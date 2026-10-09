# Phase 9 — External examinations, re-exam applications and regional QR payments (delivery report)

Baseline `main` at `ac7dc6d` (Phase 8 merge). Delivered as three stacked draft PRs:
**9A** examination application links and examination records · **9B** re-exam applications, attempt
tracking and fee rules · **9C** country/region payment settings, payment evidence and staff verification.
API: [docs/api/examinations.md](../api/examinations.md). Decision: [ADR-0014](../decisions/ADR-0014-examinations-and-re-exams.md).
Manual marks (Part F): [design only](../architecture/manual-marks-entry.md).

**Not built (by instruction):** online examinations, question banks, timers, proctoring, submissions,
evaluation, marks synchronisation, automatic exam notifications, grade/pass/GPA calculation, certificate
generation, public verification, deployment.

## Phase 9A — external examination application and examination records

- **Staff** `/admin/examinations` (records list, filters, create dialog: course → curriculum version →
  semester/year → session), `/admin/examinations/:id` (open, archive, accept/close re-exam applications,
  history), `/admin/examinations/application` (https-only links, instructions, active switch).
- **Students** `/student/examinations` (sidebar "Examinations"; "Results" stays a planned module): the
  examination application card (website, Android/iOS only when configured, instructions) with the plain
  statement that examinations happen outside Docversity and that downloading the app is not a
  registration; per own registration the assigned curriculum's semesters or years and its OPEN records;
  honest states when nothing is configured or no syllabus is assigned.
- **Database:** additive migration `20261014090000_examination_portal_foundation` — enum
  `ExaminationKind`, table `external_exam_applications` (https CHECK), `examinations.curriculum_id`
  (composite FK to the program's curricula), `kind`, `re_exam_applications_open` (re-exams only, CHECK),
  trigger `examinations_curriculum_guard` (period within the curriculum, no DRAFT curricula). Existing rows
  keep their values.
- **RBAC:** `examinations.read` (every staff role), `examinations.manage` (SUPER_ADMIN, EXAM_ADMIN).
- **Tests:** API 4 (https/unsafe URL refusal, RBAC, active-only student view, semester- and year-wise
  labels, period bounds incl. database trigger, draft curriculum refused, duplicate code, lifecycle and
  audit order, regular exams never accept applications, own-registration/OPEN-only student view,
  unassigned state, anonymous 401); types 1; web 4; Playwright 2 (configuration → record → student, with
  axe; 390 px screens).

## University-policy blockers (not invented)

| #   | Decision needed                                                                                                                       | Effect today                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1  | Is the re-exam fee per paper (subject), per application, or per examination session?                                                  | Staff must choose a scope when activating a fee rule; per-session is refused until defined (9B)                                                              |
| P2  | How are re-exam attempts counted (all non-rejected applications? only approved and attended? per subject across curriculum versions?) | 9B counts earlier non-rejected, non-cancelled re-exam applications for the same registration and catalogue subject and stores that basis on each application |
| P3  | Fee for a third or later re-exam                                                                                                      | No amount: payment is blocked with "no approved fee for attempt 3"                                                                                           |
| P4  | Must payment be confirmed before a re-exam application is approved?                                                                   | Not enforced; staff see the payment state when deciding (9C)                                                                                                 |
| P5  | Amounts/currencies for Nepal, Bangladesh, Pakistan, Afghanistan, Europe, Central Asia, Others                                         | Only staff-entered amounts are used; no conversion is computed (9C)                                                                                          |
| P6  | Who verifies payments and who configures payment destinations (a finance role?)                                                       | APPROVER verifies; SUPER_ADMIN configures (proposal)                                                                                                         |
| P7  | Which subjects a student may apply for (only failed/absent ones?)                                                                     | Any subject of the chosen period; staff decide. Results are not in Docversity yet                                                                            |
| P8  | Grading, components and attempt mapping for manual marks                                                                              | Part F design only; Phase 10                                                                                                                                 |
| P9  | Refunds, waivers and partial payments                                                                                                 | Not supported                                                                                                                                                |
