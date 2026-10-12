# Phase 12A design comparison

Phase 12A is an ordinary extension of the approved UI-02 and Phase 11B admin workspace. The completed [visual review](phase-12a-visual-review.md) records a ship verdict. The [surface contract](../../apps/web/.impeccable/surfaces/training-certificate-preview.md) supplies the certificate direction; [PRODUCT.md](../../apps/web/PRODUCT.md) preserves the existing identity and motion commitments.

## Incumbent preserved

Compared with Phase 11B desktop and mobile captures, the certificate workspace retains the navy sidebar and headings, blue active navigation and primary action, pale page ground, white bordered rounded panels, muted supporting copy, document icon and amber sample badge. The desktop control panel remains beside the preview region; tablet and mobile stack controls before the preview. The 390px view fits labels and actions without horizontal clipping. The forbidden view uses the existing permission message and administrator recovery path.

The route delegates to the feature view, which uses the existing PageHeader, Button and shared loading/error/forbidden components. Existing semantic color, surface, border and focus treatments remain in use. No new admin typography, token palette, shell or animation vocabulary is introduced. Static evidence cannot verify motion; preservation of installed GSAP/Motion patterns remains the product commitment rather than a new certificate animation requirement.

## Reference-driven document adaptations

The A4 certificate is a separate print composition: reference brand and crest, blackletter title, centered registration and body hierarchy, bold italic recipient/course emphasis, serif date/topics, and a red decorative seal beside QR and signature lines. These document assets and embedded print fonts do not establish new admin design tokens. Structured text surrounds individual raster assets rather than flattening the reference into a page image.

The subdued warm/cool background implements the contract's discreet reproducible ground. Synthetic names, registration and dates, the SAMPLE banner and diagonal watermark, example.invalid QR labeling and explicit issuance/verification notice replace personal data and authenticity claims. The user-selected signature treatment is preserved: unsigned lines with sample titles and no signatory names or handwritten signatures. The long fixture reduces recipient/course sizes and wraps the course across two lines; the inspected capture retains footer separation and readable topics.

## Inspected evidence and limits

- Phase 12A captures: [desktop](phase-12a/phase12a-templates-desktop.png), [tablet](phase-12a/phase12a-templates-tablet.png), [mobile](phase-12a/phase12a-templates-mobile.png), [forbidden](phase-12a/phase12a-templates-forbidden.png), [standard certificate](phase-12a/training-standard.png) and [long certificate](phase-12a/training-long-text.png).
- Incumbent comparison: Phase 11B [desktop](phase-11b/phase11b-templates-desktop.png) and [mobile](phase-11b/phase11b-templates-mobile.png) captures.
- Source: certificate preview view and route, training renderer and template definitions. PDF metadata independently confirms both [standard](../../output/pdf/phase12a-training-standard.pdf) and [long-text](../../output/pdf/phase12a-training-long-text.pdf) artifacts are single-page A4 portrait (594.96 × 841.92 pt); the completed visual review records inspection of their independent Poppler renders.

Admin captures cover initial and forbidden states. Generated iframe display, download behavior, loading/error transitions and keyboard focus are supported by source but not demonstrated by those captures. The supplied certificate direction and completed review are the fidelity authority; this comparison did not independently inspect the original uploaded reference. No separate quality board was supplied. Visual evidence does not verify permissions, issuance or academic policy.

DESIGN.md was already absent. That context drift is preserved; no DESIGN.md, design sidecar, replacement visual world or drift repair is introduced. The prior detector result (`[]`) is recorded by the completed review and was not rerun. This comparison changes documentation only.
