# Database

PostgreSQL 17, accessed through **Prisma 7** using the `pg` driver adapter (`@prisma/adapter-pg`).
Everything lives in `packages/database`.

```text
packages/database/
├── prisma/
│   ├── schema.prisma      generator + datasource only (no models in Phase 1)
│   └── migrations/        empty — first migration arrives with the first domain model
├── prisma.config.ts       Prisma 7 config (schema path, migrations path, DATABASE_URL)
└── src/
    ├── client.ts          createPrismaClient(), checkDatabaseConnection()
    ├── index.ts           public exports
    └── generated/prisma/  generated client (git-ignored; produced by `pnpm db:generate`)
```

## Phase 1 scope: infrastructure only

**No domain models and no migrations exist.** This is deliberate:

- No `Student`, `Result`, `Certificate`, `User` or any other model has been created.
- No placeholder "heartbeat"/"test" table was added. Database connectivity is proven with `SELECT 1`,
  which needs no table, so introducing a permanent table purely for testing would add schema with no
  product meaning.

What Phase 1 proves, and how:

| Capability               | Proof                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma Client generation | `pnpm db:generate` (also a Turborepo dependency of build/lint/typecheck/test)                                                                                                                                                |
| Database connectivity    | `packages/database/test/connection.test.ts` runs `SELECT 1`; `GET /health` does the same live                                                                                                                                |
| Failure detection        | The same test points the client at a closed port and asserts the check fails                                                                                                                                                 |
| Migration tooling        | `pnpm db:check` runs the Prisma migration engine against the live database (`prisma migrate diff --from-config-datasource --to-schema … --exit-code`) and exits 0 only when the database matches `schema.prisma`. Runs in CI |
| Schema validity          | `pnpm --filter @docversity/database db:validate`                                                                                                                                                                             |

## Commands

| Command                                        | Purpose                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`                             | Generate the Prisma client into `src/generated/prisma`                                                                                                    |
| `pnpm db:migrate`                              | `prisma migrate dev` — create and apply a migration (development)                                                                                         |
| `pnpm db:deploy`                               | `prisma migrate deploy` — apply committed migrations (CI/production)                                                                                      |
| `pnpm db:check`                                | Drift check: exit 0 = database matches the schema, 2 = differs, 1 = error                                                                                 |
| `pnpm db:status`                               | `prisma migrate status`. **Exits non-zero until the first migration exists** ("No migration found … not managed by Prisma Migrate") — expected in Phase 1 |
| `pnpm --filter @docversity/database db:studio` | Prisma Studio                                                                                                                                             |

`prisma.config.ts` loads the repository-root `.env` for local use. Variables already present in the
environment (CI, containers) take precedence.

## Rules for Phase 2 onwards

- Models follow the plan in [`initial-migration-plan.md` §13](../architecture/initial-migration-plan.md),
  adjusted by [product decisions](../architecture/product-decisions.md).
- Every schema change is a reviewed migration committed under `prisma/migrations/`. Never edit an applied
  migration.
- Partial unique indexes and other constructs Prisma cannot express are added as raw SQL inside migrations.
- Monetary-like or score values use `numeric`, never floating point.
- Certificate number and QR token verification resolve to **one** certificate table (no parallel stores).
- Audit/verification logs are append-only.
