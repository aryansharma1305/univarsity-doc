# Phase 12C — course certificate eligibility and academic certificate templates

## Baseline

Dedicated branch/worktree `feature/phase-12c-academic-certificate-templates` from green `origin/main`
`ff8b7df` (Phase 12B PR #19 merged; post-merge CI passed). Read CLAUDE.md, the Phase 11B/12A/12B
reports, ADR-0017, the Program/curriculum/registration models, Certificate/CertificateTemplate/
ProgramDocumentTemplate, the 12B request module and the 9C maker–checker pattern. Existing worktrees
were left untouched; UI-02 and UI-04 hold uncommitted work and were not modified. Codex's
`docversity-ui05` worktree appeared during this phase and was neither read for editing nor modified.

The worktree uses its own `docversity_phase12c` database (plus `_test`/`_api_test`/`_e2e` copies) and
separate Redis/queue prefixes. The original `docversity` database and MinIO bucket were snapshotted
read-only before any change (38 tables with row counts and content hashes; 3,083 objects with
sizes/ETags) for the preservation check below.

## University certificate-duration policy matrix

Policy `UNIVERSITY_COURSE_DURATION_CERTIFICATES` **v1**, evaluated on the server from
`programs.duration_value` + `duration_unit` (YEARS × 12), never from the client.

| Course duration               | Course Completion |                 Transcript                  | Provisional | Character | Migration | Source                     |
| ----------------------------- | :---------------: | :-----------------------------------------: | :---------: | :-------: | :-------: | -------------------------- |
| 2–3 months, 6 months          |         ✔         |                                             |             |           |           | University rule            |
| > 12 months through 24 months |                   |                      ✔                      |      ✔      |     ✔     |           | University rule            |
| Exactly 24 months             |                   |                      ✔                      |      ✔      |     ✔     |     —     | Literal "more than 1 year" |
| > 24 months                   |                   |                      ✔                      |      ✔      |     ✔     |     ✔     | University rule            |
| Synthetic fixtures            |    3, 6 months    | 18, 24 months (T/P/C) · 36 months (T/P/C/M) |             |           |           | Tests                      |

### Unresolved duration boundaries (fail closed — nothing offered)

| Case                                     | Reason code              | Behaviour                                      |
| ---------------------------------------- | ------------------------ | ---------------------------------------------- |
| No duration recorded on the course       | `MISSING_DURATION`       | All types `POLICY_UNRESOLVED`; no proposals    |
| Under 2 months                           | `BELOW_TWO_MONTHS`       | Same                                           |
| 4 or 5 months                            | `FOUR_TO_FIVE_MONTHS`    | Same                                           |
| 7–11 months                              | `SEVEN_TO_ELEVEN_MONTHS` | Same                                           |
| Exactly 12 months (1 year)               | `EXACTLY_TWELVE_MONTHS`  | Same                                           |
| Migration for exactly 24 months          | —                        | Not granted (awaiting university confirmation) |
| Course Completion for courses > 6 months | —                        | Not assumed for degree/diploma students        |

Questions for the university: the 1-year, 7–11 month, 4–5 month and under-2-month categories;
whether exactly 2 years earns Migration; whether longer courses also issue Course Completion; who is
authorized to approve a course's certificate set. Each answer is a new policy version (code snapshot

- migration extending the database CHECK), not an edit to v1.

## Course-to-certificate configuration architecture

- **Policy** — immutable code snapshot in `@docversity/validation` (`certificate-eligibility/policy.ts`);
  `evaluateCourseDuration` is pure and unit-tested month by month (0–60, plus 240 for Course Completion).
- **Configuration** — additive table `program_certificate_eligibility` (migration
  `20261020090000_program_certificate_eligibility`): program, revision, `certificate_types[]`, policy
  id/version, duration snapshot, tier, university authority reference, rationale, proposer, decider,
  decision note, superseded time. Lifecycle `PROPOSED → APPROVED | REJECTED | WITHDRAWN`,
  `APPROVED → SUPERSEDED`. One open proposal and one approval per course (partial unique indexes).
- **Database guarantees** — v1 tier→type mapping and duration ranges (CHECK); known types, no
  duplicates, non-empty; decider ≠ proposer; rejection needs a note; proposal must match the course
  duration on record and approval re-checks it under a row lock; snapshot and approval record
  immutable; no DELETE/TRUNCATE; program deletion restricted.
- **Resolution** — `resolveTypeEligibility`: `APPROVED_FOR_COURSE` only when the current policy
  permits the type, an approved set names it and that set still matches the course's current duration
  and policy version; otherwise `PENDING_COURSE_APPROVAL`, `NOT_OFFERED_FOR_COURSE` or
  `POLICY_UNRESOLVED`. A duration edit or registration course change therefore removes the effect of an
  older approval automatically (`OUT_OF_DATE`).
- No existing column, enum or row changes. `DocumentType`, `certificates`, `certificate_templates`,
  `program_document_templates`, historical documents and 12B tables are untouched.

## Backend authorization and validation

| Permission                       | Roles                                         | Grants                                   |
| -------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `certificateEligibility.read`    | REGISTRAR, CERTIFICATE_ADMIN, APPROVER (+ SA) | Course view                              |
| `certificateEligibility.propose` | REGISTRAR (+ SA)                              | Propose / withdraw                       |
| `certificateEligibility.approve` | SUPER_ADMIN catch-all only                    | Approve / reject — **currently blocked** |

**Approval is disabled.** The university has not authorized an eligibility-policy approver, so the API
ships with no approval authority; every approve/reject returns 403 with that reason, for every role.
Isolated tests supply a synthetic authority accepted only under `NODE_ENV=test` (12B pattern). The
proposer can never decide their own proposal (API 403 and DB CHECK). Strict Zod bodies reject
durations, tiers, policy versions, statuses and unknown types; the training certificate is rejected.
Writes are rate limited, CSRF-guarded, `no-store`, and audited in the same transaction (IDs, codes,
types, months only). Program eligibility approval is not student qualification, Rector approval,
payment verification or permission to issue — stated in the API response, UI and ADR-0018.

Endpoints: [docs/api/certificate-eligibility.md](../api/certificate-eligibility.md).

## Synthetic PDF previews

Five new preview-only templates (`sample-course-completion`, `sample-transcript`,
`sample-provisional`, `sample-character`, `sample-migration`, v1) render through the Phase 12A
Playwright/PDF pipeline with embedded Noto Sans and Crimson Pro. Every page carries a SAMPLE banner,
a diagonal SAMPLE watermark and a "SAMPLE — unsigned, unissued and unverifiable" footer; the institution
is the fictitious "Example University of Learning"; identifiers must match `SAMPLE-…`; signature lines
are blank; there is **no QR code, token or URL** (a dashed "No verification credential" box). The
Course Completion wording names the course and states it is not a degree, diploma or provisional
certificate. The transcript shows invented marks without grades, GPA or results. Each standard fixture
belongs to a synthetic course whose duration the policy maps to that type. `TRAINING_CERTIFICATE`
(12A) is unchanged and is not an alias for Course Completion.

Staff generate them at `/admin/certificate-templates` (existing `templates.write` permission) via
`GET /api/v1/certificate-templates/academic` and `/academic/preview?type&version&fixture`; no student,
registration, result or storage access; each preview is audited.

### Multipage transcripts

Transcripts that fit one A4 page keep the approved single-page design unchanged. This includes both
the standard and long-text fixtures. Only a transcript that does not fit switches to a multipage
layout built with CSS paged media:

- `@page` margin boxes carry the SAMPLE banner on every page, plus a footer reading "SAMPLE — unsigned,
  unissued and unverifiable · registration · template · Page N of M".
- A fixed frame and the SAMPLE watermark repeat on every page.
- Each period table's `thead` holds the period label ("Semester 3" / "Year 2") and the column
  headings, and repeats on continuation pages. Rows never split (`break-inside: avoid`).
- The closing block (scope note, the "no verification credential" box and the blank signature line)
  is kept together.
- Ligatures are disabled in the body and in the margin boxes, so the text extracts and searches
  correctly.

Pagination keeps the closing section with academic content. The closing block (disclaimer,
verification placeholder, unsigned signature) may not begin a page (`break-before: avoid`), so
when it does not fit after the last row, the break moves back between whole rows of the last
period and those rows continue under the repeated heading with the closing section. Widow/orphan
control keeps at least two rows of a period at the start of a page and three at its end, so no
period strands a lone row. When the content genuinely needs another page, it gets one: the
semester-wise stress transcript is still 4 pages, and page 4 now holds Semester 8's last three
rows plus the closing section, where it previously held the closing section alone. A regression
test sweeps 4–12 semesters, and for every multipage result asserts that the closing section
shares its page with at least two academic rows, that no period has a single row on any page, and
that every row appears exactly once. The test was confirmed to fail with the fix removed.

Transcripts declare `structure` (`SEMESTER_WISE` / `YEAR_WISE`), and period labels must match it.
Previews are bounded to 12 periods, 16 subjects per period, 120 subjects and 12 pages. Other
certificate types still must fit one page. No total, grade, GPA, division or result is calculated.

Two transcript-only stress fixtures exist:

- `stress-semester`: 8 semesters × 8 subjects, 4 pages.
- `stress-year`: 4 years × 14 subjects, 3 pages. A year's table breaks mid-table, so it exercises the
  repeated headings.

Chromium repeats a table heading verbatim, so a continued period shows its label without
"(continued)"; the continuing subject codes make the continuation clear. Tests check every page for
the banner, footer, page numbers and table headings. They also check that every subject code appears
once and in order, that rows don't overlap, and that nothing falls outside the page.

## Phase 12B integration

- `COURSE_COMPLETION` added to `certificateTypeSchema` and the student catalogue (5 services, all
  "Not available yet"). The `certificate_request_type_check` constraint is unchanged, so no such request
  can be stored; existing 12B requests, policies and transitions are untouched.
- `/student/certificate-requests` gains a read-only "Certificates for your courses" section, one card
  per registration, separating type eligibility from application, course completion, payment
  verification, Rector approval and issuance. No new button or submission path.
- `applicationAvailability` is reported from the 12B policy service as-is; eligibility approval never
  turns it on (tested).
- **Required before any application policy is activated:** bind a request to an explicitly selected,
  owned registration and require `APPROVED_FOR_COURSE` for that registration's course at submission;
  extend `certificate_request_type_check` for COURSE_COMPLETION in a reviewed migration.

## UI-05 integration requirements

Stable contract `docversity.student-certificate-eligibility` **v1** (`studentCertificateEligibilityV1Schema`,
`studentRegistrationEligibilityResponseV1Schema`). UI-05 must show a sample only when
`samplePreviewAllowed` is true, use `samplePreviewTemplate`, never infer types client-side, never
auto-select a registration, and render pending/not-offered/unresolved honestly. Today no course is
approved in production, so UI-05 must show the pending state. Details:
[docs/api/certificate-eligibility.md](../api/certificate-eligibility.md#ui-05-integration-requirements).
No UI-05 file was read for editing or changed; integration happens after both branches are available.

## Pending Rector approval and issuance policies

Unchanged and disabled: Rector approval, Finance verification, certificate generation for students,
numbering, digital signing, MinIO storage of issued PDFs, QR tokens and public verification. Future
chain: approved course set → approved application policy bound to a registration → staff review →
course completion/qualification decision → Finance verification → authorized Rector decision →
controlled issuance/signing/storage → delivery → separately approved verification.

## Shared MinIO bucket: investigation and test storage isolation

**Finding.** Automated tests isolated PostgreSQL (`<db>_api_test`, `<db>_e2e`), Redis key prefixes and
BullMQ prefixes, but not object storage: `apps/api/test/helpers.ts` (`realConfig`) inherited
`S3_BUCKET=docversity-local`, and the Playwright e2e API and worker servers did the same. Every run of
the historical-document, import, re-exam payment and profile-photo tests, in any worktree, therefore
wrote objects into the development bucket shared with `pnpm dev`. This predates Phase 12C (the 12B
report's preserved-object count, 2,905, had already grown to 3,083 at this phase's baseline).

**Attribution** (read-only: object keys matched against the stored rows of every Docversity
database, then UUIDv7 key timestamps and database creation times; no object read or changed):

| New objects in `docversity-local` | Owner                                     | Evidence                                         |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| 33 (23 imports, 10 payments)      | Phase 12C full API test run (12:38–12:40) | Rows in `docversity_phase12c_api_test`           |
| 14                                | Phase 12C e2e run (pre-fix configuration) | Rows in `docversity_phase12c_e2e`                |
| 33 + 33                           | UI-05 API test runs (two runs)            | Rows in `docversity_ui05_api_test` at each check |
| 14                                | UI-05 e2e run                             | Rows in `docversity_ui05_e2e`                    |
| 8 (6 documents, 2 imports)        | Unverified; probably UI-05                | No row or audit entry left in any database       |

The 8 unreferenced objects were written at 12:26–12:30. That is after `docversity_ui05_api_test` was
created (12:22) and before `docversity_ui05_e2e` was recreated (12:31:30), when no Phase 12C test
that uploads documents or workbooks was running. Their database rows were most likely removed when a
UI-05 test database was recreated. Ownership is not proven, so they are reported, not attributed.

**No object was deleted, overwritten or cleaned up.** All 3,083 baseline objects are unchanged (key,
size, ETag). Removing test objects from the shared bucket needs explicit authorization and, for UI-05
objects, coordination with Codex; the key lists are kept locally for that decision.

**Fix (this branch).**

- `testStorageBucket()` (`@docversity/validation`) returns `S3_TEST_BUCKET` (default
  `<S3_BUCKET>-test`) and throws if it equals `S3_BUCKET`.
- API integration tests: `realConfig()` uses it; the vitest global setup HeadBucket-checks the test
  bucket and aborts the run if it is unreachable (no fallback to the development bucket).
- e2e: the Playwright API **and worker** servers use it; a missing bucket fails the API `/health`
  storage probe, so the run cannot start.
- Provisioning: `docker/minio/init.sh` creates the test bucket (private) and scopes the application
  user's policy to exactly the two buckets; compose and `.env.example` define `S3_TEST_BUCKET`. CI
  starts a fresh MinIO from this script.
- Local shared MinIO: the updated idempotent `init.sh` was run once in the running container. It
  created the empty bucket `docversity-local-test` and widened the `docversity-app` policy to it. The
  previous policy was captured first; no development object was touched. If the shared container is
  later restarted from an older checkout, test-bucket access is removed and tests fail at preflight
  rather than writing to the development bucket.
- Worker unit tests already use in-memory storage; database/documents tests do not use storage.

## Verification evidence

### Integration with main (UI-05)

PR #20 (UI-05) merged to `main` at `d0d07c7`, and its post-merge CI passed
([run 39015221306](https://github.com/aryansharma1305/univarsity-doc/actions/runs/39015221306)).

Phase 12C was rebased onto it:

- A local, never-pushed snapshot was taken first; it is kept in the reflog.
- The only conflicts were export lines that both branches appended to `@docversity/documents` and
  `@docversity/validation`; both sides were kept.
- No file on `main` is deleted or changed outside those lines. UI-05's student sample controller,
  component, pinned PDF and tests are untouched.
- `/student/certificate-requests` shows UI-05's "View Sample Certificate" link above the Phase 12C
  eligibility panel.
- The UI-05 training sample downloads byte-identical to its pinned asset.
- UI-05 does not yet consume the eligibility contract. Students still see only the fixed training
  sample, and the contract integration remains a follow-up.

### Environment incident and recovery

During the first post-rebase gate run the host volume filled to 100%. Docker storage returned I/O
errors, PostgreSQL stopped and the MinIO container could not read its filesystem. That run's failures
(API tests unable to reach the database, e2e servers unable to start, empty bucket listings) were
environmental and are discarded.

After disk space was freed, these checks ran before any test:

- 34 GiB free; Docker healthy; PostgreSQL, Redis and MinIO proven to serve data.
- Original `docversity` database identical to the baseline (38 tables, row counts and content
  hashes).
- MinIO inventory listed with zero errors. All 3,083 baseline objects are present and identical by
  key, size and ETag (every ETag a plain content MD5). The 149 later additions are the set
  attributed above.
- Worktree identical to the pre-incident snapshot apart from one lint fix.

Docker's restart re-ran the main checkout's older `init.sh`, which reset the app policy to the
development bucket only. Tests would have failed closed at preflight. This branch's idempotent
`init.sh` was re-applied (policy only; no bucket, object or record changed). Its fix reaches the
shared container once this branch is merged and the main checkout updated.

A second run failed only because the shared Playwright browser cache was being reinstalled by
another process during the run (the Chromium executable was missing). It also exposed one real lint
issue in a Phase 12C web test (a redundant type assertion), now fixed.

### Final gate run (real exit codes)

| Gate                             | Exit | Result                                                                                                                                                  |
| -------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 0    |                                                                                                                                                         |
| `pnpm format:check`              | 0    |                                                                                                                                                         |
| `pnpm lint --force`              | 0    | 18/18 tasks, uncached                                                                                                                                   |
| `pnpm typecheck --force`         | 0    | 17/17 tasks, uncached                                                                                                                                   |
| `pnpm build --force`             | 0    | 10/10 tasks, uncached                                                                                                                                   |
| `pnpm db:check`                  | 0    | No difference detected                                                                                                                                  |
| `pnpm test --force`              | 0    | **845 passed**, 0 cached: 109 database, 58 validation, 21 types, 4 storage, 50 documents, 94 imports, 7 worker, 118 web, 384 API (UI-05 tests included) |
| `pnpm test:e2e`                  | 0    | **65 passed**, 0 failed, 0 retries (9.6 min), including UI-05's student sample scenarios                                                                |

Test accounting against the Phase 12B total of 763:

- Phase 12C adds 74 tests: 17 validation, 1 types, 11 database, 18 documents (including the
  multipage pagination, page-marking, row-order, overlap and bounds checks), 22 API (including the
  stress previews) and 5 web.
- UI-05 adds 8 (2 documents, 5 API, 1 web).
- 763 + 74 + 8 = 845.
- Browser scenarios: 59 + 4 (Phase 12C) + 2 (UI-05) = 65.

**Storage isolation (final run).** The development bucket held 3,232 objects before and after; nothing
was written to it. The test bucket gained 47 objects from this run.

**Migration safety (integrated schema).** `main` added no migrations. A fresh copy of the original
database (`pg_dump | psql` inside the container, source read-only) was migrated with `prisma migrate
deploy`, which applied the pending 12B migrations and `20261020090000`. Afterwards all 37 domain
tables were hash-identical, only `_prisma_migrations` changed, the new table was empty, and drift
was 0. The original database was never migrated. No existing migration was edited.

**Preservation (after the final run).** The original database is identical to the baseline, and all
3,083 baseline objects are unchanged.

**Evidence** (synthetic data only, `phase-12c/`, all from the final passing run):

- Student eligibility at 1440, 768 and 390px, including UI-05's link: `phase12c-student-eligibility-*.png`.
- Staff course panel: pending proposal at 1440, 768 and 390px; unresolved 12-month course;
  proposal form and review step: `phase12c-staff-*.png`.
- Certificate templates page and academic section at 1440 and 390px: `phase12c-templates-*.png`.
- PDFs downloaded through the staff UI:
  - the five certificates, one page each;
  - `transcript-stress-semester` (4 pages) and `transcript-stress-year` (3 pages);
  - a page raster for every page of each: `*-pageN.png`, covering first, middle and final pages.

Visual review notes:

- Approved earlier: the simplified student status line, left-aligned certificate statements and the
  phone download note for academic samples.
- Remaining:
  - The UI-03 shell's bottom navigation overlays full-page captures.
  - A continued period's repeated heading cannot say "(continued)".
  - The 12A training preview still uses an iframe on phones.

Orphaned-closing correction (after the final run): format, lint, typecheck and build exited 0
(uncached); the documents suite exited 0 with 51 passed (one new regression test, so the repository
total is 846); the API template tests exited 0 (16 passed); and the affected browser specs
(eligibility/academic samples and 12A templates) exited 0 (6 passed), downloading the corrected
PDFs through the staff UI. The approved year-wise transcript is text-identical on all three pages.

**Delivery.** Final visual approval was granted for all five academic certificates, the standard,
year-wise and corrected semester-wise transcripts, and the student, staff and template
administration screens. The code graph was refreshed with `graphify update .` (7,028 nodes, 18,546
edges, 244 communities), and only the three documented outputs are included. At delivery, Phase 14A
PR #21 was still open and `main` was `d0d07c7`. The two PRs overlap only in the regenerated
`graphify-out/` files, which the second to merge refreshes again. The final full gate run and the
push/PR CI are recorded in the draft PR. Nothing is merged. Rector approval, issuance, signing,
payment verification and public verification remain disabled.
