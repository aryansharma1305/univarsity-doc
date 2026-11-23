# Examination and certificate workflow guide

- **Audience:** Exam Admin, Registrar, Certificate Admin, Approver, Super Admin.
- **Scope:** examination records, re-exams and their payments, draft marks through review and
  publication, official documents (prepare, approve, issue, revoke, QR), certificate requests,
  historical documents and course certificate eligibility.
- **Applies to release `916b07c`.**

Authoritative detail: [docs/api/examinations.md](../api/examinations.md),
[draft-results.md](../api/draft-results.md), [result-review.md](../api/result-review.md),
[historical-documents.md](../api/historical-documents.md),
[certificate-eligibility.md](../api/certificate-eligibility.md),
[public-verification-completion.md](../development/public-verification-completion.md), ADR-0013,
ADR-0014, ADR-0015, ADR-0016, ADR-0017, ADR-0018, ADR-0024.

## 1. Examination records

Examinations are taken in the university's **separate** examination application. Docversity keeps
records and links only.

1. **Exam Form** (`/admin/examinations/application`, `examinations.manage`): add the external
   application's name, https website, optional Android/iOS links and instructions; activate it.
   Only `https` URLs are accepted.
2. **Exam Schedule** (`/admin/examinations`): create a DRAFT examination: code, name, curriculum
   version (ACTIVE or ARCHIVED), academic session, semester/year, kind `REGULAR` or
   `RE_EXAMINATION`, exam session label.
3. **Open** it (DRAFT → OPEN): students of that curriculum see it. **Archive** it when finished
   (closes re-exam applications). Only DRAFT records can be edited.
4. For a re-examination, toggle **accept re-exam applications** while it is OPEN.

Regular examination applications (eligibility, fee, approval) are not processed in Docversity;
this is an open university decision.

## 2. Re-exam applications and fees

- A student applies for **one subject** of an OPEN re-examination of their own curriculum. The server
  records identity, attempt number (`1 +` earlier non-rejected, non-cancelled applications for that
  subject) and the fee from the ACTIVE fee rule.
- **Fee rules** (`/admin/re-exam-applications/fees`, `reExamFees.manage`, Super Admin): create a
  DRAFT with scope, ISO currency and an amount per attempt (stored in integer minor units), then
  activate it (one ACTIVE rule; frozen once active). Scope `PER_EXAMINATION_SESSION` is refused until
  the policy is defined. Without a rate the application shows fee "not configured" and payment
  cannot start.
- **Decide** (`/admin/re-exam-applications`, `reExamApplications.decide`, Exam Admin): approve (optional
  note) or reject (reason shown to the student). One decision, under a row lock. Export CSV of the
  current filter (up to 5000 rows, audited).

## 3. Re-exam payments

1. **Payment Settings** (`/admin/settings/re-exam-payments`, `reExamPayments.configure`, Super Admin):
   prepare versioned payment details per region group (India, Nepal, Bangladesh, Pakistan,
   Afghanistan, Europe, Central Asia, Others), including the QR image.
2. A **different** Super Admin (not the preparer and not the last editor) approves the version. An
   approved version is frozen; changes need a new version.
3. The student chooses a region, pays outside Docversity and submits the transaction reference (and
   evidence if required). Amount and currency are snapshotted.
4. **Re-exam Payments** (`/admin/re-exam-payments`, `reExamPayments.verify`, Approver): check the
   university's own account, then confirm or reject. Amount and currency must match. Payment never
   approves the application.

Online collection (Razorpay) is not enabled in this release.

## 4. Draft marks → review → publication

| Step                  | Who (permission)                                                | Where                                           | Gate                                                                       |
| --------------------- | --------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Enter or import marks | Exam Admin (`results.write`; import also `imports.results.run`) | Marks Entry `/admin/results/new`, Result Import | Examination OPEN/UNDER_REVIEW; ACTIVE registration on that curriculum      |
| Correct a draft       | Exam Admin (`results.write`)                                    | Draft Results `/admin/results/[id]`             | DRAFT only; version conflict refused                                       |
| Attest outcomes       | `results.write`                                                 | Official records → Results                      | Approved `result` policy for the course                                    |
| Submit for review     | `results.write`                                                 | Result Management `/admin/results/review`       | Complete, valid marks                                                      |
| Return / reject       | `results.review` (Super Admin only)                             | Result Management                               | Approved `result` policy; reason required                                  |
| Approve               | `results.approve` (Super Admin only)                            | Result Management                               | Approved `result` policy; checker ≠ authors, submitter, attester           |
| Publish / withdraw    | `results.publish` (Approver, Super Admin)                       | Official records → Results                      | Exact approved version, attestation and a current approved `result` policy |

Notes:

- Marks are entered, never calculated. Null is missing; `"0"` is zero. Totals are typed. No grade,
  pass/fail or GPA is derived; recorded outcomes come from the university's attestation.
- Re-exam marks require an APPROVED re-exam application and keep its attempt number.
- `POST /result-review/:id/publish` always returns 409; publication goes through
  `official-results/:id/publish`, which writes an immutable publication receipt and a marksheet QR
  credential.
- Withdrawal changes only availability; there is no re-publication or correction API after
  withdrawal (test A16).
- **Policy-gated:** while no approved `result` policy exists for a course, review, approval,
  attestation and publication are refused for that course, including for Super Admin (ADR-0016).

## 5. Official documents

Types in this release: `ADMISSION_LETTER`, `TRANSCRIPT`, `PROVISIONAL`, `CHARACTER`.
Where: **Official records** (`/admin/official-records`).

1. **Policy** (Policies tab): an approved policy for the service (`admission-letter` or
   `certificate`) and the course. See
   [public-verification-and-qr-activation-guide.md](public-verification-and-qr-activation-guide.md).
2. **Template** (Templates tab): prepare a template version for course + type under that policy
   (`templates.write`); a **different** person activates it (`certificates.approve`). Issued
   documents keep their template.
3. **Prepare** (Documents tab, `certificates.generate`): choose registration, document type, policy,
   active template, (certificates) the REVIEW_COMPLETED certificate request, document number, issue
   date and issuance authority reference; upload the university's approved PDF (max 10 MB). The
   university supplies the final PDF; Docversity does not render official documents.
4. **Review** the private PDF (`historicalDocuments.read`).
5. **Approve** (`certificates.approve`): anyone except the preparer. Registration must be ACTIVE or
   COMPLETED.
6. **Issue** (`certificates.issue`): anyone except the preparer; the stored PDF hash is re-checked and
   a random 43-character QR credential is created.
7. **QR delivery:** the student sees the QR in My Documents. Staff with `certificates.issue` use
   **Verification link** on the document (`POST /official-documents/:id/verification-link`, audited
   as `VERIFICATION_LINK_VIEWED`) to print it on or attach it to the physical document. The QR cannot
   be inside the uploaded PDF because the PDF is hash-pinned before issue. Revoked or unissued
   documents have no link.
8. **Revoke** (`certificates.revoke`): reason required. History is preserved, the owner's download
   stops at once, public checks answer REVOKED. There is no re-issue of a revoked document.

## 6. Certificate requests (student applications)

- Lifecycle: SUBMITTED → UNDER_REVIEW ↔ INFORMATION_REQUESTED → INFORMATION_PROVIDED →
  REVIEW_COMPLETED, or CANCELLED (by student) / CLOSED. One open request per student and type.
- Staff: **Certificate Requests** (`certificateRequests.read` / `.review`, Certificate Admin).
- **Policy-gated:** submissions and review completion need an approved certificate policy with an
  `application` block (eligibility, evidence, fee exemption and review authority references) for the
  course. No such policy is seeded. Review completion is never Finance, Rector approval or issuance.
- A REVIEW_COMPLETED request of the same type is required to prepare a certificate.

## 7. Historical documents

1. **Historical Certificates → Upload** (`historicalDocuments.upload`): one registration, PDF/JPEG/PNG,
   certificate number as printed. Original bytes kept with SHA-256.
2. **Publish** (`historicalDocuments.publish`) to the student's library, or **withdraw** with a
   reason. Corrections are replacements; the original becomes SUPERSEDED when the replacement is
   published. Nothing is deleted.
3. **Authenticity** (`historicalDocuments.verify`): CONFIRMED_AGAINST_RECORDS or DISPUTED with a note,
   by someone other than the uploader. Publishing never implies authenticity.
4. Image scans: students receive a re-encoded copy without embedded metadata. PDFs are delivered as
   uploaded (PDF metadata stripping is a follow-up). Older image rows need
   `pnpm documents:backfill-student-copies` before they can be published.

Historical documents are evidence, not cryptographically verified credentials, and are not part of
public verification.

## 8. Course certificate eligibility (ADR-0018)

- Policy `UNIVERSITY_COURSE_DURATION_CERTIFICATES` v1 (code-defined) maps course duration to
  possible types: 2–3 and 6 months → Course Completion; more than 1 year → Transcript, Provisional,
  Character; more than 2 years → also Migration. Exactly 24 months gets no Migration. Unspecified
  durations (exactly 12 months, 4–5, 7–11, under 2 months, missing) fail closed.
- Registrar proposes a set per course (`certificateEligibility.propose`) with a university authority
  reference. **Approval is disabled** until the university authorizes an approver and it is added in
  code. Students therefore see "pending course approval" or "not offered" labels.
- Eligibility is never completion, application availability, payment, Rector approval or issuance.

## Merged, deploys with the next release

- **PR #62:** subject-wise examination timetable (migration `20261201090000_examination_schedule`),
  publish/unpublish to students, clash checks. Exam Form (regular applications) remains blocked.
- **PR #63:** `MIGRATION` document type (migration `20261202090000_migration_certificate_type`),
  issued only with a REVIEW_COMPLETED migration request and approved course eligibility (> 24 months).
  No current production course qualifies (see decisions).
