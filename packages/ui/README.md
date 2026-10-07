# @docversity/ui

Shared design tokens and UI primitives for `apps/web`. **Empty in Phase 1 by design** — no speculative
components. See `docs/architecture/stitch-migration.md` for what will be extracted from the Stitch
reference and in what order.

Planned layout:

```text
src/
├── styles/        theme.css — Tailwind v4 @theme tokens (colour, type, radius, shadow)
├── primitives/    shadcn/ui components (generated, then owned by us)
├── composites/    StatusBadge, StatCard, Stepper, DataTable wrapper
└── index.ts
```

The package is consumed as TypeScript source by Next.js (`transpilePackages`), so it has no build step.
