# Phase 10C — internal draft marks

Baseline: PR #9 merged at `cba5dc736250cd96cfc91e614bedb27faa361855`; its exact main CI
[38008798041](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38008798041) passed before
creating `feature/phase-10c-draft-results`. No Phase 10D, result approval/publication, student result
visibility, grading, GPA/CGPA, certificate generation or replacement policy was implemented.

## Delivered workflow and identity

- `/admin/results` lists the latest 200 saved draft subjects; `/admin/results/new` selects
  course/curriculum/session/semester or year/examination, searches a text registration number,
  selects an eligible subject/attempt, and saves or edits applicable marks. `/admin/results/:id`
  reopens a draft with its version, validation issues and actor-attributed before/after history.
- Reuses Result (registration/examination/attempt/revision) and ResultItem (one curriculum subject
  per result). A regular examination uses attempt 1. The user explicitly confirmed that re-exam
  drafts link to an APPROVED application and preserve its existing attempt number, without adding
  one. Separate examinations preserve regular marks; nothing is carried forward or replaced.
- Nullable subject outcomes permit ungraded internal DRAFTs. Missing is null and zero is zero.
  Required blanks remain visible as draft issues; invalid numeric precision, ranges, unconfigured
  components and incompatible contexts block saving. Entered totals are checked against maxima,
  not calculated. Editing a legacy draft clears stale derived figures with audit tracking. Component maxima are snapshotted, and grades/outcomes/GPA are never invented.
- Reuses Phase 10A marks validation, Phase 10B examination context and private two-hour Redis
  sources/mapping, and the existing accessible admin components. API contracts are shared Zod
  schemas. Unknown assessment component names block persistence rather than being guessed.

## Excel draft persistence

The preview adds Review draft save plan → explicit confirmation → Save Valid Rows as Drafts.
The API re-reads owner-scoped source/mapping and validates current enrollment, exact curriculum,
period, examination lifecycle, subject/application eligibility, component configuration and marks.
It never trusts previous VALID classifications. Expired/discarded previews cannot save or replay.

The plan shows CREATE/SKIP/REJECT per row, all four counts, issues and a state digest. Identical saved
marks are skipped, different existing drafts are rejected for manual editing, and every occurrence
of a duplicate student/subject is rejected. Excel update count is deliberately zero: no overwrite
precedence has been approved. A changed plan returns 409 and requires fresh review.

SERIALIZABLE transactions commit all accepted creates, their audits and an append-only receipt
atomically; invalid rows are excluded. Audit failures or expiry/discard/mapping changes during saving
roll back the entire write set. Numeric aggregate versions protect manual edits. Serialization
retries are bounded to three; concurrent uniqueness conflicts require review/retry. Batch UUID +
actor/preview/request digest supports safe replay without duplicate official records. The structured
receipt exposes created item IDs and row outcomes; audit events link the batch and previous/new marks.
A saved-preview flag keeps the reload notice honest.

## Permissions and protections

GET draft list/detail/history requires `results.read`; manual lookup/create/edit requires
`results.write`; Excel plan/commit requires both `imports.results.run` and `results.write`.
The existing EXAM_ADMIN/SUPER_ADMIN grants apply on the API with staff authentication and CSRF;
student sessions and viewers cannot write. No publish endpoint or permission grant was added.
Examinations must be OPEN/UNDER_REVIEW, enrollment ACTIVE, and curriculum/subject/period exact.
Non-DRAFT or ever-published result attempts are blocked, including additions of new subject lines.
The original published result/item database guards remain intact. Audit metadata uses IDs and marks,
not names, sensitive identity columns, credentials or workbook cells.

See [API/routes](../api/draft-results.md), [design](../plans/phase-10c-draft-results.md),
[ADR-0015](../decisions/ADR-0015-ungraded-draft-results.md) and the updated glossary.

## Database safety and preservation

A private custom-format pg_dump was taken before any development modification and restored into
`docversity_phase10c_backup_verify`. All 36 original table counts/content hashes matched the source.
The additive migration was tested on a separate fresh `docversity_phase10c_synthetic` database and
on the restored backup, with successful drift checks and unchanged existing row hashes, before
being applied to development. An initial synthetic-only attempt exposed migration ordering; its
name was corrected to follow every Phase 9 migration before any development application.

Migration `20261017090000_draft_result_persistence` adds version, nullable item outcome, an approved
application link and a durable receipt table. It enforces subject/context/application integrity,
regular attempt identity, ungraded lifecycle and immutable receipts. Existing values remain intact.
Tests use the standard disposable test databases; the development database was never reset/reseeded.

Preservation snapshots cover all pre-existing tables and the 1,620 MinIO objects present at the
Phase 10C baseline. Final checks confirm all 35 pre-existing data tables retain their counts/content hashes, all original
migration-journal rows retain their counts/content hash when the one new migration entry is excluded,
and all 1,620 original objects retain their keys/sizes/ETags. The final object total is 1,733
(113 additional synthetic objects). The new draft receipt table remains empty in development. No existing certificate/payment object was deleted or replaced. Backups and
hash snapshots remain private outside Git; screenshots and test fixtures are synthetic.

## Verification

- Format check: passed.
- Full uncached lint: 17 tasks passed; existing TanStack Table/React Compiler warning only.
- Full uncached typecheck: 16 tasks passed.
- Full uncached tests (`--concurrency=2 -- --maxWorkers=2`): **643 passed**: types 19, validation 35,
  storage 4, database 95, imports 94, worker 7, web 85, API 304.
- Full uncached production build: 10 tasks passed.
- Synthetic Phase 7 → current migration upgrade integrity: passed; expected new `version: 1` and
  null application-link columns are asserted alongside unchanged legacy published values.
- Development drift check: “No difference detected”; fresh synthetic/restored-copy checks passed too.
- Focused browser acceptance: 3 passed, both curriculum structures and viewer denial. Initial launch
  required reinstalling the missing local Playwright browser; no product change was needed for that.
- Full browser regression: **43 passed (5.8m)**. The local run uses the documented
  90-second timeout for existing long workflows; new end-to-end draft flows declare 120 seconds for
  setup/manual/reopen/import/a11y captures. CI keeps its normal suite configuration.

New coverage includes regular and re-exam separation, approved application attempts, create/edit,
missing versus zero, boundaries/precision, incorrect academic combinations, stale versions,
concurrent edits/imports, duplicate requests/rows, replay, changed enrollment/plans, expired/discarded
previews, partially invalid batches, RBAC/CSRF, accurate actor/before-after audit, audit failure rollback,
receipt immutability, all-invalid batch rejection, legacy-draft calculation invalidation, retry safety,
and locked/published protection. The final persistence API file has 20 tests. Database tests exercise nullable
outcome/lifecycle/context constraints; web tests exercise permission and empty-list behavior.

Desktop and 390px scenarios passed serious/critical accessibility and overflow checks. Screenshot
review prompted human-readable audit values and clearer missing-mark messages; the verification
captures below reflect the final UI. Semester/year workflows also verify reload after a saved batch.

## Screenshots and manual acceptance

- [Semester entry, desktop](phase-10c/draft-entry-semester_wise-desktop.png)
- [Semester entry, 390px](phase-10c/draft-entry-semester_wise-mobile.png)
- [Year entry, desktop](phase-10c/draft-entry-year_wise-desktop.png)
- [Year entry, 390px](phase-10c/draft-entry-year_wise-mobile.png)
- [Semester Excel confirmation, 390px](phase-10c/draft-import-semester_wise-mobile.png)
- [Year Excel confirmation, 390px](phase-10c/draft-import-year_wise-mobile.png)

The synthetic browser acceptance sequence selects the full academic context, saves zero internal
marks with a missing external component, sees its validation issue, reopens the draft, supplies an
external mark, observes version 2 and before/after audit, uploads a workbook containing one valid and
one invalid student row, reviews create/update/skip/reject counts, confirms saving, verifies the batch,
reloads the saved notice, and finds the new subject draft. A viewer cannot enter marks.

## Delivery boundary and remaining policy

University pass/fail/absence handling, grading schemes, rounding, GPA/CGPA, re-exam replacement and
carry-forward, approval/publication and certificate generation remain unresolved and unimplemented.
A future reviewed workflow must resolve subject outcomes before a result can leave DRAFT.
History/list views are intentionally bounded to the latest 100 modifications/200 subjects; broader
search/pagination can be added when needed. Atomic imports have a 60-second transaction timeout and
roll back on failure; the existing XLSX row/file limits still apply.

The previously authorized Turbo cache exclusion (`!.next/dev/**`) is preserved in this branch.
The rebuilt local cache remains below 100 MB; graph output, lockfile and development secrets are
untouched. Delivery is a draft PR against main; it must remain unmerged and Phase 10D must not begin.
CI evidence will be linked on that PR against its final SHA.
