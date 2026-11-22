# Functional acceptance test matrix

- **Audience:** university UAT testers (Registrar, Exam Admin, Certificate Admin, Approver, Super
  Admin, Student), QA reviewers, the operator.
- **Scope:** (1) per module, which automated tests in this repository cover it; (2) manual UAT cases
  per role with steps and expected results. Synthetic data only (for example registration
  `UAT-REG-0001`, student "Test Student One"); never real records.
- **Applies to release `916b07c`.**

Run the automated suites with `pnpm test` (API and web unit) and `pnpm test:e2e` (Playwright); see
CLAUDE.md §4. Test files are under `apps/api/test/`, `apps/web/test/` and `apps/web/e2e/`.

## 1. Automated coverage per module

| Module                                                                     | API (`apps/api/test/…`)                                                                                                                                       | Web unit (`apps/web/test/…`)                                                   | Browser (`apps/web/e2e/…`)                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Staff sign-in, sessions, CSRF, rate limits                                 | `auth/login`, `auth/sessions`, `auth/csrf`, `auth/rate-limiter`, `auth/redis-failure`, `auth/transport`, `auth/credential-races`, `auth/shared-ip-login.unit` | `staff-auth-visual`                                                            | `admin-auth`, `security-headers`                                                   |
| Staff MFA and first login                                                  | `auth/staff-mfa`, `auth/totp.unit`, `cli/create-admin`, `cli/staff-role.unit`                                                                                 | `mfa-enrollment`                                                               | `staff-mfa`                                                                        |
| Password reset (refused without notifier)                                  | `auth/password-reset`, `auth/reset-token-races`, `auth/password.service`                                                                                      | —                                                                              | —                                                                                  |
| RBAC and audit                                                             | `auth/rbac`, `auth/audit`, `security`                                                                                                                         | —                                                                              | `viewer`                                                                           |
| Academic masters (departments, courses, sessions, students, registrations) | `academic/masters`, `academic/students`, `academic/concurrent-records`                                                                                        | `departments`, `student-create`, `search-input`                                | `admin-records`                                                                    |
| Curricula and subjects                                                     | `academic/curricula`, `academic/curriculum-periods`                                                                                                           | `curricula`                                                                    | `curricula`                                                                        |
| Registration import                                                        | `imports/flow`, `imports/commit`, `imports/security`, `imports/registration-2025`, `imports/onboarding-acceptance`, `imports/performance`                     | `imports`                                                                      | `imports`                                                                          |
| Student accounts and activation                                            | `student-auth/activation`, `student-auth/admin`, `student-auth/login-boundary`, `student-auth/secrecy`                                                        | `student-auth-visual`                                                          | `student-portal`, `onboarding-navigation`                                          |
| Profile change requests                                                    | `student-profile/profile-requests`                                                                                                                            | `profile-requests`                                                             | `student-profile`                                                                  |
| Student uploads                                                            | `student-uploads/student-uploads`, `student-uploads/student-upload-file.unit`, `student-uploads/upload-throttle.unit`                                         | `student-uploads`, `upload-limits`                                             | `student-uploads`                                                                  |
| Historical documents                                                       | `historical-documents/historical-documents`, `historical-documents/document-file`, `historical-documents/student-copy`                                        | `historical-documents`                                                         | `historical-documents`                                                             |
| Examinations and exam application links                                    | `examinations/examinations`                                                                                                                                   | `examinations`                                                                 | `examinations`                                                                     |
| Re-exam applications and fees                                              | `examinations/re-exams`                                                                                                                                       | `re-exams`                                                                     | `examinations`                                                                     |
| Re-exam payments                                                           | `examinations/re-exam-payments`                                                                                                                               | `re-exam-payments`                                                             | `re-exam-payments`                                                                 |
| Result import preview                                                      | `result-imports/result-imports`                                                                                                                               | `result-imports`                                                               | `result-imports`                                                                   |
| Draft results                                                              | `results/draft-results`                                                                                                                                       | `draft-results`                                                                | `draft-results`                                                                    |
| Result review                                                              | `results/result-review`                                                                                                                                       | `result-review`                                                                | `result-review`                                                                    |
| Student results                                                            | `results/student-results`                                                                                                                                     | `student-results`                                                              | `student-results`                                                                  |
| Certificate requests                                                       | `certificate-requests/requests`, `certificate-requests/synthetic-lifecycle`                                                                                   | `certificate-requests`                                                         | `certificate-requests`                                                             |
| Course certificate eligibility and samples                                 | `certificate-eligibility/eligibility`, `certificate-eligibility/academic-samples`                                                                             | `certificate-eligibility`, `course-certificate-samples`, `certificate-samples` | `certificate-eligibility`, `student-course-samples`, `student-certificate-samples` |
| Certificate and marksheet templates (preview)                              | `certificate-templates/preview`, `certificate-templates/academic-preview`, `certificate-templates/student-samples`, `marksheet-templates/preview`             | `certificate-templates`, `marksheet-templates`                                 | `certificate-templates`, `marksheet-templates`                                     |
| Official documents, policies, results publication                          | `public-verification/official`, `public-verification/acceptance` (A1–A17)                                                                                     | `issued-documents`                                                             | `official-verification`                                                            |
| Public verification (anonymous, QR)                                        | `public-verification/verification`, `public-verification/acceptance` (B1–B4, A12–A17)                                                                         | `public-verification`, `verification-home`                                     | `public-verification`, `public-verification-acceptance`, `public`                  |
| Communication (messages, queries, notifications)                           | `communication/communication`                                                                                                                                 | `communication`                                                                | `communication`                                                                    |
| Payment buttons (test-only)                                                | —                                                                                                                                                             | `payment-buttons`                                                              | `payment-buttons`                                                                  |
| Dashboards and student workspace                                           | —                                                                                                                                                             | `admin-dashboard`, `student-dashboard`, `student-portal`                       | `admin-dashboard`, `student-workspace`, `mobile`, `accessibility`                  |
| Configuration, health, errors                                              | `api-config`, `health.integration`, `health.degraded`, `errors`, `swagger`, `deploy-preflight`, `runtime-templates`, `with-timeout`                           | `api-health`, `csp`                                                            | `smoke`                                                                            |

Each name omits the `.test.ts(x)` / `.spec.ts` suffix. `apps/api/test/release-workflows/workflows.test.ts`
covers isolated synthetic workflow tooling, not a university feature.

## 2. UAT cases

Preconditions: a non-production or approved test course and session; one synthetic student per
case; each tester signs in with their own account and role. Record case ID, tester role, date,
pass/fail and evidence without personal values or credentials.

### Registrar

| ID   | Steps                                                                                            | Expected result                                                                |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| R-01 | Admission → New Admission: create `UAT-REG-0001` in the test course and session                  | Student and registration created; appears in Students                          |
| R-02 | Registration Import: upload a synthetic workbook with 3 new rows and 1 row with a missing course | Preview shows 3 CREATE, 1 ERROR; error workbook downloadable; commit creates 3 |
| R-03 | Re-run the same import with one changed name, without ticking apply updates                      | The UPDATE row is not applied                                                  |
| R-04 | Student Accounts → issue a code for `UAT-REG-0001`                                               | Code shown once; state becomes code issued                                     |
| R-05 | Profile Update Requests → approve the request from S-03                                          | Only requested fields change; student sees the result                          |
| R-06 | Courses → create a curriculum DRAFT, add subjects, activate, assign to `UAT-REG-0001`            | Version frozen after activation; student sees it in Course Details             |
| R-07 | Historical Certificates → upload a synthetic PDF, publish; try to record authenticity yourself   | Published to student; authenticity by the uploader refused                     |
| R-08 | Student Messages → reply to the message from S-06 and resolve                                    | Student sees the reply and notification                                        |
| R-09 | Try Result Import or Staff Users & Roles                                                         | Not in navigation; direct URL shows Forbidden                                  |

### Exam Admin

| ID   | Steps                                                                              | Expected result                                        |
| ---- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| E-01 | Exam Form: add an `http://` link                                                   | Refused; `https://` accepted                           |
| E-02 | Exam Schedule: create a DRAFT REGULAR examination for the test curriculum, open it | Students of that curriculum see it                     |
| E-03 | Create a RE_EXAMINATION, open it, accept applications                              | Student can apply (S-04)                               |
| E-04 | Re-exam Applications: approve the application from S-04                            | Status APPROVED; student sees it                       |
| E-05 | Marks Entry: enter marks above the configured maximum                              | Refused with a field error                             |
| E-06 | Result Import: upload synthetic marks, validate, save as drafts                    | Drafts appear in Draft Results; grades in file ignored |
| E-07 | Result Management: submit a complete draft                                         | UNDER_REVIEW                                           |
| E-08 | Try to approve the same result                                                     | Not permitted (no `results.approve`)                   |

### Certificate Admin and Approver

| ID   | Steps                                                                                                                                    | Expected result                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C-01 | Certificate Admin: Certificate Templates → open a preview                                                                                | Sample PDF with invented data, marked as sample                 |
| C-02 | Certificate Admin: Official records → Documents → prepare a TRANSCRIPT for the test student (needs SA-02 and a REVIEW_COMPLETED request) | Document pending approval                                       |
| C-03 | Certificate Admin: try to approve own document                                                                                           | Refused                                                         |
| C-04 | Approver: approve and issue the document                                                                                                 | ISSUED; QR credential created                                   |
| C-05 | Approver: Verification link on the issued document                                                                                       | QR shown; audit entry `VERIFICATION_LINK_VIEWED`                |
| C-06 | Approver: revoke with a reason                                                                                                           | REVOKED by number and QR; student download stops                |
| C-07 | Approver: Re-exam Payments → confirm the payment from S-05 after checking the (test) account                                             | Payment VERIFIED; application decision unchanged                |
| C-08 | Approver: publish the result approved in SA-04 (Official records → Results)                                                              | Student sees it in Results; marksheet QR available to the owner |

### Super Admin

| ID    | Steps                                                                                                                              | Expected result                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| SA-01 | Operator confirms `OFFICIAL_VERIFICATION_ENABLED` with `dv-flag-check.sh`                                                          | A single value, not `UNKNOWN`                            |
| SA-02 | Super Admin A proposes a `certificate` policy for the test course, including the application and review rules; tries to approve it | Self-approval refused                                    |
| SA-03 | Super Admin B approves it                                                                                                          | APPROVED; audit PROPOSE/APPROVE                          |
| SA-04 | Approve the result submitted in E-07 (requires an approved `result` policy for the test course)                                    | APPROVED; refused if B is also the submitter or attester |
| SA-05 | Propose a policy with a field outside the allowlist (for example date of birth, via API)                                           | 400                                                      |
| SA-06 | Disable disclosure for the test course with a superseding policy (not Withdraw)                                                    | Public check no longer shows fields                      |
| SA-07 | Staff Users & Roles: view accounts                                                                                                 | Roles, status and two-step state listed                  |
| SA-08 | Payment Settings: prepare a destination; try to approve it yourself                                                                | Refused; a second Super Admin approves                   |

### Student

| ID   | Steps                                                                          | Expected result                                           |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| S-01 | `/student/register` with `UAT-REG-0001`, the code from R-04 and a new password | Signed in; code cannot be reused                          |
| S-02 | Sign out; sign in at `/student/login`                                          | Dashboard shows only own registrations                    |
| S-03 | Update My Details: propose a date of birth and a photo                         | Request pending; profile unchanged until approval         |
| S-04 | Apply for Re-exam: one subject of the open re-examination                      | Application SUBMITTED with server-derived attempt and fee |
| S-05 | Pay: choose a region, submit a synthetic transaction reference                 | Payment submitted for staff verification                  |
| S-06 | Messages: send a message                                                       | Appears in Admin → Student Messages                       |
| S-07 | My Documents: open the issued document from C-04                               | PDF downloads; QR code shown                              |
| S-08 | Results: open the published result from C-08                                   | Only published values; missing values shown as missing    |
| S-09 | Open another student's document or result by guessing a URL                    | Not found                                                 |
| S-10 | Public `/verify/qr` with the QR from S-07 (signed out)                         | Valid; PDF only if the policy allows it                   |
