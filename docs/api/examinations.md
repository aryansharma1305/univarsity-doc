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

## Phase 9B — re-exam applications, attempts and fee rules

### Rules

- **One application = one assessment:** one own registration + one re-examination record (kind
  `RE_EXAMINATION`, `OPEN`, accepting applications, same curriculum as the registration) + one subject of
  that semester/year. A second live (SUBMITTED/APPROVED) application for the same registration,
  examination and subject is `409`.
- **Identity is snapshotted** from the registration (student name, registration number, course, academic
  session, semester/year, subject, examination) — the student never types it. Registrations that are not
  ACTIVE/COMPLETED, or have no assigned curriculum, get an honest "unavailable" state.
- **Attempt number (server-derived):** `1 + earlier re-exam applications of the same registration and
catalogue subject that were not rejected or cancelled`, computed under a per-(registration, subject)
  advisory lock and stored with its basis (`NON_REJECTED_RE_EXAM_APPLICATIONS`). Pending university
  confirmation (policy P2).
- **Fees:** versioned rules (`DRAFT → ACTIVE → RETIRED`, one ACTIVE, frozen once active) with an explicit
  scope chosen by staff (`PER_SUBJECT`, `PER_APPLICATION`, `PER_EXAMINATION_SESSION`), an ISO currency and
  an amount per attempt in **integer minor units** (entered as major-unit text, converted with the
  currency's decimal places — never floating point). Because an application covers one subject,
  per-subject and per-application give the same amount; per-session is refused as `SCOPE_NOT_SUPPORTED`
  until the policy defines how subjects combine. An attempt without a rate (e.g. a third re-exam) is
  `NO_RATE_FOR_ATTEMPT`; no active rule is `NO_ACTIVE_RULE`. Such applications are recorded with
  `fee.status = NOT_CONFIGURED` and payment cannot start. The rule id/version, scope, currency and amount
  are snapshotted; later rules never re-price an application (database enforced).
- **Decisions** are separate from payment: `SUBMITTED → APPROVED` (optional note) or `→ REJECTED` (reason,
  shown to the student), once, under a row lock (concurrent conflicting decisions: one `200`, one `409`).
  Students may cancel only SUBMITTED applications. Nothing is deleted.

### Staff

| Method | Path                                       | Permission                  | Purpose                                                                                                                                    |
| ------ | ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/re-exam-fee-rules`                | `reExamApplications.read`   | Fee rule versions                                                                                                                          |
| POST   | `/api/v1/re-exam-fee-rules`                | `reExamFees.manage`         | DRAFT: `{ scope, currency, rates: [{ attemptNumber, amount }], note? }`                                                                    |
| POST   | `/api/v1/re-exam-fee-rules/:id/activate`   | `reExamFees.manage`         | DRAFT → ACTIVE (retires the current ACTIVE)                                                                                                |
| POST   | `/api/v1/re-exam-fee-rules/:id/retire`     | `reExamFees.manage`         | → RETIRED                                                                                                                                  |
| GET    | `/api/v1/re-exam-applications`             | `reExamApplications.read`   | List; `search` (name, registration no., subject code), `status`, `programId`, `academicSessionId` (batch), `periodNumber`, `examinationId` |
| GET    | `/api/v1/re-exam-applications/export`      | `reExamApplications.read`   | CSV of the same filters (≤ 5000 rows; permitted fields only; formula-injection safe; audited without search text)                          |
| GET    | `/api/v1/re-exam-applications/:id`         | `reExamApplications.read`   | Detail: identity snapshot, attempt + basis, fee snapshot, decision, history                                                                |
| POST   | `/api/v1/re-exam-applications/:id/approve` | `reExamApplications.decide` | `{ note? }`                                                                                                                                |
| POST   | `/api/v1/re-exam-applications/:id/reject`  | `reExamApplications.decide` | `{ reason }` (5–1000)                                                                                                                      |

### Student (own records only; others are `404`)

| Method     | Path                                              | Purpose                                                                                                                                           |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET        | `/api/v1/student/re-exam/options`                 | Own registrations with verified identity, open re-examinations, their subjects, the attempt and fee the server would record, and `alreadyApplied` |
| GET / POST | `/api/v1/student/re-exam-applications`            | Own applications / apply `{ registrationId, examinationId, programSubjectId }` (strict — attempt, price or "paid" fields are refused)             |
| GET        | `/api/v1/student/re-exam-applications/:id`        | One own application with fee, decision (incl. reason) and history                                                                                 |
| POST       | `/api/v1/student/re-exam-applications/:id/cancel` | Cancel while SUBMITTED                                                                                                                            |
| POST       | `/api/v1/student/re-exam-applications/:id/fee`    | Re-check a NOT_CONFIGURED fee (attempt never changes)                                                                                             |

Audit: `RE_EXAM_FEE_RULE_CREATED/_ACTIVATED/_RETIRED`, `RE_EXAM_APPLICATION_SUBMITTED/_FEE_ASSESSED/
_CANCELLED/_APPROVED/_REJECTED`, `RE_EXAM_APPLICATIONS_EXPORTED` — IDs, attempt, amounts and versions;
never decision reasons.
