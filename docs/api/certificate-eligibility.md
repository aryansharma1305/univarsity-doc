# Course certificate eligibility API (Phase 12C)

Course configuration only. Nothing here decides student qualification, course completion, Finance
verification, Rector approval or issuance, and nothing enables a certificate application. See
[ADR-0018](../decisions/ADR-0018-course-certificate-eligibility.md).

## Policy

`UNIVERSITY_COURSE_DURATION_CERTIFICATES` v1 (`@docversity/validation`, `evaluateCourseDuration`).
Months = `duration_value` (MONTHS) or `duration_value × 12` (YEARS), from the program record only.

| Course duration (months)    | Tier                  | Types permitted                                                                                                         |
| --------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2, 3, 6                     | `SHORT_COURSE`        | COURSE_COMPLETION                                                                                                       |
| 13–24 (incl. exactly 24)    | `MORE_THAN_ONE_YEAR`  | TRANSCRIPT, PROVISIONAL, CHARACTER                                                                                      |
| > 24                        | `MORE_THAN_TWO_YEARS` | TRANSCRIPT, PROVISIONAL, CHARACTER, MIGRATION                                                                           |
| missing, < 2, 4–5, 7–11, 12 | unresolved            | none (`MISSING_DURATION`, `BELOW_TWO_MONTHS`, `FOUR_TO_FIVE_MONTHS`, `SEVEN_TO_ELEVEN_MONTHS`, `EXACTLY_TWELVE_MONTHS`) |

## Staff endpoints

All responses are `programCertificateEligibilitySchema`, `Cache-Control: no-store`. Writes need CSRF,
are rate limited (30/min per principal) and write their audit entry in the same transaction.

| Method & path                                                        | Permission(s)                 | Notes                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/programs/:programId/certificate-eligibility`            | `certificateEligibility.read` | Policy, evaluation, per-type state, approved/pending sets, history (≤ 100), capabilities                                                                 |
| POST `/api/v1/programs/:programId/certificate-eligibility/proposals` | read + `.propose`             | `{ certificateTypes, authorityReference, rationale? }`; duration/tier are server-derived. 400 outside the tier, 409 unresolved duration or open proposal |
| POST `/api/v1/certificate-eligibility/:configId/withdraw`            | read + `.propose`             | `{ version, note? }`                                                                                                                                     |
| POST `/api/v1/certificate-eligibility/:configId/approve`             | read + `.approve`             | `{ version, note? }`. **403 until a university approval authority exists**; 403 for the proposer; 409 stale/changed duration                             |
| POST `/api/v1/certificate-eligibility/:configId/reject`              | read + `.approve`             | `{ version, note }` (note required); same gates as approve                                                                                               |

Roles: read — REGISTRAR, CERTIFICATE_ADMIN, APPROVER (+ SUPER_ADMIN); propose — REGISTRAR
(+ SUPER_ADMIN); approve — SUPER_ADMIN catch-all only, and still blocked by the missing authority.

## Student endpoints (contract v1 — integration point for UI-05)

| Method & path                                                               | Response schema                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET `/api/v1/student/certificate-eligibility`                               | `studentCertificateEligibilityV1Schema`                             |
| GET `/api/v1/student/certificate-eligibility/registrations/:registrationId` | `studentRegistrationEligibilityResponseV1Schema` (404 unless owned) |

Both are student-session only, take no query parameters (unknown ones → 400) and return
`contract: "docversity.student-certificate-eligibility"`, `contractVersion: 1`. Each registration
carries `registrationId`, `registrationNumber`, `registrationStatus`, `program { code, name,
durationMonths }`, `duration { outcome, tier, unresolvedReason }`, `courseConfiguration`
(`APPROVED | PENDING_APPROVAL | NOT_CONFIGURED | OUT_OF_DATE`) and exactly five `certificates`:

```ts
{
  certificateType: 'COURSE_COMPLETION' | 'TRANSCRIPT' | 'PROVISIONAL' | 'CHARACTER' | 'MIGRATION';
  typeEligibility: 'APPROVED_FOR_COURSE' | 'PENDING_COURSE_APPROVAL' | 'NOT_OFFERED_FOR_COURSE' | 'POLICY_UNRESOLVED';
  samplePreviewAllowed: boolean;               // true exactly when APPROVED_FOR_COURSE
  samplePreviewTemplate: { templateId: string; version: number } | null; // present exactly when allowed
  applicationAvailability: 'AVAILABLE' | 'NOT_AVAILABLE'; // Phase 12B policy, reported as-is
  courseCompletionStatus: 'NOT_EVALUATED';
  paymentVerification: 'NOT_AVAILABLE';
  rectorApproval: 'NOT_AVAILABLE';
  issuance: 'NOT_AVAILABLE';
}
```

### UI-05 integration requirements

- Import the Zod schemas/types from `@docversity/validation` and parse responses; never re-declare.
- Show a sample certificate **only** when `samplePreviewAllowed` is true, using `samplePreviewTemplate`.
  Never infer types from duration, programme name or level on the client.
- Show eligibility per registration; never pick the first/latest/active registration. If the UI needs
  one registration, the student selects it and the client calls the per-registration endpoint.
- Distinguish `PENDING_COURSE_APPROVAL` ("pending"), `NOT_OFFERED_FOR_COURSE` ("not offered") and
  `POLICY_UNRESOLVED` ("university policy pending"); none of them may show a sample.
- Never present type eligibility as qualification, application availability, payment, Rector approval
  or issuance. Today no type is `APPROVED_FOR_COURSE` in production (approval authority pending), so
  UI-05 must render an honest empty/pending state.
- A breaking change ships as `contractVersion: 2` on a new path or alongside v1; v1 is not mutated.
