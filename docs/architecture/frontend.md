# Frontend

`apps/web` is a Next.js (App Router) application with two shells: the **public portal** and the **staff
admin**. It renders UI only — every rule and permission is enforced by the API (`apps/api`).

## Design system (`packages/ui`)

Consumed as TypeScript source (`transpilePackages`). Contains Tailwind v4 tokens and shadcn/ui components.

### Palette (one consistent system)

The Stitch export contained two conflicting palettes; Docversity uses the client-agreed palette below.
Status _text_ shades are darker than the base colours so text meets WCAG AA (4.5:1).

| Token                                       | Value                             | Use                                           |
| ------------------------------------------- | --------------------------------- | --------------------------------------------- |
| `navy-950`                                  | `#03142F`                         | Primary navy: admin sidebar, footer, headings |
| `navy-900`                                  | `#071F4A`                         | Secondary navy: avatars, accents              |
| `brand` (`primary`)                         | `#0759D7`                         | Primary actions, links, active navigation     |
| `brand-hover`                               | `#0648B0`                         | Hover state                                   |
| `brand-accent` (`ring`)                     | `#168CFF`                         | Focus ring                                    |
| `gold` / `gold-text`                        | `#D4AF7A` / `#8A6227`             | Official/seal accents only (sparingly)        |
| `background`                                | `#F7F9FC`                         | Page canvas                                   |
| `card`                                      | `#FFFFFF`                         | Surfaces                                      |
| `muted-foreground`                          | `#64748B`                         | Secondary text (4.76:1 on white)              |
| `border` / `input`                          | `#E2E8F0` / `#CBD5E1`             | Hairlines / field borders                     |
| `success` / `success-text` / `success-soft` | `#16A34A` / `#166534` / `#ECFDF3` | Active, valid                                 |
| `warning` / `warning-text` / `warning-soft` | `#D97706` / `#92400E` / `#FFFBEB` | Suspended, not available                      |
| `danger` / `danger-text` / `danger-soft`    | `#DC2626` / `#B91C1C` / `#FEF2F2` | Revoked, errors                               |

Radii: 4/6/8/12 px (`sm`/`md`/`lg`/`xl`). Shadows: `shadow-card`, `shadow-raised`.

### Typography

Inter (body) and Plus Jakarta Sans (headings, 600/700), self-hosted via `next/font` (no runtime CDN).

| Utility              | Use                                                 |
| -------------------- | --------------------------------------------------- |
| `text-page-title`    | Page H1 (24 → 28 px)                                |
| `text-section-title` | Section headings (18 px)                            |
| `text-card-title`    | Card titles (16 px)                                 |
| `text-body`          | Body copy (15 px)                                   |
| `text-meta`          | Timestamps, secondary info (13 px, muted)           |
| `text-table`         | Table cells (14 px, tabular numerals)               |
| `text-label`         | Form labels (14 px, 500)                            |
| `text-badge`         | Status chips (12 px)                                |
| `tabular`            | Tabular/lining numerals for numbers and identifiers |

### Components

shadcn/ui (generated with the pinned shadcn CLI, then owned in-repo): Button, Input, Label, Textarea,
Select, Dialog, Sheet, Dropdown Menu, Table, Badge, Card, Tabs, Separator, Avatar, Skeleton, Toast
(sonner), Tooltip, Breadcrumb — plus `StatusBadge` (status always shown as text with a tone colour).
The shadcn CLI imports `cn` from its new `cn` package; it was replaced with the established
`clsx` + `tailwind-merge` helper (`src/lib/utils.ts`) so every dependency stays pinned.

## Public shell — `app/(public)`

Header (wordmark, Home, Results, Registration Verification, Certificate Verification, Help, Staff sign in;
mobile menu in a Sheet), footer (Privacy, Terms, Contact). Routes:

| Route                                                                   | Phase 4 content                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/`                                                                     | Hero + four service cards + staff sign-in panel                               |
| `/results`, `/verify/registration`, `/verify/certificate`, `/verify/qr` | Honest "Not available yet — coming in a later phase" pages **with no inputs** |
| `/help`, `/privacy`, `/terms`, `/contact`                               | "Content will be provided by the university" placeholders                     |
| `/status`                                                               | Development infrastructure status (moved from `/` in Phase 4)                 |

No compliance/security claims (ISO 27001, GDPR/FERPA, blockchain, …), statistics or university names.

## Admin shell — `app/admin/(protected)`

The protected layout checks the session server-side (`GET /auth/me`), then renders `AdminShell`:

- **Desktop (≥ 1024 px):** navy sidebar, collapsible to icons (preference in `localStorage`, via
  `useSyncExternalStore`, server render always expanded) with tooltips; top bar with breadcrumbs and the
  account menu (name, email, roles, sign out).
- **Mobile/tablet (< 1024 px):** menu button opens the navigation in a Sheet (focus-trapped, closes on
  navigation); breadcrumbs collapse to the current page.
- **Navigation:** Dashboard, Students, Programs, Departments, Academic Sessions — each shown only if the
  user has its read permission. Results, Certificates, Imports and Templates are **omitted** until built.
- **Motion:** Framer Motion (`motion/react`) for the page entrance and hero/card fade-in; Radix animations
  for dialogs/sheets. Everything respects `prefers-reduced-motion`. No GSAP in Phase 4.

| Route                                                               | Screen                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `/admin`                                                            | Dashboard: real counts + recent academic-record activity (only with `audit.read`)       |
| `/admin/students`                                                   | Student list (TanStack Table; cards on mobile), search + program/session/status filters |
| `/admin/students/new`                                               | Create student + first registration (one transaction)                                   |
| `/admin/students/[id]`                                              | Header + tabs: Overview, Registrations, Activity; edit dialogs                          |
| `/admin/programs`, `/admin/departments`, `/admin/academic-sessions` | List + add/edit dialogs + activate/deactivate                                           |

## Feature folders

```text
src/
├── app/                      routes only (thin server components)
├── components/
│   ├── admin/                AdminShell, breadcrumbs, navigation, user menu
│   ├── public/               PublicHeader, PublicFooter, ComingSoon
│   ├── brand/                Docversity mark/wordmark (no university crest supplied yet)
│   ├── data/                 DataTable, Pagination, SearchInput, FilterSelect, RowActions, states, status
│   ├── forms/                Field / SelectField (labels, hints, aria), server-error mapping
│   ├── motion/               FadeIn
│   └── providers/            QueryProvider, SessionProvider (+ useCan)
├── features/<feature>/       api.ts (typed API + TanStack Query hooks), views, dialogs
│                             departments · programs · academic-sessions · students · dashboard · auth
├── hooks/use-list-params.ts  list state in the URL
└── lib/                      api.ts (typed client), server-auth.ts, format.ts, env.ts
```

## Data, forms and states

- **API client** (`lib/api.ts`): same-origin `/api/v1/*`, sends `X-CSRF-Token` on mutations (re-fetched
  once on `CSRF_INVALID`), validates every response with the shared Zod schema, and raises `ApiError` with
  the API's safe message and field details. Endpoint paths live only in `features/*/api.ts`.
- **TanStack Query** for server state; mutations invalidate the affected lists and the dashboard.
- **List state in the URL** (`?search=&status=&page=`): reload-safe, shareable, back-button friendly.
- **Forms:** React Hook Form + the **same Zod schemas** the API uses. Server field errors (`details[]`,
  e.g. duplicate code / registration number, inactive program, department mismatch) are shown next to the
  field; other errors become a toast with the API's message (never a generic message when a safe specific
  one exists).
- **States:** skeletons while loading; empty states (with an "Add" call to action only if permitted);
  explicit **403** "You don’t have access to this" and **404** states; error state with retry.
- **Permission-aware UI:** `useCan(permission)` hides actions the user cannot perform. This is a hint only;
  the API enforces permissions on every request.

## Responsiveness & accessibility

Verified at 1440 px and 390 px (Playwright): no page-level horizontal overflow; tables switch to cards
below 768 px; touch targets ≥ 40 px; skip links; visible focus ring; labels on every field
(`aria-invalid` / `aria-describedby` for hints and errors); semantic tables with captions and `scope`;
status always written as text. Automated axe checks (WCAG 2.1 A/AA, serious/critical) run in e2e on the
public pages, login and all admin screens.
