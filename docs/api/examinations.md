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

## Phase 9C — country/region payments, QR configuration and manual verification

Contracts: `packages/validation/src/examinations/re-exam-payments.ts` and `payment-common.ts`. Docversity
never takes money: students pay **outside** Docversity with the university's approved details and submit a
transaction reference; staff confirm each payment against the university's own account. No gateway,
refund, settlement or exchange-rate logic exists.

- **Choices:** `INDIA`, `NEPAL`, `BANGLADESH`, `PAKISTAN`, `AFGHANISTAN` (countries) and `EUROPE`,
  `CENTRAL_ASIA`, `OTHERS` (region groups; an optional specific country may be named).
- **Payment destinations** (`re_exam_payment_destinations`) are versioned per region: `DRAFT` (staff only,
  editable) → `APPROVED` (by a **different** person than the preparer and the last editor of the draft, QR required, explicit
  `confirmApproved: true`; frozen in the database) → `RETIRED`. At most one APPROVED version per region.
  Students see a destination only while it is APPROVED, switched on and within `effectiveFrom`/
  `effectiveUntil`. Replacing a QR = approving a replacement draft (`replacesDestinationId`), which retires
  the replaced version in the same transaction; payments already started keep their version.
- **QR images:** PNG/JPEG ≤ 2 MB, decoded in full, stored **re-encoded without metadata** under a generated
  key, SHA-256 checked on every read, served `private, no-store`, `nosniff`, sandboxing CSP. Docversity
  cannot read what a QR encodes; the approver confirms it is the university's real QR.
- **Amounts (never computed):** when the destination's currency equals the application's assessed fee
  currency, the amount is the application's snapshotted fee. Otherwise only an explicitly approved
  per-attempt amount of that destination applies (`rates`, integer minor units of its currency); no amount
  → `NO_APPROVED_AMOUNT`. Rates in the active fee rule's own currency are refused.
- **Payment obligation** (`re_exam_payments`): created when the student chooses a region, snapshotting
  destination + version, region, attempt, fee rule + version, amount source, amount and currency. The
  database trigger re-derives the amount on insert, so nothing else can be recorded. One live obligation
  per application (partial unique index). Lifecycle: `AWAITING_PAYMENT → SUBMITTED → VERIFIED | REJECTED`;
  `AWAITING_PAYMENT → VOID` when the student switches region before paying. "Not configured" is a derived
  state (no row). After a rejection the student may start again.
- **Submission:** transaction reference (6–64 chars of letters, digits and separators; short all-digit
  values and text naming PIN/OTP/password/CVV are refused) and evidence per the destination's policy
  (`OPTIONAL`/`REQUIRED`): PDF without scripts/attachments/forms/encryption, or JPEG/PNG stored re-encoded
  without metadata, ≤ 5 MB. The normalised reference (upper-case letters/digits) can back only one
  SUBMITTED/VERIFIED payment (`409`). Submissions cannot be edited.
- **Verification:** `SUBMITTED → VERIFIED` requires `confirmedAgainstUniversityAccount: true` and the
  amount and currency **received**, which must equal the obligation (partial, excess or other-currency
  payments are rejected with a reason instead). `→ REJECTED` needs a reason (shown to the student).
  Decisions run under a row lock (concurrent decisions: one `200`, one `409`) and are final.
- **Separation:** payment never approves or rejects an application, and an application decision never
  changes a payment. Applications show the latest payment (`payment` summary) for information. Payments
  cannot start for rejected/cancelled applications or unassessed fees.
- **Retention:** pending university policy — nothing is deleted (`RE_EXAM_PAYMENT_RETENTION`).

### Staff

| Method | Path                                               | Permission                 | Purpose                                                                                          |
| ------ | -------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/api/v1/re-exam-payment-destinations`             | `reExamPayments.configure` | All versions + per-region overview + active fee currency                                         |
| POST   | `/api/v1/re-exam-payment-destinations`             | `reExamPayments.configure` | DRAFT (or replacement draft)                                                                     |
| GET    | `/api/v1/re-exam-payment-destinations/:id`         | `reExamPayments.configure` | Detail with history                                                                              |
| PATCH  | `/api/v1/re-exam-payment-destinations/:id`         | `reExamPayments.configure` | Edit a DRAFT                                                                                     |
| POST   | `/api/v1/re-exam-payment-destinations/:id/qr`      | `reExamPayments.configure` | multipart `file` (DRAFT only)                                                                    |
| GET    | `/api/v1/re-exam-payment-destinations/:id/qr`      | `reExamPayments.configure` | Stored QR (staff preview)                                                                        |
| POST   | `/api/v1/re-exam-payment-destinations/:id/approve` | `reExamPayments.configure` | `{ confirmApproved: true }`; not by the preparer or last editor                                  |
| POST   | `/api/v1/re-exam-payment-destinations/:id/active`  | `reExamPayments.configure` | `{ active }` (APPROVED only)                                                                     |
| POST   | `/api/v1/re-exam-payment-destinations/:id/retire`  | `reExamPayments.configure` | → RETIRED                                                                                        |
| GET    | `/api/v1/re-exam-payments`                         | `reExamPayments.read`      | List; `search` (name, registration no., subject code, transaction reference), `status`, `region` |
| GET    | `/api/v1/re-exam-payments/:id`                     | `reExamPayments.read`      | Detail: obligation snapshot, evidence summary, same-reference warnings, history                  |
| GET    | `/api/v1/re-exam-payments/:id/evidence`            | `reExamPayments.read`      | Evidence file (checksum-checked; every view audited)                                             |
| POST   | `/api/v1/re-exam-payments/:id/verify`              | `reExamPayments.verify`    | `{ verifiedAmount, verifiedCurrency, confirmedAgainstUniversityAccount: true, note? }`           |
| POST   | `/api/v1/re-exam-payments/:id/reject`              | `reExamPayments.verify`    | `{ reason }` (5–1000)                                                                            |

### Student (own applications only; others are `404`)

| Method | Path                                               | Purpose                                                                                                          |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/student/re-exam-applications/:id/payment` | Pay Now view: identity snapshot, attempt, fee, the eight choices with availability, current and earlier payments |
| POST   | `/api/v1/student/re-exam-applications/:id/payment` | `{ region }` — create the obligation (or replace an unpaid one); strict, no amounts                              |
| GET    | `/api/v1/student/re-exam-payments/:id/qr`          | QR of an own AWAITING_PAYMENT obligation while its destination is available                                      |
| POST   | `/api/v1/student/re-exam-payments/:id/submit`      | multipart `transactionReference` + optional/required `evidence`                                                  |

Start is limited to 30 and submission to 10 requests per account per hour (Redis; fails closed).

Audit: `RE_EXAM_PAYMENT_DESTINATION_CREATED/_UPDATED/_QR_UPLOADED/_APPROVED/_ACTIVATED/_DEACTIVATED/
_RETIRED`, `RE_EXAM_PAYMENT_STARTED/_VOIDED/_SUBMITTED/_VERIFIED/_REJECTED/_EVIDENCE_VIEWED` — IDs, regions,
versions, amounts, file hashes and field names; never transaction references, rejection reasons or notes.
