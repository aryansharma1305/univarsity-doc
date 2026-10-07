---
name: Academic Trust Matrix
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424654'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737786'
  outline-variant: '#c3c6d7'
  surface-tint: '#0056d2'
  primary: '#0043a8'
  on-primary: '#ffffff'
  primary-container: '#0759d7'
  on-primary-container: '#d3ddff'
  inverse-primary: '#b2c5ff'
  secondary: '#4a5d8c'
  on-secondary: '#ffffff'
  secondary-container: '#b8cbff'
  on-secondary-container: '#425583'
  tertiary: '#60451a'
  on-tertiary: '#ffffff'
  tertiary-container: '#7a5d30'
  on-tertiary-container: '#ffd8a2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a1'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#b2c6fa'
  on-secondary-fixed: '#011944'
  on-secondary-fixed-variant: '#324672'
  tertiary-fixed: '#ffddb0'
  tertiary-fixed-dim: '#e7c08a'
  on-tertiary-fixed: '#281800'
  on-tertiary-fixed-variant: '#5c4217'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 3rem
    fontWeight: '700'
    lineHeight: 3.5rem
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
  label-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.02em
  code-num:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2rem
  margin: 2rem
  margin-mobile: 1rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system embodies an authoritative, institutional aesthetic reimagined for high-efficiency modern software. Built for academic verification, official transcript distribution, and tamper-evident credential management, the interface communicates legal validity, institutional prestige, and technical precision.

The style converges **Corporate / Modern** structure with **Editorial Academic Dignity**:
- **Dignified Restraint:** Clean, unembellished surfaces prioritize legibility and rapid comprehension of complex tabular records, cryptographically signed credentials, and administrative audit trails.
- **Architectural Hierarchy:** Strict grid-bound structures evoke official diplomas, university charters, and registrar documents while maintaining contemporary ergonomics inspired by refined headless component architectures.
- **Micro-Accents of Heritage:** Subtle metallic warm gold accents are reserved strictly for official status markers, academic seal insignias, and cryptographic verification badges, keeping the broader UI airy and unpolluted.
- **Emotional Resonance:** Registrars, admissions officers, and students feel an absolute sense of security, provenance, and finality.

## Colors

The palette establishes an immutable balance between academic heritage and digital trust infrastructure.

### Functional Roles
- **Primary (`#0759D7` - Royal Institutional Blue):** Primary actions, active navigation states, selected table rows, verified token links, and high-priority interactive touchpoints.
- **Secondary (`#071F4A` - Deep Heritage Navy):** Structural frames, authoritative top-level navigation, document headers, and high-contrast title typography. Paired with `#03142F` for deep container backdrops and security modal headers.
- **Tertiary (`#D4AF7A` - Academic Seal Gold):** Reserved for official seals, honors indicators, Latin honors labels, secure credential watermarks, and micro-borders on validated certificates.
- **Neutral (`#64748B` - Slate Muted):** Subtitles, meta-descriptors, column keys, audit log timestamps, and inactive iconography.
- **Canvas & Surface:** Base canvas sits on `#F7F9FC` with primary document and module cards resting on crisp `#FFFFFF`.
- **Status Signals:**
  - Verified Success: `#16A34A` (Emerald) for cryptographic match, issued records, and validated identities.
  - Revocation & Errors: `#DC2626` (Ruby) for altered documents, failed hashes, and hold flags.
  - Pending Action: `#D97706` (Amber) for pending approvals and processing queues.

## Typography

Typography delivers a balanced division between institutional authority and technical precision:
- **Headlines (Plus Jakarta Sans):** Brings a structural, modern, geometric character to titles, metrics, and credential headings without drifting into casualness.
- **Body & Data Labels (Inter):** Deployed across table matrices, transcript lines, metadata keys, and verification status descriptions.
- **Tabular Numerics:** All numerical displays (GPA, credit hours, timestamps, serial identifiers, cryptographic hash signatures) must enforce CSS `font-variant-numeric: tabular-nums lining-nums` to guarantee absolute vertical grid alignment within data grids.

## Layout & Spacing

The layout is anchored on an 8-point baseline grid engineered for content-dense records:
- **Desktop (1280px+):** 12-column fluid grid bounded by a maximum container width of 1440px. Gutters default to `gutter-lg` (2rem) and outer margins to `margin-desktop` (3rem).
- **Tablet (768px - 1279px):** 8-column layout with 1.5rem gutters and 2rem outer margins. Auxiliary verification panels collapse into contextual slide-overs.
- **Mobile (<768px):** 4-column layout with 1rem gutters and 1rem canvas margins. Tables reflow into structured card stacks, retaining high-visibility verification indicators on top.
- **Data Spacing Discipline:** Table rows adopt compact vertical rhythms (`space-sm` to `space-md`) to ensure maximum information density without sacrificing touch/cursor target precision.

## Elevation & Depth

Visual hierarchy relies on crisp borders and ambient, high-restraint shadows rather than aggressive drop-shadows:
- **Canvas Base:** `#F7F9FC` provides a clinical, modern substrate.
- **Level 1 (Cards & Data Tables):** Pure white (`#FFFFFF`) with a 1px boundary of `#E2E8F0` and an ambient, low-opacity shadow: `0 1px 3px 0 rgba(3, 20, 47, 0.04), 0 1px 2px -1px rgba(3, 20, 47, 0.04)`.
- **Level 2 (Hover States & Dropdowns):** `0 4px 6px -1px rgba(3, 20, 47, 0.07), 0 2px 4px -2px rgba(3, 20, 47, 0.05)` layered with a 1px border of `#CBD5E1`.
- **Level 3 (Modals & Verification Viewers):** Centered floating layers with `0 20px 25px -5px rgba(3, 20, 47, 0.1), 0 8px 10px -6px rgba(3, 20, 47, 0.08)` surrounded by an explicit navy-tinted hairline border (`rgba(7, 31, 74, 0.12)`).
- **Document Watermark Layer:** Cryptographic hash backgrounds and institutional seals use layered opacities (3% to 6%) directly integrated into white cards to denote provenance.

## Shapes

The system implements a **Soft** shape language (`roundedness: 1`):
- Standard interactive elements (buttons, text inputs, dropdown toggles, table rows) feature `0.25rem` (4px) or `0.375rem` (6px) corners.
- Structural cards and modal dialogs use `rounded-lg` (8px).
- Status chips, cryptographic badge pins, and avatar frames use `rounded-full` pills to strictly contrast against the rectilinear layout of academic records.
- Avoid large, playful radiuses (`>12px`) on cards to maintain an authentic, official institutional character.

## Components

### Buttons
- **Primary:** Solid `#0759D7` fill with white text, 0.375rem border radius, and subtle focus rings (`2px` solid `#168CFF` offset by `2px`). Hover shifts to `#0648B0`.
- **Secondary / Institutional:** Solid `#071F4A` with `#FFFFFF` text. Used for conclusive actions like "Authorize Transcript" or "Issue Verification".
- **Outline / Neutral:** 1px border `#E2E8F0`, background `#FFFFFF`, text `#071F4A`. Hover background shifts to `#F8FAFC`.
- **Ghost:** Minimal `#64748B` label text with no border; hover activates subtle slate tint.

### Data Tables & Records Lists
- **Structure:** Clean hairline horizontal dividers (`#E2E8F0`). Table headers use `label-sm` in all-caps tracking with neutral slate color (`#64748B`) over `#F8FAFC` background.
- **Row Interaction:** Subtle background hover `#F1F5F9`. Selected rows highlight with a 2px left border accent in `#0759D7` and surface tint `#EFF6FF`.
- **Tabular Numbers:** Monospaced alignment for dates, credits, and verification identifiers.

### Verification Badges & Chips
- **Verified Status:** Deep emerald badge with background `rgba(22, 163, 74, 0.1)`, text `#15803D`, accompanied by an official checkmark icon.
- **Honors / Cum Laude Badge:** Gold seal accent with background `rgba(212, 175, 122, 0.15)`, text `#8A6227`, encased in a 1px border of `#D4AF7A`.
- **Cryptographic Hash Pill:** Compact `0.75rem` text with monospace font, subtle `#E2E8F0` border, and clipboard copy action.

### Input Fields & Controls
- **Text Inputs:** Height 40px, border 1px solid `#CBD5E1`, background `#FFFFFF`, typography `body-md`. Focus rings use `#0759D7` with `ring-1` precision.
- **Checkboxes & Radios:** Crisp square/circle profiles with 1px border `#94A3B8`. Checked state fills with `#0759D7` displaying an explicit white mark.

### Institutional Verification Cards
- **Record Overview Card:** Enclosed in `#FFFFFF` with 1px border `#E2E8F0`. Header contains university seal watermark, degree title, student ID, and an immutable SHA-256 verification string pinned to the top right.
- **Audit Sidebar:** Chronological timeline showing issuance, registrar signature verification, third-party views, and cryptographic integrity checks.