# Phase 12C.1 — registration-specific academic certificate samples

## Baseline

Worktree `docversity-phase12c1`, branch `feature/phase-12c1-student-certificate-samples`, from
`origin/main` at `add9bae` (PR #23 merged, post-merge CI green on the first attempt). It uses its own
database (`docversity_phase12c1`), Redis/queue prefixes and the `docversity-local-test` bucket.
Codex's Phase 13A worktree was not touched. Heavy runs were scheduled around Codex's verification
window; one in-progress build was stopped during the build step, before any database or storage step.

## What students get

On `/student/documents`, UI-05's **View Sample Certificate** card keeps its generic Training
Certificate sample unchanged. A new **Samples for your courses** section follows it:

- **One registration:** that course is shown directly.
- **Several registrations:** a labelled selector, with nothing preselected. No samples appear until
  the student chooses a course.
- **Per course:** name and duration; one line explaining that a sample is a layout only (not
  completion, qualification, payment, Rector approval or an issued certificate); one compact row per
  offered type; and a single line listing types not offered.
  - **Approved for the course:** Preview (new tab) and Download.
  - **Otherwise:** "Awaiting university approval", plus a note that samples appear after approval.
  - **Unresolved durations:** an explanation and no list.
- No `article` elements are added, so UI-05's document-count test is unaffected.

Until the university authorizes an approver of course certificate sets, production students see no
academic sample to open, only explanations and the training sample. The previews in the screenshots
come from synthetic approvals that exist only in tests and the disposable e2e database.

## Server-side authorization (every request)

`GET /api/v1/student/certificate-samples/registrations/:registrationId/:sampleId/file`:

1. **Rate limit first.** UI-05's per-account window (30/min, shared with the training sample) is
   checked before any lookup, which also bounds registration probing. If the limiter is
   unavailable, the request fails closed (503).
2. **Strict input.**
   - `registrationId` must be a UUID (otherwise 404).
   - `sampleId` must be one of the five academic IDs (otherwise 400; the training ID is refused here).
   - Unknown query parameters (including any client "type", "status" or "eligibility") are
     rejected with 400.
3. **Type from the identifier.** The certificate type is derived from `sampleId` on the server; the
   client never supplies it.
4. **Ownership and current policy.**
   - The Phase 12C resolver evaluates that registration of the signed-in student: the course's
     duration policy plus the current approved set, which must match the course's present duration
     and policy version.
   - Only `APPROVED_FOR_COURSE`, with the matching template, is served.
   - Another student's registration, unknown registrations, and pending, withdrawn, out-of-date,
     not-offered and unresolved types all return the same 404.
5. **Integrity.** The pinned file must pass identity, size, `%PDF-` header and SHA-256 checks.
   Otherwise the response is 503 "This sample is temporarily unavailable.", and the log records only
   the sample ID (or `(unknown)`) and the failed check. Caller input is never echoed.
6. **Headers.** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'; frame-ancestors 'self'`, filename `<sampleId>.pdf`.
7. **No side effects.** No rendering, no student data in the file, and no database, audit or object
   storage write.

UI-05's training endpoint is unchanged and remains independent of course eligibility.

## Synthetic samples and drift check

The five PDFs were rendered once from the approved Phase 12C templates (standard synthetic records)
by `packages/documents/scripts/generate-academic-samples.mjs` and are pinned by SHA-256 and size
(see `packages/documents/assets/samples/README.md`). Tests check every page of every shipped file for:

- the SAMPLE banner and the non-official footer;
- the fictitious institution and student;
- `SAMPLE-` identifiers only;
- unsigned signature lines;
- no QR code, no URL, token or verify link, no link annotation, and no computed result.

The **drift check** re-renders each template and compares a structural fingerprint with the shipped
file: page geometry, the full drawing-operator sequence, operator arguments (colours, transforms,
positions, font sizes; pdf.js per-load font handles are normalised) and every placed text run. A
sensitivity test confirms that a one-character content change alters the fingerprint. The PDFs that
the browser test downloaded through the student page are byte-identical to the pinned files.

## Verification (real exit codes)

| Gate                             | Exit | Result                                                                                                  |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 0    |                                                                                                         |
| `pnpm format:check`              | 0    |                                                                                                         |
| `pnpm lint --force`              | 0    | 18/18, uncached                                                                                         |
| `pnpm typecheck --force`         | 0    | 17/17, uncached                                                                                         |
| `pnpm build --force`             | 0    | 10/10, uncached                                                                                         |
| `pnpm db:check`                  | 0    | No difference detected                                                                                  |
| `pnpm test --force`              | 0    | **891 passed**, 0 cached (846 + 17 documents + 23 API + 5 web)                                          |
| `pnpm test:e2e`                  | 0    | **68 passed** (65 + 3 new), 0 failed, 0 retries, 9.1 min, with the machine kept awake (`caffeinate -i`) |

New tests:

- **API (23).** Approved types served for one and several registrations: Course Completion (3
  months), Transcript, Provisional and Character (24 months), Migration (36 months).
  - Returning 404: not-offered, pending, withdrawn, out-of-date, unresolved (12 months and missing
    duration), another student's registration and unknown registrations.
  - Strict identifiers and queries; 401 for student-only access.
  - Fail-closed integrity (503, safe log) and rate limiter.
  - Training sample independent; shared rate limit; no writes.
- **Documents (17).** Pins, every fail-closed check, privacy and watermark on every page, drift and
  sensitivity.
- **Web (5).** Single and multiple registrations with no default, pending, unresolved, unavailable
  and empty states, and no `article`.
- **Browser (3).**
  - The real student UI at 1440, 768 and 390px: selector, previews, downloads, headers, withdrawn
    and unresolved states, axe checks, keyboard and reduced motion.
  - The single-registration view.
  - Cross-student ownership (404), unapproved type (404) and anonymous access (401).
- UI-05's component test changed in one assertion only: the "other formats not available yet"
  sentence now points to the per-course section.

## Data preservation

The `/private/tmp` scratch folder was partly pruned by the system on 22 October. That removed the
17 October baseline files (object inventory, table fingerprints). New baselines are kept in
`/Users/gugloo/Docvarsity/verification-baselines/`. Nothing below is reconstructed and presented as
original evidence.

**MinIO (development bucket, 3,232 objects):**

- **Fully verified by content hash, 1,003 objects.** Every object in the independent 9 October backup
  (`local-backups/phase8-hardening-20261009-194616`, read from a copy through a throwaway container)
  is present today with identical size and content MD5. The backup itself was unchanged afterwards
  (SHA-256 of all 1,063 files).
- **Verified by count and timestamps only, 2,080 objects.** These are the rest of the 3,083-object
  17 October baseline. Exactly 3,083 objects were last modified before a 20-minute write gap
  (06:32–06:52 UTC on 17 October); MinIO updates that time on any overwrite, and the count rules out
  deletions. This is **not** byte-level proof for these objects.
- **149 later test objects**, attributed in the Phase 12C report and not modified.
- **This phase's gate run:** the full inventory (key, size, content MD5 of all 3,232 objects) was
  identical before and after. The 47 new objects all went to the test bucket.

**PostgreSQL (original `docversity`, 38 tables):**

- **Fully verified against the independent 10 October dump, 32 tables.** `pre-phase9c-20261010-020359.dump`
  was restored into a temporary database (since removed) and fingerprinted. These tables are
  identical in row count and full content fingerprint: academic_sessions, audit_logs,
  certificate_templates, certificates, departments, examinations, external_exam_applications,
  grading_schemes, historical_documents, import_jobs, import_rows, legacy_mappings,
  number_sequences, program_curricula, program_document_templates, program_subjects, programs,
  re_exam_applications, re_exam_fee_rates, re_exam_fee_rules, result_items, results, roles,
  student_accounts, student_activation_codes, student_profile_change_requests,
  student_registrations, students, subjects, user_roles, users, verification_logs. The dump file is
  unchanged.
- **Fully verified against the surviving 17 October record:** `_prisma_migrations` (17 rows, same
  hash; 13 rows on 10 October, as expected before migrations 9C, 10C and 10D). `academic_sessions`
  and the append-only `audit_logs` also match their 17 October hashes.
- **Partially verified, 5 tables:** re_exam_payment_destination_rates, re_exam_payment_destinations,
  re_exam_payments, result_draft_batches and result_review_events. They post-date the dump, and no
  independent fingerprint survives. All five are empty today.
- No migration was applied to the original database.

## Visual-review wording changes

Student-facing copy only; no change to policy, eligibility or API authorization:

- **Unresolved courses:** the intro now reads "Certificate availability for this course has not been
  confirmed yet." It no longer says the university offers the listed types.
- **Resolved courses:** the intro reads "Certificate types for this course and whether a sample is
  available."
- **Pending and withdrawn sets** share a neutral chip, "Not currently approved for this course"
  (neutral tone instead of the warning tone). The footnote reads "Samples are shown only for
  certificate types currently approved for this course."

Affected checks after the change (real exit codes): format 0, web lint 0, web typecheck 0, full web
unit suite 0 (123 passed; new assertions forbid "Awaiting" and any "offers for this course" claim for
unresolved courses), build 0, and the affected browser specs 0. That is the course-samples spec plus
UI-05's spec, 5 passed. Screenshots were regenerated. The PDFs downloaded in that run are still
byte-identical to the pinned files.

Remaining notes: at 390px the native selector truncates the "(registration number)" suffix (the full
course name is shown underneath), and the UI-03 shell's bottom navigation overlays full-page captures.

## Evidence (`phase-12c1/`)

- Documents page: `phase12c1-documents-{desktop,tablet,mobile}.png`.
- Course samples section: 24-month course at 1440/768/390px, 36-month course, withdrawn set,
  unresolved 1-year course, and the single-registration view at desktop and mobile.
- PDFs: the five samples downloaded through the student UI were byte-identical to the pinned assets committed in `packages/documents/assets/samples/academic/` (SHA-256 in that folder's README). The repository ignores `*.pdf` elsewhere, so the downloaded copies are not committed separately; only the pinned sample folder is excepted, in `.gitignore`.

Graph refreshed with `graphify update .` (7,212 nodes, 18,885 edges, 271 communities).
[ADR-0019](../decisions/ADR-0019-registration-scoped-academic-samples.md) records the decisions.
Nothing is committed or pushed. This phase awaits visual and security approval. Rector approval,
signing, issuance, payments and public verification remain disabled.
