> **Archived planning document (7 Oct 2026).** Copied verbatim from `STITCH-MIGRATION-PLAN.md`, which was
> written before implementation began. It remains the reference for the module, database, import, result,
> certificate and security plans, **except** where later decisions supersede it:
>
> | Topic in this document | Superseded by |
> |---|---|
> | Public result lookup "plus date of birth" | Second identifier is **not confirmed** and must not be hard-coded — [product-decisions.md §A](./product-decisions.md#a-public-result-lookup) |
> | Worker as a second entrypoint of `apps/api` | Separate `apps/worker` — [ADR-0003](../decisions/ADR-0003-background-worker.md) |
> | Node.js 24 LTS | Node ≥ 22.12 (`.nvmrc` 22) — [ADR-0005](../decisions/ADR-0005-toolchain-baseline.md) |
> | Phase 1 "single throwaway table" to prove migrations | No table; migration tooling proven without a model — [docs/database](../database/README.md) |
> | Phase 1 production Dockerfiles | Deferred to deployment work — [docker/README.md](../../docker/README.md) |
> | `/admin/results/import` style routes | One `/admin/imports` subsystem — [product-decisions.md §B](./product-decisions.md#b-imports--one-subsystem) |
> | Animation guidance (§19 risk 13) | [frontend-animation.md](./frontend-animation.md) |
> | §13 database models and enums | The implemented Phase 2 schema — [docs/database](../database/README.md), [ADR-0006](../decisions/ADR-0006-database-enforced-integrity.md) |
>
> References to `TECHNICAL-AUDIT.md` point to the legacy WordPress audit, which is kept outside this
> repository (`/Users/gugloo/Docvarsity/TECHNICAL-AUDIT.md`) because it describes a live third-party system.

---

# Docversity — Stitch export inspection & production migration plan

Inspection date: 7 October 2026. Source: `~/Downloads/stitch_docversity_ui_ux_design_system.zip` (4.5 MB, 21 entries) and its extracted folder. The extracted folder matches the ZIP listing byte-for-byte in size; the ZIP was not modified. No code was written, nothing was installed, no project was scaffolded.

Related prior document: `TECHNICAL-AUDIT.md` (6 Oct 2026) audited the **existing WordPress site** at `verify.thedocversity.com` and recommended a WordPress plugin. That recommendation is **superseded** by the locked stack in this brief (no WordPress). Its findings about existing data and printed QR codes still matter and are carried into §13, §16 and §19.

Terminology: **Confirmed** = directly observed in the export. **Proposed** = a design recommendation, not something that exists.

---

## 1. Stitch ZIP Summary

The export is a **visual prototype, not an application**. It contains:

- **6 screens**, each a single self-contained `code.html` (28–46 KB) plus a full-page `screen.png` render.
- **1 design-system document** (`academic_trust_matrix/DESIGN.md`) with YAML tokens and prose guidelines.

There is no `package.json`, no build, no framework, no components, no API layer, no data layer and no local assets. Every page loads Tailwind through the Play CDN. All content is hard-coded, all 80 links are `href="#"`, and every interactive behaviour is a local DOM trick: toggling classes, `alert()`, `confirm()`, toasts and `window.print()`.

Its value is as a **visual specification**: layout, hierarchy, tokens, component inventory and interaction intent. It contains **no reusable runtime code**.

Two things need attention before anything ships:

1. **Fake verification outcomes.** The QR page shows "Record Located & Cryptographically Intact" for *any* input. The certificate page generates its "SHA256" with `Math.random()`. On a verification product, a fake positive is the worst possible defect.
2. **Unsupported claims in the copy.** The pages claim ISO 27001 certification, FERPA/GDPR compliance, blockchain, "decentralized institutional nodes", zero-knowledge proofs, Arweave storage, hardware HSM sealing, PKI signatures and "ECC-200 cryptograms". None of these exist, and some (ISO 27001) are certifications the client may not hold. Publishing them would be misrepresentation.

## 2. Existing Export Technology

| Item | Finding |
|---|---|
| Framework | **None.** Static HTML5 with inline `<script>` blocks |
| Package manager / `package.json` | **None** |
| Build scripts | **None** |
| Source directory | None. One folder per screen, each with a single `code.html` |
| CSS | Tailwind **Play CDN** (`cdn.tailwindcss.com`, documented as not for production) with an inline `tailwind.config`. A tiny inline `<style>` hides **all** scrollbars globally (`::-webkit-scrollbar{display:none}`) |
| Tailwind config | Identical across all 6 files (same MD5). It defines ~49 Material-3-style colour names, a custom spacing scale, 13 font-size tokens, and an **overridden radius scale** (see §6) |
| Fonts | Google Fonts CDN: Inter (400/500/600) and Plus Jakarta Sans (600/700). The certificate preview also uses Tailwind `font-serif`, which falls back to a system serif font (no font is loaded) |
| Icons | Material Symbols Outlined via **two** duplicate Google Fonts stylesheet links per page, rendered as ligature text (`<span>search</span>`) |
| Images | 3 unique remote images, all hosted at `lh3.googleusercontent.com/aida-public/…` (AI-generated): a crest "logo" (used 12×), a stock parchment photo (QR page) and a student portrait (result page). **No local images, SVG files or brand assets** |
| Inline SVG | 3 decorative fake QR codes/glyphs. They do not encode anything |
| Generated artefacts | `<g0-textarea-recorder-host>` elements leaked from the Stitch editor (3 files); `data-path` attributes hinting at intended routes; `data-alt` image descriptions |
| JavaScript / TypeScript | ~250 lines of inline vanilla JS in total. No TypeScript |
| React components | **None** |
| API calls | **None.** No `fetch`, XHR, axios or form `action` |
| Fake / static data | Everything: people, numbers, hashes, counts, timestamps and file names |
| Forms | 1 `<form>` (QR manual entry, `preventDefault` → shows a hidden fake success). The other inputs are not inside forms |
| Tables | 3 `<table>` elements (result marks, dashboard activity, import errors) plus a card-list "table" for certificates |
| Modal / dropdown logic | 1 modal ("Fast Provision Student") with show/hide via class toggles; 1 native `<select>` (document type); toast element; inline edit panel; tab buttons with no behaviour |
| Animations | CSS transitions only (hover lift, `translate-x`, toast slide, pulse dots). No Framer Motion or GSAP equivalent |
| External CDN dependencies | `cdn.tailwindcss.com`, `fonts.googleapis.com`/`fonts.gstatic.com` (3 stylesheets per page), `lh3.googleusercontent.com` (images) |
| Dark mode | `darkMode:"class"` is configured but **0** `dark:` classes are used |
| Accessibility | 1 `aria-` attribute per page (`aria-current`). Only 6 `<label>` elements in the whole export. Icon ligatures are read aloud by screen readers. Scrollbars are hidden globally |

## 3. Directory Structure

```text
stitch_docversity_ui_ux_design_system/            5.2 MB, 21 entries
├── academic_trust_matrix/
│   └── DESIGN.md                    tokens (YAML) + brand/style guidelines
├── public_verification_portal_home/
│   ├── code.html                    30 KB  public landing
│   └── screen.png                   1.4 MB
├── academic_result_verification_detail/
│   ├── code.html                    35 KB  public result statement
│   └── screen.png                   1.1 MB
├── qr_document_scanner_verifier/
│   ├── code.html                    28 KB  public QR scan + manual lookup
│   └── screen.png                   0.5 MB
├── admin_registry_dashboard/
│   ├── code.html                    35 KB  admin dashboard
│   └── screen.png                   0.9 MB
├── excel_bulk_import_validation/
│   ├── code.html                    46 KB  admin result import wizard (step 5)
│   └── screen.png                   0.9 MB
└── certificate_management_preview/
    ├── code.html                    39 KB  admin certificate registry + preview
    └── screen.png                   0.4 MB
```

There is no `node_modules` and no generated build output.

## 4. Screens Found

The export has **6 screens**. The target product needs roughly **24 routes**, so about 18 routes have **no design** (listed at the end of this section).

| # | Stitch screen | Proposed route(s) | Purpose | Reusable components it implies | Dependencies | Verdict |
|---|---|---|---|---|---|---|
| 1 | `public_verification_portal_home` | `/` | Landing page: hero quick search, 4 service cards, "how it works", trust strip, footer | `PublicHeader`, `PublicFooter`, `HeroSearch`, `ServiceCard`, `StepCard` | Fonts, icons, real logo | **Keep layout, rewrite copy.** Remove every false claim and fake stat. Decide what the quick-search does (see §5). Drop or confirm the "Enterprise Gateway / bulk access" CTA |
| 2 | `academic_result_verification_detail` | `/results` (form → result view) | Public statement of marks | `VerificationBanner`, `StudentIdentityCard`, `MarksTable`, `ResultSummaryCards`, `VerificationRefCard`, `DocumentActionBar` | Results API, grading output, PDF endpoint | **Keep, refactor.** This is the best template for **all three** public verification result pages and the visual basis for the result PDF |
| 3 | `qr_document_scanner_verifier` | `/verify/qr` (scanner) and `/verify/qr/[token]` (outcome) | Camera/upload QR scan plus manual serial lookup | `ModeToggle`, `ScannerViewport`, `FileDropZone`, `ManualLookupForm` | A QR decode library (not in the locked stack, see §19) | **Redesign.** Keep the layout idea, rebuild all behaviour. Most real users will scan with the phone camera app, which opens `/verify/qr/[token]` directly, so the in-page scanner is secondary |
| 4 | `admin_registry_dashboard` | `/admin` | KPIs, recent verifications, recent certificates, recent imports | `AdminShell` (sidebar + top bar), `StatCard`, `ActivityTable`, `RecentList` | Dashboard aggregate API | **Keep, refactor.** Sidebar nav matches the target modules almost exactly. Fix the broken layout (§5) |
| 5 | `excel_bulk_import_validation` | `/admin/imports/[id]` (shared by student and result imports) | 6-step import wizard, shown at step 5 "Review errors" | `Stepper`, `FileSummaryCard`, `RowHealthSummary`, `ColumnMappingCard`, `ImportErrorTable`, `ImportActionBar` | Imports API, BullMQ jobs | **Keep structure, redesign actions.** The 6 steps map well to the backend (§14). Remove the auto-clamp, inline edit and "create student" shortcuts |
| 6 | `certificate_management_preview` | `/admin/certificates` (list) and `/admin/certificates/[id]` (detail/preview) | Status tabs, filters, certificate list, A4 preview, actions | `StatusTabs`, `FilterBar`, `CertificateListItem`, `DocumentPreviewFrame`, `CertificateActions` | Certificates API, template renderer | **Keep, split into list and detail.** The parchment is a placeholder: real templates come from the client's official documents |
| — | `academic_trust_matrix/DESIGN.md` | — | Design tokens + guidelines | — | — | **Reference.** Move to `docs/design-system.md` after resolving its conflicts with the screens (§6) |

**Route adjustments to the suggested map:**
- **Imports:** use one `imports` area instead of `/admin/results/import`: `/admin/imports` (history), `/admin/imports/new?type=students|results`, `/admin/imports/[id]` (wizard). The Students and Results pages link into it. One wizard serves both import types.
- **QR:** add `/verify/qr` for the scanner page. Keep `/verify/qr/[token]` as the QR landing page; this is the URL encoded in every printed QR.
- **Documents:** keep `/document/[token]` only if the client wants public PDF download by token. Otherwise the QR page shows the verification outcome and nothing more (privacy decision, §19).
- **Legacy URLs:** add redirects so that already-printed WordPress QR URLs on `verify.thedocversity.com` keep working (§19).

**Routes with no Stitch design:**
- Public: `/results` search form, `/verify/registration` (form + result), `/verify/certificate` (form + result), the not-found / revoked / error states for every verification, and mobile navigation.
- Admin:
  - `/admin/login`
  - Students: `/admin/students`, `/admin/students/[id]`
  - Results: `/admin/results`, `/admin/results/[id]`, plus a publish flow
  - Certificates: `/admin/certificates/generate`
  - Imports: `/admin/imports` (history), `/admin/imports/new` (upload + mapping steps)
  - `/admin/templates`, `/admin/logs`, `/admin/users`, `/admin/settings`
  - Mobile admin navigation

These should be built from the extracted component system rather than generated ad hoc.

## 5. Functional vs Mock Controls

Legend: **F** = functional (really works), **S** = static/mock (looks real, does nothing or shows fake data), **P** = placeholder (`href="#"`, no handler), **B** = broken/incomplete.

### Shared shell (all pages)
| Control | Class | Notes |
|---|---|---|
| Public top nav (Home, Results Check, …), Staff Portal, avatar | P | `href="#"`. Nav is `hidden lg:flex` with **no mobile menu**, so navigation disappears below 1024 px |
| Admin sidebar nav (9 items) | P | `href="#"`. Sidebar is `fixed w-72` with content `pl-72` and **no responsive handling**, so admin is unusable on tablet/mobile |
| Admin global search, notifications bell | P | No handler |
| Session chip, user name/role, "Vault Integrity SHA256", "ACTIVE AUDIT v4.18-SEC" | S | Hard-coded. Header says session "2024/2025 Term II" while dashboard body says "2023–2024 Term II" |
| Footer links | P | `href="#"` |

### Result search & public result
| Control | Class | Notes |
|---|---|---|
| Home quick search + Enter key | S/B | Only sets `location.hash = '#/certificate-verify?q=…'`, so it always assumes certificate. Empty input swaps the placeholder text instead of showing an accessible error. The input has no label |
| Service cards (4) | P | `href="#"` |
| Result **search form** | — | **Does not exist.** The export jumps straight to a populated result |
| Result page data (student, marks, SGPA/CGPA, status) | S | One hard-coded student. Arithmetic is inconsistent: the column maxima add to 725 (5×125 + 100) but the footer says "637 / 700" and "91.0%" |
| Registration No. / Roll Number | B | Text overlaps in the rendered screenshot |
| Download PDF | S | `window.print()`. It is not a PDF |
| Print Result | F (trivially) | `window.print()`, with no print stylesheet |
| QR code on result | S | Decorative SVG; encodes nothing |
| "Verify Another Record" | P | |
| Student portrait | S | AI image. Whether photos may be shown publicly is a client privacy decision |

### Registration verification
**No screen exists.** It is only a nav item and a service card.

### Certificate verification (public)
**No screen exists.** The home quick-search points at it.

### QR scanning
| Control | Class | Notes |
|---|---|---|
| Live Optical Scan / Upload toggle | F (cosmetic) | Swaps visible panels. The only genuine UI-state logic in the export |
| Camera viewport, "Target locked … 99.4% CONF", corner brackets | S | Stock photo with overlay. **No `getUserMedia`, no decoding** |
| Flashlight, Flip Aperture, Reset View | P | No handlers |
| File drop zone / file input | P | `<input type=file>` has no change handler. Claims PDF support up to 25 MB |
| Manual lookup form (serial + student ID) | **S — dangerous** | Any submission reveals a hidden success card for "Eleanor Vance … Summa Cum Laude", which is **a fake positive** |
| "View Attestation", "Contact Registrar" | P | |

### Admin dashboard
| Control | Class | Notes |
|---|---|---|
| 4 KPI cards, trend %, progress bar | S | Hard-coded |
| Recent Verification Activity table | S/B | 5 fake rows. "Outcome" column **clipped off-screen**. Rows reference sources that don't exist (Employer API, Student Mobile App, Enterprise Registry API). "Auto-refresh: 15s" does nothing |
| Import Excel | S | Changes its label and then calls `alert()` |
| Generate Cert, audit icon, filter, "View All", "Open Registry Audit Log" | P | |
| Recent Certificates / Recent Imports | S | Hard-coded. "Published"/"In Review" badges overflow their cards |
| Department chart, System health | B | Empty HTML comment stubs where sections were meant to be |

### Student tables
**No students screen exists.**

### Excel import UI
| Control | Class | Notes |
|---|---|---|
| Stepper (6 steps) | S | Static at step 5. "Step 5 • Active" text overlaps the label in the render |
| File summary, encoding, checksum, "Validated by Docversity Core" | S | Hard-coded. Size badge overflows its card |
| Row health counts (1,420 / 1,411 / 7 / 2 / 0) | S | Hard-coded. The 7 warnings are counted but **never listed** |
| Column mapping cards ("Semantic Engine … 98.2%") | S | 4 hard-coded mappings with fake confidence scores. No way to change a mapping. "Re-evaluate" shows a toast |
| Error table (2 rows) | S | Hard-coded |
| Set to Max (60) | S — **must not exist** | Silently changes an official mark to make validation pass |
| Inline Edit → Apply Correction | S | Changes nothing except row opacity and a counter |
| Skip Row | S | Row opacity + counter |
| Create Student modal | S — **wrong place** | Creates a student from inside a *result* import with a read-only, hard-coded program. Student creation belongs in student import or student management |
| Download Error Report, Cancel & Re-upload, Save Draft, Import Valid Records | S | Toasts only |
| **Second** action bar (duplicate buttons) | B | **Duplicate element IDs** (`downloadErrorLogBtn`, `commitActionBtn`, `reuploadFileBtn`, `saveDraftBatchBtn`, `commitActionText`), so these buttons never receive handlers |
| `queueBadge` updates | B | References an element that doesn't exist |
| "Atomic Transaction Notice … instant rollback" | S | Claim not backed by anything |

### Result tables (admin)
**No admin results screen exists.**

### Certificate generation
**No generation screen exists.** The "+ Issue New Certificate" and "Batch Export" buttons have no handler.

### Certificate preview / management
| Control | Class | Notes |
|---|---|---|
| Status tabs, search, type `<select>`, filter, pagination | P | No handlers. The "Revoked (48)" tab is clipped. The `<select>` already lists Provisional, Transcript and Character certificate types, which is useful |
| Certificate list item click → preview update | F (cosmetic) | Rewrites preview text from inline literals. Uses the deprecated global `event`. **Serial mismatch**: list shows `DOC-CERT-2024-00918`, preview shows `DOC-DEG-2024-CS-00918` |
| Preview hash | S — **fake** | `Math.random()` string presented as SHA-256 |
| Download Official PDF | S | `alert()` |
| Print Security Parchment | F (trivially) | `window.print()`, which prints the whole admin page |
| View Public Verification Link | S | Copies a hard-coded URL on a placeholder domain (`verify.docversity.edu`), then calls `alert()` |
| Revoke Document | S | `confirm()` + `alert()`. No reason captured, no authorisation |
| Audit trail / storage node / foil cards | S | Fiction (Arweave, HSM, WES portal, stock-paper serials) |

### Template management, Users/Roles, Settings
**No screens exist.** They appear only as sidebar items.

**Answer to "does any control only change appearance?"** Yes, virtually all of them. Only three behaviours do anything real: the QR mode toggle, the certificate list → preview text swap, and `window.print()`. None of the three touches data. Everything else is a placeholder, a toast/alert, or fabricated output.

## 6. Design System

### Source conflict that must be resolved first
`DESIGN.md` has **two inconsistent palettes**. The rendered screens use the YAML/Tailwind palette, while the prose describes a different one:

| Role | YAML / Tailwind config (what the screens render) | DESIGN.md prose |
|---|---|---|
| Primary | `#0043A8` (container `#0759D7`) | `#0759D7`, hover `#0648B0` |
| Secondary | `#4A5D8C` (muted slate-blue) | `#071F4A` deep navy |
| Tertiary / gold | `#60451A` / `#7A5D30` (brown) | `#D4AF7A` seal gold |
| Canvas | `#F8F9FF` | `#F7F9FC` |
| Border | `#C3C6D7` (outline-variant) | `#E2E8F0` |
| Error | `#BA1A1A` | `#DC2626` |
| Success / warning | **not defined** | `#16A34A` / `#D97706` |

**Radius trap:** the Tailwind config **remaps** the scale: `DEFAULT 2px, lg 4px, xl 8px, full 12px`. As a result, every `rounded-full` "pill" in the screens is really 12 px, and every `rounded-xl` card is 8 px. DESIGN.md says `xl 0.75rem, full 9999px`. Copying class names verbatim into a standard Tailwind setup would change the look everywhere.

**Status colours are missing.** The screens show "PASS" and "Valid" in blue-grey and use ~20 ad-hoc hex values for gold, slate and green (e.g. `text-[#15803D]`, `border-[#8C6D3F]`). There are no success or warning tokens.

### Observed system
| Area | Observation |
|---|---|
| Typography | Headings: Plus Jakarta Sans 600/700 (display 48/56, headline 36/28/24/20/18). Body: Inter 400/500/600 (18, 15, 13; labels 14/12 with +0.02em tracking). DESIGN.md requires `tabular-nums lining-nums` for numbers, but **the screens never apply it** |
| Spacing | Tokens 4/8/16/24/40 px (`space-xs…xl`), gutters 16/24/32, margins 16/32/48. Max content width 1280 (`max-w-7xl`); DESIGN.md says 1440 |
| Shadows | Mostly `shadow-sm`/`shadow-md`, plus arbitrary `0 1px 8px rgba(0,0,0,.04)` on header/sidebar. The DESIGN.md elevation levels 1–3 (navy-tinted) are **not used** |
| Buttons | Primary (blue fill), tonal (`surface-container` + primary text), outline-ish white, ghost, danger-tonal (revoke). Heights inconsistent. Focus rings absent |
| Inputs | Borderless tonal fields with icon; 40 px intended; no focus ring token; few labels |
| Tables | Uppercase 12 px headers on tinted background, hairline row dividers, right-aligned numerics; clipped on dashboard |
| Cards | White, 8 px radius, `outline-variant/40` border, small shadow; metric cards with icon tile |
| Badges | Small tonal chips (12 px radius); dot + label; strikethrough serial for revoked |
| Sidebar | 288 px fixed, logo block, version chip, 9 nav items with icons, active = filled blue, footer status card |
| Header | Public: 80 px sticky, blurred translucent white, segmented pill nav. Admin: session chip, search, bell, user block |
| Mobile navigation | **None in either shell** |

### Proposed design tokens
These become shadcn CSS variables in `packages/ui` (Tailwind v4 `@theme`). Values default to what the client saw rendered; the four rows marked ⚑ need client/designer sign-off.

| Token | Proposed value | Use |
|---|---|---|
| `background` | `#F8F9FF` | App canvas |
| `foreground` | `#0B1C30` | Body text |
| `surface` / `card` | `#FFFFFF` | Cards, tables, dialogs |
| `surface-muted` | `#EFF4FF` | Table headers, tonal fields |
| `surface-strong` | `#E5EEFF` | Tonal buttons, strips |
| `muted-foreground` | `#424654` | Secondary text |
| `subtle-foreground` | `#64748B` | Meta, timestamps, column keys |
| `border` | `#E2E8F0` ⚑ (screens: `#C3C6D7` at 40%) | Hairlines |
| `input` | `#CBD5E1` | Field borders |
| `primary` | `#0043A8` ⚑ | Primary action, links, active nav |
| `primary-hover` | `#0040A1` | |
| `primary-foreground` | `#FFFFFF` | |
| `ring` | `#0759D7` | Focus ring (2 px, offset 2) |
| `secondary` / `institutional` | `#071F4A` ⚑ | Conclusive actions ("Issue", "Publish"), document headers |
| `accent-gold` | `#D4AF7A` ⚑ fill / `#8A6227` text | Seals, honours, official markers **only** |
| `success` / `success-soft` | `#15803D` / `rgba(22,163,74,.10)` | Valid, issued, published, pass |
| `warning` / `warning-soft` | `#B45309` / `rgba(217,119,6,.12)` | Pending, draft, in review, warnings |
| `danger` / `danger-soft` | `#BA1A1A` / `#FFDAD6` | Revoked, invalid, failed, errors |
| `info` | = `primary` | Informational |
| `radius-sm / md / lg / full` | 4 / 6 / 8 / 9999 px | Inputs / buttons / cards / chips |
| `shadow-1 / 2 / 3` | DESIGN.md levels 1–3 | Card / hover-dropdown / modal |
| `font-heading` / `font-body` | Plus Jakarta Sans / Inter via `next/font` | |
| `.num` utility | `font-variant-numeric: tabular-nums lining-nums` | All marks, GPAs, serials, dates |

**Status → token mapping (used everywhere, one `StatusBadge` component):**

| Statuses | Token |
|---|---|
| `VALID` `ACTIVE` `ISSUED` `PUBLISHED` `PASS` `IMPORTED` | success |
| `DRAFT` `PENDING_APPROVAL` `IN_REVIEW` `VALIDATING` `WARNING` | warning |
| `REVOKED` `INVALID` `FAILED` `FAIL` `ERROR` | danger |
| `NOT_FOUND` `SUPERSEDED` `SKIPPED` `CANCELLED` | neutral |

Do **not** carry over the ~49 Material-3 colour names (`on-surface-variant`, `tertiary-fixed-dim`, …). Map them once to the ~20 semantic tokens above.

## 7. Reusable Assets

| Category | What | Classification | Why |
|---|---|---|---|
| Design tokens | `DESIGN.md` YAML values: font scale, spacing, palette | **Reuse (as data)** | Translate once into `packages/ui` theme CSS. Not reusable as a file |
| Typography choice | Inter + Plus Jakarta Sans | **Reuse** | Load via `next/font` (self-hosted, no CDN) |
| Icon vocabulary | Material Symbols names used (~70) | **Reuse as a mapping** | Recommend **lucide-react** (shadcn default, tree-shaken SVG). It drops two variable icon-font downloads and fixes screen-reader ligature leakage. Keep a name-mapping table in docs |
| Layout patterns | Public shell, admin shell, service-card grid, metric-card row, result page composition, import stepper, list + preview split | **Reuse as specification** | Rebuild as React components |
| Copy | Section headings and service descriptions that are true | **Reuse selectively** | After removing false claims |
| Brand assets (logo, crest, seal) | Remote AI crest image | **Not reusable** | It is not the university's crest and is hotlinked from Google. **The client must supply the official logo, seal and signatures** (SVG/PNG) |
| Images | Parchment photo, student portrait | **Discard** | Stock/AI placeholders |
| Simple components | None exist as components | — | Nothing to lift directly |

**Net: zero files reused directly.** Tokens, typography and layout are reused as specification.

## 8. Files to Refactor

Each `code.html` is refactored **by extracting visual fragments into typed React components**, not by converting the file. Target locations follow §11.

| Source fragment | Becomes | Target |
|---|---|---|
| Public header + footer (repeated in 3 files) | `PublicHeader` (+ mobile `Sheet` nav), `PublicFooter` | `apps/web/src/components/layout/` |
| Admin `<aside>` + header (repeated in 3 files) | `AdminShell`, `AdminSidebar` (collapsible + mobile `Sheet`), `AdminTopbar` | `apps/web/src/components/layout/` |
| Hero search | `QuickLookup` (real routing per identifier type, labelled input) | `apps/web/src/features/public/` |
| Service card, step card | `ServiceCard`, `StepCard` | `apps/web/src/features/public/` |
| Metric cards (dashboard, import health, certificate KPIs) | `StatCard` | `packages/ui` |
| Status chips everywhere | `StatusBadge` (status → token map) | `packages/ui` |
| Stepper | `Stepper` | `packages/ui` |
| Tables (activity, marks, import errors) | `DataTable` wrapper on **TanStack Table** + shadcn `Table`; server pagination/sorting | `packages/ui` (generic) + feature column defs in `apps/web/src/features/*` |
| Result page blocks | `StudentIdentityCard`, `MarksTable`, `ResultSummary`, `VerificationRefCard` | `apps/web/src/features/results/`. The *document* version lives in the template package (§11) |
| Import wizard blocks | `FileSummaryCard`, `RowHealthSummary`, `ColumnMapper` (editable `Select` per header), `ImportRowsTable` | `apps/web/src/features/imports/` |
| Certificate list item + tabs + filters | `CertificateListItem`, `StatusTabs`, `FilterBar` | `apps/web/src/features/certificates/` |
| Parchment preview | Rebuilt as a **document layout** rendered identically for preview (iframe) and PDF (Playwright) | `packages/documents` (§11) |
| QR mode toggle + drop zone + manual form | `ScannerPanel` (real decoding), `FileDropZone`, `ManualLookupForm` (RHF + Zod) | `apps/web/src/features/verification/` |
| Modal / toast | shadcn `Dialog`, `AlertDialog` (revoke with reason), `Sonner` toasts | `packages/ui` |

## 9. Files to Discard

| Item | Reason |
|---|---|
| Tailwind Play CDN script + inline `tailwind.config` | Not for production; replaced by compiled Tailwind with tokens |
| Duplicate Google Fonts / Material Symbols links | Replaced by `next/font` + lucide |
| All `lh3.googleusercontent.com` images | Hotlinked AI placeholders; not client assets |
| All inline `<script>` blocks | Fake behaviour: hash routing, fake success reveal, `alert`/`confirm`, `Math.random()` hash, auto-clamp, fake toasts, duplicate-ID handlers |
| All hard-coded data | People, marks, counts, hashes, file names, signatories ("Dr. Eleanor Vance", "Dr. S. K. Mahapatra", "Arthur Pendelton") |
| **False/unsupported claims** | ISO 27001, FERPA/GDPR "clean", blockchain, decentralized nodes, zero-knowledge, SHA-256 "ledger", Arweave, HSM, PKI signature numbers, ECC-200, "99.4% CONF", "Semantic Engine", "atomic rollback", "tokens expire after 180 s", "Chartered by Parliament", version badges (`v4.18-SEC`, `Registry Pipeline v2.4`), "Vault Integrity" |
| Fictional product surfaces | Employer/Enterprise API, Student Mobile App, "Enterprise Gateway", "Documentation" CTA. Unless the client actually wants an employer access programme, these are out of scope |
| Import shortcuts | "Set to Max", inline mark editing, "Create Student" from result import |
| `<g0-textarea-recorder-host>` | Stitch editor artefact |
| Global scrollbar hiding | Harms usability of wide tables |
| `screen.png` files | Keep **outside** the repo or in `docs/design/reference/` as visual references only; never ship |

## 10. Recommended Migration Strategy

**Recommendation: B — create a fresh Next.js project and rebuild the UI from the Stitch screens as a specification.**

Option A (convert directly) is not really available. There is no project to convert: no package manifest, no build, no components, no routing and no data layer. Every page duplicates its shell inline, and every behaviour is mock logic that must be deleted rather than adapted. "Converting" would mean pasting 6 × ~35 KB of class soup into JSX and then removing most of it. That is slower and riskier than building clean components against the design.

**How:**
1. Build the token layer and `packages/ui` primitives first (Phase 2+, not Phase 1).
2. Build `PublicShell` and `AdminShell` once, with responsive navigation.
3. Recreate each screen route by route against its `screen.png`, wiring every control to a real API endpoint or leaving it out. **No control ships without behaviour.**
4. Design the ~18 missing screens from the same component system, not with further Stitch generations (which would drift tokens again).

## 11. Final Monorepo Architecture

```text
docversity/
├── apps/
│   ├── web/                         Next.js (App Router) — public portal + admin
│   │   └── src/
│   │       ├── app/
│   │       │   ├── (public)/        /, /results, /verify/registration, /verify/certificate,
│   │       │   │                    /verify/qr, /verify/qr/[token], /document/[token]
│   │       │   ├── (auth)/admin/login
│   │       │   └── (admin)/admin/   dashboard, students, results, imports, certificates,
│   │       │                        templates, logs, users, settings
│   │       ├── components/layout/   PublicShell, AdminShell
│   │       ├── features/            public, verification, results, imports, certificates, …
│   │       └── lib/                 api client (fetch + TanStack Query), auth/session helpers
│   └── api/                         NestJS — REST + Swagger; two entrypoints:
│       └── src/                       main.ts (HTTP API)  ·  worker.ts (BullMQ processors)
│           ├── modules/             see §12
│           └── common/
├── packages/
│   ├── database/                    Prisma schema, migrations, client export, seed
│   ├── ui/                          tokens (theme CSS), shadcn primitives, StatusBadge,
│   │                                StatCard, Stepper, DataTable wrapper
│   ├── types/                       shared enums/status unions, API envelope & pagination types
│   ├── validation/                  Zod schemas — single source for web forms, API DTOs,
│   │                                and import-row validation
│   ├── documents/   (proposed)      document layouts (result statement, provisional,
│   │                                transcript, character) as server-renderable
│   │                                React/HTML + print CSS; used by admin preview AND PDF
│   └── config/                      tsconfig bases, ESLint, Prettier, Vitest/Jest presets
├── docs/
│   ├── design-system.md             from DESIGN.md, conflicts resolved
│   ├── design/reference/            the 6 screen.png files (reference only)
│   └── adr/                         architecture decisions
├── docker-compose.yml               postgres, redis, minio (S3-compatible, local only)
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

**Where the Stitch material goes:**

| Stitch material | Destination |
|---|---|
| `DESIGN.md` | `docs/design-system.md`, token values in `packages/ui/src/styles/theme.css` |
| `screen.png` ×6 | `docs/design/reference/` |
| Public header/footer/home blocks | `apps/web/src/components/layout` + `features/public` |
| Result page | `apps/web/src/features/results` (web view), `packages/documents` (PDF layout) |
| QR page | `apps/web/src/features/verification` |
| Admin shell | `apps/web/src/components/layout` |
| Dashboard | `apps/web/src/app/(admin)/admin/page.tsx` + `features/dashboard` |
| Import wizard | `apps/web/src/features/imports` |
| Certificate list/preview | `apps/web/src/features/certificates`, parchment → `packages/documents` |
| `code.html` files | Not committed (or kept read-only in `docs/design/reference/` if the team wants to inspect them) |

**Notes:**
- **`packages/documents` is the one proposed addition.** It guarantees that the admin preview and the issued PDF render from the same markup. Without it, preview and PDF drift apart.
- **Worker:** same NestJS codebase, separate process/container (`worker.ts`). Playwright/Chromium is installed only in the worker image, keeping the API image small and its attack surface lower.
- **Types:** API request/response types are inferred from `packages/validation` Zod schemas. Swagger is generated from the same schemas (e.g. via `nestjs-zod`, to confirm in Phase 1). This avoids keeping class-validator DTOs and Zod in sync by hand.

## 12. Backend Module Architecture

The NestJS modules, their responsibilities and dependencies are:

| Module | Responsibility | Depends on |
|---|---|---|
| `common` | Exception filters, response envelope, pagination, request-ID, Zod validation pipe, RBAC guard + `@RequirePermissions` decorator, correlation logging | — |
| `config` *(infra)* | Environment loading + Zod validation at boot; typed config service | — |
| `health` *(infra)* | `/health/live`, `/health/ready` (DB, Redis, storage) | database, redis |
| `auth` | Login/logout, Argon2id verify, Redis-backed sessions, cookie issue/rotation, CSRF token, lockout, password change | users, audit |
| `users` | Staff users CRUD, enable/disable, role assignment | audit |
| `roles` *(part of users or separate)* | Role definitions + permission sets (permissions are code constants) | — |
| `departments` | Department master data | audit |
| `programs` | Programs, curriculum (`program_subjects`), program → document-template assignment | departments, subjects, templates |
| `academic-sessions` | Session master data | — |
| `subjects` | Subject master data | — |
| `students` | Student records, search, detail, status changes | programs, academic-sessions, audit |
| `examinations` | Exam events per program/semester/session; status lifecycle | programs, academic-sessions |
| `grading` *(proposed addition)* | Versioned grading schemes; **pure** calculation engine (grades, SGPA, CGPA, division) | — (pure) |
| `results` | Results + items, compute via grading, review/approve/publish/withhold, versioned corrections, public lookup | students, examinations, grading, audit |
| `imports` | Upload, parse, map, validate, review, commit, error report (BullMQ jobs) | storage, students, results, programs, subjects, validation pkg, audit |
| `templates` | Certificate templates (layout key + config), versions, activation | storage, audit |
| `certificates` | Draft → approval → issue → revoke/supersede; numbering; QR tokens | students, programs, results, templates, documents, audit |
| `documents` | Render HTML (from `packages/documents`) → PDF via Playwright in the worker; QR generation (`qrcode`); store + checksum | storage |
| `verification` | Public endpoints: result lookup, registration, certificate number, QR token; minimal disclosure; logs every attempt | students, results, certificates, audit (verification log) |
| `audit` | Append-only audit log writer + admin query; verification log query | — |
| `storage` | S3/R2 client, private put/get, presigned URLs, key conventions | config |
| `queue` *(infra)* | BullMQ connection, queue registration, job retry/backoff policy | redis |
| `dashboard` *(thin)* | Aggregate counts for `/admin` | read-only queries |

**Dependency rules:** `verification` is read-only and never imports admin services that mutate data. `grading` and `documents` rendering are pure/isolated so they can be unit-tested with fixtures.

## 13. Database Architecture

**Conventions:**
- **Keys:** UUID primary keys (`gen_random_uuid()` or Prisma-generated UUIDv7 if supported); `bigint identity` for high-volume logs.
- **Timestamps:** `timestamptz` throughout. `created_at`/`updated_at` on mutable tables.
- **Text:** human identifiers are stored **normalised** (trimmed, upper-cased) with a unique index. The display form is kept where it differs.
- **Marks:** stored as `numeric`, never float.
- **Partial unique indexes:** Prisma cannot express these, so they are added as raw SQL in the migration.

### Models

| Model | Key fields (only what the workflows need) | Keys & indexes | Relationships |
|---|---|---|---|
| **users** | `email` (citext), `name`, `password_hash`, `status`, `last_login_at`, `failed_login_count`, `locked_until` | PK `id`; **unique** `email` | ↔ roles via user_roles |
| **roles** | `key` (`SUPER_ADMIN`, `REGISTRAR`, `EXAM_CONTROLLER`, `DATA_OPERATOR`, `AUDITOR`), `name`, `permissions text[]` | PK; **unique** `key` | |
| **user_roles** | `user_id`, `role_id`, `assigned_by_id`, `assigned_at` | **PK (`user_id`,`role_id`)** | FK users, roles |
| **departments** | `code`, `name` | **unique** `code` | 1–n programs |
| **programs** | `code`, `name`, `level`, `department_id`, `duration_semesters`, `grading_scheme_id`, `status` | **unique** `code`; idx `department_id` | FK departments, grading_schemes |
| **academic_sessions** | `code` (`2023-24`), `name`, `starts_on`, `ends_on` | **unique** `code` | |
| **students** | `registration_no` (+ normalised), `roll_no`, `full_name`, `date_of_birth`, `program_id`, `admission_session_id`, `status`, `photo_key?` | **unique** `registration_no_normalized`; **unique** (`program_id`,`roll_no`) where not null; idx `full_name` (trigram later), `status` | FK programs, academic_sessions |
| **subjects** | `code`, `name` | **unique** `code` | |
| **program_subjects** | `program_id`, `subject_id`, `semester`, `credits numeric(4,1)`, `assessment_components jsonb` (e.g. `[{key:"INT",max:40},{key:"EXT",max:60},{key:"PRAC",max:25}]`), `is_elective` | **unique** (`program_id`,`subject_id`,`semester`) | FK programs, subjects |
| **grading_schemes** *(added)* | `code`, `name`, `version`, `config jsonb`, `status` | **unique** (`code`,`version`) | referenced by programs, snapshotted into results |
| **examinations** | `code`, `name`, `program_id`, `academic_session_id`, `semester`, `type`, `status`, `held_month`, `held_year` | **unique** `code`; **unique** (`program_id`,`academic_session_id`,`semester`,`type`) | FK programs, academic_sessions |
| **results** | `student_id`, `examination_id`, `status`, `version`, `supersedes_id?`, `total_marks`, `max_marks`, `credits_registered`, `credits_earned`, `sgpa numeric(4,2)`, `cgpa numeric(4,2)`, `outcome`, `division?`, `grading_snapshot jsonb`, `published_at`, `published_by_id`, `public_token` | **partial unique** (`student_id`,`examination_id`) where status ≠ `SUPERSEDED`; **unique** `public_token`; idx (`examination_id`,`status`) | FK students, examinations; self-FK supersedes |
| **result_items** | `result_id`, `program_subject_id`, `components jsonb` (`{INT:36,EXT:52,PRAC:22}`), `total`, `max_total`, `grade`, `grade_point numeric(4,2)`, `credits`, `status` | **unique** (`result_id`,`program_subject_id`) | FK results (cascade), program_subjects |
| **certificate_templates** | `code`, `name`, `document_type`, `layout_key`, `config jsonb` (wording, signatories, asset keys, number pattern), `page_size`, `orientation`, `version`, `status`, `created_by_id` | **unique** (`code`,`version`); idx (`document_type`,`status`) | |
| **program_document_templates** *(added)* | `program_id`, `document_type`, `template_id` | **PK (`program_id`,`document_type`)** | Answers "which template does this program use for this document type" |
| **certificates** | `certificate_number`, `document_type`, `student_id`, `program_id`, `result_id?`, `template_id`, `data_snapshot jsonb`, `public_token`, `status`, `pdf_key`, `pdf_sha256`, `approved_by_id/at`, `issued_by_id/at`, `revoked_by_id/at`, `revocation_reason`, `supersedes_id?`, `created_by_id`, `legacy_source?`, `legacy_ref?` | **unique** `certificate_number` (when assigned); **unique** `public_token`; **unique** (`legacy_source`,`legacy_ref`); idx `student_id`, (`document_type`,`status`) | FK students, programs, results, templates; self-FK supersedes |
| **number_sequences** *(added)* | `scope` (e.g. `PROV/BTECH/2026`), `next_value` | PK `scope` | Gap-free, concurrency-safe numbering via `UPDATE … RETURNING` |
| **imports** | `type`, `status`, `original_filename`, `file_key`, `file_sha256`, `sheet_name`, `detected_headers jsonb`, `column_mapping jsonb`, `examination_id?`, `total_rows`, `valid_rows`, `warning_rows`, `error_rows`, `imported_rows`, `error_report_key?`, `created_by_id` | idx (`type`,`status`), `created_by_id`, `file_sha256` (duplicate-upload warning) | FK users, examinations |
| **import_rows** | `import_id`, `row_number`, `raw jsonb`, `normalized jsonb`, `status`, `messages jsonb` (`[{field,code,severity,message}]`), `entity_id?` | **unique** (`import_id`,`row_number`); idx (`import_id`,`status`) | FK imports (cascade) |
| **verification_logs** | `id bigint`, `occurred_at`, `channel`, `query_normalized`, `outcome`, `student_id?`, `certificate_id?`, `result_id?`, `ip_hash`, `user_agent` (truncated) | idx `occurred_at`, (`channel`,`outcome`,`occurred_at`), `certificate_id` | Monthly partitioning later if volume demands |
| **audit_logs** | `id bigint`, `occurred_at`, `actor_user_id?`, `action`, `entity_type`, `entity_id`, `changes jsonb` (before/after diff), `ip`, `request_id` | idx (`entity_type`,`entity_id`), (`actor_user_id`,`occurred_at`) | **Append-only**: the app DB role gets no UPDATE/DELETE on this table |

Sessions live in **Redis**, not Postgres, so there is no sessions table.

### Status enums

| Enum | Values |
|---|---|
| `UserStatus` | `ACTIVE` `DISABLED` |
| `StudentStatus` | `ACTIVE` `COMPLETED` `DISCONTINUED` `SUSPENDED` (confirm with client) |
| `ProgramLevel` | `CERTIFICATE` `DIPLOMA` `UG` `PG` `DOCTORAL` |
| `ExaminationType` | `REGULAR` `SUPPLEMENTARY` `IMPROVEMENT` |
| `ExaminationStatus` | `DRAFT` `RESULTS_ENTRY` `PUBLISHED` `ARCHIVED` |
| `ResultStatus` | `DRAFT` `APPROVED` `PUBLISHED` `WITHHELD` `SUPERSEDED` |
| `ResultItemStatus` | `PASS` `FAIL` `ABSENT` `WITHHELD` |
| `DocumentType` | `PROVISIONAL_CERTIFICATE` `TRANSCRIPT` `CHARACTER_CERTIFICATE` (`RESULT_STATEMENT` if results get their own PDF type) |
| `TemplateStatus` | `DRAFT` `ACTIVE` `ARCHIVED` |
| `CertificateStatus` | `DRAFT` `PENDING_APPROVAL` `APPROVED` `ISSUED` `REVOKED` `SUPERSEDED` |
| `ImportType` | `STUDENTS` `RESULTS` |
| `ImportStatus` | `UPLOADED` `PARSING` `AWAITING_MAPPING` `VALIDATING` `VALIDATED` `COMMITTING` `COMPLETED` `FAILED` `CANCELLED` |
| `ImportRowStatus` | `VALID` `WARNING` `ERROR` `SKIPPED` `IMPORTED` |
| `VerificationChannel` | `RESULT` `REGISTRATION` `CERTIFICATE` `QR` |
| `VerificationOutcome` | `VALID` `REVOKED` `SUPERSEDED` `NOT_FOUND` `INVALID_INPUT` `RATE_LIMITED` |

**Deliberately not modelled** until the client confirms: father's/mother's name, address, nationality/national ID, gender, mode of study, curriculum versioning beyond `program_subjects`, multi-attempt history beyond result versions, and department-scoped role assignments. Several of these exist in the legacy WordPress `wp_dv_registrations` table, so they will likely be needed for registration verification.

## 14. Excel Import Architecture

### Flow and how it maps to the Stitch wizard

| Stitch step | Backend operation | Endpoint (proposed) | Job |
|---|---|---|---|
| 1 Download | Serve the official template XLSX per import type (headers, example row, data-validation lists) generated with ExcelJS | `GET /imports/templates/:type` | — |
| 2 Upload | Stream the file to private storage, record sha256, create the `imports` row, warn if the same hash was imported before | `POST /imports` (multipart) | `import.parse` |
| — | Parse: ExcelJS **streaming** reader, pick the sheet, read the header row, sample 20 rows, count rows | — | (worker) |
| 3 Map Columns | Show detected headers. Auto-suggest via **deterministic alias matching** (normalised header vs a field alias list), not AI. User confirms/edits with a `Select` per column. Mapping can be saved as a preset | `PUT /imports/:id/mapping` | — |
| 4 Validate | Per row: Zod schema from `packages/validation` (types, required fields, formats), then **batched** DB checks (student exists, subject belongs to the program curriculum, each component ≤ its max, duplicates within the file and against DB, examination open for entry). Writes `import_rows` with status + messages | `POST /imports/:id/validate` | `import.validate` |
| 5 Review Errors | Summary counts + paginated rows (TanStack Table, server-side) filtered by status, **including warnings**. Actions: skip row, or fix the spreadsheet and re-upload. **No in-app editing of official marks in v1** | `GET /imports/:id`, `GET /imports/:id/rows?status=` , `POST /imports/:id/rows/:n/skip` | — |
| — | Error report: an XLSX of the original columns plus `Row`, `Status` and `Errors` columns, with error cells highlighted. Values starting with `= + - @` are neutralised to prevent formula injection. Stored privately; downloaded via a short-lived signed URL | `GET /imports/:id/error-report` | `import.report` |
| 6 Import | Commit valid (and accepted-warning) rows in chunked transactions (~500 rows each), idempotent on (`import_id`,`row_number`). Results land as **`DRAFT`**; publishing is a separate, permissioned step | `POST /imports/:id/commit` | `import.commit` |
| Cancel | Mark cancelled; delete the staged file after the retention period | `POST /imports/:id/cancel` | — |

**Progress:** the UI polls `GET /imports/:id` with TanStack Query `refetchInterval` while the status is a running state. WebSockets aren't needed.

**Stitch controls that change meaning:**
- "Save Draft" disappears, because every import is persisted at every step.
- "Create Student" becomes "Download list of unknown registration numbers" plus a link to a student import.
- "Set to Max" and "Inline Edit" are removed.

**Limits (to confirm with client volumes):**
- Accept `.xlsx` only (plus `.csv` if the client needs it); reject `.xls`/`.xlsm`.
- 10 MB file size.
- 50k rows and 200 columns.
- One active import per examination at a time.

**Student import vs result import:**
- **Student import** keys on registration number and can *create or update* students. Updates show a field-level diff in review and require explicit confirmation.
- **Result import** never creates students and is scoped to one examination selected at upload.

**Result sheet shape — the biggest unknown.** Universities often send *wide* sheets (one row per student, columns like `CS601_INT`, `CS601_EXT`, as in the Stitch mapping cards) rather than *long* sheets (one row per student × subject). The importer should support a wide format through a header pattern (`<SUBJECT_CODE>_<COMPONENT>`) resolved against the examination's curriculum. **Get real sample sheets before building the mapper.**

## 15. Result Architecture

```
Student ─┐
         ├─ Examination (program, session, semester, type)
         │     └─ Result (DRAFT, version n)
         │           └─ ResultItems (subject → component marks)
         │                 └─ grading engine → grade, grade point, item status
         │           └─ SGPA, credits, outcome   └─ CGPA across published results
         └─ Approve (exam controller) → Publish (bulk per examination) → public lookup + PDF
```

- **Grading is data, not code paths.** A versioned `grading_schemes.config` describes:
  - the components and maxima (or defers to `program_subjects`);
  - pass rules (per-component minimum, aggregate minimum);
  - grade bands (percentage or marks → letter + grade point);
  - absent/withheld codes and rounding rules;
  - SGPA formula options (which credits count, whether failed credits are included);
  - the CGPA policy (latest attempt vs best attempt, which semesters count);
  - division/class thresholds.

  The engine is a **pure TypeScript function** with fixture-based tests built from the university's own worked examples.
- **Two modes per scheme:**
  - `COMPUTE`: we calculate grades from marks.
  - `ACCEPT_IMPORTED`: the university's own system already produced grade/GP/SGPA; we store them and only cross-check where possible.

  Many universities need the second mode, so do not assume we compute.
- **Snapshot:** each result stores the scheme version and resolved config it was computed with (`grading_snapshot`). Later scheme changes never silently alter published results.
- **Immutability after publish:** a correction creates a new result version that supersedes the old one, is re-approved and is republished. The audit log records who changed what and why.
- **Public lookup:** only `PUBLISHED` results. Lookup requires roll/registration number **plus a second factor (date of birth)** to prevent enumerating everyone's marks. The response is identical for "not found" and "wrong DOB". Rate-limited. Every attempt is written to `verification_logs`.
- **PDF:** on-demand render of the `result-statement` layout from `packages/documents` via the worker. Cached in storage keyed by result id + version. Delivered by short-lived signed URL. It includes a QR linking to `/verify/qr/<result public_token>`.
- **Totals:** totals and percentages are always derived from data, never typed. The Stitch mock's "637/700" vs 725 inconsistency is exactly the class of bug this prevents.

## 16. Certificate Architecture

```
Student → Program → Document type → Template (program_document_templates)
  → auto-filled data (student, program, result/CGPA, dates) + manual fields (e.g. conduct remark)
  → DRAFT → preview (same HTML as PDF, in iframe) → PENDING_APPROVAL → APPROVED (maker ≠ checker)
  → ISSUE: assign certificate number (number_sequences), generate public_token (≥128-bit random,
           base64url), freeze data_snapshot, render PDF (worker/Playwright), store + sha256
  → ISSUED → public verification by number or QR → (REVOKED with reason | SUPERSEDED by reissue)
```

- **Templates:** a template = **code-defined layout** (`layout_key` in `packages/documents`) + **DB config** (wording, signatory names/titles, seal/signature asset keys, number pattern, page size). Templates are versioned, and a version becomes immutable once any certificate has been issued with it.

  Arbitrary admin-authored HTML templates are **not recommended**: they create injection risk and pixel-drift between preview and PDF, and they are hard to support. New layouts are added by developers from the client's official samples.
- **Per-type rules:**
  - **Provisional certificate:** requires a published final-semester result, with eligibility rules configurable per program.
  - **Transcript:** pulls all published semester results (latest valid versions) for the student.
  - **Character certificate:** cannot be derived from data. It needs a manual conduct statement and an authorised signatory, and therefore always goes through approval.
- **Numbering:** the pattern is in template config (e.g. `PC/{PROGRAM}/{YEAR}/{SEQ:5}`). The number is assigned **at issue**, inside the issue transaction, to avoid gaps from abandoned drafts. Confirm with the client whether numbers must be gap-free.
- **QR:** encodes only `https://<verify-domain>/verify/qr/<token>`. The token is an opaque random value: **no name, number or marks in the QR**.
- **Verification page** shows: status (Valid / Revoked / Superseded / Not found), document type, certificate number, student name, program, issue date. Any more fields are a client privacy decision.
- **Bulk:** generation for a cohort runs as a BullMQ batch with per-item status. It still goes through approval (bulk-approve is allowed for authorised roles).
- **Revocation:** reason is required, and a second approver is required if the client wants it. It is reflected on public verification immediately.
- **Legacy:**
  - Existing WordPress certificates (`wp_dv_certificates`, `wp_cg_certificates`) must be **migrated** into `certificates` with `legacy_source`/`legacy_ref`.
  - Their **already-printed QR/verification URLs must keep resolving** through redirects. The two legacy stores are not linked to each other, so reconciliation rules are needed (see `TECHNICAL-AUDIT.md`).

## 17. Security Architecture

| Control | Plan |
|---|---|
| Auth cookies | Opaque session ID in an `HttpOnly; Secure; SameSite=Lax` cookie with the `__Host-` prefix. Session state lives in Redis. ID rotates on login and privilege change. Idle timeout ~30 min, absolute timeout ~12 h. **No tokens in localStorage or JS-readable cookies** |
| Same-origin API | Serve the API under the same site (reverse proxy `/api` or a same-site subdomain) so cookies work without permissive CORS. CORS allowlist only |
| CSRF | SameSite plus a per-session CSRF token required as a header on all state-changing requests |
| Passwords | **Argon2id** with tuned memory cost; minimum length + breached-password check (optional); lockout/backoff after failed attempts. **TOTP MFA for admin roles** recommended (later phase) |
| RBAC | Permission constants (`results.publish`, `certificates.issue`, `certificates.revoke`, `imports.commit`, …) mapped to roles, enforced by a global guard + decorator. Maker-checker on issue/publish/revoke |
| Rate limiting | `@nestjs/throttler` with Redis storage. Separate, stricter buckets for public verification (per IP + per identifier) and login. Optional CAPTCHA (e.g. Turnstile) after repeated failures, pending client approval |
| Enumeration resistance | Result lookup requires DOB. Responses are uniform for not-found vs mismatch. Logs store a hashed IP |
| Validation | Zod at both edges (web forms + API pipes). Unknown fields stripped. Strict param parsing |
| Uploads | Size cap, extension + magic-byte check, parse only in the worker, row/column caps, cell values treated as data, formula-injection neutralisation on export |
| Storage | Private buckets only. Short-TTL presigned GET URLs (≈5 min) generated after an authorisation check. Object keys are not guessable. No public ACLs |
| QR | Opaque token only. No PII |
| Audit | Append-only `audit_logs` for every write (actor, action, diff, request ID). `verification_logs` for every public lookup |
| Headers | Helmet on the API; CSP, HSTS, `frame-ancestors 'none'` (except the self-hosted preview iframe), `Referrer-Policy` in Next.js |
| Logging | Structured logs (pino) with PII redaction; request IDs propagated web → api → worker |
| Secrets | Env validated at boot; never committed; `.env.example` only. The prior audit found DB credentials inside a downloadable WordPress backup: **rotate those credentials** regardless of this project |
| Integrity of UI | Every verification outcome rendered in the UI comes from the server response. No client-side success states. This directly fixes the Stitch fake-positive pattern |

## 18. Local Development Setup

**Prerequisites:**
- Node.js **24 LTS**
- pnpm 10 via Corepack
- Docker Desktop with Compose v2

PostgreSQL and Redis run in containers, so there is no local install. A local S3-compatible store (MinIO) runs in the same compose file and stands in for R2.

**Commands, once Phase 1 exists:**
```bash
corepack enable
pnpm install
cp .env.example .env              # local defaults only
docker compose up -d              # postgres:17, redis:7, minio (+ bucket init)
pnpm db:migrate                   # prisma migrate dev (packages/database)
pnpm db:seed                      # roles + one local super-admin (dev only)
pnpm dev                          # turbo: web :3000, api :4000, worker
```

**Useful URLs:**
| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API health | http://localhost:4000/health/ready |
| Swagger | http://localhost:4000/api/docs |
| MinIO console | http://localhost:9001 |

**Other scripts:**
| Command | Does |
|---|---|
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Unit + Supertest integration (the API tests use the compose Postgres or a separate test DB) |
| `pnpm --filter web exec playwright install chromium` then `pnpm test:e2e` | End-to-end tests |

The worker needs Chromium only from the PDF phase onward.

## 19. Risks / Unknowns

| # | Risk / unknown | Impact | Needed from client |
|---|---|---|---|
| 1 | **Legacy WordPress data and printed QR codes.** The existing site holds registrations, certificates, generated certificates and tokens; printed documents already point at `verify.thedocversity.com` URLs | Breaking these would invalidate real documents in circulation | Sanitised DB export, URL inventory, cut-over plan |
| 2 | Grading rules unknown (components, pass rules, grade bands, SGPA/CGPA, rounding, backlogs) | Result engine can't be finalised | Official ordinance/regulations + worked examples per program |
| 3 | Whether the university already computes grades elsewhere | Decides `COMPUTE` vs `ACCEPT_IMPORTED` | Confirmation + sample output |
| 4 | Real spreadsheet formats (wide vs long, header names, date formats) | Import mapper design | 2–3 real (anonymised) sheets per import type |
| 5 | Official document templates, fonts, seals, signatures, wording per program | Templates can't be built from Stitch's placeholder parchment | Approved samples (PDF/scan) + assets |
| 6 | What public verification may disclose (marks? photo? DOB?) | Privacy/legal exposure | Written disclosure policy |
| 7 | Brand: real logo/crest; palette conflict in DESIGN.md | UI tokens | Logo files + token sign-off (§6 ⚑) |
| 8 | Numbering rules (format, gap-free?, per program/year?) and legacy number formats | Certificate issuance | Specification |
| 9 | Approval workflow (who approves, is two-person approval required, who can revoke) | RBAC design | Role matrix |
| 10 | Volumes (students, rows per import, peak lookups on result day) | Sizing, rate limits, queue concurrency | Estimates |
| 11 | Hosting target, domain, R2 vs other S3, email needs | Deployment, cookie/domain strategy | Decision |
| 12 | QR scanning library is **not in the locked stack** | The in-page scanner needs one (e.g. a ZXing- or jsQR-based library); PDF upload scanning would also need pdf.js | Approve one addition, or ship v1 with "scan with your phone camera" + image upload only |
| 13 | GSAP **and** Framer Motion both locked in | Bundle weight, inconsistent motion | Usage rule: Framer Motion for UI transitions; GSAP limited to the public landing hero, if used at all; honour `prefers-reduced-motion`; no animation in admin data views |
| 14 | Stitch claims (ISO 27001 etc.) may already be in client expectations or marketing | Misrepresentation if published | Client to confirm which certifications are real; otherwise remove |
| 15 | Registration number semantics (person vs enrolment) | `students` model | Confirmation |
| 16 | Student photo storage and display | Privacy, storage | Policy |

## 20. Exact Phase 1 Plan — Project Foundation

**Goal:** an empty, running, tested, documented skeleton. **No product features, no screens beyond placeholders, no domain tables beyond what proves the pipeline.**

1. **Monorepo**
   - pnpm workspace + Turborepo (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e` pipelines with caching).
   - `.nvmrc`/`engines` pinning Node 24.
   - `packageManager` pinned.
   - `.editorconfig`, `.gitignore`, `git init`.
2. **`packages/config`**
   - Shared `tsconfig` bases (strict).
   - ESLint flat config (TS, import order, React/Next rules for web).
   - Prettier.
   - Vitest preset for packages/web; Jest preset for NestJS, if keeping Nest's default (or Vitest for both — decide and record an ADR).
3. **`apps/web`**
   - Next.js App Router, TypeScript, Tailwind v4.
   - shadcn/ui initialised with a **neutral placeholder theme**. Real tokens come in Phase 2 after sign-off.
   - TanStack Query provider.
   - Route groups `(public)`, `(auth)`, `(admin)` with placeholder pages.
   - `/api/health` proxy check.
   - Env validation (Zod) for public/server env.
   - Security headers baseline.
4. **`apps/api`**
   - NestJS with `config` module (Zod-validated env; the app refuses to start on invalid config).
   - `common` (error filter, request ID, logger with redaction).
   - `health` (`/health/live`, `/health/ready` checking Postgres + Redis + storage).
   - Swagger at `/api/docs`.
   - Helmet, CORS allowlist, global throttler (Redis store) wired but with generous limits.
   - Separate `worker.ts` entry that connects to BullMQ and runs a no-op `system.ping` job to prove the queue path.
5. **`packages/database`**
   - Prisma schema with the datasource and a **single** `system_heartbeat` (or equivalent) table only, to prove migrate/generate/seed.
   - Domain models come in Phase 2 after the client answers §19.
   - Scripts `db:migrate`, `db:generate`, `db:seed`, `db:studio`.
6. **`packages/validation`, `packages/types`, `packages/ui`** — created with build/test wiring and one trivial export each, proving cross-package imports and type-checking in both apps.
7. **Docker**
   - `docker-compose.yml` with postgres:17, redis:7 and minio + bucket-init, health-checks and named volumes.
   - Multi-stage Dockerfiles for `web`, `api` and `worker` (production images build, even if not deployed).
8. **Testing**
   - One unit test per package.
   - One Supertest test hitting `/health/live`.
   - One Playwright e2e test loading the web home placeholder.
   - `pnpm test` runs green from a clean clone.
9. **CI (recommended)** — GitHub Actions: install → lint → typecheck → test (with Postgres/Redis services) → build.
10. **Docs**
    - `README.md` with exactly the §18 commands.
    - `docs/design-system.md` (DESIGN.md + conflict list).
    - `docs/adr/0001-stack.md`, `0002-sessions-in-redis.md`, `0003-zod-single-source.md`.
    - `docs/design/reference/*.png`.

**Acceptance criteria:**
- `pnpm install && docker compose up -d && pnpm db:migrate && pnpm dev` works on a clean machine.
- `/health/ready` reports DB, Redis and storage OK.
- Swagger loads.
- The worker processes the ping job.
- Lint, typecheck, unit, integration and e2e all pass.
- Invalid env stops both apps with a clear message.

**Explicitly out of Phase 1:**
- Design tokens and real UI.
- Auth/users.
- All domain models and modules.
- Imports, results, certificates, PDF/QR.
- Legacy migration.

These belong to Phase 2+ once the client has answered the §19 questions (especially 1–6).
