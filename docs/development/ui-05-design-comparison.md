# UI-05 design comparison

This is an ordinary local extension of the approved UI-03 student portal and merged Phase 12B. It introduces no new visual world or system-wide design decision. The finished surface matches the user-confirmed placement: one **View Sample Certificate** section in My Documents, before owned documents, plus a secondary Certificate Requests link to that section.

The initial [visual review](ui-05-visual-review.md) returned `ship`, with no material fixes, at the scope of readiness for human visual approval only. Human approval was subsequently received. The same reviewer appended a bounded `ship` continuation scoring both requested copy refinements resolved; it adds no new whole-surface or repository-gate certification. Commit, push and draft PR are authorized by the human approval; no automatic merge is authorized.

## Incumbent comparison

The current authority is the implemented portal: [theme tokens](../../packages/ui/src/styles/theme.css), shared [Button](../../packages/ui/src/components/button.tsx), [portal primitives](../../apps/web/src/features/student-portal/portal-ui.tsx), [student motion](../../apps/web/src/features/student-portal/student-motion.tsx), and the existing [Phase 12B mobile capture](phase-12b/phase12b-student-mobile.png). The [pre-UI-03 documents capture](ui-03/ui03-before-student-documents-desktop.png) was opened for historical context only. Its dark sidebar is not the current design authority.

| Aspect            | Finished UI-05 compared with incumbent                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Color and ground  | Reuses navy headings, brand-blue actions/icons, muted text, white card surfaces and pale portal ground through existing semantic tokens. No new palette or token is introduced.                                                                              |
| Typography        | Keeps PageIntro's existing heading hierarchy and PortalCard's title style. Training name uses the existing `text-lg`/semibold vocabulary; body and restriction copy use `text-sm` with relaxed leading. No new font or display treatment is added.           |
| Containers        | Reuses PortalCard's rounded panel, border, title rule and responsive padding. The owned-document library remains a separate section below it, consistent with the existing portal's task grouping.                                                           |
| Actions           | Shared default Button makes Preview Sample primary; shared outline Button gives Download Sample PDF secondary emphasis. Both anchors have a 44px minimum height. At 390px they stack across the available width; tablet and desktop permit adjacent actions. |
| Responsive layout | The sample is two columns at the existing `lg` breakpoint. At tablet and phone widths it stacks, with a separating rule before restrictions. All first-viewport captures show both actions. Existing mobile navigation and shell remain in place.            |
| Focus and motion  | The keyboard capture shows the download anchor's visible focus ring. Source reuses StudentActionMotion's optional tap scale and reduced-motion branch, rather than defining a new animation. A still image does not independently prove motion timing.       |
| Discovery         | My Documents owns the section. The Certificate Requests source links to `/student/documents#certificate-samples` with an existing brand link, visible focus and 44px minimum target; this secondary link has source evidence, not a separate screenshot.     |
| Content honesty   | The exact reference-only explanation and four restrictions are present. Transcript, Provisional, Character and Migration remain unavailable. Training is explicitly not their official format. This follows Phase 12B's honest unavailable-state approach.   |

The practical first-viewport mechanism is immediate: identify the Training Certificate and choose preview or download while the fictional/reference-only status is visible. No custom modal, extra navigation section, student input or actual issuance experience is introduced.

## Evidence opened and checked

The initial documentation pass opened all eight capture files. After human approval and the two copy refinements, this continuation reopened all seven refreshed portal captures and checked the updated component source and scoped reviewer verdict. The unchanged PDF render remains evidence from the initial pass:

- [1440px desktop full page](ui-05/documents-desktop.png) and [viewport](ui-05/documents-desktop-viewport.png): complete two-column panel, all restrictions, unavailable formats and the populated synthetic owned-document library below the sample.
- [768px tablet full page](ui-05/documents-tablet.png) and [viewport](ui-05/documents-tablet-viewport.png): stacked content, adjacent direct actions and readable copy; the full-page image shows the existing synthetic owned-document card below the sample.
- [390px mobile full page](ui-05/documents-mobile.png) and [viewport](ui-05/documents-mobile-viewport.png): two-line illustrative introduction, stacked full-width actions, readable wrapping and inherited navigation. The full-page image shows the separate owned-document card and its existing actions.
- [Keyboard/reduced-motion capture](ui-05/keyboard-reduced-motion.png): visible focus on download, with the same usable content hierarchy.
- [Actual sample PDF render](ui-05/sample-training.png): complete single-page approved training layout, Alex Sample and SAMPLE registration, large watermark, synthetic course/grade/period, unsigned lines, decorative sample seal, invalid sample QR label and non-official banner/footer.

The refreshed portal images come from the full-suite populated fixture state and show “E2E Provisional certificate scan” below the sample, with its existing metadata, “Not independently verified” explanation and Preview/Download actions. It is synthetic owned-document test content, not an available Provisional sample or newly issued certificate. The earlier empty-library captures and initial reviewer findings remain historical evidence; the current image paths now represent the populated state. In both states the sample remains separate from the existing library, using the incumbent UI-03 card, type and spacing vocabulary.

The tablet/mobile full-page captures retain the fixed bottom navigation at its initial viewport position, obscuring a strip of later content. The corresponding viewport images accurately establish the first view; desktop and source establish the obscured restriction lines. This stitching behavior is also visible in the historical Phase 12B mobile evidence and is not proof of a permanently obscured scrolled region. No blank, loading or wrong-route capture was observed.

The document artwork remains the approved Phase 12A sample; its branding and dated fictional fixture are preserved, not interpreted as the viewing student's course completion. Native protected PDF preview opens a new tab and attachment delivery downloads the same fixed sample. Headless Chrome cannot paint the native viewer in this test setup: the supplied evidence instead covers click/navigation and a 200 inline response with headers, API inline-byte hash checks, browser attachment hash checks, and Poppler rendering of the actual PDF. These screenshots do not claim to show a painted native browser PDF viewer.

## Documentation boundary and verification status

Reviewed the original user brief, [surface direction](../../apps/web/.impeccable/surfaces/student-certificate-samples.md), [PRODUCT](../../apps/web/PRODUCT.md), [implementation report](ui-05-student-certificate-sample.md), fresh visual review, certificate sample component, My Documents integration and Certificate Requests link source. Also compared the actual shared tokens/components and the two historical captures identified above. No browser, test run, new capture or implementation edit was performed in this documentation pass.

The supplied focused results are five API tests, two PDF tests, one component test and two browser tests passed. The parent verification report now records all local gates passed: 28 uncached static tasks, 771 unit/integration tests, 10 production-build tasks, no database drift and all 61 browser tests (7.6 minutes). Read-only post-run checks preserve all 38 original tables and 3,083 original MinIO objects. These runtime results are from the parent verification run, not independently certified by this visual documentation pass; UI-05 CI awaits approval and delivery.

PRODUCT retains its earlier UI-03 presentation-only wording. No current app-root DESIGN.md or `.impeccable/design.json` exists; the repository's archived Stitch DESIGN reference and earlier UI-03 context do not fully describe the current portal. This pre-existing context drift is recorded without repair. PRODUCT, global design context, sidecars, tokens and shared components are preserved. This file documents only the local UI-05 comparison; it does not turn task-specific sample restrictions into global design rules.

## Delivery approval and minor copy refinement

Human visual approval was received on 17 October 2026. The only subsequent UI change is the shorter
intro “An illustrative certificate layout with fictional details and unsigned signatures.” It
removes the implication of official layout approval while preserving the full reference-only
explanation, four restrictions and direct actions. Layout, shared UI-03 patterns and PDF bytes are
unchanged. The prior readiness review remains historical evidence; the same reviewer's scoped
continuation scores both requested refinements resolved. The seven refreshed portal captures were
checked against the inherited UI-03 components and layout without finding a new design-system
decision. Updated delivery gates are recorded in the implementation report; the current delivery
browser rerun was still finishing at this continuation's handoff, so earlier complete-run totals
above are not a claim about that rerun. Commit/push/draft PR are now authorized; merge and issuance
remain excluded. Phase 12C is entirely excluded; any future typed-contract integration belongs in
a separate PR.

Final delivery rerun completed: all 61 browser tests passed in 7.6 minutes. All 38 original tables and 3,171 original MinIO objects were preserved.
