# Phase 10D design — review marks without inventing grading

Baseline PRs #10 and #11 are merged; main SHA is `8cec321370c08bd6dc22c16c63631ea1b5877566`.
Exact main CI [38080022128](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38080022128) finished successfully before implementation verification.
Codex works only in the main development checkout on `feature/phase-10d-result-publication`.
The other UI checkout is untouched.

Reuse Result's DRAFT → UNDER_REVIEW → APPROVED states. Submission validates all existing subject
lines, registration/curriculum/examination eligibility and exact approved re-exam application attempts.
Regular submissions require every assigned subject for the examination period; re-exam submissions
require all APPROVED subject applications for that student/examination/attempt. Missing components
block submission. No totals, grades, pass/fail, GPA, selection or replacement are calculated.

Each submission stores an append-only marks/context snapshot with the current aggregate version,
identity and origin (manual/import audit plus batch). A transition increments Result.version and writes
an append-only event/receipt and audit in one serializable transaction. Request UUID + actor + digest
supports identical retries; changed payload reuse is rejected. Expected version and snapshot hash
protect stale requests and concurrent edits. Returning/rejecting requires a reason and returns to DRAFT,
retaining the old submitted snapshot. Only DRAFT items may be edited; approved parents are frozen.

Review/approval roles and maker/checker enforcement await explicit user policy confirmation because
repository authorization documentation calls its role map a proposal. Submission reuses results.write;
reading reuses results.read. New approval powers will not be inferred from results.publish.

Ungraded UNDER_REVIEW/APPROVED records require the review infrastructure's immutable snapshot;
legacy graded records keep their existing constraints. Publication still requires outcomes and all
university release/selection/embargo/correction/role policies, which are absent. A server policy endpoint
and publication operation report configuration required; no runtime switch enables publication in
this phase, and no student/public results routes are added. Payment never changes result state.

UI is localized under /admin/results/review with queue filters, whole-result detail, issues, source,
chronological history and explicit actions. No shared shells, CSS, navigation or Claude UI files change.

Before migrations: private pg_dump restored to isolated backup database; all 37 table hashes verified.
New migration first runs in fresh synthetic and restored-copy databases. All existing records/objects
are compared after verification. Full repository checks and desktop/390px/a11y acceptance precede
commit/push/draft PR and both exact-head CI runs. Never merge or start Phase 11.
