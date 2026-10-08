# @docversity/ui

The Docversity design system: tokens and shadcn/ui-based components, consumed as TypeScript source by
`apps/web` (Next.js `transpilePackages`).

```text
src/
├── styles/theme.css     Tailwind v4 tokens: palette, status colours, radii, shadows, typography utilities
├── components/          shadcn/ui components (generated with the shadcn CLI, then owned here) + StatusBadge
├── lib/utils.ts         cn() — clsx + tailwind-merge
└── index.ts
```

Only the components the current phase uses are added (Button, Input, Label, Textarea, Select, Dialog,
Sheet, Dropdown Menu, Table, Badge, Card, Tabs, Separator, Avatar, Skeleton, Toast (sonner), Tooltip,
Breadcrumb). Add new ones with:

```bash
cd packages/ui && pnpm dlx shadcn@<pinned version> add <component>
```

then make sure imports use `../lib/utils` and no new dependency was added without a pinned version.

See [docs/architecture/frontend.md](../../docs/architecture/frontend.md) for the token table and usage rules.
