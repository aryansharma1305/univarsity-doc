# Staff roles and permissions

- **Audience:** Super Admins who assign roles, university management who sign off the role model,
  auditors.
- **Scope:** the six staff roles, every permission each grants, and the separation-of-duties rules
  the server enforces.
- **Applies to release `916b07c`.**

## Model

- Roles are database records; permissions are code constants in
  `packages/types/src/permissions.ts`. A role grants permissions only through `ROLE_PERMISSIONS`.
  Changing a grant is a reviewed code change and release, not an admin setting.
- The file states that this mapping is "the initial proposal pending client sign-off". The
  university must confirm it (see [handover-signoff-checklist.md](handover-signoff-checklist.md)).
- Students have no roles. Staff and student sessions are separate; neither can use the other's
  routes.
- A user's permissions are the union of their roles' permissions.

| Role                | Description (`ROLE_DESCRIPTIONS`)                                                           | Permissions |
| ------------------- | ------------------------------------------------------------------------------------------- | ----------- |
| `SUPER_ADMIN`       | Full access, including user and settings management.                                        | 63 (all)    |
| `REGISTRAR`         | Manages student records and imports; prepares certificates.                                 | 41          |
| `EXAM_ADMIN`        | Maintains examination records and the examination application links; prepares results.      | 16          |
| `CERTIFICATE_ADMIN` | Prepares certificates and maintains document templates.                                     | 18          |
| `APPROVER`          | Publishes results, approves, issues or revokes certificates, and verifies re-exam payments. | 22          |
| `VIEWER`            | Read-only access.                                                                           | 11          |

## Role × permission table

Generated from `ROLE_PERMISSIONS` at release `916b07c` (all 63 permissions, in source order).
"Yes" = granted. Regenerate after any change to `permissions.ts`.

| Permission                       | SUPER_ADMIN | REGISTRAR | EXAM_ADMIN | CERTIFICATE_ADMIN | APPROVER | VIEWER |
| -------------------------------- | ----------- | --------- | ---------- | ----------------- | -------- | ------ |
| `verificationPolicies.manage`    | Yes         | —         | —          | —                 | —        | —      |
| `syntheticWorkflows.manage`      | Yes         | —         | —          | —                 | —        | —      |
| `departments.read`               | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `departments.write`              | Yes         | Yes       | —          | —                 | —        | —      |
| `programs.read`                  | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `programs.write`                 | Yes         | Yes       | —          | —                 | —        | —      |
| `academicSessions.read`          | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `academicSessions.write`         | Yes         | Yes       | —          | —                 | —        | —      |
| `students.read`                  | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `students.write`                 | Yes         | Yes       | —          | —                 | —        | —      |
| `registrations.read`             | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `registrations.write`            | Yes         | Yes       | —          | —                 | —        | —      |
| `subjects.read`                  | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `subjects.write`                 | Yes         | Yes       | —          | —                 | —        | —      |
| `curricula.read`                 | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `curricula.write`                | Yes         | Yes       | —          | —                 | —        | —      |
| `curricula.activate`             | Yes         | Yes       | —          | —                 | —        | —      |
| `curricula.archive`              | Yes         | Yes       | —          | —                 | —        | —      |
| `studentCurricula.assign`        | Yes         | Yes       | —          | —                 | —        | —      |
| `results.read`                   | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `results.write`                  | Yes         | —         | Yes        | —                 | —        | —      |
| `results.review`                 | Yes         | —         | —          | —                 | —        | —      |
| `results.approve`                | Yes         | —         | —          | —                 | —        | —      |
| `results.publish`                | Yes         | —         | —          | —                 | Yes      | —      |
| `certificateRequests.read`       | Yes         | —         | —          | Yes               | —        | —      |
| `certificateRequests.review`     | Yes         | —         | —          | Yes               | —        | —      |
| `certificateEligibility.read`    | Yes         | Yes       | —          | Yes               | Yes      | —      |
| `certificateEligibility.propose` | Yes         | Yes       | —          | —                 | —        | —      |
| `certificateEligibility.approve` | Yes         | —         | —          | —                 | —        | —      |
| `certificates.read`              | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `certificates.generate`          | Yes         | Yes       | —          | Yes               | —        | —      |
| `certificates.approve`           | Yes         | —         | —          | —                 | Yes      | —      |
| `certificates.issue`             | Yes         | —         | —          | —                 | Yes      | —      |
| `certificates.revoke`            | Yes         | —         | —          | —                 | Yes      | —      |
| `historicalDocuments.read`       | Yes         | Yes       | —          | Yes               | Yes      | —      |
| `historicalDocuments.upload`     | Yes         | Yes       | —          | Yes               | —        | —      |
| `historicalDocuments.publish`    | Yes         | Yes       | —          | —                 | Yes      | —      |
| `historicalDocuments.verify`     | Yes         | Yes       | —          | —                 | Yes      | —      |
| `examinations.read`              | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `examinations.manage`            | Yes         | —         | Yes        | —                 | —        | —      |
| `reExamApplications.read`        | Yes         | Yes       | Yes        | —                 | Yes      | —      |
| `reExamApplications.decide`      | Yes         | —         | Yes        | —                 | —        | —      |
| `reExamFees.manage`              | Yes         | —         | —          | —                 | —        | —      |
| `reExamPayments.configure`       | Yes         | —         | —          | —                 | —        | —      |
| `reExamPayments.read`            | Yes         | —         | —          | —                 | Yes      | —      |
| `reExamPayments.verify`          | Yes         | —         | —          | —                 | Yes      | —      |
| `templates.read`                 | Yes         | Yes       | Yes        | Yes               | Yes      | Yes    |
| `templates.write`                | Yes         | —         | —          | Yes               | —        | —      |
| `imports.read`                   | Yes         | Yes       | —          | —                 | —        | —      |
| `imports.students.run`           | Yes         | Yes       | —          | —                 | —        | —      |
| `imports.results.run`            | Yes         | —         | Yes        | —                 | —        | —      |
| `studentAccounts.read`           | Yes         | Yes       | —          | —                 | —        | —      |
| `studentAccounts.manage`         | Yes         | Yes       | —          | —                 | —        | —      |
| `studentProfileRequests.read`    | Yes         | Yes       | —          | —                 | —        | —      |
| `studentProfileRequests.review`  | Yes         | Yes       | —          | —                 | —        | —      |
| `studentUploads.read`            | Yes         | Yes       | —          | —                 | —        | —      |
| `studentMessages.read`           | Yes         | Yes       | —          | —                 | —        | —      |
| `studentMessages.respond`        | Yes         | Yes       | —          | —                 | —        | —      |
| `verificationQueries.read`       | Yes         | Yes       | —          | —                 | —        | —      |
| `verificationQueries.respond`    | Yes         | Yes       | —          | —                 | —        | —      |
| `audit.read`                     | Yes         | Yes       | —          | —                 | —        | —      |
| `users.manage`                   | Yes         | —         | —          | —                 | —        | —      |
| `settings.manage`                | Yes         | —         | —          | —                 | —        | —      |

### Permissions granted to no role except SUPER_ADMIN

`verificationPolicies.manage`, `syntheticWorkflows.manage`, `results.review`, `results.approve`,
`certificateEligibility.approve`, `reExamFees.manage`, `reExamPayments.configure`, `users.manage`,
`settings.manage`. Some of these are additionally blocked by the server until the university records
a decision (below). `syntheticWorkflows.manage` covers isolated synthetic test tooling only.

## Separation-of-duties rules (enforced by the server, several also by database constraints)

| Area                           | Rule                                                                                                                                                                                                      | Where enforced                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Verification policies          | Proposer ≠ approver. Approval also refused while `OFFICIAL_VERIFICATION_ENABLED` is off.                                                                                                                  | `verification-policies.service.ts`; DB CHECK `verification_policy_state`   |
| Official document templates    | Person who prepared the template version ≠ person who activates it.                                                                                                                                       | `official-documents.service.ts`                                            |
| Official documents             | Preparer (`certificates.generate`) cannot approve **or** issue; issue requires approver ≠ preparer and the stored PDF hash to match.                                                                      | `official-documents.service.ts`                                            |
| Results review                 | Checker ≠ every audited marks author/editor and ≠ the submitter, including Super Admin. Attester or submitter cannot approve.                                                                             | `result-review.service.ts`; tests A10, A10b                                |
| Course certificate eligibility | Proposer ≠ decider.                                                                                                                                                                                       | DB constraint (migration `20261020090000_program_certificate_eligibility`) |
| Historical documents           | Uploader ≠ authenticity reviewer. Publishing never implies authenticity.                                                                                                                                  | API and DB CHECK (ADR-0013)                                                |
| Re-exam payment destinations   | Approver ≠ preparer and ≠ last editor; approved versions are frozen.                                                                                                                                      | API and DB (`20261016093000_re_exam_payment_destination_editor_check`)     |
| Re-exam payments               | Payment verification (`reExamPayments.verify`) never decides the application (`reExamApplications.decide`).                                                                                               | ADR-0014                                                                   |
| Staff administration           | Cannot reset or disable your own account; cannot disable the last active Super Admin (advisory lock).                                                                                                     | `staff-users.service.ts`                                                   |
| Results publication            | `results.publish` is separate from review/approval; the legacy `/result-review/:id/publish` always returns 409. Official publication uses `official-results/:id/publish` under an approved result policy. | `result-review.service.ts`, `official-workflows.controller.ts`             |

Practical consequence: because only `SUPER_ADMIN` holds `verificationPolicies.manage`, every policy
needs **two different Super Admin accounts**, one to propose and one to approve. The university must
confirm who holds each account (see decisions: "Admin2 account holder identity").

## Policy-gated even for Super Admin

| Capability                                     | Gate                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Results review/return/reject/approve           | Needs an approved `result` policy for the course (ADR-0016, `result-review.service.ts`). |
| Course certificate set approval                | Disabled until a university approval authority is added in code (ADR-0018).              |
| Certificate applications and review completion | Need an approved certificate policy with an `application` block (ADR-0017).              |
| Any OFFICIAL policy approval or use            | `OFFICIAL_VERIFICATION_ENABLED=true` on the API.                                         |
| Live payments (Razorpay)                       | Not enabled in code; `PaymentButtonPolicyService.definition()` returns `null`.           |

## Merged, deploys with the next release

PR #61 adds role assignment through the Admin Panel (`PATCH /staff-users/:id/roles`): your own
account is refused, and removing `SUPER_ADMIN` from the last active Super Admin is refused. Until it
is released, roles are assigned only when the operator creates the account with the CLI.
