# Internal result review (Phase 10D)

Staff-only routes under `/api/v1/result-review`; all reads use `results.read`, `Cache-Control: no-store`.
Unsafe requests require staff authentication, CSRF, strict Zod validation and explicit confirmation.
No student/public results or marksheet routes are introduced.

## Routes and contracts

| Route                        | Permission                          | Behavior                                                                                                                                                                |
| ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/`                      | results.read                        | Paginated queue: examinationId, programId, curriculumId, academicSessionId, periodNumber, programSubjectId, status, page, pageSize (max 100). Unknown filters rejected. |
| GET `/contexts`              | results.read                        | Existing course/curriculum/period/examination options, including locked context.                                                                                        |
| GET `/policy`                | results.read                        | Review/approval availability and publication configuration blockers.                                                                                                    |
| GET `/:id`                   | results.read                        | Whole student/examination/attempt version, marks, issues, manual/import provenance and chronological transition history.                                                |
| GET `/:id/versions/:eventId` | results.read                        | Immutable marks from a particular transition; event must belong to result.                                                                                              |
| POST `/:id/submit`           | results.write                       | Valid, complete DRAFT → UNDER_REVIEW.                                                                                                                                   |
| POST `/:id/return`           | results.review + authorized policy  | UNDER_REVIEW/APPROVED → DRAFT; required correction reason.                                                                                                              |
| POST `/:id/reject`           | results.review + authorized policy  | Reject reviewed version with reason; DRAFT permits correction, immutable receipt retains decision.                                                                      |
| POST `/:id/approve`          | results.approve + authorized policy | Valid UNDER_REVIEW → APPROVED; never publishes.                                                                                                                         |
| POST `/:id/publish`          | results.publish                     | Always 409: Publication configuration required. No environment switch enables it.                                                                                       |

State request: `{ requestId: UUID, expectedVersion: positive integer, confirmed: true, reason?: trimmed 1–1000 character string }`.
Transition response (200): `{ requestId, resultId, version, status }`. Missing correction reason is 400;
stale versions/state, request-ID misuse or missing configuration are 409; maker/checker conflicts and
missing permissions are 403. Authentication and CSRF run before permissions. Unknown IDs return 404.
Request IDs are owner/digest scoped: identical authorized replay returns the original receipt, including
after later transitions, without repeating the event or audit. Different payload/actor/action reuse conflicts.

## Policy boundary

Repository role mapping explicitly remains an initial proposal. `results.publish` does not imply the
new review/approval permissions. Until the university/user establishes reviewer roles, the server's
review/approval policy is disabled, including for SUPER_ADMIN. Synthetic API tests explicitly replace
that policy only within isolated test applications; they do not enable production operations.

When an explicitly authorized policy enables review, the checker must differ from every audited
marks author/editor and the submitter, including SUPER_ADMIN; all subject lines require staff provenance.
Result read/write permissions retain their existing grants. Publication stays disabled independently
because scope, grading/outcomes, completeness, official re-exam selection, release dates, corrections,
withdrawal and publishing roles are unresolved. An approval establishes internal acceptance of marks,
not an official grading outcome or student release.

## Completeness, concurrency and integrity

Submission and approval freshly check ACTIVE enrollment, exact assigned curriculum, examination
OPEN/UNDER_REVIEW lifecycle, period and subject assignments, configured components and marks validation.
Regular attempts require every curriculum subject in that examination period and attempt 1. Re-exam
attempts require all APPROVED applications for the student/examination/exact attempt; each subject
retains its approved application's number and link without incrementing or replacing regular results.
Required component blanks are invalid submissions; zero remains zero. No grades, pass/fail, total,
GPA or carry-forward rules are calculated. Entered totals retain their Phase 10C validation.

Each accepted transition locks the result row, checks its expected aggregate version, creates an
append-only receipt with an immutable marks/context snapshot, increments the parent version and writes
actor-attributed state/version/reason audit in one SERIALIZABLE transaction. Serialization/deadlock
retries are bounded to three. A deferred database constraint rejects receipts without the matching
committed state. Snapshot guards reject stale/fabricated marks. UNDER_REVIEW items from this workflow
are frozen; return/rejection explicitly reopens DRAFT. APPROVED parent figures and items are frozen.
Published/historical guards remain in force. No deletion of reviewed history is permitted.

Correction uses existing Phase 10C endpoints and preserves previously reviewed versions. A new
submission gets a new snapshot; approval compares current marks/context to the last submission.
Snapshots contain IDs, marks and academic context; raw source cells and student names are excluded.
Origins/batch IDs come from existing audited manual/Excel saves. Payments never change result states.
