# Admin Panel user guide

- **Audience:** university staff who sign in at `/admin/login` (Registrar, Exam Admin, Certificate
  Admin, Approver, Viewer, Super Admin).
- **Scope:** every page in the Admin Panel navigation (`apps/web/src/components/admin/nav.ts`), who
  can use it, the main tasks, and which actions stay blocked until the university approves a policy.
- **Applies to release `916b07c`.**

## How access works

- A navigation entry is shown only when your roles grant **all** listed permissions. Hiding is a
  convenience; the API checks every request again and refuses with "Forbidden" otherwise.
- Role grants are listed in [staff-roles-and-permissions.md](staff-roles-and-permissions.md).
- "Policy-gated" means the button exists but the server refuses the action until a university
  decision is recorded in the system (usually an approved verification policy, see
  [public-verification-and-qr-activation-guide.md](public-verification-and-qr-activation-guide.md)).
- Every write is audited with IDs and field names only, never personal values or passwords.

## Signing in and your own account

1. Open `/admin/login` and sign in with your email and password.
2. Accounts created by the CLI must change the password at first sign-in.
3. If two-step verification is enabled for you, enter the 6-digit code from your authenticator app
   (or a single-use recovery code). `STAFF_MFA_ENFORCED=true` makes enrolment mandatory (ADR-0021).
4. **Settings & Administration → Admin Profile** (`/admin/settings/profile`, any staff) links to
   **Change password** (`/admin/security/password`) and **Two-step verification**
   (`/admin/security/mfa`).

Forgotten password: email delivery is not configured, so self-service reset is refused. A Super
Admin resets access (see Staff Users & Roles), or the operator uses the break-glass CLI
`pnpm staff:reset-access`.

## Workspace Navigation

| Page                 | Permission | What it does                                                                                                              |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (`/admin`) | any staff  | Workspace navigator, pending-work cards (profile requests, re-exam applications, payment submissions) and recent activity |

Merged, deploys with the next release: PR #60 adds workload counts, enrolment by course/session and a Reports
page with eight aggregate reports and CSV export.

## Admission

| Page                                                                                  | Permission                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------- |
| New Admission (`/admin/students/new`)                                                 | `students.write` + `registrations.write` |
| Students (`/admin/students`, `/admin/students/[id]`)                                  | `students.read`                          |
| Student Accounts (`/admin/student-accounts`)                                          | `studentAccounts.read`                   |
| Admission Letter Verification (Official records → Policies, service admission letter) | `certificates.read`                      |
| Issue Admission Letters (Official records → Documents, type admission letter)         | `certificates.read`                      |
| Profile Update Requests (`/admin/profile-requests`)                                   | `studentProfileRequests.read`            |

Tasks:

- **Admit one student:** New Admission → enter student details and the registration (course,
  academic session, registration number) → Save. The server checks that the course is active, the
  session is not archived and course and department match.
- **Find a student:** Students → search by name or registration number. The detail page shows
  registrations, assigned curriculum and, with `studentUploads.read`, a read-only **Student uploads**
  tab (every view and download is audited).
- **Give a student portal access:** Student Accounts → filter (for example by import or state
  `NO_ACCOUNT`) → select → **Issue activation codes** (`studentAccounts.manage`). Codes appear in
  plain text **only in this response**; hand them over through the university's private channel.
  Codes are single-use and expire after `STUDENT_ACTIVATION_CODE_TTL_DAYS` (default 30). Revoke
  codes, or lock, unlock or disable an account (reason required to disable) from the same page.
- **Review a profile change:** Profile Update Requests → open a request → compare current and
  requested values (and the staged photo) → **Approve** or **Reject** with a reason
  (`studentProfileRequests.review`). Only requested fields change. A stale request is refused.
- **Admission letters:** see
  [examination-and-certificate-workflow-guide.md](examination-and-certificate-workflow-guide.md#official-documents).
  Policy-gated: needs an approved `admission-letter` policy for the course.

## Certificates

| Page                                                                        | Permission                                    |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| Certificate Requests (`/admin/certificate-requests`)                        | `certificateRequests.read`                    |
| Official records (`/admin/official-records`)                                | `certificates.read`                           |
| Generate Certificates → Transcript / Provisional / Character                | `certificates.read` + `certificates.generate` |
| Certificate Verification (Official records → Policies, service certificate) | `certificates.read`                           |
| Historical Certificates (`/admin/historical-documents`)                     | `historicalDocuments.read`                    |
| Certificate Templates (`/admin/certificate-templates`)                      | `templates.write`                             |

- **Certificate Requests:** review queue of student applications. Review actions need
  `certificateRequests.review`. Policy-gated: real submissions and review completion require an
  approved certificate policy that includes the application rules (ADR-0017).
- **Official records** has tabs **Documents**, **Policies**, **Templates**, **Results** and (with
  `audit.read`) **Audit**. Procedures: [examination-and-certificate-workflow-guide.md](examination-and-certificate-workflow-guide.md)
  and [public-verification-and-qr-activation-guide.md](public-verification-and-qr-activation-guide.md).
- **Historical Certificates:** upload scans of historic documents for one registration, publish them
  to the student's library, record authenticity. See the workflow guide.
- **Certificate Templates:** preview the code-defined layout with invented sample data. Previews are
  never issued. There is no template editor in the Admin Panel.

## Course Management and Subject Management

| Page                                                           | Permission      |
| -------------------------------------------------------------- | --------------- |
| Manage Courses (`/admin/programs`, `/admin/programs/[id]`)     | `programs.read` |
| Subject Catalogue (`/admin/subjects`)                          | `subjects.read` |
| Course-wise Subject Mapping (`/admin/programs?view=curricula`) | `programs.read` |

Tasks (Registrar):

1. **Create or edit a course** (`programs.write`): code, name, department, level, duration value and
   unit. Duration drives certificate eligibility (ADR-0018).
2. **Maintain subjects** (`subjects.write`): a subject used in an active or archived curriculum or in
   results keeps its frozen identity; retire it instead of renaming.
3. **Build a curriculum version** (`curricula.write`): open a course → Curricula → new DRAFT →
   add subjects to semesters or years with maximum marks.
4. **Activate** (`curricula.activate`): freezes the version. Active windows of one course cannot
   overlap. **Archive** (`curricula.archive`) stops new assignments and keeps history.
5. **Assign students** (`studentCurricula.assign`): explicitly assign an active version to
   registrations. It is never guessed from dates. A registration with results cannot be moved.
6. **Course certificate set** (Phase 12C, course detail page): propose which certificate types the
   course offers (`certificateEligibility.propose`). Policy-gated: approval
   (`certificateEligibility.approve`) is disabled until the university authorizes an approver in code.

## Examination

| Page                                                 | Permission                       |
| ---------------------------------------------------- | -------------------------------- |
| Exam Form (`/admin/examinations/application`)        | `examinations.manage`            |
| Re-exam Applications (`/admin/re-exam-applications`) | `reExamApplications.read`        |
| Re-exam Payments (`/admin/re-exam-payments`)         | `reExamPayments.read`            |
| Exam Schedule (`/admin/examinations`)                | `examinations.read`              |
| Result Management (`/admin/results/review`)          | `results.read`                   |
| Marks Entry (`/admin/results/new`)                   | `results.read` + `results.write` |
| Draft Results (`/admin/results`)                     | `results.read`                   |
| Marksheet Templates (`/admin/marksheet-templates`)   | `templates.write`                |

- **Exam Form** configures the https links of the university's **separate** examination application
  that students open from the portal. Docversity does not run, schedule or mark examinations.
- **Exam Schedule** lists examination records (DRAFT → OPEN → ARCHIVED) tied to a curriculum
  period. It is not a timetable. Merged, deploys with the next release: PR #62 adds a subject-wise timetable.
- **Re-exam Applications:** approve or reject (`reExamApplications.decide`, Exam Admin). Fee rules are
  under `/admin/re-exam-applications/fees` (`reExamFees.manage`, Super Admin only).
- **Re-exam Payments:** confirm or reject a submitted payment after checking the university's own
  account (`reExamPayments.verify`, Approver). Payment never decides the application.
- **Marks Entry / Draft Results / Result Management:** internal draft marks and review; review and
  approval are policy-gated. See the workflow guide.
- **Marksheet Templates:** code-defined preview with invented data only; no editor.

## Schools & Departments and Academic Session

| Page                                                          | Permission                                                |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| Manage Departments (`/admin/departments`)                     | `departments.read` (write: `departments.write`)           |
| Manage Academic Sessions (`/admin/academic-sessions`)         | `academicSessions.read` (write: `academicSessions.write`) |
| Session-wise Student Records (`/admin/students?view=session`) | `students.read` + `academicSessions.read`                 |

There is one organisational level, the department. A separate "School" level above departments does
not exist yet (see [decisions](university-decisions-and-known-limitations.md)).

## Imports & Reports

| Page                                       | Permission             |
| ------------------------------------------ | ---------------------- |
| Result Import (`/admin/results/import`)    | `imports.results.run`  |
| Registration Import (`/admin/imports/new`) | `imports.students.run` |
| Imports (`/admin/imports`)                 | `imports.read`         |

Procedures: [registration-and-result-import-guide.md](registration-and-result-import-guide.md).

## Chat & Communication

| Page                                                 | Permission                                      |
| ---------------------------------------------------- | ----------------------------------------------- |
| Student Messages (`/admin/messages`)                 | `studentMessages.read` (reply: `.respond`)      |
| Verification Queries (`/admin/verification-queries`) | `verificationQueries.read` (answer: `.respond`) |
| Notifications (`/admin/notifications`)               | any staff                                       |
| Verification Audit (Official records → Audit)        | `certificates.read` + `audit.read`              |

- **Student Messages:** open a conversation → reply, resolve or reopen. Messages are append-only.
- **Verification Queries:** questions from students and from the public (`/verify/support`). Answers
  are visible to the requester.
- **Notifications** are in-app only. Email and SMS delivery are not enabled.
- **Verification Audit:** one entry per public check, with hashed references only.

## Settings & Administration

| Page                                                  | Permission                               |
| ----------------------------------------------------- | ---------------------------------------- |
| Admin Profile (`/admin/settings/profile`)             | any staff                                |
| Staff Users & Roles (`/admin/settings/staff`)         | `users.manage` (Super Admin)             |
| Payment Settings (`/admin/settings/re-exam-payments`) | `reExamPayments.configure` (Super Admin) |

- **Staff Users & Roles** (released): view staff accounts, roles, status and two-step state. The API
  also offers **reset access** (clears MFA, forces a new password, revokes sessions) and **disable**
  (refuses your own account and the last active Super Admin) at `/api/v1/staff-users`. In this
  release these two actions have no buttons on the page. New staff accounts are created by the
  operator with the CLI (`create-staff.js --role <ROLE>`).
- **Payment Settings:** versioned payment details per country/region group; a **different** person
  from the preparer and last editor approves; approved versions are frozen.

Merged, deploys with the next release: PR #61 adds Add staff account, Change roles (last-Super-Admin guard),
Reset access, Disable and Re-enable dialogs, and an unread-notification badge in the header.
