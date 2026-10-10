> Phase 10D extends the internal lifecycle through a separate [review workflow](result-review.md).
> These draft endpoints still edit only DRAFT records; approved/public marks remain protected.

# Internal draft results (Phase 10C)

Staff can enter marks at `/admin/results/new`, open saved subject drafts at `/admin/results/:id`, and
browse the latest 200 subjects at `/admin/results`. Excel upload remains `/admin/results/import`;
its preview offers a separate, deliberate draft-save plan and confirmation. Student/public results
pages remain unavailable. These draft endpoints perform no approval, publication, GPA, certificate
or grading-scheme writes; internal review is handled separately.

All endpoints are under `/api/v1/draft-results`. Staff authentication applies everywhere, unsafe
methods require CSRF, and responses use `Cache-Control: no-store`.

| Method | Route                              | Permission                              | Purpose                                                                                       |
| ------ | ---------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/`, optional `examinationId` UUID | `results.read`                          | Latest 200 DRAFT subject lines                                                                |
| POST   | `/lookup`                          | `results.write`                         | Exact context + text registration number → eligible assignments/components and current drafts |
| POST   | `/`                                | `results.write`                         | Create/edit a single subject draft                                                            |
| GET    | `/:id`                             | `results.read`                          | Saved DRAFT line and aggregate version                                                        |
| GET    | `/:id/history`                     | `results.read`                          | Latest 100 modifications, actors, timestamps and before/after marks                           |
| POST   | `/imports/:previewId/plan`         | `imports.results.run` + `results.write` | Fresh classified save plan                                                                    |
| POST   | `/imports/:previewId/commit`       | `imports.results.run` + `results.write` | Confirmed atomic batch                                                                        |

## Manual write contract

`{ context, registrationId, programSubjectId, reExamApplicationId, expectedVersion, marks }` uses the
existing context (program/curriculum/session/period/examination IDs). Marks contain all five nullable
strings: `internalMarks`, `externalMarks`, `practicalMarks`, `otherMarks`, `totalMarks`.
Null is missing; `"0"` is zero. Numbers must be non-negative, below 10000, with at most two decimals,
and within approved curriculum maxima. Unknown component names and values in unconfigured components
block saves. The total is entered, not calculated; grade/pass/fail/GPA are never derived.

Required blanks are permitted in a manual DRAFT and returned as validation issues. Invalid numbers
or maxima are rejected. Excel requires valid required marks, excluding incomplete rows. All new marks
have null subject outcomes. Applicable maxima are snapshotted on the subject line; no raw workbook,
student name or registration string is stored in its source metadata.

The enrollment must be ACTIVE and follow the examination's exact course/curriculum. The curriculum
subject must belong to its semester/year. Examination session is the selected examination session;
an older student cohort is not silently excluded from a later re-exam. Examinations must be OPEN or
UNDER_REVIEW and curricula must not be DRAFT. Re-exams require an APPROVED application matching the
registration/examination/subject, and use its recorded attempt number unchanged. Payment status
never substitutes for application approval and no marks are carried forward.

Editing draft marks clears any legacy derived totals, outcomes, grade/credit figures and GPA snapshots
with audit tracking; no replacement calculation is performed. Published records remain protected.

For a create, `expectedVersion` is null. An existing subject requires its aggregate `version` for an
edit. A duplicate create or stale version returns 409; reload before editing. Non-DRAFT or ever
published attempts are blocked, including new subjects on locked attempts. This workflow does not
create correction revisions.

## Excel confirmation and replay

The owner-only Redis source/mapping is re-read; previous VALID classifications are never trusted.
The plan returns `digest`, `expiresAt`, counts (`created`, `updated: 0`, `skipped`, `rejected`) and row
numbers/actions/issues. All duplicate student/subject occurrences are rejected. Invalid enrollment,
unknown configurations, missing applications, locked results and different existing draft marks are
rejected; identical marks are skipped. Conflicts must be resolved in manual entry, not overwritten.

An all-invalid plan cannot create an empty saved receipt. Commit takes
`{ batchId: UUID, digest, confirmed: true }`. It revalidates within a SERIALIZABLE
transaction and rejects changed plans with 409. Creates, per-subject audits and the immutable batch
receipt commit together or roll back together. Serialization failures retry at most three times;
unique races return a review/retry conflict. Repeating the same batch ID and digest returns the stored
outcome; divergent reuse is rejected. A new preview of already saved marks produces SKIP rows.
Ownership and fixed two-hour expiry are checked before and at the end of saving; discard, expiry or
mapping changes abort the transaction. Even receipt replay requires a still-accessible preview.

The persistent receipt retains structured row actions/issues and created item IDs, not raw cells.
Its batch UUID is recorded on each subject modification audit. Audit metadata records actor through
the existing infrastructure, context IDs, attempt/application, previous/new marks and aggregate
versions. Audit and receipt tables are append-only; no sensitive identity columns or credentials are
included. `result-imports/previews/:id` exposes `hasSavedDrafts` so reload gives an honest save notice.

## Schema and lifecycle

Migration `20261017090000_draft_result_persistence` adds `results.version`, nullable
`result_items.status`, unique/FK `re_exam_application_id`, and an append-only `result_draft_batches`
receipt table with actor/examination FKs. Existing values remain intact. Database triggers require
valid enrollment/examination/subject/application identity for ungraded lines, enforce regular attempt
1 and preserve approved application attempts. Ungraded lines require a matching immutable review receipt to enter internal review/approval; publication still requires official outcomes. The existing
published result/item guards remain authoritative. No real seed/reset or destructive migration is
required. See [design](../plans/phase-10c-draft-results.md) and [ADR-0015](../decisions/ADR-0015-ungraded-draft-results.md).
