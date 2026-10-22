# Frontend animation rules

Framer Motion and GSAP are both part of the agreed stack. To keep motion purposeful and the bundle small,
each has a defined job. The installed packages are `motion` (Framer Motion) and `gsap`, reused by UI-01
and UI-02 rather than introducing another animation stack.

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
- the explicitly requested UI-02 dashboard workspace switcher: a bounded rule/mask timeline,
  dynamically loaded in that feature only, with static content as the fallback

- the explicitly requested UI-03 student dashboard entrance: one scoped, dynamically loaded
  welcome/identity/academic/actions timeline following UI-01/UI-02 timing and lifecycle patterns

- the explicitly requested Phase 11A student Results entrance: a scoped, dynamically loaded
  4px translation over 280ms, without hiding content or delaying result/error visibility

- the explicitly requested UI-06 public homepage: the hero entrance (masked headline, crest orbits,
  pointer tilt and scroll parallax) plus ScrollTrigger reveals, the how-it-works rail and the
  safeguards shield, all in `features/public-verification/use-landing-motion.ts`. Reveals animate
  opacity/transform only (never `visibility`), every tween starts from laid-out content, and a switch
  to reduced motion reverts all tweens and ScrollTriggers. The hero's network canvas and the sign-in
  pages' orbit rings use a single `requestAnimationFrame` loop instead of an animation library.

**Do not use GSAP for ordinary UI transitions beyond these explicitly approved sequences.**

## General rules

- **Do not animate every element.** Motion must communicate state or hierarchy, not decorate.
- Respect `prefers-reduced-motion`: provide a non-animated path for every animation.
- No animation in admin data views (tables, import review, logs) beyond instant state feedback.
- Verification results must appear immediately and unambiguously; animation must never delay or obscure an
  outcome such as "Not found" or "Revoked".
- Load GSAP only on the routes that use it (dynamic import), never in the shared layout.
