# UI-05 — student certificate sample preview

## Scope and review boundary

Branch `feature/ui-05-student-certificate-sample` is a separate worktree from latest green main
`ff8b7dfea937772186126dad57ba78d4ab5ede27` (merged Phase 12B).
[Baseline CI](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38769526560) passed.
UI-04 remains untouched in its separate worktree. No Phase 12C template work is included.
The user confirmed My Documents placement with a secondary Certificate Requests link.
Visual approval received on 17 October 2026, with two copy refinements. Delivery is authorized
after complete verification: commit, push and draft PR only. No automatic merge or deployment.

## Student experience

My Documents includes one `View Sample Certificate` section before the existing published-document
library. It identifies the Training Certificate, explains its illustrative purpose and offers direct
`Preview Sample` / `Download Sample PDF` actions. The preview opens the native PDF viewer in a new
protected tab; download uses an attachment response. No extra navigation item, modal, application
form, fake completion date or eligibility promise is introduced. The existing document empty/error
and published-document cards remain intact. Certificate Requests links to this same section rather
than creating another sample area or altering application eligibility/review behavior.

The exact required explanation is visible, with all four restrictions: not issued, not valid for
verification, not evidence of completion and no guarantee of eligibility/issuance. Transcript,
Provisional, Character and Migration sample formats are unavailable: corresponding approved
synthetic certificate templates are absent from main. No training layout is presented as their
format or as the official certificate for every course.

The local addition inherits UI-03 typography, tokens, PortalCard, shared Button, visible focus,
44px actions and existing StudentActionMotion/reduced-motion handling. Desktop groups content in
two columns; tablet/phone stack it. Global design context and private portal navigation are preserved.

## PDF provenance and deterministic delivery

The private package asset [training-v1.pdf](../../packages/documents/assets/samples/training-v1.pdf)
is generated once by the unchanged Phase 12A structured HTML/CSS renderer using `sample-training`
v1 and `syntheticTrainingCertificate('standard')`. No student object is supplied. The fictional
Alex Sample / SAMPLE registration, course, grade and period are the approved fixture, shared by
every student. Sample dates are fictional document fields, not course-completion claims about the
viewer. SAMPLE watermark, top non-official banner, unsigned signature lines, decorative sample
seal and non-issuance footer are unchanged. The sample QR encodes only the reserved invalid
`example.invalid` URL and a fixed synthetic label; no token is issued or public verification enabled.

The PDF is one A4 page, 716,549 bytes. SHA-256:
`42624f64d67bbc6447b839b5b1136cdd450ca4bb5cb6bd6d54394a3daebd5d40`.
The package loader checks the pin and 1 MB size ceiling, caches validated bytes and returns copies.
Requests never launch Chromium, calculate grades, query marks/real certificates, write MinIO or
create request/certificate/issuance records. The file is not in the web public directory. Its
provenance README describes deliberate version replacement; builds and requests do not regenerate
it. Repeated requests and different students receive identical approved bytes.

[Rendered sample](ui-05/sample-training.png) was inspected for complete page layout, watermark,
unsigned lines, legible text and non-official footer. PDF tests also verify one page, all required
synthetic/disclaimer text and absence of JavaScript actions, attachments or annotations.

## API and privacy boundary

`GET /api/v1/student/certificate-samples/sample-training-v1/file?disposition=inline|attachment`
is a separate student-authenticated read-only route in the existing template module. The global
student guard requires a student session; anonymous and staff-only sessions receive 401. Existing
staff template routes retain `templates.write`, staff authentication and preview audit logging;
student sessions cannot use them. No role, permission, schema or migration changes are introduced.

Shared Zod schemas allow only the fixed sample identifier and disposition. Extra query fields,
student IDs, URLs, HTML, watermark overrides and unknown template versions are rejected. File
paths never interpolate request values. Guard/session lookups authenticate the student; the sample
handler never looks up their identity, course, marks, results, registration or real certificates.

The existing Redis rate limiter allows 30 requests per account per 60-second window shared across
preview/download, using a keyed hash rather than raw account/session data. Exceeding it returns
429 with Retry-After. Redis failure fails closed with 503 and no PDF. The immutable asset/size bound
avoids rendering/queue amplification. GET remains read-only except normal auth/rate-limit state.
All responses on this controller, including errors, receive `Cache-Control: no-store`. Successful
PDF responses also use fixed safe Content-Disposition, Content-Length, `nosniff` and restrictive
CSP (`default-src 'none'; frame-ancestors 'self'`). No academic data, actual certificate number,
real signature, valid verification destination, approval or issuance is added.

## Verification and preservation

Initial focused tests: five API tests and one component test passed. The PDF extraction test first
encountered whitespace within font ligatures; normalizing extraction whitespace preserves the
exact required disclaimer assertions without changing PDF bytes. Both PDF tests then passed.
Both focused browser tests then passed (20.7 seconds). Preview clicking creates a PDF navigation
request and a new browsing context with a 200 inline PDF response; Chrome headless delegates PDFs
to its download handler instead of painting the native viewer, so response-body/URL assertions on
that viewer are not used. The same endpoint's inline bytes are pinned in the API tests, the real
attachment is saved and hashed in the browser test, and Poppler renders the actual PDF for visual
inspection. This limitation is explicit; screenshots do not pretend to show a headless native viewer.
The complete repository gate totals and independent visual review follow the final run.

A read-only baseline covers 38 original database tables (counts/content hashes) and 3,083 original
MinIO objects (keys/sizes/ETags). All tests use synthetic isolated `docversity_ui05` derivatives,
including a separate browser database and Redis prefix. Existing migrations were applied only to
the new isolated base, not the original database. No existing server is stopped or reconfigured.
Post-run read-only verification passed: all original table counts/content hashes and original object keys/sizes/ETags are unchanged. No actual records or secrets are included here.

## Screenshots and independent review

| Size   | Initial viewport                                | Full page                              |
| ------ | ----------------------------------------------- | -------------------------------------- |
| 1440px | [Desktop](ui-05/documents-desktop-viewport.png) | [Desktop](ui-05/documents-desktop.png) |
| 768px  | [Tablet](ui-05/documents-tablet-viewport.png)   | [Tablet](ui-05/documents-tablet.png)   |
| 390px  | [Mobile](ui-05/documents-mobile-viewport.png)   | [Mobile](ui-05/documents-mobile.png)   |

[Keyboard/reduced-motion capture](ui-05/keyboard-reduced-motion.png) records visible download focus.
The eight delivered images (including the actual PDF render) come from the focused production
browser verification with an empty owned-document library. Full-suite fixtures also exercise the
same sample section alongside previously published synthetic documents; the final test compares
the entire owned-document list before/after sample use and checks that the document cards remain.
This avoids incorrectly assuming an empty library after the historical-document workflow runs.

The [independent visual review](ui-05-visual-review.md) returned **ship**, with all eight images
inspected and no material fixes. The [design comparison](ui-05-design-comparison.md) documents
inheritance of UI-03/12B and the existing portal's fixed-navigation full-page capture behavior.
Accurate viewport captures establish the initial phone/tablet experience; full-page captures retain
the fixed bottom navigation at its first viewport position. Neither report claims a custom PDF
viewer screenshot or final human approval.

## Final quality gates

- Frozen dependency install: passed; no dependency or lockfile changes.
- Format: passed; final documentation is formatted and checked again after recording totals.
- Full lint/typecheck: **28 uncached tasks passed**. The existing TanStack compiler warning remains;
  no new errors. A binary-response type guard in the API test and an escaped JSX apostrophe resolved
  initial lint findings without changing assertions or visible text.
- Full unit/integration tests: **771 passed**, 16 uncached Turbo tasks. Database 98, types 20,
  validation 41, storage 4, documents 32, imports 94, API 362, web 113, worker 7.
- Production build: **10 uncached tasks passed**.
- Database drift: **No difference detected**.
- Browser: **61/61 passed**, zero failures/skips/retries, **7.6 minutes** in the final complete run. The first broad run was stopped before the new case to
  correct its empty-library assumption; the final case preserves both empty and populated libraries
  by comparing real owned-document responses before/after. Web lint/typecheck passed again for
  this test-only correction. Application source and the approved PDF did not change.
- Protected-data comparison: **38 original tables and 3,083 original MinIO objects preserved**.
- Design detector: ran once on the three changed UI targets; returned `[]`. No new design world,
  global token, shared component or motion utility changes.

The three tracked graphify outputs were refreshed because CLAUDE.md requires the generated code
graph after source changes: 6,698 nodes, 17,758 edges, 255 communities. They are generated navigation
artifacts, not additional product scope. No historical migration or unrelated academic code changed.
The initial review checkpoint preceded delivery authorization. CI for the final UI-05 commit is
verified after push and draft PR creation, with final links/status reported in the PR and handoff.

Pre-existing Impeccable context drift (older PRODUCT scope, absent app-root design/sidecar and
lookup-reported orphaned briefs whose routes still exist) is documented, not repaired.

### Initial visual-review disposition

At the initial checkpoint UI-05 was ready for human visual review. All local gates are green; new preview/download tests pass
against both an empty focused fixture and a full-suite fixture with a previously published document.
The student document list and rendered document-card count are unchanged after sample use. Staff
preview permissions/auditing, student records/documents, examinations, re-exam payments, result
publication boundaries and authentication passed their existing browser/API regressions. The actual
download's SHA-256 matches the reviewed private sample asset. No issuance, Rector approval, live
payment collection, public verification or academic-rule changes were enabled.

Visual approval has been received. Deliver the verified UI-05 branch as a draft PR; do not merge.

## Approved delivery refinements — 17 October 2026

The user approved desktop, tablet and 390px visuals and authorized delivery after final gates.
The introductory sentence now reads: “An illustrative certificate layout with fictional details
and unsigned signatures.” This removes “approved sample layout” and shortens the phone introduction
without responsive content duplication. The exact reference-only explanation, all four SAMPLE
restrictions and both actions are unchanged. Layout, tokens, motion, API authorization and the
synthetic PDF hash/bytes are unchanged.

UI-05 remains isolated from Phase 12C: no typed eligibility API, registration-specific sample
selection, course eligibility or issuance logic is incorporated. The future focused integration
requires Phase 12C's server-owned typed contract; the frontend cannot grant eligibility.
The delivery preservation baseline is 38 original tables and 3,171 original MinIO objects.
The final gate results, updated screenshots and post-run comparison are recorded below.

### Final delivery verification

All final gates passed on the approved implementation with the two copy refinements:

| Gate                   | Final result                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| Format                 | Passed                                                            |
| Lint and typecheck     | 28 uncached tasks passed                                          |
| Unit/integration       | 771 tests passed; 16 uncached tasks                               |
| Production build       | 10 uncached tasks passed                                          |
| Database drift         | No difference detected                                            |
| Complete browser suite | 61/61 passed in 7.6 minutes; no failures, skips or retries        |
| Protected data         | All 38 original tables and 3,171 original MinIO objects unchanged |

Browser tests exercised actual new-tab preview navigation and attachment download, no-store/CSP
headers, authenticated student-only access, exact downloaded PDF SHA-256, owned-document-list
preservation, all three viewports, keyboard focus and reduced motion. Package PDF tests confirmed
SAMPLE/synthetic/invalid-for-issuance text, fictional identity, unsigned lines and absence of active
PDF scripts, attachments or annotations. Headless Chromium does not paint the native PDF viewer;
the real PDF bytes were separately rendered and visually inspected with Poppler.

The seven refreshed UI captures show the shorter introduction and a populated synthetic owned-document
library below the sample. The existing “E2E Provisional certificate scan” is an earlier browser fixture,
not a newly issued certificate or a Provisional sample format. Exact viewport captures accompany
full-page captures because fixed portal navigation appears within stitched tall screenshots.
The reviewed PDF rendering and underlying asset are unchanged. The bounded final visual review
scored both requested copy refinements resolved; see the visual review and design comparison.

The required regenerated graph contains 6,701 nodes, 17,762 edges and 253 communities.
Latest compatible main is `ff8b7dfea937772186126dad57ba78d4ab5ede27`, with green push CI.
No Phase 12C eligibility changes are included. No original migration, database record or MinIO
object was changed. Final commit SHA and push/PR CI links are reported in the delivery handoff.
