# DOCVERSITY

University **Academic Verification & Records Portal** — public verification of results, registrations and
certificates, and an admin system for students, results, imports and certificate issuance.

> **Status: Phase 4 — design system, application shells and academic records.** Foundation, core schema,
> staff authentication/RBAC/audit, the Docversity design system, public and admin shells, and management of
> departments, programs, academic sessions, students and registrations are in place. **Not yet built:**
> imports, examinations/results, certificates, public verification. See [`docs/`](docs/README.md).

## Stack

| Layer          | Technology                                                               |
| -------------- | ------------------------------------------------------------------------ |
| Monorepo       | pnpm workspaces + Turborepo                                              |
| Web            | Next.js (App Router), React, TypeScript, Tailwind CSS                    |
| API            | NestJS (REST), Swagger / OpenAPI                                         |
| Worker         | BullMQ (Redis-backed queues)                                             |
| Database       | PostgreSQL + Prisma                                                      |
| Object storage | S3-compatible (MinIO locally; Cloudflare R2 or AWS S3 in production)     |
| Validation     | Zod — one schema drives runtime validation, TypeScript types and OpenAPI |
| Tests          | Vitest (unit + integration), Supertest (API), Playwright (browser smoke) |

## Prerequisites

- **Node.js ≥ 22.12** (`.nvmrc` pins 22). Node 24 LTS also works.
- **pnpm 12** via Corepack: `corepack enable pnpm`
- **Docker** with Compose v2

## Getting started

```bash
corepack enable pnpm
pnpm install
cp .env.example .env          # development defaults; matches docker-compose.yml
docker compose up -d --wait   # PostgreSQL, Redis, MinIO (bucket + app user created automatically)
pnpm db:deploy                # apply database migrations
pnpm db:seed                  # optional: DEVELOPMENT fixtures only (DEV-REG-0001 …)
pnpm admin:create             # create your first staff admin (prompts; password hidden)
pnpm dev                      # web, API and worker with hot reload
```

| Service                       | URL                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Web (development status page) | http://localhost:3000                                                          |
| API health                    | http://localhost:4000/health                                                   |
| Swagger UI                    | http://localhost:4000/api/docs                                                 |
| OpenAPI JSON                  | http://localhost:4000/api/docs/openapi.json                                    |
| MinIO console                 | http://localhost:59001 (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` from `.env`) |
| PostgreSQL                    | `127.0.0.1:55432`                                                              |
| Redis                         | `127.0.0.1:56379`                                                              |

Infrastructure uses non-default host ports (55432, 56379, 59000/59001) bound to `127.0.0.1` so it never
collides with a locally installed PostgreSQL or Redis.

Check the queue end to end while `pnpm dev` is running:

```bash
pnpm queue:check   # enqueues the infrastructure health-test job and waits for the worker's result
```

## Commands

All root commands run across the whole monorepo through Turborepo.

| Command                                                 | What it does                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm dev`                                              | Start web (3000), API (4000) and worker in watch mode                                |
| `pnpm build`                                            | Production build of every package and app                                            |
| `pnpm lint`                                             | ESLint (type-aware) everywhere                                                       |
| `pnpm typecheck`                                        | `tsc --noEmit` everywhere                                                            |
| `pnpm test`                                             | Unit + integration tests (**requires `docker compose up -d`**)                       |
| `pnpm test:e2e`                                         | Builds, then runs the Playwright smoke test against the full stack (ports 3100/4100) |
| `pnpm format` / `pnpm format:check`                     | Prettier                                                                             |
| `pnpm db:generate`                                      | Generate the Prisma client                                                           |
| `pnpm db:migrate` / `pnpm db:deploy` / `pnpm db:status` | Prisma migrations (no migrations exist yet)                                          |
| `pnpm queue:check`                                      | Prove enqueue → worker → result against the running worker                           |

First Playwright run on a new machine: `pnpm --filter @docversity/web exec playwright install chromium`.

Stop infrastructure with `docker compose down` (keeps data) or `docker compose down -v` (deletes all local data).

## Repository layout

```text
apps/
  web/         Next.js app (public portal + admin, later)
  api/         NestJS REST API
  worker/      BullMQ worker (student imports; PDF rendering later)
packages/
  database/    Prisma schema, migrations, client factory
  imports/     Spreadsheet import engine (ExcelJS): parse, map, validate, commit, templates, reports
  storage/     Private object storage port + S3-compatible implementation (MinIO / R2 / S3)
  validation/  Zod schemas (env, API contracts, job payloads)
  types/       Shared TS constants/types (queue names)
  ui/          Design tokens + UI primitives (empty until Phase 2)
  documents/   Official document layouts (empty until approved samples exist)
  config/      Shared TypeScript / ESLint configuration
references/
  stitch/      Unmodified Google Stitch export — visual reference only
docs/          Architecture, API, database docs and ADRs
docker/        Compose support files (MinIO bootstrap)
```

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Stitch migration rules](docs/architecture/stitch-migration.md)
- [Product decisions already agreed](docs/architecture/product-decisions.md)
- [Frontend animation rules](docs/architecture/frontend-animation.md)
- [Frontend](docs/architecture/frontend.md) · [Academic masters API](docs/api/academic-masters.md)
- [Authentication](docs/architecture/authentication.md) · [Authorization](docs/architecture/authorization.md) · [Auth threat model](docs/security/auth-threat-model.md)
- [API](docs/api/README.md) · [Database](docs/database/README.md)
- [Architecture decision records](docs/decisions/)
