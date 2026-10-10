# Results import previews (Phase 10B)

Staff with `imports.results.run` can use `/admin/results/import`. Upload, mapping, validation and
preview endpoints remain read-only for marks. Phase 10C adds a separate, confirmed
[draft persistence workflow](draft-results.md) requiring `results.write` as well; it saves internal
DRAFT records only. There is no approval/publication or registration, grading-scheme, certificate or
payment modification.

```text
Existing examination context → XLSX upload → worksheet/column mapping → validation
  → paginated preview → download issues → discard or automatic expiry
```

All routes live under `/api/v1/result-imports`. Global staff authentication, permission and CSRF
checks apply; student sessions cannot use them. Responses and inputs use shared Zod contracts.

| Method | Path                         | Behaviour                                                                                                                         |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/context`                   | Courses, curriculum versions, periods, sessions and associated examinations; unavailable contexts carry a blocker                 |
| GET    | `/template`                  | XLSX template; registration column uses text formatting; no grade column                                                          |
| POST   | `/previews`                  | Multipart `file`, `programId`, `curriculumId`, `academicSessionId`, `periodNumber`, `examinationId`; returns 201 preview metadata |
| GET    | `/previews/:id`              | Owner's metadata and current academic context                                                                                     |
| POST   | `/previews/:id/validate`     | `{ worksheet, columns: { registrationNumber: 1, subjectCode: 2, totalMarks: 3 } }`; returns classified counts                     |
| GET    | `/previews/:id/rows`         | Standard page/search/sort query; `filter=all                                                                                      | valid | warnings | errors`, optional issue `code` |
| GET    | `/previews/:id/error-report` | Private XLSX containing rows with errors or warnings and their original Excel row numbers                                         |
| DELETE | `/previews/:id`              | Discards temporary data, returns 204                                                                                              |

An examination must be OPEN or UNDER_REVIEW and belong to the selected course, curriculum, session
and period. Its period must contain subjects. Draft curricula and draft/published/archived exams are
blocked. Context is checked again at validation. The UI derives semester/year labels from curriculum
structure. No attempt or revision number is invented.

Registration and subject columns are mandatory. Required configured component columns must be mapped;
at least one marks column is necessary. Columns cannot be reused, mapped outside the worksheet, or
mapped from sensitive identity-number headers. Suggestions reuse the Phase 5 normalization rules.

The Phase 10A validator checks text registration identity (including leading zeros), curriculum and
period membership, unknown/ambiguous subjects, duplicate student/subject rows, missing marks, numeric
precision, negative values and configured maxima. Inactive registrations and existing examination
results warn. Grades, when supplied, warn and are ignored. Component names are matched only to the
existing marks-field aliases; unknown/ambiguous names are reported as configuration required, never
guessed. No pass/fail, grades, GPA, CGPA, credits or re-exam replacement rules are calculated.

## Temporary lifecycle and file security

Previews use Redis, not PostgreSQL staging or MinIO. Metadata and compressed source/classified rows
expire two hours after upload; reading or validating does not extend that expiry. There are at most
five open previews per staff member, enforced atomically. Discard deletes all preview keys. A late
validation cannot recreate a discarded or expired preview. Unknown, expired and another owner's IDs
all return the same 404. Users must upload again after expiry; previews are not historical records.

The existing XLSX upload size, archive-inflation, worksheet and column limits apply. The total data
rows retained across usable worksheets cannot exceed `IMPORT_MAX_ROWS`. Formula cells are never
executed and cached formula results are not accepted as marks or registration identity. Sensitive
columns are dropped before storage. Reports escape spreadsheet formulas, and downloads use
`Cache-Control: no-store`. Audit metadata includes context IDs, mapped field names, hashes and counts,
never uploaded values, registration numbers or student names.
