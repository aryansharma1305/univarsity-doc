# Student Portal simplification (university request, 20 November 2026)

Branch `feature/student-portal-simplification` from main `b4ace7f`. Release notes for reviewers:
`/Users/gugloo/Docvarsity/phase1-release/STUDENT-PORTAL-CHANGES.md` (outside the repository).

## What changed

1. **Dashboard**: welcome, identity card, academic overview and four quick actions only. The
   "Recent activity" feed, the "My requests" card and the second "Documents" card are removed.
2. **My Requests** (`/student/requests`, new nav item): the existing profile-update request list and
   the student's certificate applications, plus a link to re-exam applications.
3. **Course Details** is a section of **My Profile**; `/student/course` redirects to
   `/student/profile#course-details`. Data and API unchanged.
4. **Update My Details** (`/student/profile/update`): the profile is read-only; the existing
   review-then-submit form (or the pending request) appears only there. Workflow and approvals
   unchanged.
5. **Examinations**: exactly three options — Apply for Exam (`/student/examinations/apply`, the
   student's own course examination records with the existing, unavailable exam-fee panel), Apply for
   Re-exam (`/student/examinations/re-exam`, unchanged) and Login to Exam Panel (the configured
   external examination application, new tab; "Not yet available" when none is configured).
6. **Results**: the "Official marksheets" section is removed; "View Result" keeps the honest
   empty/error states.
7. **Certificate Request**: "View Certificate Sample" (→ `/student/certificate-requests/samples`, the
   existing samples and eligibility labels), then Transcript, Provisional, Character, Migration and
   Course Completion, each with Apply. Apply opens the existing application form only when the server
   catalogue marks the service available; otherwise the row says "Not yet available". All five types
   already exist in the enum — no migration. Payment panels say "Online payment not yet available".
8. **My Documents**: student uploads by category (Academic: Class 10, Class 12, Bachelor's, Master's,
   Others; Identity: National ID, Passport, PAN Card, Driving Licence, Other Identity Proof) with
   upload/replace/view/delete; university-published documents stay below, read-only. New backend:
   ADR-0023, `docs/api/student-uploads.md`, migration `20261122090000_student_uploads`, permission
   `studentUploads.read` (REGISTRAR, SUPER_ADMIN). Staff view: "Student uploads" tab on
   `/admin/students/[id]`, read-only, audited.
9. Notifications: unchanged.
10. **Logo**: the official logo replaces the UI-04 crest on the homepage, auth shell (student
    sign-in/activation, Staff Login Centre) and the portal header mark (provenance in
    `apps/web/src/features/public-verification/README.md`).

## Screenshot evidence

Captured from `next start` production builds against a local mock API serving synthetic data only
("Test Student One", `SYN-REG-0001`); before = unchanged main `b4ace7f`, after = this branch. Every
capture had no horizontal overflow and no serious/critical axe violations (1440, 1024, 390).

| Screen                                     | Before 1440                                                                | Before 390                                                                | After 1440                                                                | After 1024                                                                | After 390                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Homepage                                   | [view](student-portal-simplification/before-home-1440.webp)                | [view](student-portal-simplification/before-home-390.webp)                | [view](student-portal-simplification/after-home-1440.webp)                | [view](student-portal-simplification/after-home-1024.webp)                | [view](student-portal-simplification/after-home-390.webp)                |
| Student sign-in                            | [view](student-portal-simplification/before-student-login-1440.webp)       | [view](student-portal-simplification/before-student-login-390.webp)       | [view](student-portal-simplification/after-student-login-1440.webp)       | [view](student-portal-simplification/after-student-login-1024.webp)       | [view](student-portal-simplification/after-student-login-390.webp)       |
| Staff Login Centre                         | [view](student-portal-simplification/before-staff-login-1440.webp)         | [view](student-portal-simplification/before-staff-login-390.webp)         | [view](student-portal-simplification/after-staff-login-1440.webp)         | [view](student-portal-simplification/after-staff-login-1024.webp)         | [view](student-portal-simplification/after-staff-login-390.webp)         |
| Dashboard                                  | [view](student-portal-simplification/before-dashboard-1440.webp)           | [view](student-portal-simplification/before-dashboard-390.webp)           | [view](student-portal-simplification/after-dashboard-1440.webp)           | [view](student-portal-simplification/after-dashboard-1024.webp)           | [view](student-portal-simplification/after-dashboard-390.webp)           |
| My Profile (+ Course Details)              | [view](student-portal-simplification/before-profile-1440.webp)             | [view](student-portal-simplification/before-profile-390.webp)             | [view](student-portal-simplification/after-profile-1440.webp)             | [view](student-portal-simplification/after-profile-1024.webp)             | [view](student-portal-simplification/after-profile-390.webp)             |
| Examinations                               | [view](student-portal-simplification/before-examinations-1440.webp)        | [view](student-portal-simplification/before-examinations-390.webp)        | [view](student-portal-simplification/after-examinations-1440.webp)        | [view](student-portal-simplification/after-examinations-1024.webp)        | [view](student-portal-simplification/after-examinations-390.webp)        |
| Results                                    | [view](student-portal-simplification/before-results-1440.webp)             | [view](student-portal-simplification/before-results-390.webp)             | [view](student-portal-simplification/after-results-1440.webp)             | [view](student-portal-simplification/after-results-1024.webp)             | [view](student-portal-simplification/after-results-390.webp)             |
| Certificate Request                        | [view](student-portal-simplification/before-certificate-request-1440.webp) | [view](student-portal-simplification/before-certificate-request-390.webp) | [view](student-portal-simplification/after-certificate-request-1440.webp) | [view](student-portal-simplification/after-certificate-request-1024.webp) | [view](student-portal-simplification/after-certificate-request-390.webp) |
| My Documents                               | [view](student-portal-simplification/before-documents-1440.webp)           | [view](student-portal-simplification/before-documents-390.webp)           | [view](student-portal-simplification/after-documents-1440.webp)           | [view](student-portal-simplification/after-documents-1024.webp)           | [view](student-portal-simplification/after-documents-390.webp)           |
| Admin student detail                       | [view](student-portal-simplification/before-admin-student-1440.webp)       | [view](student-portal-simplification/before-admin-student-390.webp)       | [view](student-portal-simplification/after-admin-student-1440.webp)       | [view](student-portal-simplification/after-admin-student-1024.webp)       | [view](student-portal-simplification/after-admin-student-390.webp)       |
| Update My Details (new)                    | —                                                                          | —                                                                         | [view](student-portal-simplification/after-profile-update-1440.webp)      | [view](student-portal-simplification/after-profile-update-1024.webp)      | [view](student-portal-simplification/after-profile-update-390.webp)      |
| My Requests (new)                          | —                                                                          | —                                                                         | [view](student-portal-simplification/after-requests-1440.webp)            | [view](student-portal-simplification/after-requests-1024.webp)            | [view](student-portal-simplification/after-requests-390.webp)            |
| Apply for Exam (new)                       | —                                                                          | —                                                                         | [view](student-portal-simplification/after-exam-apply-1440.webp)          | [view](student-portal-simplification/after-exam-apply-1024.webp)          | [view](student-portal-simplification/after-exam-apply-390.webp)          |
| Certificate request detail (payment) (new) | —                                                                          | —                                                                         | [view](student-portal-simplification/after-certificate-detail-1440.webp)  | [view](student-portal-simplification/after-certificate-detail-1024.webp)  | [view](student-portal-simplification/after-certificate-detail-390.webp)  |
| Certificate samples (new)                  | —                                                                          | —                                                                         | [view](student-portal-simplification/after-certificate-samples-1440.webp) | [view](student-portal-simplification/after-certificate-samples-1024.webp) | [view](student-portal-simplification/after-certificate-samples-390.webp) |
