# Phase 11B design comparison

Documentation disposition: preserve incumbent UI-02. The finished marksheet preview workspace is a precisely specified extension of the existing admin experience. Its PDF presentation follows the confirmed restrained black/navy academic direction. This pass records the comparison; it does not establish a new visual system.

## Evidence checked

Source inspected: `apps/web/PRODUCT.md`, `apps/web/src/styles/globals.css`, `packages/ui/src/styles/theme.css`, shared Button and Card components, shared PageHeader, admin shell and shared data states; the marksheet route and `features/marksheet-templates/preview-view.tsx`; and `packages/documents/src/templates.ts` and `renderer.ts`. The recorded direction is `apps/web/.impeccable/surfaces/in-protected-marksheet-templates-page-tsx-171aa4c0.md`. The original Phase 11B request supplies the synthetic-only document and preview requirements.

Visual comparison used incumbent `docs/development/ui-02/ui02-dashboard-desktop.png` and `ui02-dashboard-mobile.png`. All four finished UI captures were inspected: `phase11b-templates-desktop.png` (1440px), `phase11b-templates-tablet.png` (768px), `phase11b-templates-mobile.png` (390px), and `phase11b-templates-forbidden.png`, under `docs/development/phase-11b/`.

Actual rendered PDF pages inspected in the same directory: `phase11b-pdf-semester-1.png`, `phase11b-pdf-year-1.png`, and every page `phase11b-pdf-stress-1.png` through `phase11b-pdf-stress-8.png`. These ten raster pages are the document evidence, rather than a browser viewer substitute. Downloadable synthetic PDF artifacts are retained under `output/pdf/`.

## Incumbent fidelity

| Aspect                          | Incumbent evidence                                                                                                                               | Finished extension                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette and ground              | Theme defines navy headings/sidebar (`#03142f`), blue actions (`#0759d7`), pale ground (`#f7f9fc`), white surfaces, muted text and pale borders. | Captures retain the navy shell and heading, blue Generate action, pale page ground and white bordered panels. The SAMPLE badge uses incumbent warning text and soft background tokens.                     |
| Typography                      | Inter body and Jakarta heading stacks; shared page title is 24px/32px below 768px and 28px/36px above, weight 600. Card title is 16px/24px.      | PageHeader and card title use these shared roles. Metadata, explanations and controls use the existing small body/label vocabulary. Desktop/mobile hierarchy matches the reference captures.               |
| Shell and topology              | Existing sidebar, header, account affordance and mobile menu; dashboard content reflows within the shell.                                        | The same shell contains template controls and document inspection. The selected navigation item is a normal admin entry; no independent shell or ornamental dashboard metrics appear.                      |
| Spacing and shapes              | Rounded, lightly bordered cards; consistent 24px section spacing and existing control radii.                                                     | Preview panels use 12px corners, a 24px grid gap and 20px/24px control-panel padding. Shared buttons retain their normal variants, with 44px minimum height for generation/download.                       |
| Responsive behavior             | Mobile reference replaces persistent sidebar with menu and stacks content within 16px gutters.                                                   | Desktop uses a bounded 240–320px controls column alongside the larger preview. Tablet/mobile stack controls before the preview; text and metadata wrap without visible clipping. Header/badge can wrap.    |
| Permission and state vocabulary | Shared ForbiddenState, ErrorState and skeleton affordances.                                                                                      | Permission-denied capture shows the shared calm bordered state in the mobile shell. Source reuses shared list loading/error states and supplies local generation status, retry and download fallback text. |

The preview workspace uses flat bordered panels rather than adding stronger depth. This is consistent with the incumbent's restrained surface vocabulary; no new elevation token or animation language is required. The document itself remains the primary inspection object.

## PDF comparison against the confirmed direction

The registry fixes A4 portrait, 42-point margins, 9-point body text, 6-point row padding and embedded Noto Sans. The renderer uses navy ink (`#14243a`) or supported black, fine neutral rules and white paper. These are document-local print settings, not replacements for web tokens or the admin type ramp.

Semester and year samples preserve their actual period labels. Both single-page outputs have a clear institutional heading, two-column identity/examination block, ruled subject table, synthetic summary and intentionally blank signature/seal area. The eight-page stress output wraps the long registration/program/subject text, keeps subject rows intact, repeats table headers on continuation pages and places its summary after the final rows. None of the inspected pages shows content/footer overlap or clipped text.

Every inspected page carries the bordered `SAMPLE — NOT VALID FOR OFFICIAL USE` frame, the synthetic-development footer, template/version/preview metadata and its page count. The frame remains prominent without covering marks. No official logo, seal, signature or verification QR is introduced. Sparse space on the final stress page follows natural pagination and leaves the summary readable; it is not filled with decoration.

## Documentation boundary and drift

There is no incumbent `DESIGN.md` at the project root or `apps/web/` boundary. A pre-existing Stitch reference `DESIGN.md` exists under `references/stitch/stitch_docversity_ui_ux_design_system/academic_trust_matrix/`; it is reference material, not the normative production system. Production CSS and shared components remain the authority. The missing incumbent design document is a pre-existing documentation gap, reported without repair. No `DESIGN.md`, `.impeccable/design.json`, token, PRODUCT.md, reference asset or graph artifact is generated or changed by this pass.

The direction contract retains a generic FINISH sentence naming DESIGN.md, followed by its explicit ordinary-extension instruction to preserve documentation and report the missing file. That template inconsistency is recorded here, not promoted into a requirement to regenerate the system. The theme's `brand-hover` token and shared Button's opacity-based primary hover are also existing source differences; this pass preserves actual shared-component behavior rather than rewriting tokens to conceal drift.

The finished preview icon references `text-brand-700`, which is not defined in the inspected theme. The capture renders a legible inherited dark icon. This local non-normative utility is not recorded as a new palette token or house rule; source remediation is outside this documentation-only boundary.

## Verification context

The independent fresh finish review returned **ship**, with persistence, fidelity, ceiling, material-fixes and keep sections and no material fixes. The detector ran once with an empty findings list. These outcomes were supplied by the implementation coordinator; this documenter's separate source and raster inspection supports preserving the incumbent system.

At this documentation checkpoint, the coordinator reports 723 unit tests passing and static, build and database-drift checks passing. Both new browser tests passed independently, including responsive accessibility, keyboard, reduced-motion, denial, retry and download coverage. The complete 54-test browser rerun was still pending. This pass runs no tests and does not claim that full rerun or CI is green.

Only this comparison document is written by the documenter. No defect is canonized as a reusable rule; the pre-existing documentation gap and source differences are retained for explicit review rather than repaired through an unapproved system change.
