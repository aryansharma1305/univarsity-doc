# ADR-0001: pnpm workspaces + Turborepo monorepo

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Docversity has three deployable applications (Next.js web, NestJS API, BullMQ worker) that share a lot:
validation schemas (forms, API contracts, Excel row rules, job payloads), the Prisma client, queue names,
document layouts used by both the admin preview and the worker's PDF renderer, and tooling configuration.
The team is small, and changes frequently span web + API + worker at once (e.g. a new import column).

## Decision

Use a single repository managed with **pnpm workspaces** and **Turborepo**.

- **pnpm:** strict, non-flat `node_modules` (a package can only import what it declares — no phantom
  dependencies), content-addressed store (fast, disk-efficient installs), first-class `workspace:*`
  protocol, and supply-chain controls we rely on: dependency build scripts are blocked unless explicitly
  allowed (`allowBuilds` in `pnpm-workspace.yaml`) and very recently published versions are held back
  (`minimumReleaseAge`).
- **Turborepo:** a task graph over the workspace (`build` of a package runs after `build` of its
  dependencies; `db:generate` runs before anything that imports the Prisma client), local caching of
  build/lint/typecheck outputs, and one root command per task (`pnpm dev|build|lint|typecheck|test|test:e2e`).

## Consequences

- One pull request can change a schema and every consumer atomically; CI verifies them together.
- Shared packages are compiled (`tsc` → `dist/`), so apps depend on built output; `pnpm dev` runs package
  watchers alongside the apps.
- Tests that hit live services are never cached (`cache: false`).
- Contributors need pnpm (via Corepack) rather than npm/yarn.
- Alternatives considered: separate repositories (contract drift, version juggling for a small team);
  npm/yarn workspaces (weaker isolation and fewer supply-chain controls); Nx (more capable but heavier
  than this project needs).
