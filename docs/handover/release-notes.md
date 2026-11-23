# Release notes

- **Audience:** university administration, staff trainers, the operator.
- **Scope:** the three most recent main releases and the open pull requests that are not released.
  Built from `git log` and pull request titles/descriptions.
- **Applies to release `916b07c`** (current production).

Which of these commits were each deployed to production, and when, is recorded in the operator's
private release record; deployment dates are **not verified** in this repository.

## `916b07c` — homepage verification statuses and document QR delivery (current)

Merged 22 November 2026. No new migrations (27 in total).

- **#58 Homepage verification — recorded statuses only, activation procedure.** The public
  registration result is titled and coloured by its recorded status (ACTIVE, COMPLETED, SUSPENDED,
  REVOKED); a suspended or revoked registration is never shown as currently valid. The legend no
  longer lists "Expired", which the system never records. Documents the production activation and
  withdrawal procedure (disable with a superseding policy, not Withdraw).
- **#59 QR verification codes for issued admission letters and certificates.** Students see a
  scannable QR of their own issued documents in My Documents. Staff with `certificates.issue` retrieve
  an issued document's QR (`POST /official-documents/:id/verification-link`, audited
  `VERIFICATION_LINK_VIEWED`, token never logged) to print or attach it. Revoked, unissued, or
  withdrawn-policy documents return no link. The logger redacts `verificationUrl`.

## `21d9146` — communication and public verification

Merged 22 November 2026. Adds migrations `20261128090000_communication` and
`20261129090000_result_verification_token` (27 in total).

- **#56 Chat & Communication.** Student messages (`/student/messages`, `/admin/messages`),
  verification queries from students and the public (`/verify/support`, reference + one-time access
  code), in-app notifications. ADR-0025.
- **#55 Public verification portal.** Anonymous checks under approved disclosure policies for all four
  services, code-fixed field allowlists, credential-gated PDFs and marksheets, result QR credentials,
  no enumeration oracle. ADR-0024.
- **#54 Registration selection in the academic session filter** (staff student list).
- **#57 Verification integration follow-up.** Marksheet QR links route to `/results`; the registration
  sign-in prompt follows each course's latest approved policy; roll-number validation; public support
  accepts student-session CSRF tokens.

## `0071bdb` — student portal and admin workspace reorganisation

Merged 22 November 2026 (00:32 IST). 25 migrations at this commit.

- **#51 Student portal simplification (university request).** Simplified student navigation and pages;
  student uploads of academic and identity files (ADR-0023).
- **#52 Admin workspace reorganisation.** The navigation groups used in this handover (Admission,
  Certificates, Course Management, … Settings & Administration); document shortcuts open the matching
  Official records type; Staff Users & Roles roster for Super Admins.
- **#53 Student portal sub-navigation.** Course Details, Update My Details, Apply for Exam, Apply for
  Re-exam, Login to Exam Panel, View Result.

## Merged, deploys with the next release

| PR  | Title                                                 | Migration                                   | Notes                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #60 | Operational dashboard workload, enrolment and reports | none                                        | Permission-scoped workload counts; eight aggregate reports (enrolment, certificate requests, official documents, results, re-exam applications, verification activity, student messages, verification queries) with CSV and print; no personal data |
| #61 | Staff account creation, role assignment and re-enable | none                                        | `POST /staff-users`, `PATCH /staff-users/:id/roles` (own account refused, last-Super-Admin guard), `POST /staff-users/:id/enable`; dialogs; header unread badge                                                                                     |
| #62 | Subject-wise timetable with publication to students   | `20261201090000_examination_schedule`       | Timetable per examination and subject, clash checks, publish/unpublish, student view; Exam Form still blocked                                                                                                                                       |
| #63 | Official issuance of migration certificates           | `20261202090000_migration_certificate_type` | Adds `MIGRATION` document type; needs REVIEW_COMPLETED request and approved course eligibility (> 24 months, ADR-0018); no current course qualifies                                                                                                 |

Other open PRs not part of this handover: #47 (Razorpay plan), #49 (Razorpay test-mode pilot),
#50 (homepage verification guidance).
