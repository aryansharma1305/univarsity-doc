# Phase 11B — synthetic marksheet infrastructure

## Baseline and scope

Dedicated worktree/branch `feature/phase-11b-marksheet-infrastructure` from latest green main
`47b009ff555e2f7b3fc558a7d6771b9975b1b11a`, the merge of PR #16.
[Baseline CI](https://github.com/aryansharma1305/univarsity-doc/actions/runs/38164093582) passed.
Existing worktrees were inspected and preserved, including untracked UI-02 developer files.
The existing localhost preview remains separate from this worktree and test databases.

**Implemented:** validated, code-versioned templates; deterministic vector PDF rendering; staff-only
synthetic preview/download; semester/year presentation; bounded multi-page samples; future issuance
interfaces and architecture.

**Not implemented:** official issuance, template approval, result approval/publication, GPA/SGPA or
pass/fail calculations, re-exam replacement, digital signatures/seals/QRs, student marksheet downloads
or any Phase 12 work. No production publication flag, result lookup or official-document storage path
was added. Phase 11A continues to deny every result until trustworthy release provenance exists.

## Audit and architecture

Read CLAUDE.md, current Prisma results/document foundations, the staff/student guards, permission
mapping, audit/storage infrastructure, Phase 10C/10D and Phase 11A documentation and controllers,
and the approved UI-02/UI-03 system. The documents package contained plans only; Playwright was a
browser-test dependency, not a production PDF implementation. No existing renderer was replaced.

`@docversity/documents` owns the pipeline; `@docversity/validation` owns its Zod contracts. A NestJS
module authorizes known fixture/template selection, renders bytes in memory, audits generation and
returns a private no-store PDF. The admin view embeds and downloads those exact same bytes; a
separate HTML facsimile cannot drift from PDF output. Nothing connects the renderer to Prisma,
Next.js, object storage, academic decisions or signing.

PDFKit 0.20.2 is a pinned pure-JavaScript runtime dependency. Its documented vector text, wrapping,
embedded fonts and buffered pages avoid a production Chromium installation. pdf2json 4.1.0 is a
pure-JavaScript development-only parser for content/page tests, not part of the API renderer.
Noto Sans regular/bold are bundled under SIL OFL 1.1 and embedded; no remote fonts are fetched.
Font source/license is recorded in `packages/documents/assets/fonts/README.md` and `OFL.txt`.

## Validated model and period presentation

`marksheetPreviewInputSchema` accepts only `kind: SYNTHETIC_PREVIEW`. Institution name, office,
optional address/identifier, minimal student/program/course/batch/session/level, examination session,
period, subjects and supplied summary are validated. Unknown fields, hidden controls, HTML-like text,
malformed registration numbers, oversized text, duplicate subject codes and more than 80 subjects
are rejected. No real identifiers, certificate number, issue date, signature or verification fields
exist in the preview contract.

Periods use the existing SEMESTER_WISE/YEAR_WISE vocabulary and explicit numbers/labels; years are
never converted to semesters. Subject components are explicit internal/external/practical/other
objects. Components absent from every subject do not create a table column. Recorded obtained marks
must be numeric, nonnegative and no greater than their supplied maximum. Marks preserve up to two
fractional digits; supplied grade points/GPA preserve up to three. No university GPA scale is assumed.

`RECORDED` requires a numeric value, including valid zero. `WITHHELD`, `ABSENT` and `UNAVAILABLE`
require null; they never silently become zero. The printed dash means not supplied, with a legend.
Optional totals, grades, grade points, status, GPA and percentages are displayed only when supplied,
never calculated. Defaults intentionally leave totals/GPA/percentage/status unavailable. The example
values are invented and have no relationship to an official grading policy.

An optional supplied examination attempt label can carry illustrative markers. The renderer neither
counts stars nor selects an official re-exam attempt. Existing approved application numbering,
payments and historical marks are untouched.

## Template and rendering

The internal registry exposes `sample-academic`, version 1, status PREVIEW_ONLY. Both period types are
supported. A strict template schema allow-lists A4, margins (36–54 points), body size (8–10 points),
row padding (6–10 points), bundled Noto Sans and navy/black institutional typography. Asset references
currently allow only NONE: there is no arbitrary image, HTML, URL or filesystem template input.
Callers get validated copies and cannot mutate the registry. Official approved immutable versions
need a separate lifecycle, never a promoted or stripped-watermark preview.

The renderer validates input/settings, wraps text, measures rows before placing them, moves whole
rows onto the next page, repeats table headers and uses a compact continuation header. Signature/seal
space is intentionally blank. Footer/page metadata is added to every buffered page. Limits are 80
subjects, 16 pages and 2 MB output; the API admits at most two active generations per process.

Every page permanently carries:

- **SAMPLE — NOT VALID FOR OFFICIAL USE** in a prominent, printable header frame.
- **Synthetic preview generated for Docversity development. Not an issued university document.**
- Template ID/version, PREVIEW ONLY and `Page n of total`.

There is no setting to suppress these markings. No token, official certificate number, QR, seal or
signature is generated. PDF creation/modification dates are fixed synthetic metadata (2000-01-01 UTC),
not issue dates. Identical validated input, version and pinned renderer produce byte-identical output.
Determinism does not imply PDF/A conformance or institutional authenticity.

## Authorization and delivery

`GET /api/v1/marksheet-templates` and `GET /api/v1/marksheet-templates/preview` require the existing
`templates.write` permission: SUPER_ADMIN and CERTIFICATE_ADMIN. Permission mappings were not
expanded; REGISTRAR, EXAM_ADMIN, APPROVER and VIEWER are denied. Student cookies never authenticate a
staff route, and anonymous requests are denied. The web navigation uses the same existing permission;
backend guards remain authoritative. There is no new real-student selector or free-form document form.

Preview queries are strict: exact template ID/version, fixture enum `semester | year | stress`, and
allow-listed inline/attachment disposition. Unknown student/result IDs, versions, paths, URLs and
watermark options fail before rendering. The renderer opens only fixed bundled font paths.

These are read-only GET previews, so unsafe-method CSRF checks are not applicable; global staff guards
and security-header practices are unchanged. Generation is audited like existing document reads.
`MARKSHEET_PREVIEW_GENERATED` records actor/correlation ID, template ID/version, fixture code, page
count and byte size, without invented student names/registration strings or PDF content. Audit failure
prevents PDF delivery. No issuance audit or academic transition is created.

Responses use application/pdf, a fixed safe filename, no-store, nosniff and a restrictive CSP.
Middleware applies no-store before guard/validation failures too. The server writes no MinIO objects
and never adds previews to official student document collections. Browser blobs are session-local
and revoked on replacement/unmount; download uses the same generated blob. A PDF-viewer fallback
explains how to open the sample where native inline viewing is unavailable. Errors have working retry.

## Synthetic fixtures and review

All sample details are unmistakably fictitious: Example University of Learning, a Fictional City
address, Alex Sample and SAMPLE registration/subject identifiers. No institution logo is invented.

- Semester-wise: five subjects, one A4 page; includes zero, withheld and optional practical components.
- Year-wise: five subjects, one A4 page; preserves year labels.
- Stress: 48 subjects, long names/program/registration, eight A4 pages.

The approved direction is restrained black/navy academic PDFs inside the unchanged UI-02 admin
system. The new page reuses PageHeader, Button, permission/session hooks, TanStack Query, states and
existing responsive navigation. No new GSAP sequence or animation dependency was needed; PDF output
never depends on motion. Existing shell motion/reduced-motion behavior is retained.

Screenshots and downloadable samples are recorded below after actual page inspection. The browser
screen is reviewed at 1440px, 768px and 390px, with a permission-denied state. PDFs are separately
rendered through Poppler and their actual pages inspected, including every stress page.

## Future official issuance — architecture only

`FutureMarksheetIssuancePlan` and `FutureIssuanceReadinessVerifier` describe references a future service
must verify server-side. They have no implementations/routes and confer no authorization themselves.
The future workflow must:

1. Obtain university-approved GPA, passing, rounding, absence and re-exam replacement policies.
2. Obtain the official institutional name, address, logo, fonts, wording, template and signatory assets.
3. Approve and freeze a template version under separately authorized maker/checker permissions.
4. Verify publication authorization and durable release provenance, exact enrollment/period/cohort,
   completeness and current withdrawal/correction eligibility.
5. Obtain an approved immutable result snapshot; render supplied authorized values under a separate
   official input contract. Never reuse a SYNTHETIC_PREVIEW as proof or remove its watermark.
6. Use an authorized institutional signing/seal service; preserve hash and signature metadata.
7. Store signed bytes privately with immutable issuance/template/snapshot provenance.
8. Authorize current eligible student downloads without leaking other enrollments or unpublished marks.
9. Audit issuance, access, withdrawal and replacement while preserving all prior versions.

Policy, publisher scope, release scheduling, official attempt selection, template approval,
numbering, signing readiness and private issuance storage are independently pending. Existing
historical uploaded certificates remain a separate workflow; their authenticity is not reclassified.

## Verification and preservation

Initial preservation baseline: all 38 original public tables hashed by counts/content; all 2,629
existing MinIO objects inventoried by key/size/ETag. Tests use only the new isolated
`docversity_phase11b` base and its disposable suffix databases. No schema migration, development
reset/reseed, existing object deletion or backup overwrite is performed.

An accidentally overlapping API invocation invalidated disposable-test evidence. The obsolete run
was stopped and the six new API tests rerun alone successfully. No original data was involved; no
assertion or timeout was relaxed. Short-PDF pagination and test mock typing were corrected during
implementation rather than weakening checks. Browser-only locators were scoped to the actual sidebar
and preview error panel; the simulated error intercept now matches the initial URL before Next.js
normalization. Both preview browser tests pass in isolation. A subsequent full run exposed an existing re-exam
search/navigation race: the trace showed the 300 ms search URL replacement overtaking an immediate
detail click. The browser test now waits for the requested search parameter before navigating; all
fee, attempt, student and approval assertions remain unchanged. No application source or academic
rule was modified. The final complete browser run passed all 54 tests in 8.1 minutes with no retries.

Final preservation verification passed: all 38 original table counts/content hashes and all 2,629
original MinIO key/size/ETag entries match the protected baseline. No original object was removed or
modified. The existing localhost:3000 preview was kept separate and remains available.

### Local quality gates

| Gate                                 | Result                                       |
| ------------------------------------ | -------------------------------------------- |
| Format                               | Passed                                       |
| Uncached lint/typecheck              | 28 tasks passed                              |
| Full uncached unit/integration tests | 723 passed; 16 tasks, zero cache hits        |
| Production build                     | Passed                                       |
| Database drift                       | No difference on isolated Phase 11B database |
| Focused preview browser tests        | 2 passed                                     |
| Complete browser suite               | 54 passed in 8.1 minutes; no retries         |

Unit/integration totals: API 336, web 102, database 98, imports 94, validation 37, documents 25,
types 20, worker 7 and storage 4. No assertions or security requirements were weakened. Existing
PostgreSQL deprecation warnings remain baseline warnings.

### Downloadable samples and visual evidence

All three authenticated browser downloads were byte-identical to the direct production renderer.
The samples contain only the invented fixture data described above.

| Sample        | Pages | Bytes  | Download                                                    |
| ------------- | ----- | ------ | ----------------------------------------------------------- |
| Semester-wise | 1     | 21,390 | [Sample PDF](../../output/pdf/phase11b-sample-semester.pdf) |
| Year-wise     | 1     | 21,457 | [Sample PDF](../../output/pdf/phase11b-sample-year.pdf)     |
| Long subjects | 8     | 35,531 | [Sample PDF](../../output/pdf/phase11b-sample-stress.pdf)   |

- [1440px staff workspace](phase-11b/phase11b-templates-desktop.png)
- [768px staff workspace](phase-11b/phase11b-templates-tablet.png)
- [390px staff workspace](phase-11b/phase11b-templates-mobile.png)
- [390px permission denial](phase-11b/phase11b-templates-forbidden.png)
- [Semester-wise PDF page](phase-11b/phase11b-pdf-semester-1.png)
- [Year-wise PDF page](phase-11b/phase11b-pdf-year-1.png)

Every stress PDF page was inspected: [1](phase-11b/phase11b-pdf-stress-1.png),
[2](phase-11b/phase11b-pdf-stress-2.png), [3](phase-11b/phase11b-pdf-stress-3.png),
[4](phase-11b/phase11b-pdf-stress-4.png), [5](phase-11b/phase11b-pdf-stress-5.png),
[6](phase-11b/phase11b-pdf-stress-6.png), [7](phase-11b/phase11b-pdf-stress-7.png) and
[8](phase-11b/phase11b-pdf-stress-8.png). Poppler confirms A4 dimensions, 595.28 × 841.89 points.
Rows stay whole, long names wrap, continuation headers repeat and the final summary stays clear of
footers. Watermarks, synthetic footer and page numbering are visible throughout.

The UI screenshots show the initial workspace; actual PDF page renders provide document visual
review independently of the browser's native PDF viewer. All shipping PNGs carry their capture or
rasterization origin. The single changed-UI detector pass returned no findings. The fresh independent finish
review returned **ship** with no material fixes; see [visual review](phase-11b-visual-review.md).
The shipped documenter independently compared source and all fourteen captures against UI-02 and
returned **preserve incumbent UI-02**; see [design comparison](phase-11b-design-comparison.md).
Pre-existing missing DESIGN.md and non-material token discrepancies are reported without system
regeneration. There were no later UI or PDF layout edits after those reviews.

## Changed files

53 files, including source, tests, documentation, bundled fonts and synthetic evidence.

```text
apps/api/package.json
apps/api/src/app.module.ts
apps/api/src/marksheet-templates/marksheet-templates.controller.ts
apps/api/src/marksheet-templates/marksheet-templates.module.ts
apps/api/src/marksheet-templates/marksheet-templates.service.ts
apps/api/test/marksheet-templates/preview.test.ts
apps/web/.impeccable/surfaces/in-protected-marksheet-templates-page-tsx-171aa4c0.md
apps/web/e2e/examinations.spec.ts
apps/web/e2e/marksheet-templates.spec.ts
apps/web/src/app/admin/(protected)/marksheet-templates/page.tsx
apps/web/src/components/admin/nav-groups.ts
apps/web/src/components/admin/nav.ts
apps/web/src/features/marksheet-templates/api.ts
apps/web/src/features/marksheet-templates/preview-view.tsx
apps/web/src/lib/api.ts
apps/web/test/marksheet-templates.test.tsx
docs/development/phase-11b-design-comparison.md
docs/development/phase-11b-marksheet-infrastructure.md
docs/development/phase-11b-visual-review.md
docs/development/phase-11b/phase11b-pdf-semester-1.png
docs/development/phase-11b/phase11b-pdf-stress-1.png
docs/development/phase-11b/phase11b-pdf-stress-2.png
docs/development/phase-11b/phase11b-pdf-stress-3.png
docs/development/phase-11b/phase11b-pdf-stress-4.png
docs/development/phase-11b/phase11b-pdf-stress-5.png
docs/development/phase-11b/phase11b-pdf-stress-6.png
docs/development/phase-11b/phase11b-pdf-stress-7.png
docs/development/phase-11b/phase11b-pdf-stress-8.png
docs/development/phase-11b/phase11b-pdf-year-1.png
docs/development/phase-11b/phase11b-templates-desktop.png
docs/development/phase-11b/phase11b-templates-forbidden.png
docs/development/phase-11b/phase11b-templates-mobile.png
docs/development/phase-11b/phase11b-templates-tablet.png
output/pdf/phase11b-sample-semester.pdf
output/pdf/phase11b-sample-stress.pdf
output/pdf/phase11b-sample-year.pdf
packages/documents/README.md
packages/documents/assets/fonts/NotoSans-Bold.ttf
packages/documents/assets/fonts/NotoSans-Regular.ttf
packages/documents/assets/fonts/OFL.txt
packages/documents/assets/fonts/README.md
packages/documents/package.json
packages/documents/src/fixtures.ts
packages/documents/src/future-issuance.ts
packages/documents/src/index.ts
packages/documents/src/renderer.ts
packages/documents/src/templates.ts
packages/documents/test/marksheet.test.ts
packages/documents/vitest.config.ts
packages/types/src/audit.ts
packages/validation/src/documents/marksheet-preview.ts
packages/validation/src/index.ts
pnpm-lock.yaml
```

## Approved PDF security follow-up

The preview controller explicitly sets `Cache-Control: no-store` on PDF responses.
The existing middleware remains in place to protect authorization and error responses.
The API integration test checks the exact header for both inline and attachment responses
across semester, year and stress fixtures, with an audit event for each successful preview.
Authorization, auditing, SAMPLE watermarking, synthetic-only restrictions and the approved
PDF layouts are unchanged.

Follow-up verification: format, forced lint/typecheck, 723 uncached unit/integration
tests, forced production build, database drift (no difference) and all 54 browser
tests passed. The focused preview API suite passed all six tests. Preservation
checks confirmed all 38 original tables and 2,629 original MinIO objects remain
unchanged, and the existing localhost application responds with HTTP 200.
