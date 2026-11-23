# Student Portal user guide

- **Audience:** students, and the Registrar's office staff who support them.
- **Scope:** activation, sign-in and every page in the student navigation
  (`apps/web/src/features/student-portal/nav.ts`). Students have no roles or permissions; every page
  shows only the signed-in student's own records.
- **Applies to release `916b07c`.**

## Activate your account (first time)

1. Get your **activation code** from the Registrar's office. It is single-use and expires (default
   30 days). Your registration number alone never activates an account.
2. Open `/student/register`, enter your registration number, the activation code and a new password.
3. You are signed in. Next time use `/student/login` with any of your own registration numbers and
   your password.

Forgotten password: ask the Registrar's office for a new activation code and activate again. Changing
the password from Account Settings is not available in this release. Repeated wrong codes revoke the
code; ask for a new one.

## Pages

| Page (path)                                              | What you can do                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard (`/student`)                                   | Overview of your registrations and shortcuts.                                                                                                |
| My Profile (`/student/profile`)                          | Read-only personal and registration details; **Course Details** shows your assigned curriculum (or an honest "not assigned" state).          |
| Update My Details (`/student/profile/update`)            | Propose a missing date of birth, a photo, or corrections to name, parents' names or gender → review → submit. One pending request at a time. |
| My Requests (`/student/requests`)                        | Your profile update requests (cancel while pending), certificate applications and a link to re-exam applications.                            |
| Messages (`/student/messages`)                           | Private conversations with the administration.                                                                                               |
| Examinations (`/student/examinations`)                   | Links to the university's external examination application and your OPEN examination records.                                                |
| Apply for Exam (`/student/examinations/apply`)           | Per registration: periods and OPEN examination records. Regular examination applications are not processed in Docversity (see limitations).  |
| Apply for Re-exam (`/student/examinations/re-exam`)      | Apply for one subject of an open re-examination; then pay (see below).                                                                       |
| Login to Exam Panel (`/student/examinations#exam-panel`) | Opens the external examination application configured by staff.                                                                              |
| Results (`/student/results`)                             | Your **published** results only, filter by period/examination, print; marksheet QR link when available.                                      |
| Certificate Requests (`/student/certificate-requests`)   | Per registration, which certificate types your course offers; apply when the university has enabled applications.                            |
| My Documents (`/student/documents`)                      | Published historical documents, issued official documents (with their QR code), sample PDFs, and your own uploads.                           |
| Verification Queries (`/student/verification-queries`)   | Ask the verification team a question and read the answer.                                                                                    |
| Notifications (`/student/notifications`)                 | In-app notifications (no email or SMS).                                                                                                      |
| Account Settings (`/student/settings`)                   | Account status, activation date, sign-in method; recovery guidance.                                                                          |

## Tasks

### Update your details

1. My Profile → **Update My Details**.
2. Enter only the fields that need changing. Photos: JPEG, PNG or WebP, up to 5 MiB, at least
   200×200 px. The photo is re-encoded without metadata.
3. Review and submit. Staff approve or reject; the official record changes only after approval.

### Apply for a re-exam and pay

1. Examinations → **Apply for Re-exam** → choose registration, the open re-examination and one
   subject. Your identity, attempt number and fee are taken from the record; you do not type them.
2. If a fee applies, open the application → **Payment** → choose your country/region → pay outside
   Docversity to the account shown → enter the transaction reference (and evidence if required).
3. Staff verify the payment against the university account and, separately, decide the application.
   You can cancel only while the application is SUBMITTED.

### See a result

Results appear only after the university has attested, independently reviewed and published them.
Missing marks, grades or GPA are shown as missing, never as zero or fail.

### Documents and QR codes

- Historical documents appear only after staff publish them. Image scans are copies without
  embedded metadata.
- Issued official documents (admission letter, certificates) show a scannable QR code. Anyone who
  scans it at `/verify/qr` can check the document. Share it only with people who should verify it.
- **Your uploads:** one file per category (academic or identity documents). Upload, replace or
  delete your own file. Files only, never identity numbers.

### Certificate requests

Each type shows one of: approved for your course, pending course approval, not offered for your
course, or policy unresolved. In this release applications stay unavailable until the university
approves an application policy for the course.
