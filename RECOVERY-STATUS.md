# Student Portal — recovery status (2026-11-21)

## Previous branch / worktree

- Worktree: `../docversity-student-portal`, branch `feature/student-portal-simplification`
  (last commit `0361277`).
- Delivered as **PR #51**, merged into `main` on 2026-11-21 (merge `14ab024`). Main CI on `14ab024`
  was green.
- The worktree was clean (no uncommitted, staged or untracked files). There were no stashes.
- The interrupted session stopped **after** the merge, while it was loading the `14ab024` release
  artifact onto the VPS (that background command was killed at its time limit). This recovery does
  **not** resume that deployment: the current instruction is "no deploy without explicit approval".
  The VPS state of that load has not been checked here.

## Existing code changes (already on `main` via PR #51)

1. Dashboard: Recent Activity, the My Requests card and the second Documents card removed.
2. My Requests: `/student/requests` (profile-update and certificate requests, re-exam link).
3. Course Details: a section of My Profile; `/student/course` redirects to `/student/profile#course-details`.
4. Update My Details: the profile is read-only; the form is only at `/student/profile/update`.
5. Examinations: exactly Apply for Exam, Apply for Re-exam and Login to Exam Panel (configured external
   app, or "Not yet available").
6. Results: Official Marksheet removed; View Result kept.
7. Certificate Request: View Certificate Sample at the top, then the 5 types with Apply. All 5 exist in
   the enum, so no migration was needed. Payment shows "Online payment not yet available".
8. My Documents: student uploads (Academic ×5, Identity ×5). Migration `20261122090000_student_uploads`,
   ADR-0023, content sniffing, 15 MB limit, private keys, ownership checks, audits.
9. Notifications: unchanged.

## Remaining work found (this branch: `feature/student-portal-nav-submenus`)

- The requested navigation nests sub-items: My Profile → Course Details / Update My Details,
  Examination → Apply for Exam / Apply for Re-exam / Login to Exam Panel, Result → View Result.
  Main's sidebar was flat, so these pages were reachable only from inside their parent pages. This
  branch adds the sub-items to the sidebar and to the mobile drawer. The drawer now lists every section
  so the sub-items stay reachable on small screens.

## Conflicts / blockers

- None with PR #49 (Razorpay): this branch touches no payment, API or database code.
- Open university decisions carried over from PR #51: retention period for identity uploads; there is
  no exam-application workflow yet (Apply for Exam shows records and an unavailable fee panel); online
  payment stays off until PR #49 is approved and enabled.
