# Course curricula (Phase 7B)

All paths below start with `/api/v1`. Staff endpoints require the existing staff session; mutations
require `X-CSRF-Token`. Contracts and generated OpenAPI come from `packages/validation/src/academic/curricula.ts`.

| Method        | Path                                    | Permission / purpose                                                                                            |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET, POST     | `/subjects`                             | `subjects.read` / `subjects.write`: paginated catalogue / create                                                |
| GET, PATCH    | `/subjects/:id`                         | Read / edit catalogue defaults and status; history-locked identity is immutable                                 |
| GET, POST     | `/programs/:id/curricula`               | `curricula.read` / `curricula.write`: versions / create or copy same-program version                            |
| GET, PATCH    | `/curricula/:id`                        | Read / edit draft; active version allows only its end date                                                      |
| POST          | `/curricula/:id/activate`               | `curricula.activate`: validate and freeze draft                                                                 |
| POST          | `/curricula/:id/archive`                | `curricula.archive`: retire draft or active version without deletion                                            |
| POST          | `/curricula/:id/subjects`               | `curricula.write`: add a catalogue subject to a draft period                                                    |
| PATCH, DELETE | `/curricula/:id/subjects/:assignmentId` | Edit / remove draft placement                                                                                   |
| POST          | `/curricula/:id/subjects/reorder`       | Reorder one period using all its assignment IDs                                                                 |
| GET           | `/curricula/:id/registrations`          | `curricula.read` + `registrations.read`: eligible course registrations, search/session/batch/assignment filters |
| POST          | `/curricula/:id/registrations`          | `studentCurricula.assign`: explicit bulk assignment                                                             |
| GET           | `/student/curriculum`                   | Student session only; own registrations and assigned subjects; `no-store`                                       |

Course create/update endpoints retain `/programs` and `programs.write`. Their new fields include
`durationValue`, `durationUnit`, `academicStructure`, `periodCount`, and description. Partial updates
validate the merged stored record. Legacy `durationSemesters` remains compatible for imports/old callers.

## Assignment and lifecycle

`DRAFT → ACTIVE → ARCHIVED`, or `DRAFT → ARCHIVED`. Archived versions cannot be reopened. Version codes
are unique per program. Copy creates a new editable draft with separate placements and preserved catalogue
references. Activation requires at least one subject overall, valid periods/marks, and nonoverlapping
inclusive effective dates among active versions of that program. An empty date bound is open-ended.
Activation does not assign students or replace another version automatically.

Bulk registration assignment takes `registrationIds` (1–500 unique IDs) and optional `replaceExisting`.
It returns `{ assigned, skipped: [{ registrationId, reason }] }`. Wrong-course, already-assigned and
result-bearing registrations are skipped; explicit replacement permits moving another assigned version
only when no results exist. A result-bearing registration is protected even if its current version is null.
Parents and registrations are locked before checking state; archive and assignment cannot race past checks.

Catalogue creation uses uppercase codes and existing subject version 1. Historical catalogue identity
(code, title, category, version) is frozen; description/default credits/status remain maintainable.
`historyLocked` tells the UI to disable identity editing. Placement credits and marks belong to the
curriculum, so later catalogue defaults cannot rewrite them.

## Validation, roles and audit

Structures are semester-wise or year-wise, with 1–40 periods. Duration is 1–240 months or 1–20 years.
Credits are optional (0–99.99); maximum/passing marks are optional (0–1000, two decimal places).
Classification is THEORY/PRACTICAL/COMBINED. At most six uniquely named marks components may be stored;
passing marks cannot exceed maximum marks, and component totals must match a provided maximum.
No grade, pass/fail outcome or university grading formula is inferred.

SUPER_ADMIN and REGISTRAR receive writes/lifecycle/assignment; existing read-only staff roles can read.
All mutations audit IDs, codes, changed field names and counts in the same transaction; student names,
marks values, secrets and submitted personal data are not copied into audit metadata.
Existing API error conventions apply: validation 400, permission 403, conflict 409 (including database
`DV001` integrity guards), missing record 404. Server details are never returned.
