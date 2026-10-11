# UI-03 — Student portal

## Baseline and scope

Separate worktree/branch `feature/ui-03-student-portal`, based on main
`962907ec7d0d5e0163d8c6d442fae71dc0b03045`. Phase 10D (#12), UI-02 (#13) and CI recovery (#14)
are merged. Main CI [38108636026](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38108636026)
is green. Existing worktrees and local changes are preserved. No backend, schema, authentication,
permissions, fee/attempt logic, result policies or file-authorization changes are in scope.

## Existing UI audit

| Route                                                   | Existing behavior preserved                                                                      | Presentation work                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/student`                                              | Session identity, own registrations, published documents and profile-request events              | Simplify repeated information; identity first, concise tasks and real request status |
| `/student/profile`                                      | Read-only official fields, reviewed correction form, pending request blocks duplicate submission | Clear summary, comfortable forms, consistent panels                                  |
| `/student/profile/requests`                             | Own request history, status/rejection reason, cancellation                                       | Status hierarchy and touch targets                                                   |
| `/student/course`                                       | All own registrations, assigned semester/year curriculum, subjects, unavailable states           | Readable lists and details                                                           |
| `/student/examinations`                                 | Configured external links, own course records                                                    | Clear app access and re-exam entry                                                   |
| `/student/examinations/re-exam`                         | Server-resolved eligibility, attempts and fee, confirmed submission                              | Presentation only                                                                    |
| `/student/examinations/re-exam/applications`            | Own applications, cancellation/fee recheck, separate payment status                              | Distinct status labels                                                               |
| `/student/examinations/re-exam/[applicationId]/payment` | Approved regional destinations, QR/evidence/reference, reconciliation                            | Legible instructions and accessible forms                                            |
| `/student/documents`                                    | Published own documents, secure same-origin downloads                                            | Calm document rows/cards and honest empty state                                      |
| `/student/settings`                                     | Account status and existing recovery instructions                                                | Consistent account panels                                                            |
| `/student/results`, `/student/notifications`            | Explicitly unavailable                                                                           | Preserve honest placeholders                                                         |
| `/student/login`, `/student/register`                   | Existing sign-in and activation                                                                  | Unchanged                                                                            |

The old navy shell has eight equal navigation entries including planned modules. Dashboard profile,
academic and registration panels repeat the same identity fields; examination access is secondary.
Mobile uses a drawer but has no direct thumb navigation. Existing Radix Sheet, shared tokens,
PortalCard/DetailList/PageIntro, StudentAvatar and secure API helpers remain the foundations.
The previous dashboard converted failed reads to empty arrays; UI-03 preserves null and displays
unavailable states instead of claiming there are no records.

## Design direction

Operate mode, within the incumbent visual identity. At 390px the first viewport introduces the
actual student and their registration, then the most useful destinations. Desktop expands the
same hierarchy rather than adding statistics. A navy digital identity surface anchors the light
workspace; request and document sections use restrained typography and whitespace. No fake grades,
current periods, payment totals or notifications. The confirmed priority is balanced identity, documents and examinations.

## Motion and responsive contract

Reuse UI-02's scoped Motion layout indicators and short timing. GSAP is dynamically loaded only
by the dashboard for one bounded welcome/identity/overview/action sequence, from visible defaults;
contexts revert on unmount and reduced motion skips import/spatial movement. No new dependencies.
Touch navigation must remain visible without covering content, drawers must scroll and restore focus,
and every requested screen must fit 1440px, 768px and 390px (plus narrower overflow checks).

## Implementation details

UI-03 preserves the established navy, royal-blue, light-surface palette and Inter/Plus Jakarta Sans
fonts, adding the requested subtle violet accent to the requests icon. Portal-local changes include
the 26/30px welcome heading, 16px card corners and roomier spacing. Four persistent mobile destinations
(Home, Course, Exams, Documents) complement the secondary drawer; desktop retains the existing routes.
The dashboard reads the existing authorized re-exam applications API and distinguishes failed reads
from empty records. Application approval and payment verification remain separate labels. No current
semester/year or grades are inferred from registration dates.

The approximately 400ms GSAP sequence uses the existing power3.out ease. Welcome text retains full
opacity throughout to preserve contrast. The identity moves 6px, overview/actions 4px; optional motion
failure leaves records visible. Navigation uses the existing 220ms Motion indicator and 150ms press
feedback. Reduced motion skips GSAP entirely and removes spatial/press movement. Loading skeletons
pulse only with motion permitted. Radix manages drawer focus trapping, Escape and focus restoration;
primary navigation, buttons and text-entry fields use 44px minimum heights, with a reserved bottom navigation area and safe-area
padding. Static screenshots show settled layouts, not measured animation frame rates.

## Verification findings

The baseline production browser suite passed 49 cases, including the before-capture case. The first
UI-03 run passed all 679 unit/integration tests, production build and database drift check, but had
five browser failures. These exposed profile secondary-text contrast, transient welcome-text contrast
during its opacity entrance, a new test's incorrect assumption that an owned fixture had no documents,
and a staff sign-in rate limit shared between repeated browser runs. Contrast was corrected without
relaxing axe assertions; the mobile ownership test now accepts either the actual published list or
an actual empty state. Existing historical-document tests prove file authorization, while new unit
cases cover unavailable/empty data. Browser session/rate-limit Redis keys now have a unique prefix
per run; authentication thresholds and application logic are unchanged.

The detector ran once over student components and routes and returned no findings. The complete corrected browser suite passed 50 cases; the independent finish reviewer returned **ship**, with no material fixes.

## Visual approval boundary

The user gave final visual approval on 11 October 2026 after reviewing desktop, tablet and the mobile
drawer. The 390px dashboard is included below. Delivery is authorized on the existing feature branch;
optional drawer focus styling and tablet quick-action refinements are deferred. No Phase 11 or
grading/publication changes are included. Final PR/SHA and CI evidence will be reported at delivery.

## Quality gates

| Gate                            | Result                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `pnpm format:check`             | Passed                                                    |
| Uncached lint + typecheck       | 27 tasks passed; inherited TanStack Table warning remains |
| Uncached unit/integration suite | 679 tests passed (web 96, API 325)                        |
| Uncached production build       | 10 tasks passed                                           |
| `pnpm db:check`                 | No drift                                                  |
| Complete Chromium browser suite | 50 passed (6.1 minutes)                                   |

These gates ran from the separate UI-03 worktree with disposable test databases. The baseline main
CI was green; no UI-03 commit has been created. Existing browser coverage includes public landing,
activation/login/logout, staff permissions, curricula, profile review, historical documents, exam and
re-exam workflows, payments, result draft/review/publication and signed file access. Serious/critical
axe checks are automated coverage, not a certification of every WCAG requirement.

## Screenshot evidence

All screenshots use synthetic E2E identities and generated fixture files. Blue placeholder photos
are synthetic browser-drawn images, not real student photographs. Full-page captures describe the
entire workspace; viewport captures show the actual first screen and fixed navigation placement.
Before screenshots were taken from an unchanged production main build. After screenshots were taken from the final corrected production build.

| Screen                                | Before                                                              | After                                                       |
| ------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Dashboard390px                        | [Before](ui-03/ui03-before-dashboard-mobile.png)                    | [After](ui-03/ui03-dashboard-mobile.png)                    |
| Dashboard768px                        | [Before](ui-03/ui03-before-dashboard-tablet.png)                    | [After](ui-03/ui03-dashboard-tablet.png)                    |
| Dashboard1440px                       | [Before](ui-03/ui03-before-dashboard-desktop.png)                   | [After](ui-03/ui03-dashboard-desktop.png)                   |
| Mobile drawer                         | [Before](ui-03/ui03-before-navigation-mobile.png)                   | [After](ui-03/ui03-navigation-mobile.png)                   |
| Tablet drawer                         | [Before](ui-03/ui03-before-navigation-tablet.png)                   | [After](ui-03/ui03-navigation-tablet.png)                   |
| Profile390px                          | [Before](ui-03/ui03-before-profile-mobile.png)                      | [After](ui-03/ui03-profile-mobile.png)                      |
| Profile1440px                         | [Before](ui-03/ui03-before-profile-desktop.png)                     | [After](ui-03/ui03-profile-desktop.png)                     |
| Profile requests390px                 | [Before](ui-03/ui03-before-profile-requests-mobile.png)             | [After](ui-03/ui03-profile-requests-mobile.png)             |
| Course390px                           | [Before](ui-03/ui03-before-course-mobile.png)                       | [After](ui-03/ui03-course-mobile.png)                       |
| Course1440px                          | [Before](ui-03/ui03-before-course-desktop.png)                      | [After](ui-03/ui03-course-desktop.png)                      |
| Examinations390px                     | [Before](ui-03/ui03-before-examinations-mobile.png)                 | [After](ui-03/ui03-examinations-mobile.png)                 |
| Examinations1440px                    | [Before](ui-03/ui03-before-examinations-desktop.png)                | [After](ui-03/ui03-examinations-desktop.png)                |
| Documents390px                        | [Before](ui-03/ui03-before-documents-mobile.png)                    | [After](ui-03/ui03-documents-mobile.png)                    |
| Documents1440px                       | [Before](ui-03/ui03-before-documents-desktop.png)                   | [After](ui-03/ui03-documents-desktop.png)                   |
| Re-exam applications390px             | [Before](ui-03/ui03-before-applications-mobile.png)                 | [After](ui-03/ui03-applications-mobile.png)                 |
| Re-exam form390px                     | [Before](ui-03/ui03-before-re-exam-mobile.png)                      | [After](ui-03/ui03-re-exam-mobile.png)                      |
| Account390px                          | [Before](ui-03/ui03-before-settings-mobile.png)                     | [After](ui-03/ui03-settings-mobile.png)                     |
| Reduced motion390px                   | [Before](ui-03/ui03-before-reduced-motion.png)                      | [After](ui-03/ui03-reduced-motion.png)                      |
| Owned applications with statuses390px | [Before](ui-03/ui03-before-student-re-exam-applications-mobile.png) | [After](ui-03/ui03-student-re-exam-applications-mobile.png) |
| Payment390px                          | [Before](ui-03/ui03-before-student-re-exam-payment-mobile.png)      | [After](ui-03/ui03-student-re-exam-payment-mobile.png)      |
| Payment1440px                         | [Before](ui-03/ui03-before-student-re-exam-payment-desktop.png)     | [After](ui-03/ui03-student-re-exam-payment-desktop.png)     |

First-screen dashboard captures: [390px](ui-03/ui03-dashboard-mobile-viewport.png),
[768px](ui-03/ui03-dashboard-tablet-viewport.png),
[1440px with expanded sidebar](ui-03/ui03-dashboard-desktop-viewport.png).
Populated eligible re-exam forms: [390px](ui-03/ui03-student-re-exam-apply-mobile.png),
[1440px](ui-03/ui03-student-re-exam-apply-desktop.png).
The directory also contains matching desktop history/settings/form captures and original document
workflow captures. These are evidence files rather than pixel-diff assertions; randomized fixture
IDs and timestamps vary between runs.

## Data preservation

Read-only before/after checks passed for all 38 original public database tables (row counts and
content hashes) and all 2,070 original MinIO objects (keys, sizes and ETags). Tests added their own
synthetic fixture objects; no original object or record was removed or modified. No database schema,
authentication handler, grading/publication rule, payment handler or secure download helper changed.

## Independent finish review

A fresh reviewer inspected the final screenshot matrix and sampled source against the supplied brief
and incumbent visual system. Disposition: **ship**, with no material fixes requested. The review
accepted the concise academic overview and four-destination mobile navigation as deliberate
adaptations to the brief, and confirmed the navy identity anchor, immediate document/exam access,
honest data states and distinct application/payment labels. This independent review does not replace
the user's final visual approval on 11 October 2026. The documenter compared the extension with existing tokens,
fonts and motion conventions; global design-system files remain unchanged.

## Approved delivery verification

The approved implementation is preserved. The approved delivery reran all repository gates uncached where
applicable: format passed, 27 lint/typecheck tasks passed, 679 unit/integration tests passed, 10
production-build tasks passed, no database drift, and all 50 Chromium browser tests passed in 6.1
minutes. A repeat preservation check matched all 38 original tables and 2,070 original objects.
Latest main remained `962907ec7d0d5e0163d8c6d442fae71dc0b03045` before commit. Student results and notifications remain unavailable placeholders; the dashboard does
not fetch results or result-review data. API integration coverage rejects a student session on
internal draft/review endpoints, and result-publication tests continue to enforce disabled publication.
No unpublished academic results have been added to student views. Authentication, permissions and
academic/payment/document handlers are unchanged; the only additional dashboard read uses the
existing session-authorized re-exam applications endpoint.
