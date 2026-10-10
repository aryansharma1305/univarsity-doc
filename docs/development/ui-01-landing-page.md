# UI-01 — Public landing page

Redesign of the public landing page (`/`) for its main audience, **students**. Frontend only: no API,
database, migration, authentication or routing changes. Admin and student applications are untouched.

## Scope

| Changed                                                    | Not changed                                        |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `/` landing page (new sections, interactions, share image) | Admin dashboard and `/admin/*`                     |
| Public header and footer (shared by all public pages)      | Student portal `/student/*`                        |
| `Wordmark` gains an opt-in `adaptive` tone (header only)   | Login, activation and session behaviour            |
| `apps/web/e2e/public.spec.ts` updated for the new headline | API, database, worker, migrations, Phase 10C files |
| Dependency: `gsap@3.15.0` (web app only)                   | Placeholder pages (`/results`, `/verify/*`)        |

## Page structure

1. **Sticky header** — Features · Get started · What’s coming · FAQ · Help, ⌘K search, Staff Login
   (small), Student Login. Mobile: menu sheet (unchanged contract: “Open menu”).
2. **Hero** — headline “Everything academic. One intelligent workspace.”, student-facing supporting
   text, **Student Sign In** / **Activate your account**, and a clickable student portal preview.
3. **Quick access** — student entry points and public verification services marked _Coming soon_.
4. **Features** — the eight student portal pages that work today.
5. **Get started** — four activation steps, a “have these ready” checklist and an activation CTA.
6. **What’s coming** — live student portal, then planned results, notifications and public
   verification. No dates until the university confirms them.
7. **FAQ** — six student questions with live search and deep links (`/#faq-<n>`).
8. **Final chooser** — “Have you signed in before?” → Sign in / Activate your account.
9. **Footer** — Explore, Access, Verification (_Soon_), Support, legal links.

## Design decisions

- **Audience is students.** Admin capabilities, audit internals and staff workflows were removed after
  review; staff reach their console through the small header/footer Staff Login link.
- **Truthful content.** Every feature listed maps to a working student page
  (`app/student/(portal)`). Results, notifications and public verification are labelled _Coming soon_ /
  _Planned_ and link only to the existing “not available yet” placeholders. No testimonials, logos,
  statistics or university names. Product mockups are drawn in markup from the real student shell
  (same navigation labels, Results/Notifications marked _Soon_) with skeleton bars instead of data.
- **Visual language.** Existing brand palette only (navy 950, blue 600); one serif italic accent word
  per heading (Instrument Serif, loaded by the landing page only); hairline grids instead of gradients
  or glass; large display type with tight tracking.
- **Copy.** Edited with the `no-ai-slop` rules: no em dashes in short copy, no unverifiable claims
  (“no more queues”), no generic headings. Office wording matches the portal (“registrar’s office”).
- **Tokens.** `apps/web/src/styles/landing.css` adds `--lp-*` tokens (ink, paper, surface, hairlines,
  accent, CTA, live) and type utilities (`lp-type-*`, `lp-serif`, `lp-grid`, `lp-spotlight`). Utilities
  are not named `text-*` so `tailwind-merge` never strips them.

## Activation accuracy

Checked against the code, not assumed:

- Codes are issued by staff only (`POST /api/v1/student-accounts/activation-codes`); the plain code is
  returned once, to staff. Docversity does not email codes, so the page says the university issues
  them and to ask the registrar’s office if none arrived.
- Activation takes registration number + activation code + new password
  (`POST /api/v1/student-auth/activate`, form at `/student/register`).
- Codes are single use and expire (`STUDENT_ACTIVATION_CODE_TTL_DAYS`, default 30). The page says
  “expires” without a number because the value is configurable.
- A forgotten password is recovered with a new activation code (same wording as
  `/student/register` and student Account Settings).

## Interactions

| Feature              | Library       | Notes                                                                 |
| -------------------- | ------------- | --------------------------------------------------------------------- |
| Hero intro timeline  | GSAP          | Words, preview window, floating cards. Pre-paint guard on `<body>`.   |
| Scroll depth + tilt  | GSAP          | Floating cards drift; window leans back on a separate element.        |
| Get-started rail     | GSAP          | Progress line scrubs with scroll; steps light up.                     |
| Portal preview tabs  | Framer Motion | ARIA tabs (click + arrow keys); five screens; shared-layout nav pill. |
| Section reveals, FAQ | Framer Motion | In-view reveals, accordion, live search with layout animation.        |
| Magnetic primary CTA | Framer Motion | Mouse pointers only.                                                  |
| Cursor spotlight     | CSS variables | `pointermove` sets `--lp-x/--lp-y`; no React re-render.               |
| ⌘K command palette   | Radix Dialog  | Combobox/listbox; title matches ranked first; FAQ results deep-link.  |
| Mobile sticky bar    | Framer Motion | Shown only between the hero and the final chooser/footer.             |

**Enhancements only.** Magnetic, spotlight and tilt never wrap or replace navigation: every CTA is a
plain link; the spotlight layer is `pointer-events-none`; tilt applies to the decorative preview only.

## Motion, touch and performance

- **Reduced motion:** GSAP is never loaded (`useGsapScene` exits early); the pre-paint guard is skipped;
  `MotionConfig reducedMotion="user"` disables Framer Motion transforms page-wide; CSS transitions are
  cut by the theme’s global rule. Verified: no element hidden, CTAs navigate.
- **Touch:** Tailwind v4 `hover:` only applies on hover-capable devices; magnetic ignores non-mouse
  pointers. Verified by tap tests on the hero CTA and mobile sticky bar.
- **Performance:** GSAP (69 KB) is a dynamic import loaded only on `/` when motion is allowed —
  verified absent on `/help`, `/student/login` and under reduced motion. `/` is statically prerendered.

## Dark mode

Follows the device setting on the landing page only. Variables are redefined under
`@media (prefers-color-scheme: dark) { body:has([data-lp-root]) { … } }`; only the landing page renders
`data-lp-root`. Verified in dark mode: `/` is dark; `/help`, `/student/login`, `/student/register`,
`/admin/login` stay light, including after client-side navigation away from `/`. Product mockups stay
light on purpose (they depict the light-themed portal).

## Share image

`app/(public)/opengraph-image.tsx` generates a 1200×630 PNG at build time. `metadataBase` uses
`WEB_URL`. The site stays `noindex` until launch (root layout, unchanged).

## Final polish pass

After visual review, without new features:

- **Contrast:** `--lp-ink-soft` darkened in light mode (`#334158`, 10.6:1 on white) and brightened in
  dark mode (`#bcc7da`, 10.4:1 on the dark surface). Idle get-started steps dim to 75% instead of 45%
  (still ≥ 5:1 in both themes).
- **Mobile preview:** below `md` the hero preview is framed as a phone (navy bezel, no desktop address
  bar) at up to 22 rem wide, with its type stepped up one size (e.g. 10 → 12 px). Desktop is unchanged.
- **Header branding:** the wordmark has an opt-in `large` size (bigger shield and name, tracked
  subtitle), used in the public header from `sm` up. Phones keep the standard size so the header fits
  at 390 px.
- **Dark-mode separation:** sections alternate `--lp-paper` and a lifted `--lp-surface`
  (`#0b1930`) with hairline dividers; hairlines are slightly stronger in dark mode.
- **Mobile feature cards:** icon beside the text, tighter padding and gaps on phones; the 390 px page is
  526 px shorter (9,924 → 9,398 px).

Overflow at 390 px is checked with a full-height viewport and an element scan: with mobile emulation,
wide content widens the layout viewport instead of scrolling, which `scrollWidth − innerWidth` misses.

## Accessibility

- axe (serious/critical) passes on `/` in light mode (`accessibility.spec.ts`) and was run locally in
  dark mode at 1440 px and 390 px as well. Three contrast issues found during the work were fixed.
- Real headings per section; preview tabs, FAQ accordion and palette follow WAI-ARIA patterns;
  decorative mockups are `aria-hidden` with a screen-reader description of the selected screen.
- No page-level horizontal scroll at 390 px.

## Verification (local)

`pnpm format:check`, `pnpm lint` (one pre-existing warning in `data-table.tsx`), `pnpm typecheck`,
web unit tests, `pnpm --filter @docversity/web build`, `public.spec.ts` and the public part of
`accessibility.spec.ts` against the built app, plus a scripted audit: 19 landing links resolve, preview
tabs, palette results, all FAQ deep links, reduced motion, touch, GSAP isolation and dark-mode scoping.

## Evidence

Production build, full page:

| Width | Light                                 | Dark                                |
| ----- | ------------------------------------- | ----------------------------------- |
| 1440  | [light](ui-01/landing-1440-light.png) | [dark](ui-01/landing-1440-dark.png) |
| 768   | [light](ui-01/landing-768-light.png)  | [dark](ui-01/landing-768-dark.png)  |
| 390   | [light](ui-01/landing-390-light.png)  | [dark](ui-01/landing-390-dark.png)  |

Details: [hero](ui-01/hero-1440-light.png), [portal preview — Profile](ui-01/preview-profile.png),
[command palette](ui-01/command-palette.png), [mobile preview](ui-01/preview-mobile.png). Before (dev build): [1440](ui-01/before-1440.png),
[390](ui-01/before-390.png). Screenshots are manual evidence, not golden assertions.
