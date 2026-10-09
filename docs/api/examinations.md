# Examinations (Phase 9)

The university conducts examinations in its **own, separate examination application**. Docversity does
not run examinations: no MCQs, question banks, timers, proctoring, submissions, evaluation or marks
synchronisation. It links to that application, keeps examination **records** tied to the curriculum, and
(Phase 9B/9C) takes re-exam applications with manual payment evidence. Contracts:
`packages/validation/src/examinations/schemas.ts`. Decision: [ADR-0014](../decisions/ADR-0014-examinations-and-re-exams.md).

## Phase 9A — external examination application and examination records

### External examination application (staff)

| Method | Path                           | Permission            | Purpose                                                                            |
| ------ | ------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/examination-apps`     | `examinations.read`   | All configured applications (active first)                                         |
| POST   | `/api/v1/examination-apps`     | `examinations.manage` | Add: name, website, optional Android/iOS, instructions, `isActive` (default false) |
| PATCH  | `/api/v1/examination-apps/:id` | `examinations.manage` | Edit any field or (de)activate                                                     |

URLs: **https only**, a hostname, no embedded user/password, no whitespace (Zod + database CHECK) —
`http:`, `javascript:`, `data:`, `itms:` and similar are refused with `400`. Values are stored as given and
never fetched. Download links are optional; nothing is invented when they are missing. Audit:
`EXTERNAL_EXAM_APP_CREATED`, `EXTERNAL_EXAM_APP_UPDATED` (changed field names only).

### Examination records (staff)

| Method | Path                                            | Permission            | Purpose                                                                                                                                                                  |
| ------ | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/examinations`                          | `examinations.read`   | List; `search` (code, name, session label), `programId`, `curriculumId`, `academicSessionId`, `kind`, `status`, paging                                                   |
| POST   | `/api/v1/examinations`                          | `examinations.manage` | Create a DRAFT: `code`, `name`, `curriculumId`, `academicSessionId`, `periodNumber`, `kind` (`REGULAR`/`RE_EXAMINATION`), `examSession` label, optional `examType` label |
| GET    | `/api/v1/examinations/:id`                      | `examinations.read`   | Detail with history                                                                                                                                                      |
| PATCH  | `/api/v1/examinations/:id`                      | `examinations.manage` | Edit a DRAFT (name, session, period, labels); `409` otherwise                                                                                                            |
| POST   | `/api/v1/examinations/:id/open`                 | `examinations.manage` | DRAFT → OPEN (visible to students of that curriculum)                                                                                                                    |
| POST   | `/api/v1/examinations/:id/archive`              | `examinations.manage` | DRAFT/OPEN → ARCHIVED (closes re-exam applications)                                                                                                                      |
| POST   | `/api/v1/examinations/:id/re-exam-applications` | `examinations.manage` | `{ open }` — accept/stop re-exam applications (OPEN re-examinations only)                                                                                                |

The program is taken from the curriculum version, which must be ACTIVE or ARCHIVED (never an editable
draft); `periodNumber` must be one of its periods. `period.label` reads "Semester n" or "Year n" from the
curriculum's structure. These rules are enforced again by the database (`examinations_curriculum_guard`,
`examinations_re_exam_applications_check`). Records do not schedule examinations or decide eligibility;
the university notifies students through its existing process. Audit: `EXAMINATION_CREATED`,
`_UPDATED`, `_OPENED`, `_ARCHIVED`, `_RE_EXAM_APPLICATIONS_OPENED`, `_RE_EXAM_APPLICATIONS_CLOSED`.

### Student

| Method | Path                           | Purpose                                                                                                                                                                        |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/student/examinations` | Active examination applications, and per **own** registration: program, academic session, assigned curriculum (periods labelled by structure) and its OPEN examination records |

Registrations without an assigned curriculum return `curriculum: null` and no records (the portal shows
an honest "no syllabus assigned" state). Drafts, archived records and other curricula are never shown.
