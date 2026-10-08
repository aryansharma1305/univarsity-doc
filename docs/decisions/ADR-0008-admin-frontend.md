# ADR-0008: Admin frontend data and component approach

- **Status:** Accepted
- **Date:** 2026-10-08

## Decisions

1. **Design system as source package.** `packages/ui` holds Tailwind v4 tokens and shadcn/ui components,
   consumed as TypeScript source by Next.js (`transpilePackages`). Components are generated with a
   pinned shadcn CLI and then owned in-repo.
2. **Client-side data fetching for admin screens** with TanStack Query through the same-origin `/api/v1`
   proxy. The server only decides _whether_ to render the admin shell (`GET /auth/me`); lists, details and
   mutations are fetched in the browser so filters, pagination and optimistic UI stay simple. The API is
   the single authority for data and permissions.
3. **Shared Zod schemas** for forms (React Hook Form) and the API, so client and server validation cannot
   drift; server `details[]` errors map back onto form fields.
4. **TanStack Table v8 (8.21.3), not v9.** v9 had just become `latest` with a new API; v8 is stable and
   sufficient for server-paginated tables. Revisit when v9 settles.
5. **List state in the URL** (`useListParams`) rather than component state.
6. **Framer Motion only** (`motion/react`) for subtle entrance/transition effects; no GSAP in Phase 4.

## Consequences

- Admin pages show skeletons briefly on navigation (no server-side data prefetch). Acceptable for staff
  tools; can be revisited with route-level prefetching later.
- Adding a component means running the pinned shadcn CLI and checking it did not add unpinned
  dependencies (it tried to add `cn` and `next-themes` in Phase 4; both were removed).
