# Manual marks entry — design foundation (Phase 9, Part F)

Status: **design only.** Implementation is Phase 10, after the university approves its grading and
attempt rules. Examinations are conducted in the university's separate application; marks are typed in
by staff afterwards. Docversity never connects to, imports from or scrapes that application.

## What already exists (Phase 2 schema, unchanged)

| Concept                              | Where                                                                                            | Notes                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration                         | `results.student_registration_id`                                                                | the anchor for every result                                                                                                                                                            |
| Examination session                  | `results.examination_id` → `examinations`                                                        | Phase 9A adds `curriculum_id`, `kind` (REGULAR/RE_EXAMINATION)                                                                                                                         |
| Curriculum version + academic period | `examinations.curriculum_id`, `examinations.semester_number` (a semester or a year)              | subject lines point at `program_subjects`, which belong to one curriculum version                                                                                                      |
| Subject                              | `result_items.program_subject_id`                                                                | carries credits, max/pass marks and `component_configuration` of that curriculum version                                                                                               |
| Marks components                     | `result_items.internal_marks / external_marks / practical_marks / other_marks`                   | fixed columns; `program_subjects.component_configuration` (JSON) describes which apply — its shape is unconfirmed                                                                      |
| Draft vs published                   | `results.publication_status` DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED (→ SUPERSEDED/WITHHELD) | one working revision and one published revision per attempt (partial unique indexes); published rows frozen by `results_guard`; items frozen once the result leaves DRAFT/UNDER_REVIEW |
| Attempts                             | `results.attempt_number`                                                                         | unique per (registration, examination, attempt, revision)                                                                                                                              |
| Audit history                        | `audit_logs` (append-only)                                                                       | every write must be audited in the same transaction                                                                                                                                    |

Existing published results are never modified: corrections are new revisions that supersede (database
enforced).

## Proposed data contract for manual entry (Phase 10)

```text
ManualMarksSheet (one per examination + subject)
  examinationId            uuid   → examinations (OPEN, linked to a curriculum)
  programSubjectId         uuid   → program_subjects of examinations.curriculum_id and period
  lines[]:
    studentRegistrationId  uuid   (registration assigned to that curriculum)
    attemptNumber          int    (server-derived, see "Attempts" below — never client input)
    components             { internal?, external?, practical?, other? }  decimal(7,2), each ≤ configured maximum
    absent                 boolean
    remarks                text?  (staff only)
  enteredBy / verifiedBy   staff user ids (two different people — maker–checker)
  status                   DRAFT → SUBMITTED_FOR_VERIFICATION → VERIFIED → (publication via results.publish)
```

Mapping: each line becomes (or updates) a DRAFT `results` row per (registration, examination, attempt)
with one `result_items` row per subject; verification moves it to UNDER_REVIEW/APPROVED; publishing uses
the existing `results.publish` permission (APPROVER — not the person who entered the marks).

## Blockers found in the existing schema and policy

1. **`result_items.status` is NOT NULL and only allows PASS/FAIL/ABSENT/BACKLOG/WITHHELD.** Marks cannot
   be stored without deciding pass/fail, which needs approved grading rules. Phase 10 needs an additive
   change (e.g. a nullable status until approval, or a "MARKS_ENTERED" state) — decided with the rules.
2. **No grading rules.** `grading_schemes.rules` is an empty placeholder; no grade, pass/fail, percentage,
   SGPA/CGPA may be calculated until the university approves the rules (open question 1).
3. **Who entered / verified marks** is not a column today (only the audit log knows). Proposed additive
   columns: `results.entered_by_user_id`, `results.verified_by_user_id` with a CHECK that they differ.
4. **Component shape** in `program_subjects.component_configuration` is unconfirmed (which components per
   subject, maxima, whether internal marks are carried into re-exams).
5. **Attempt numbering across regular exams and re-exams.** `results.attempt_number` counts examination
   attempts; Phase 9B numbers _re-exam applications_ per registration and subject. The university must
   confirm whether the first re-exam is result attempt 2, and whether internal/practical marks carry over.
6. **Marks of a re-exam** must reference the re-examination record (`examinations.kind = RE_EXAMINATION`)
   and, once approved, the student's re-exam application — a link to be added in Phase 10.

Nothing in Phase 9 writes to `results` or `result_items`.
