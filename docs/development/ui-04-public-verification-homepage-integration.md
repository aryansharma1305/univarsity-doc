# UI-04 — Public verification homepage integration

## Initial audit and base

Phase 13A PR #24 is merged at `2d05e59e1ce4dc15359e3b9bf164cfdd449e2613`.
Post-merge [main CI](https://github.com/aryansharma1305/univarsity-doc/actions/runs/39699895495)
passed before this independent worktree was created. Branch: `feature/ui-04-verification-homepage-integration`.
The latest CLAUDE.md is byte-identical to the fully read Phase 13A base version.
Claude’s Phase 12C.1 worktree, academic modules, certificate renderers and migrations are outside scope.

The earlier uncommitted UI-04 work exists in `docversity-ui04`; it is preserved as the source of the
mentor-approved composition, not reset or committed by this task. Its old test totals are historical
and are not verification evidence for the new integration branch.

## Reference and initial comparison

The complete supplied HTML was read with embedded image bytes inspected separately. SHA-256:
`0a39f101bc50671995a7f446b2da7676e137a282cccf80d4bcef88afc7628a94` (2,805,819 bytes).
It is plain HTML/CSS, not a framework. Its only inline script sets the year. External dependencies
are Google Fonts CSS and Inter/Plus Jakarta Sans fonts; the crest is an embedded transparent PNG.
Outbound verification anchors are visual-reference behavior, never trusted issuance or API logic.

| Area         | Current main                                                                            | Existing approved UI-04 / integration direction                                                 |
| ------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Homepage     | Light UI-01 marketing hero, capabilities, roadmap, FAQ and repeated actions             | Navy/blue and gold, exact supplied crest, headline and four direct service tabs                 |
| Verification | Separate light `/verify` form sends availability checks                                 | One shared unavailable-only panel at `/`; `/verify` redirects to it                             |
| Density      | Long marketing homepage; supplied HTML also has a viewport-height hero and empty header | Preserve UI-04’s removed redundant hero actions, 12.6% smaller desktop crest and compact panels |
| Services     | UI-01 links include the legacy QR placeholder                                           | Four mentor services, Result Checking first; no fifth QR service on homepage                    |
| Interaction  | Phase 13A accepts references even though no record can be checked                       | No reference fields or submissions; switch explanatory panels in place                          |
| Motion       | Reference has continuous spin/float/pulse effects                                       | Retain bounded existing GSAP entrance and Motion tab transition; honor reduced motion           |
| Typography   | Reference 9–13px supporting text; externally loaded fonts                               | Existing self-hosted Inter/Plus Jakarta Sans, readable supporting text and visible focus        |

## Implementation and routing plan

Reuse the earlier UI-04 hero, local crest, scoped styles and minimal access footer. Adapt the existing
Phase 13A `VerificationPanel` rather than ship a second service implementation. Derive its canonical
service keys/order from the shared validation package. Render only unavailable explanatory panels,
with no frontend activation flag and no API request on selection.

`/` owns the minimal composition outside the legacy public shell. `/verify` redirects cleanly to `/`
so it cannot retain a second reference-entry form or divergent availability state. Existing private
routes, cookies, sessions, CORS/CSRF, rate limits and Phase 13A endpoints remain unchanged.

Intentional changes: retire the marketing-only homepage sections and their dead search/navigation
anchors. Keep their source components and existing help/contact/legal/status and legacy verification
placeholder routes; no protected academic functionality is removed. Update homepage/share metadata
to describe verification honestly. Student/admin login targets remain unchanged.

## Security boundary

No identifier collection or browser lookup occurs while unavailable. No academic table, eligibility
contract, private document or MinIO object is read by the homepage. The Phase 13A API continues to
validate strict POST bodies, limit abuse, hash audit identifiers and return no-store UNAVAILABLE
responses; its implementation and validation schemas are unchanged. Eligibility, SAMPLE PDFs,
registration numbers and stored files never establish issuance or public-disclosure authority.

## Verification scope and evidence

Integration verification covers the following behaviors. Test homepage/redirect behavior, all four cards and default,
keyboard/focus/live status, no identifier fields/submission or verification network requests, login
navigation, no-JavaScript safety, reduced motion, 200% text scaling, and 1440/768/390/320px layouts.
Retain direct API contract/error assertions independently of the deliberately removed input UI.
Run format, lint, typecheck, production build, schema drift, full uncached unit/integration and
browser suites using isolated synthetic resources after the coordinated testing window is confirmed.
Capture actual exit codes, totals, full-page screenshots and all four selected service states.

Original PostgreSQL fingerprints and MinIO object metadata will be checked read-only before and
after verification. No shared volume pruning, database reset or original object modification is
permitted. Graphify outputs will be regenerated. Stop for visual/security approval before commit,
push, tagging or PR creation. Real verification, issuance, publication, QR activation and payments
remain disabled; UI-04 integration does not change Claude’s sample workflows.

Card descriptions remain visible at 390/320px; selected text gains weight as an additional
non-color cue, and long text can wrap during text scaling. The approved visual composition is
preserved. Existing global PRODUCT/DESIGN context drift is reported without unrelated repair.

## Current verification evidence

- Isolated stack `docversity-ui04-integration-qa`: all three services healthy before tests.
  PostgreSQL 55437 / Redis 56384 / MinIO 59010–59011; separate database, queue prefixes, app/test buckets and random credentials. All ports bind only to localhost.
- Format: exit 0. Lint/typecheck: exit 0, 28 uncached tasks; existing nonfatal TanStack warning remains.
- Full unit/integration: exit 0, 874 tests in 16 uncached tasks (database 109, validation 68, types 21,
  storage 4, documents 51, imports 94, worker 7, API 396, web 124).
- Production build: exit 0, 10 uncached tasks. Database drift: exit 0, No difference detected.
- Final focused browser tests: exit 0, 12/12 in 19.3 seconds. Covers 1440/768/390/320, all selected services,
  axe, keyboard/focus, 200% text scaling, normal/reduced GSAP/Motion, no-JavaScript behavior,
  login navigation, no identifiers/API submissions, redirects and actual unchanged API contracts.
- Mechanical UI detector: exit 0, no findings (run once). Independent finish reviewer: ship after the
  sole R1 text-reflow finding was resolved; no visible regressions across eight refreshed captures.
- Read-only midrun preservation comparison: exit 0, 38 original tables / 3,232 original objects match.
- Complete browser regression: exit 0, **74/74 passed** in 7.2 minutes; 11 uncached tasks,
  total command time 7m26s. Includes existing student/admin auth, permissions, curricula, imports,
  records, documents, synthetic PDFs, payments, result review and published-only student boundaries.
- Final read-only preservation comparison: exit 0, all 38 original tables / 3,232 original MinIO
  objects match the pre-test baseline. No migrations or private/backend modules changed.
- Final test-file lint/typecheck and format check: exit 0. Graphify refresh: exit 0; required three
  generated artifacts included, with known missing SQL parser / two barrel-file extraction warnings.
- Diff whitespace and focused secret-pattern scan: exit 0, no findings. No credentials or data
  fingerprints are tracked; private environment and detailed evidence remain ignored locally.
- QA stack stopped successfully; volumes retained, E2E 3144/4144 listeners closed, ten existing
  shared containers healthy. Heavy testing window released for Claude to resume Phase 12C.1.

After the reflow correction, lint/typecheck (28 uncached tasks) and production build (10 uncached tasks)
passed again. The stronger text-scaling test waits for computed font size to double, asserts single-column
card geometry and checks that headline/card words remain whole. Its first attempt failed while reading the
old computed size immediately after changing styles; polling the actual rendered size resolved this test
synchronization issue without weakening the assertion. Focused browser rerun passed all 12 tests.

Initial static checks caught test-helper typing/lint issues (exit 2 and 1): Testing Library queries
used a Playwright-only option, and new browser helpers needed typed tuples and shared error-schema
parsing. These were corrected without weakening assertions. Final static gates above pass; all
actual exit codes and logs remain in ignored `.local/evidence`.

## Review captures

| Width | Original HTML                                     | Integrated homepage                                           |
| ----- | ------------------------------------------------- | ------------------------------------------------------------- |
| 1440  | [Reference](ui-04-integration/reference-1440.png) | [Homepage / Result Checking](ui-04-integration/home-1440.png) |
| 768   | [Reference](ui-04-integration/reference-768.png)  | [Homepage](ui-04-integration/home-768.png)                    |
| 390   | [Reference](ui-04-integration/reference-390.png)  | [Homepage](ui-04-integration/home-390.png)                    |
| 320   | [Reference](ui-04-integration/reference-320.png)  | [Homepage](ui-04-integration/home-320.png)                    |

[Side-by-side comparison](ui-04-integration/comparison.html).
Selected services: [Result](ui-04-integration/home-1440.png), [Registration](ui-04-integration/service-registration.png),
[Certificate](ui-04-integration/service-certificate.png), [Admission letter](ui-04-integration/service-admission-letter.png).
[200% text scaling](ui-04-integration/text-scale-320.png).

Original captures loaded their fonts and 1403×1121 crest without failed requests, with zero horizontal
overflow at every width. The parent opened all original and implementation captures before review.
The same scoped GSAP/Motion patterns and local crest asset are reused; no unsafe reference script,
external verification destination, continuous animation or official-approval badge is copied.

The old marketing FAQ/search targets, hero actions and large multi-column root footer are intentionally
replaced by direct service selection and minimal student/staff/contact access. Their source components
and existing help/contact/legal/status routes remain. No academic or authentication workflow is removed.

## Design documentation handoff

Reviewed the direction contract, current PRODUCT.md, homepage/panel source and scoped stylesheet,
asset README, all four homepage widths, all four selected-service captures, the 320px 200% text
capture and corresponding original HTML references. The integration retains the approved navy/blue
and bright-gold composition, transparent crest, self-hosted Inter/Plus Jakarta Sans, compact desktop
hero and restrained motion. Shared typed Radix tabs select one honest unavailable explanation;
`/verify` redirects to `/`. Student/staff access remains linked to the existing private portals.

The resolved R1 text-reflow capture shows a readable single-column service stack at 320px with
200% text sizing; descriptions, availability copy and footer links remain present. The fresh finish
review disposition supplied for this handoff is **ship after R1 resolved**. This documents visual
readiness only. Browser regression and preservation were pending at the documentation handoff;
the completed runtime results are recorded separately above.

Preexisting context drift is retained explicitly: `apps/web/PRODUCT.md` still describes UI-03's
student workspace rather than this public surface. The only DESIGN.md found in this checkout is
`references/stitch/stitch_docversity_ui_ux_design_system/academic_trust_matrix/DESIGN.md`; its light
canvas, muted-gold status emphasis and small-card guidance differ from the already approved UI-04
navy ground, scoped bright gold and 16px service cards. No root/app DESIGN.md or design.json was
found. These inherited differences do not authorize a global identity refresh: the surface contract
and scoped CSS carry this extension, and global design files were preserved without repair.

Crest provenance is confirmed against the asset README: local PNG SHA-256
`a973157df748fdfff0c8b809c8e015e500821d71703e71dc73935fb255a36fbf` matches the unchanged
user-supplied embedded transparent PNG. Reference rasters are browser captures of that supplied
HTML; implementation rasters are browser captures of this integrated homepage. No generated artwork
was introduced. The crest is visual branding, never evidence of issuance, public disclosure approval
or a verified academic record.

## Review boundary and remaining limitations

Final human visual and security-design approval was received on 22 October 2026 after review of
the packaged reference comparisons, responsive captures, all selected states and verification report.
Delivery fetch confirmed origin/main remains `2d05e59e1ce4dc15359e3b9bf164cfdd449e2613` with successful
CI; no integration changes or repeat heavy suites were needed. A fresh read-only preservation check
again matched all 38 original tables and 3,232 MinIO objects. The approved branch is proceeding to
commit, push and draft PR; final remote CI is reported on the PR. No automatic merge is authorized. All four actual verification services remain UNAVAILABLE. No issuance,
publication, public QR flow, identifier lookup or eligibility activation is authorized.

The review images are the final focused-run captures reviewed after R1, from the same source used
by the passing full regression. Normal viewports retain two mobile/tablet card columns; enlarged
320px text reflows to one column. The original and integrated comparison intentionally shows the
removed empty header, repeated hero buttons, Official Portal claim, continuous decorative motion
and external service navigation, replaced by immediate accessible unavailable panels.

Existing nonfatal tooling warnings include React Compiler/TanStack, Next standalone `next start`,
metadataBase, test NODE_ENV/color flags and pg concurrent-client-query deprecation. These were not
changed as part of this public UI integration. No production deployment or live verification is
claimed. Global design-context drift remains documented without an unrelated rewrite.
