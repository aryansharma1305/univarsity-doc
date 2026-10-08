# Phase 6.5 — Student portal UI

Frontend-only extension of Phase 6. Next.js routes use the existing `StudentMe` contract and the
cached server student-session lookup. No API, academic data, migrations, auth/CSRF flows or design
system dependencies change. The mentor reference guides hierarchy, not fixture content or invented
services.

Design direction: Operate mode, built in code against the mentor reference and the existing Docversity tokens.
The quality target is a dense, readable university workspace with accessible navigation and honest service states.

## Screens and components

- Public home/header: Student Login, Activate Student Account and Staff Login; desktop/mobile access;
  explicit unavailability on public verification service cards and navigation.
- `/student`: navy sidebar, student identity bar, overview, four quick links, profile/academic cards,
  every real registration, results/documents unavailable states, recent activity and help.
- `/student/profile`: read-only personal information; explicit missing DOB/photo; initials fallback.
- `/student/course`: every registration's program, department, session, references and real dates.
- `/student/settings`: account status, activation date and existing recovery instructions.
- `/student/results`, `/student/documents`, `/student/notifications`: honest planned-service pages.

`StudentShell` owns responsive navigation and existing logout. `STUDENT_NAV` owns routes and availability.
`PortalCard`, `DetailList`, `PortalEmptyState` and `PageIntro` unify composition. `StudentAvatar` uses
initials; `StudentOverview` and the read-only student pages use only authenticated API fields.

The API returns `hasPhoto`, not a photo URL/download endpoint. A stored photo is reported as on record
with display unavailable; there is no arbitrary storage request. Results/documents/notifications
endpoints do not exist, so no counts, grades, PDFs, schedules, progress, staff audit feed, WhatsApp or fee
payment controls are fabricated. The account screen does not promise working password editing.

## Development indicator investigation

The existing development log reports React hydration differences on `<body>` for
`data-new-gr-c-s-check-loaded` and `data-gr-ext-installed`: attributes injected by Grammarly.
This is extension modification, not student rendering/data mismatch. The baseline production browser
flow passed. No dev-indicator configuration or blanket hydration suppression was added. Verify in an
extension-free browser; disable the extension for the local site if it injects attributes before hydration.
The final browser checks assert no page/console errors through student activation and all portal routes.

The baseline also emitted the API's `pg` overlapping-query deprecation warning, outside this frontend
phase, plus the toolchain NO_COLOR/FORCE_COLOR warning. Report these separately from browser failures.

## Evidence

Before captures come from the unchanged Phase 6 production build and disposable E2E database. After
captures use the same synthetic fixture workflow, with no real student records or activation codes in
committed images. Desktop before is 1280px; desktop after is 1440px. Both mobile captures are 390px.

- [Desktop before](phase-6.5/student-home-desktop-before.png)
- [Desktop after](phase-6.5/student-home-desktop-after.png)
- [Mobile before](phase-6.5/student-home-mobile-before.png)
- [Mobile after](phase-6.5/student-home-mobile-after.png)
- Public access navigation: [desktop](phase-6.5/public-home-desktop-after.png), [mobile](phase-6.5/public-home-mobile-after.png)

Compared with the mentor reference: retains navy navigation, light workspace, identity overview,
quick actions, distinct academic/profile/document areas and optional right activity/help column.
It deliberately omits unsupported progress/marks/announcements and uses restrained Docversity colors.
At narrow widths the sidebar becomes a focus-trapped drawer and cards stack without page overflow.

## Verification

Uncached lint, typecheck, all 378 unit/integration tests across 58 files and production build pass.
Formatting passes; database drift reports “No difference detected.” All 19 Playwright E2E tests pass in the production build (1.7 minutes, no cache).
Existing test assertions are retained; the certificate navigation matcher accounts for its new explicit unavailable label.
Additional checks cover every portal route, authentication redirects, active navigation, read-only
profile, no fake downloads/forms, drawer close/focus restoration, console errors and public access links.
No visual-diff tolerances are changed (existing screenshots are manual evidence, not golden assertions).

The generated knowledge graph was refreshed with `graphify update .`. Its pre-existing extractor
limitations remain: missing SQL parser support and a partial parse of `packages/database/src/index.ts`.
No generated graph files were hand-edited. Lint retains the existing TanStack Table compiler warning;
the test toolchain emits NODE_ENV/color-environment warnings and the existing API pg deprecation.

The independent finish review scored all four requested corrections resolved: full-width stacked
activity/help rail, student-facing activity copy, sidebar badge contrast and academic registration status.
Its final disposition was `ship` for that correction list. A separate documentation review confirmed
incumbent theme/type consistency. Existing architecture summary drift (two shells, older public access
copy) remains a context limitation; the implementation and this delivery note describe the student shell.

## Review polish (before merge)

- Quick actions: working actions (My Profile, Course Details) stay solid navy; planned ones (My Results,
  My Documents) are white dashed tiles with a "Soon" label. Both still open their honest status pages.
- Sidebar: a compact "Soon" badge and an 18rem sidebar (matching the mobile drawer) keep every label on
  one line at 1024/1280/1440px and in the 390px drawer; no truncation.
- Recent activity shows exactly one real event, "Student account activated", from `account.activatedAt`
  (already returned by `GET /student/me`). Without a timestamp the existing empty state is shown. No other
  events are listed and no staff audit data is used.
- axe caught two contrast failures during this pass (muted tile caption, badge on the active blue row);
  both were fixed, not suppressed.

## Phase boundary

Stop at Phase 6.5. Recommended Phase 7: student DOB/photo change requests, submission validation,
private ownership-checked photo delivery, staff approval/rejection and audit integration, with reviewed
API/schema changes. Academic results, official certificate generation and notifications remain separate
roadmap work. Do not add them automatically while polishing the portal.
