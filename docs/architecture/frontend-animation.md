# Frontend animation rules

Framer Motion and GSAP are both part of the agreed stack. To keep motion purposeful and the bundle small,
each has a defined job. **Neither is installed in Phase 1** — they are added when the first screen needs them.

## Framer Motion — default for UI motion

Use for:

- page transitions
- dialogs, sheets and popovers
- cards (enter/hover)
- forms (validation feedback, step changes)
- status transitions (e.g. pending → verified)
- small UI interactions

## GSAP — only for timeline-heavy, special effects

Use **only** for:

- complex hero sequences on the public landing page
- QR scanning visual effects
- special timeline-based interactions that Framer Motion cannot express cleanly

**Do not use GSAP for ordinary UI transitions.**

## General rules

- **Do not animate every element.** Motion must communicate state or hierarchy, not decorate.
- Respect `prefers-reduced-motion`: provide a non-animated path for every animation.
- No animation in admin data views (tables, import review, logs) beyond instant state feedback.
- Verification results must appear immediately and unambiguously; animation must never delay or obscure an
  outcome such as "Not found" or "Revoked".
- Load GSAP only on the routes that use it (dynamic import), never in the shared layout.
