# Phase 10D — internal result review and publication safeguards

PR #10 merged at `61b321c649b0a1100b90956db7cbaaf3e9c8194f`; PR #11 merged at
`8cec321370c08bd6dc22c16c63631ea1b5877566`. Exact main
[CI 38080022128](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38080022128) passed.
Codex uses the main development checkout on `feature/phase-10d-result-publication`.
Claude's separate UI worktrees and shared shells/styles/navigation are untouched.

## Delivered infrastructure and policy boundary

- Localized `/admin/results/review` queue filters course, curriculum, academic session, semester/year,
  examination, subject and status, with URL state and bounded pagination (25 by default, max 100).
- Whole-result detail lists subject marks, student/examination context, validation issues, manual/Excel
  origin, import batch reference and chronological review history. Saved marks versions remain readable
  after correction; snapshots exclude names and original spreadsheet cells.
- DRAFT → UNDER_REVIEW submission validates the whole examination attempt and locks its subject marks.
  UNDER_REVIEW → APPROVED, and UNDER_REVIEW/APPROVED → DRAFT return/rejection infrastructure uses
  an explicitly authorized review policy; reasons are required for return/rejection.
- Approval is internal marks acceptance. It neither computes a grading outcome nor publishes a result.
  No total calculation, grade, pass/fail, GPA/CGPA, replacement or carry-forward policy is invented.
- Re-exam subjects remain linked to APPROVED applications and preserve their exact attempt numbers,
  including attempts 1 and 2. Regular examination identity remains separate and unchanged.

**Role-policy gate:** existing authorization documentation calls its role map an initial proposal and
contains no established result approval permission. New `results.review`/`results.approve` permissions
are separate from `results.publish`; publishing access does not imply approval. Review decisions,
returns, rejection and approval stay disabled server-side pending the user's explicit role decision,
including for SUPER_ADMIN. Their successful logic is verified only under an explicitly enabled
synthetic test policy. The implementation does not silently assign approver roles.

**Publication gate:** server and database block publication of reviewed results independently of
approval. The UI explains “Publication configuration required.” No environment flag enables it.
University publishing scope/roles, grading/outcomes, completeness, official attempt selection,
embargo/release dates, corrections and withdrawal remain unresolved. Student/public result pages,
downloadable marksheets and Phase 11 are not implemented.

## Authorization matrix

| Operation                                     | Existing or reserved authorization              | Current policy                                               |
| --------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Queue, detail, context, history/version reads | results.read (existing staff roles)             | Available to authenticated staff; student sessions denied.   |
| Submit complete draft                         | results.write (EXAM_ADMIN, SUPER_ADMIN)         | Available; no maker can silently change submitted marks.     |
| Edit returned draft                           | results.write                                   | Existing Phase 10C only; DRAFT and current version required. |
| Return/reject reviewed version                | results.review                                  | Disabled until reviewer roles are explicitly authorized.     |
| Approve reviewed version                      | results.approve                                 | Disabled until approver roles are explicitly authorized.     |
| Publish                                       | results.publish (existing SUPER_ADMIN/APPROVER) | Always disabled for this workflow.                           |

SUPER_ADMIN's existing ALL_PERMISSIONS grant cannot bypass the disabled policy. Under an explicitly
established review policy, reviewers/checkers must differ from every audited author/editor and the
submitter, including SUPER_ADMIN; every subject requires staff provenance. UI hints supplement API
RBAC, staff authentication and CSRF. Payment verification never approves applications or results.

## Versions, transactions and migration

Migration `20261018090000_result_review_workflow` adds the append-only `result_review_events` table,
actor/result foreign keys and unique result/version receipts. Existing states/models/attempts are reused.
It adds an immutable marks/context snapshot function, snapshot/transition guards, a deferred constraint
requiring the committed parent version/state, reviewed-item locks, approved-parent protection and a
reviewed-result publication blocker. Ungraded internal review/approval requires matching receipts;
publication still requires official outcomes. Existing published/history guards remain intact.

A transition checks expected Result.version, locks the aggregate and uses a SERIALIZABLE transaction
to commit snapshot receipt, state/version and audit atomically. PostgreSQL serialization/deadlock and
Prisma serialization conflicts receive at most three retries; remaining conflicts require reload.
Request UUID + actor + normalized digest permits identical retries without duplicate receipts/audits;
a changed payload, actor or action cannot reuse it. Audit failures and invalid submissions roll back.
Approval revalidates eligibility/completeness and compares the latest submission snapshot with current
marks/context. Returning preserves old snapshots; correction and resubmission create a new version.
Snapshots identify the registration, exam, subject, period, curriculum, session, revision and attempt;
no new grading or result replacement records are created.

## Preservation

Before migration, a private custom-format development backup was restored into a separate database;
all 37 table counts/content hashes and all 1,733 current objects matched. The final migration passed on
both a fresh synthetic database and the restored copy, with “No difference detected” and unchanged
original data hashes. Only then was the additive migration applied to development.

After application, all 36 original data tables retain counts/content hashes and all 1,733 original
MinIO objects retain their keys/sizes/ETags. The migration journal has the expected new entry; the
new review-event table remains empty in development. Development was never reset, reseeded or used
for synthetic result writes. Certificates, payments and historical attempts were preserved. Private
backup/hash evidence remains outside Git. After the browser regression, all 38 development tables
matched the surviving restored verification database (the new migration journal entry excluded),
including all 36 original application tables; the review-event table remained empty. A fresh private
dump of that restored database preserves the verification copy outside Git.

The final MinIO inventory contains 1,794 objects, including synthetic regression uploads. The original
1,733-object key/size/ETag comparison passed immediately after migration. A host/session restart removed
the temporary pre-migration manifest before the final inventory, so the original-object hash comparison
could not be repeated after the full browser suite. No object cleanup or deletion was performed.

## Verification and acceptance

Focused verification: 20 review API tests (including synthetic-policy approval/return/rejection),
three new database guard tests, three UI tests and two semester/year browser workflows. Existing
Phase 10C and database result guards were exercised; the legacy approval test now expects the guarded
review prerequisite rather than the superseded grading-only CHECK name.

Coverage includes complete/incomplete marks, zero/null, curriculum/registration/exam mismatches,
approved re-exam attempts, stale versions, concurrent submission/approval, request replay/misuse,
maker/checker conflicts including SUPER_ADMIN, reason requirements, immutable historical versions,
locked edits, rollback/retry, staff permissions/CSRF/student denial and publication blocked without
policy. Production publication success is intentionally unavailable; no authorized release policy exists.

Full uncached format, lint, typecheck, tests and production build passed; migration drift reported
“No difference detected.” All 670 tests passed: API 324, database 98, web 88, imports 94,
validation 35, types 20, worker 7 and storage 4. All 45 browser tests passed on the full confirmation
run, including Phase 9 payments/applications and Phase 10A–10C workflows. The initial run had one
existing curriculum dialog-close timeout (39 passed, five serial dependents skipped); all six
curriculum tests passed on confirmation without source changes. The retained Playwright final-run
receipt reports passed with no failed tests; temporary console logs were lost in the host restart.

Desktop and 390px acceptance checks passed accessibility (serious/critical WCAG A/AA) and horizontal
overflow checks for semester/year detail and queues. First visual inspection clarified optional blank
marks as “Not entered” and removed the unnecessary raw digest from the staff screen; immutable version
references remain available through the audit API. Final screenshots are synthetic:

- [Semester review, desktop](phase-10d/review-semester_wise-desktop.png)
- [Semester review, 390px](phase-10d/review-semester_wise-mobile.png)
- [Year review, desktop](phase-10d/review-year_wise-desktop.png)
- [Year review, 390px](phase-10d/review-year_wise-mobile.png)
- [Semester queue, 390px](phase-10d/review-queue-semester_wise-mobile.png)
- [Year queue, 390px](phase-10d/review-queue-year_wise-mobile.png)

The independent finish reviewer returned “ship” for all six final captures, with no required visual
fixes. The documentation handoff confirmed reuse of incumbent components, semantic colors and
feature conventions; inherited reference differences were preserved. Desktop queue screenshots
were not captured, and mobile filter compaction was deferred. Accessibility and overflow checks
were executed by the primary workflow rather than independently rerun by the visual reviewer.

## University decisions and Phase 11 dependencies

Authorize review/approval roles and segregation of duties first. Publication additionally needs
approved scope, completeness, grading/outcomes, official regular/re-exam selection, release scheduling,
correction/withdrawal and publisher roles. These require a separately reviewed policy/code change;
Phase 11 must derive student visibility from a precisely authorized published version. It must preserve
review receipts, existing attempts and historical publication guards, and cannot turn payment into
result approval or publication.

See [API contracts](../api/result-review.md), [design](../plans/phase-10d-result-review-publication.md)
and [ADR-0016](../decisions/ADR-0016-internal-review-before-grading.md). Delivery remains a draft PR
against main with both exact-final-SHA CI runs required. No automatic merge or Phase 11.
