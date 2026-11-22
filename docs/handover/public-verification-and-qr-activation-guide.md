# Public verification and QR activation guide

- **Audience:** university authorities who approve disclosure, the two Super Admins who propose and
  approve policies, the production operator.
- **Scope:** the four public verification services, the fields they can ever disclose, QR
  credentials, the two-person policy procedure, safe disabling, the `OFFICIAL_VERIFICATION_ENABLED`
  switch and the post-activation test plan.
- **Applies to release `916b07c`.**

Authoritative detail: ADR-0019 (fail-closed public verification), ADR-0024 (anonymous verification),
[public-verification-portal.md](../development/public-verification-portal.md) (screenshots with
synthetic records), [public-verification-completion.md](../development/public-verification-completion.md),
`packages/validation/src/public-verification/official.ts`.

## 1. The four services

| Service                 | Public page                | Without sign-in (only if an approved policy allows)                                            | With the QR credential                                  |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Verify Registration     | `/verify/registration`     | Registration status + approved fields, by registration number                                  | — (no QR for registrations)                             |
| Verify Admission Letter | `/verify/admission-letter` | Validity + approved fields, by document number                                                 | The issued PDF, if `documentWithCredential` is approved |
| Verify Certificate      | `/verify/certificate`      | Validity + approved fields, by certificate number                                              | The issued PDF, if `documentWithCredential` is approved |
| Check Result            | `/results`                 | Course + roll number + semester/year → published status (and outcome if approved), never marks | Full marksheet, if `documentWithCredential` is approved |

QR links open `/verify/qr`. The credential is a 43-character random token kept in the URL fragment
(never sent to the server by the browser) and submitted in a POST body only after the visitor acts.

Controls on every check: per-client and per-reference rate limits, strict request bodies,
`no-store`, identical answers for "unknown", "not enabled for this course", "unpublished" and
"ambiguous" (no enumeration oracle), and one audit event per check with hashed references only.

Registration status is shown as recorded: ACTIVE, COMPLETED, SUSPENDED or REVOKED, each with its own
title and wording (release `916b07c`, PR #58).

## 2. Approved field allowlists (code-fixed)

`PUBLIC_DISCLOSURE_FIELDS` lists the **only** fields a policy may disclose anonymously. A proposal
with any other field is rejected (400).

| Service            | Fields a policy may list                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration`     | `STUDENT_NAME`, `REGISTRATION_NUMBER`, `REGISTRATION_DATE`, `PROGRAM`, `COURSE_LEVEL`, `COURSE_DURATION`, `SCHOOL`, `ACADEMIC_SESSION`, `ADMISSION_DATE`, `COMPLETION_DATE` |
| `admission-letter` | `STUDENT_NAME`, `REGISTRATION_NUMBER`, `PROGRAM`, `COURSE_LEVEL`, `COURSE_DURATION`, `SCHOOL`, `ISSUE_DATE`                                                                 |
| `certificate`      | `STUDENT_NAME`, `REGISTRATION_NUMBER`, `PROGRAM`, `COURSE_LEVEL`, `COURSE_DURATION`, `SCHOOL`, `ISSUE_DATE`, `CERTIFICATE_TYPE`                                             |
| `result`           | `PROGRAM`, `ACADEMIC_SESSION`, `RESULT_OUTCOME`                                                                                                                             |

Never disclosable by policy: photos, date of birth, nationality, identity numbers, contact details,
student uploads. Adding any of them needs a legal/privacy decision and a reviewed code change.

Review combinations: approving `REGISTRATION_NUMBER` for certificates exposes a number that can then
be used for an anonymous registration lookup where that is also enabled. A credential-gated PDF is
returned as issued, so approval must cover everything printed on it, including any photograph. The
full marksheet shown to a credential holder includes the student's name, unmasked roll number and
session, as on paper.

## 3. QR credentials

| Credential                               | Created when          | Who can retrieve it                                                                                                                                                                                                        |
| ---------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document (admission letter, certificate) | At **issue**          | Owner: My Documents (`/student/documents`). Staff with `certificates.issue`: Verification link on the document (`POST /official-documents/:id/verification-link`, audited `VERIFICATION_LINK_VIEWED`, token never logged). |
| Marksheet                                | At result publication | Owner only, with the marksheet. Publications made before migration `20261129090000_result_verification_token` have none (status-only).                                                                                     |

Revoked or unissued documents, and documents whose issuing policy is no longer current, return no
link. The token is redacted from logs (`verificationUrl` key).

## 4. Two-person policy procedure (Admin → Official records → Policies)

Both people need `verificationPolicies.manage`, which only `SUPER_ADMIN` holds. They must be two
different, university-confirmed accounts.

1. **Record the written university decision** for each service and course: institution name,
   authorization reference, date, signatory, the exact fields, and whether QR holders may open the
   PDF/marksheet. Keep it in the handover record (see sign-off checklist).
2. **Proposer:** Official records → **Policies** → choose course and service → enter the approved
   legal issuing institution and the university approval reference (a new policy fully replaces the
   current one, so re-enter everything) → tick "The university authorizes checks without a student
   sign-in for this course" only if approved → tick the approved fields only → tick the credential
   option only if approved → submit. The result is a DRAFT, which discloses nothing.
3. **Approver:** a different person opens the DRAFT and approves it. The API refuses self-approval,
   refuses fields outside the allowlist and refuses any approval while `OFFICIAL_VERIFICATION_ENABLED`
   is off. Both steps are audited (`VERIFICATION_POLICY_CHANGED`, PROPOSE/APPROVE, IDs only).
4. Run the post-activation test plan (section 8).

Disclosure follows the course's **latest approved** policy (by creation time). Validity of an issued
document follows the policy it was issued under.

Switch-on effect across courses: while no course's latest approved registration policy carries
anonymous disclosure, Verify Registration answers "Sign in required" for every number. As soon as one
course enables it, anonymous checks for courses **without** disclosure answer "No verified record
found".

## 5. Safe disabling

To stop public disclosure for a service and course:

1. Propose a **new** policy now for the same service and course **without** the anonymous option
   (re-enter institution and reference).
2. Have the second person approve it. It becomes the latest approved policy and supersedes the old
   one immediately.

**Do not use "Withdraw"** on the current policy for this. Withdrawing makes the next-latest approved
policy apply again, and it may carry an older disclosure. Do not approve an old, stale draft either:
it is older by creation time and supersedes nothing. Issued documents keep their validity.

## 6. `OFFICIAL_VERIFICATION_ENABLED`

- API setting, default `false` (`apps/api/src/config/api-config.ts`), values `true`/`false`/`1`/`0`.
- While `false`: every OFFICIAL policy is treated as absent. Public checks answer "Verification not
  available", OFFICIAL policies cannot be approved, and every workflow that needs a current approved
  policy (template activation, document approval/issue, result review/approval/publication,
  certificate applications) is refused. It is a global switch, not a per-service one.
- In production the API container starts through `deploy/scripts/launch.mjs`, which reads the runtime
  secrets file (default `/run/secrets/runtime`, mounted into the container) and starts the API as a
  child process with those values. The value is read at start; a change takes effect only after the
  API container is restarted, and only the operator changes it.
- The value currently set in production is **not verified** in this repository.

### Confirming the value (operator, read-only)

Run `/tmp/dv-flag-check.sh` on the VPS. As provided to operators it reads three places: the runtime
file on the host, the same file through the API container's mount, and the environment of the API
child process started by `launch.mjs`. It prints only `OFFICIAL_VERIFICATION_ENABLED=<value>`, or
`UNKNOWN` if the three disagree (for example, the file was edited but the API was not restarted).
Treat `UNKNOWN` as a stop: do not propose or approve policies until it is resolved.

### Inventory of what is disclosed (operator, read-only)

Run `/tmp/dv-disclosure-inventory.sh` on the VPS to list, per service and course, the latest approved
policy and whether it carries anonymous disclosure, which fields and the credential option. Use it
before and after every activation or disabling.

Both scripts are operator-held and are **not in this repository**; their content and output format
are **not verified** here. They must stay read-only and must not print secrets or personal data.

## 7. Before activation (checklist)

- [ ] Written authorization recorded (reference, date, signatory, institution name, courses, fields,
      credential option) per service.
- [ ] Both Super Admin account holders confirmed by the university.
- [ ] `dv-flag-check.sh` prints `OFFICIAL_VERIFICATION_ENABLED=true` (not `UNKNOWN`).
- [ ] `dv-disclosure-inventory.sh` output saved as the "before" state.
- [ ] A verified backup exists (see operations doc).

## 8. Post-activation test plan

Use a synthetic or consenting record; record results without personal values.

| #   | Test                                                                                | Expected                                                            |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `dv-disclosure-inventory.sh` again                                                  | Only the approved service/course changed; fields match the decision |
| 2   | Verify Registration with the test registration number                               | Only approved fields; status wording matches the recorded status    |
| 3   | Same check with a made-up number and with a number from a course without disclosure | Identical "No verified record found" answer                         |
| 4   | Admission letter / certificate by number                                            | Validity + approved fields only; no PDF                             |
| 5   | Same document via its QR (`/verify/qr`)                                             | PDF opens only if the credential option was approved                |
| 6   | Check Result: course + roll number + semester                                       | Published status (and outcome if approved); never marks             |
| 7   | Marksheet QR                                                                        | Full marksheet only if approved                                     |
| 8   | A revoked document by number and QR                                                 | REVOKED; no PDF                                                     |
| 9   | Repeat a lookup rapidly                                                             | 429 with `Retry-After` after the budget                             |
| 10  | Admin → Official records → Audit                                                    | One entry per check, hashed references only                         |

If any test shows more than approved, disable immediately using section 5, then investigate.

Automated coverage: `apps/api/test/public-verification/acceptance.test.ts` (A1–A17, B1–B4),
`apps/api/test/public-verification/official.test.ts`, `verification.test.ts`,
`apps/web/test/public-verification.test.tsx`, `apps/web/test/issued-documents.test.tsx`, and
Playwright `official-verification`, `public-verification`, `public-verification-acceptance`, `public`.
