# Imports (Phase 5: students / registrations)

One import subsystem (`/admin/imports`, `/api/v1/imports`, BullMQ queue `imports`) serves every import
type. Phase 5 implements `STUDENTS`. Phase 10B adds a separate, temporary results preview workflow
without creating persistent `RESULTS` jobs or a commit route: [results previews](../api/result-import-previews.md). Design rationale:
[ADR-0009](../decisions/ADR-0009-import-engine.md). API reference: [docs/api/imports.md](../api/imports.md).
Columns: [docs/imports/student-template.md](../imports/student-template.md).

## Flow

```text
Download template → Upload (API) → Parse workbook (worker) → Choose worksheet + map columns (UI)
  → Validate (worker) → Review summary/rows/errors (UI) → Import valid rows (worker) → Import report
```

Nothing touches student records before the explicit commit. The user always sees how many rows were read,
are valid, have warnings, have errors, and will be created, updated or skipped.

## State machine

```text
UPLOADED ──parse──▶ MAPPING ──validate──▶ VALIDATING ──▶ VALIDATED ──commit──▶ PROCESSING ──▶ COMPLETED
   │                  │  ▲                    │            │  │ ▲                 │
   │                  │  └──────── re-map ────┼────────────┘  │ └─ re-validate    │
   ▼                  ▼                       ▼               ▼                   ▼
 FAILED          CANCELLED              FAILED / CANCELLED  CANCELLED           FAILED
FAILED ──retry (only if retryable)──▶ UPLOADED | VALIDATING | PROCESSING       COMPLETED, CANCELLED: terminal
```

- Transitions are defined once (`IMPORT_TRANSITIONS`, `packages/imports/src/state-machine.ts`) and applied
  only as compare-and-set updates (`UPDATE … WHERE status IN (…)`), so double clicks and concurrent
  requests cannot start a step twice (→ `409 CONFLICT`).
- The API computes the allowed actions (`map`, `validate`, `commit`, `cancel`, `retry`) for the UI.
- Cancel is allowed before importing starts (not during PROCESSING: a half-cancelled commit would be
  ambiguous). Completed, failed and cancelled imports are never restarted implicitly; retry is an
  explicit, audited operation offered only when the failure is retryable.

## Worker jobs

| Job               | Status     | Does                                                                                                                                                                    |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import.parse`    | UPLOADED   | Verifies the container, loads the workbook, lists worksheets, headers, row/column counts and deterministic mapping suggestions → MAPPING                                |
| `import.validate` | VALIDATING | Reads the chosen worksheet, bulk-loads master data and existing registrations, validates and classifies every row, writes the error report, stores the rows → VALIDATED |
| `import.commit`   | PROCESSING | Commits pending rows in batches, re-checking each against the current database, then writes the final report → COMPLETED                                                |

Each job carries `{ importJobId, runId, actorUserId, correlationId }`. Progress (0–100) is persisted on
the job by the worker; the UI polls `GET /imports/:id` every 1.5 s **only** while the status is
UPLOADED, VALIDATING or PROCESSING, and stops for every other state. A reload shows the same state.

### Retries and failures

| Cause                                                            | Handling                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row problems (unknown program, bad date…)                        | Data, not exceptions: stored as row errors/warnings. Never a retry condition.                                                                       |
| Problem with the file (not xlsx, zip bomb, too many rows, empty) | `ImportFileError` → FAILED immediately (`retryable: false`), with a safe message. No BullMQ retry.                                                  |
| Transient system problem (database, storage, Redis)              | Rethrown; BullMQ retries 3× with exponential backoff (5 s). After the last attempt the import is FAILED (`retryable: true`) with a generic message. |
| Queue unavailable when the API enqueues                          | The import is marked FAILED (`QUEUE_UNAVAILABLE`, retryable) and the API answers 503.                                                               |
| Stale/duplicate delivery, cancelled job                          | The run no longer owns the job (`active_run_id`) → stops silently.                                                                                  |

Failure messages never contain stack traces or database details.

## Storage and retention

- Uploads are stored privately at `imports/<importJobId>/source-<uuid>.xlsx`; reports at
  `imports/<importJobId>/error-report-<uuid>.xlsx`. Keys are generated (`objectKeys`); the uploaded file
  name is sanitised display metadata only. The SHA-256 and size are recorded.
- Files are never public: the error report and template are streamed by the API after a permission
  check (`Cache-Control: no-store`); there are no presigned URLs.
- A new validation or commit replaces the report (the previous object is deleted).
- **Retention (to be confirmed with the client; not automated yet):** keep source workbooks and reports
  for 90 days after an import completes/fails/is cancelled, then delete the objects and the job
  (`import_rows` cascade). Audit entries are kept (they contain IDs and counts only).

## Validation

Per row, deterministic and without AI: cells are read as typed values (formulas are never evaluated),
mapped fields are normalised, then checked. Master data is **never created**; a value is resolved by
(1) an explicit translation chosen by the administrator in the mapping step ("value maps", e.g. a course
name → a program, "Inactive" → SUSPENDED, a school → "no department"), then (2) exact code, (3) code
ignoring case/spacing, (4) name ignoring case/spacing — steps 3–4 only when exactly one record matches.
Workbooks without a session column use **one academic session for every row**, chosen while mapping.

**Identity-number columns** (national ID, Aadhaar, passport, PAN, … detected from the header) cannot be
mapped and are dropped before validation: they never reach staging rows, previews, reports or audit.
Distinct values (for translating) are collected only for category-like columns — values that repeat —
so per-person columns are never collected. The registration relation rules are the shared
`checkRegistrationRelations` used by manual entry. Registration numbers use the shared
`normalizeRegistrationNumber` (trim + upper case), so duplicates are found within the file and against
the database exactly as the unique index sees them. Full code list: [student-template.md](../imports/student-template.md#validation-codes).

- **Error** = the row cannot be imported. **Warning** = importable but worth a look: a date of birth or
  roll number missing in a column that is otherwise filled (a column empty for **every** row — e.g. DOB
  not collected yet — produces no warnings), COMPLETED without completion date, a roll number used by
  another registration in the same program and session, and a numeric registration number with fewer
  digits than most rows (Excel drops leading zeros). Unmapped optional columns never warn.
- The source row (`raw_data`) is stored exactly as read; normalised values, errors and warnings are
  stored separately.

### Create / update / skip policy

| Situation                                                       | Result                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Registration number not in the database                         | **CREATE** a new student + registration                                                                      |
| Exists; a safe field differs                                    | **UPDATE**, shown as a field diff; applied only if the commit explicitly approves updates, otherwise skipped |
| Exists; nothing safe differs                                    | **SKIP** (no change)                                                                                         |
| Exists; program, academic session, department or status differs | **ERROR** (`*_CHANGE_NOT_ALLOWED`) — never changed by an import                                              |

Safe (updatable) fields: student name, father name, mother name, date of birth, gender, roll/reference
number, admission date, completion date. A blank cell never clears a stored value. The registration
number's spelling (case/spaces) is never changed. An import never links a row to an existing student by
name — a new registration number always creates a new student record.

## Commit and idempotency

- Batches of `IMPORT_BATCH_SIZE` rows (default **250**: small enough for short transactions and
  progress updates, large enough that 5,000 rows commit in a few seconds), in ascending row order, each in
  one transaction that also marks its rows `IMPORTED` with the registration ID. There is no unbounded
  transaction.
- Each batch locks the job row (`FOR UPDATE`) and re-checks the run: duplicate deliveries of the same job
  run one after another, and the second finds nothing pending.
- Every row is re-checked against the **current** database: master data changed since validation, a
  registration number created meanwhile (`REGISTRATION_ALREADY_EXISTS`) or an existing record edited
  meanwhile (`RECORD_CHANGED_SINCE_VALIDATION`) turn the row into an error instead of failing the batch.
- An unexpected error rolls back the whole batch; earlier batches stay committed and are never repeated;
  a retry continues with the remaining rows. The registration-number unique index is the final guard.
- Finally, remaining importable rows become `SKIPPED`, counts are recomputed from the rows, and the job
  becomes COMPLETED together with its `STUDENT_IMPORT_COMMITTED` audit entry.

## Audit

`STUDENT_IMPORT_CREATED`, `_UPLOADED`, `_MAPPING_SAVED`, `_VALIDATED`, `_COMMIT_REQUESTED`, `_COMMITTED`,
`_CANCELLED`, `_FAILED`, `_RETRIED` — metadata holds the import ID, counts and field names only, never
spreadsheet content. Every created/updated record also gets the normal `STUDENT_CREATED`,
`REGISTRATION_CREATED`, `STUDENT_UPDATED`, `REGISTRATION_UPDATED` entry with `source: "import"`,
`importJobId` and `rowNumber`, attributed to the user who committed.

## Security

| Threat                         | Control                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthorised use               | Global AuthGuard → CsrfGuard → PermissionsGuard run **before** the upload is read; permissions are enforced by the API, not the UI                                                                          |
| Oversized uploads              | `IMPORT_MAX_FILE_MB` enforced while streaming (multer limit, 413 `FILE_TOO_LARGE`); the web proxy allows exactly that size plus 1 MB                                                                        |
| Wrong/malicious file types     | Extension `.xlsx` + MIME allow-list + real container check (ZIP signature, workbook parts present; legacy `.xls`/password-protected files recognised). MIME alone is never trusted                          |
| Zip bombs / malformed archives | Total declared uncompressed size ≤ `IMPORT_MAX_UNCOMPRESSED_MB`; the worker additionally inflates every entry with a hard output cap before ExcelJS parses it; ZIP64/encrypted/unknown compression rejected |
| Path traversal                 | Nothing is written to disk; storage keys are generated from UUIDs; the original name is sanitised display metadata                                                                                          |
| Formula injection              | Workbook formulas are never evaluated (formula cells in mapped columns → `FORMULA_NOT_ALLOWED`); generated reports prefix text starting with `= + - @`, tab or CR with an apostrophe                        |
| Resource exhaustion            | Row/column/worksheet limits, chunked bulk queries (never one query per row), batched commits, import concurrency 1 by default                                                                               |
| Data leakage                   | Private bucket, streamed downloads, no storage keys in API responses, safe error messages, audit metadata without personal values                                                                           |

## Limits and production tuning

| Variable                     | Default | Notes                                                                          |
| ---------------------------- | ------: | ------------------------------------------------------------------------------ |
| `IMPORT_MAX_FILE_MB`         |      10 | Typical student workbooks are < 2 MB per 10,000 rows                           |
| `IMPORT_MAX_UNCOMPRESSED_MB` |     100 | Raise together with the file size; keep ≤ ~10× it                              |
| `IMPORT_MAX_ROWS`            |  10,000 | Up to ~50,000 is reasonable with 2 GB worker memory (whole workbook in memory) |
| `IMPORT_MAX_COLUMNS`         |      50 |                                                                                |
| `IMPORT_BATCH_SIZE`          |     250 | 100–500; larger batches mean longer locks and coarser progress                 |
| `IMPORT_CONCURRENCY`         |       1 | Per worker process; scale with more worker replicas instead                    |

Measured on a development laptop (Apple Silicon, Docker PostgreSQL/MinIO), 5,000 generated rows
(`apps/api/test/imports/performance.test.ts`), 231 KB workbook:

| Run                                 | Parse | Validate | Commit (batch 250) |
| ----------------------------------- | ----: | -------: | -----------------: |
| Test alone                          | 0.3 s |    1.6 s |              3.8 s |
| During the full parallel test suite | 0.9 s |    3.7 s |              6.0 s |

Heap growth ≈ 190 MB before GC. The test asserts only loose ceilings (60 s / 90 s / 150 s) to catch
accidental O(n²) behaviour, not to benchmark.

## Known limitations

- `.xlsx` only (no CSV, no legacy `.xls`). Row 1 is always the header row; merged cells read as their
  top-left value; blank rows are skipped and not counted.
- Retention cleanup is documented but not automated.
- Updates are approved for the whole import, not row by row.
- Client-side size pre-check uses the default 10 MB; the server's configured limit is authoritative.
