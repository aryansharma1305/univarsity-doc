# Phase 12A — training certificate template and synthetic preview infrastructure

## Scope and reference

This additive phase introduces `TRAINING_CERTIFICATE` preview infrastructure on a new branch from
latest main (`82b3aed`, merged Phase 11B). The user-provided Certificate of Training image is the
visual reference. Only brand, crest and decorative seal crops are retained as assets; the complete
reference, original recipient, registration number, QR and handwritten signatures are excluded.
The user selected blank signature lines with sample titles. Neither document is an issued certificate.

The print layout reproduces the centered blackletter title, registration number, prominent student
and course names, grade and period, training contents, bottom-left seal, QR and issue date, and
right-hand signature lines. A SAMPLE banner, watermark and explicit preview footer are always present.
Two fixtures cover a normal example and longer name/course text, both on one A4 portrait page.

## Architecture and contracts

`packages/documents` extends its immutable, validated template registry with `sample-training` v1.
Every historical definition is a code snapshot; future revisions add versions rather than overwrite
released definitions. Audit events retain template ID/version and fixture ID. No schema changes or
new database tables are required. Template authoring/editing, activation and issuance are unavailable.

Dynamic data: registration number, student name, course name, grade, course period, issue date,
synthetic QR token/URL and optional sample certificate reference. Configuration: introduction,
organizer copy, contents heading/topics, both signatory names/titles, footer and fixed branding/seal
asset identifiers. Names can be blank; all other text has strict length/control/markup validation.
Configuration is server-owned, not accepted from preview requests. Date validation rejects impossible
dates, and sample registration/reference prefixes and reserved `example.invalid` URLs prevent a
preview from claiming a live credential.

The renderer builds HTML/CSS with escaped text, embedded Noto Sans/Crimson Pro/UnifrakturMaguntia
fonts, static data-URI branding and an inline vector QR. Chromium prints structured, selectable text
to a tagged PDF. JavaScript, service workers and external requests are blocked. A browser deadline
bounds resource lifetime; content must fit above the footer or rendering fails rather than clipping.
The existing PDFKit marksheet renderer and all historical-document behavior are unchanged.

Playwright is pinned to the repository's existing browser version. CI installs Chromium before unit/
integration tests because PDF preview generation now requires it. Local prerequisites:
`pnpm --filter @docversity/documents exec playwright install chromium`.
Linux runtime provisioning also needs the browser's system dependencies (`--with-deps`).
Print behavior follows [Playwright's PDF documentation](https://playwright.dev/docs/api/class-page#page-pdf).

## API, authorization and audit

- `GET /api/v1/certificate-templates` lists validated preview-only definitions and fixed fixtures.
- `GET /api/v1/certificate-templates/preview` accepts only template ID, version, fixture and disposition.
- Both routes reuse `templates.write`: SUPER_ADMIN and CERTIFICATE_ADMIN. Anonymous/student sessions
  and other staff roles are rejected by existing guards; UI hints are not authorization.
- Strict validation rejects student/result identifiers, HTML, paths, URLs, watermark removal and
  unsupported fixtures/versions. No real student lookup or public endpoint exists.
- PDF responses explicitly send `Cache-Control: no-store`, `nosniff`, private PDF CSP and a safe filename.
  Middleware also protects denial/error responses.
- At most two previews render concurrently per API instance. Busy requests return 503/Retry-After.
- `TRAINING_CERTIFICATE_PREVIEW_GENERATED` is written before bytes are delivered. Audit failure
  prevents delivery; capacity is released in finally. Metadata has IDs, version, page/byte counts only.
- No academic calculations, grading changes, result publication, certificate rows, signing service,
  official issuance, rector approval, MinIO writes or public verification flow are introduced.

## Admin experience

`/admin/certificate-templates` joins the existing Records navigation group with the same permission
as marksheet templates. Controls, loading/error/empty/denied states, object URL cleanup and PDF
preview/download reuse the existing composition. Standard and long-text fixtures are the only choices.
The interface preserves current animation, keyboard and reduced-motion behavior. No motion is added
to the document. Mobile browsers without native PDF rendering can download the same sample.

## Verification

Full local verification passed. Focused renderer/validation tests (5), API tests (6) and web tests (4)
cover strict input/version validation, immutable configuration, actual selectable single-page PDFs,
all role boundaries, no academic queries/storage writes, exact PDF headers, audit failure/retry,
concurrency limits, download bytes, URL revocation and safe error/denied states.
Browser checks include desktop 1440px, tablet 768px, mobile 390px, keyboard focus, reduced motion,
axe serious/critical checks, fixed fixtures, PDF downloads and error recovery. Full repository gates,
data preservation evidence, screenshot paths, independent visual review and final CI links are recorded
below after they complete.

## Evidence files

- `output/pdf/phase12a-training-standard.pdf`
- `output/pdf/phase12a-training-long-text.pdf`
- `docs/development/phase-12a/training-standard.png`
- `docs/development/phase-12a/training-long-text.png`

Raster branding retains its source provenance in PNG metadata. The QR remains SVG geometry in the PDF,
not a cropped QR from the reference. The uploaded design is not represented as an official final policy.

## Final local verification

| Gate                              | Result                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Format                            | Passed                                                                                                            |
| Forced lint and typecheck         | 28 tasks passed                                                                                                   |
| Uncached unit/integration         | 738 passed: types 20, validation 37, database 98, documents 30, storage 4, imports 94, worker 7, API 342, web 106 |
| Forced production build           | Passed                                                                                                            |
| Database drift                    | No difference detected                                                                                            |
| Complete browser suite            | 56 passed, no retries (8.2 minutes)                                                                               |
| Focused certificate browser tests | 2 passed                                                                                                          |
| Protected data                    | All 38 original tables unchanged; all 2,778 baseline MinIO keys/sizes/ETags preserved                             |
| Existing localhost                | HTTP 200; existing app was not replaced                                                                           |

The first full test attempt exposed only a private launcher origin mismatch: the copied preview
origin differed from the CSRF test's localhost:3000 contract. The launcher was corrected; the complete
uncached run passed with the original CSRF assertion and production authentication behavior unchanged.
No historical migration, schema, payment, grading, result publication or student-document code changed.

Independent visual review: **ship**, with no material fixes in its inspected scope. See
[visual review](phase-12a-visual-review.md) and [incumbent comparison](phase-12a-design-comparison.md).
Screenshots cover [1440px desktop](phase-12a/phase12a-templates-desktop.png),
[768px tablet](phase-12a/phase12a-templates-tablet.png),
[390px mobile](phase-12a/phase12a-templates-mobile.png) and
[390px forbidden state](phase-12a/phase12a-templates-forbidden.png).
Both PDF pages were independently rendered and inspected. Capture limits are documented in the review;
browser tests verify generated preview responses, PDF display/download controls, error recovery,
keyboard focus and reduced motion. Shipping raster provenance scan: 9 files, none missing metadata.
The code knowledge graph was refreshed with the repository's graphify command.

Pre-existing design-context metadata drift and missing DESIGN.md were preserved, not repaired as part
of this phase. The existing marksheet route remains intact despite a context-loader orphan warning.
Final PR/SHA and CI run links are maintained in the draft PR body to avoid self-referential commits.
The phase stops here: no Phase 12B, official issuance, signing, activation or public verification.

## Final visual approval and scope audit

The user approved the standard and long-text PDFs, including branding, typography, wrapping,
SAMPLE watermark, QR placement and unsigned signature lines. The approved design is unchanged.
The user-supplied reference and this approval authorize the isolated branding and decorative seal
assets for synthetic development previews; the scope is recorded in the asset README.

The PR retains exactly three generated knowledge-graph files: `graphify-out/graph.json`,
`graphify-out/graph.html` and `graphify-out/GRAPH_REPORT.md`. These are documented repository
requirements in [knowledge-graph instructions](knowledge-graph.md) and CLAUDE.md. No generated
caches or unrelated graph outputs are included. The instructions permit the graph to lag behind
small subsequent documentation edits, so this scope clarification does not regenerate it.

This follow-up changes documentation only. Synthetic input restrictions, staff permissions,
audit-before-delivery behavior, PDF security headers (including `Cache-Control: no-store`),
watermarking and unsigned signatures remain unchanged. Final verification and both CI run links
for the follow-up commit are recorded in the draft PR body.
