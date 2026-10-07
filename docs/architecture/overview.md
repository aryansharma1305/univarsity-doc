# Architecture overview

## Runtime topology

```text
                          Browser
                             │  HTTPS (pages, later: same-site API calls with HTTP-only cookies)
                             ▼
                ┌────────────────────────┐
                │  apps/web  (Next.js)   │  Server Components render pages and call the API
                └───────────┬────────────┘  server-to-server (API_INTERNAL_URL)
                            │  REST / JSON
                            ▼
                ┌────────────────────────┐        enqueue jobs        ┌──────────────────────────┐
                │  apps/api  (NestJS)    │ ─────────────────────────▶ │  Redis (BullMQ queues)   │
                │  REST + OpenAPI        │                            └────────────┬─────────────┘
                └──┬──────────┬──────────┘                                         │ consume
                   │          │                                                    ▼
                   │          │                                       ┌──────────────────────────┐
                   │          │                                       │  apps/worker (BullMQ)    │
                   │          │                                       │  long-running jobs       │
                   │          │                                       └──┬──────────┬────────────┘
                   ▼          ▼                                          ▼          ▼
            ┌────────────┐ ┌──────────────────────┐            ┌────────────┐ ┌──────────────────┐
            │ PostgreSQL │ │ S3-compatible storage│            │ PostgreSQL │ │ S3 storage       │
            │ (Prisma)   │ │ MinIO / R2 / AWS S3  │            │ (same DB)  │ │ (same bucket)    │
            └────────────┘ └──────────────────────┘            └────────────┘ └──────────────────┘
```

- **Browser → Next.js only.** The browser never talks to PostgreSQL, Redis or storage. Files will be
  delivered through short-lived presigned URLs issued by the API after an authorisation check.
- **Next.js → NestJS.** All business logic and data access live in the API. Next.js renders UI and calls
  the API (see [ADR-0002](../decisions/ADR-0002-separate-api.md)).
- **API → worker via Redis.** Anything slow or heavy (Excel validation/import, PDF rendering, bulk
  issuance) is enqueued by the API and executed by the worker
  (see [ADR-0003](../decisions/ADR-0003-background-worker.md)). The worker shares the database and the
  storage bucket with the API.
- **Storage is provider-neutral.** Code depends on an `ObjectStorage` port; MinIO, R2 and AWS S3 differ
  only in configuration (see [ADR-0004](../decisions/ADR-0004-object-storage.md)).

## What exists (Phases 1–3)

| Component                           | Implemented                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth (Phase 3)                      | Staff login with Argon2id, Redis sessions in HttpOnly cookies, CSRF (session HMAC + signed double-submit), login throttling, global Auth/CSRF/Permission guards, code-defined permissions, audit service, correlation IDs, JSON logs, DV001→409. See [authentication](./authentication.md), [authorization](./authorization.md)                |
| `apps/web`                          | Development status page that renders live results of `GET /health` (server-side fetch)                                                                                                                                                                                                                                                         |
| `apps/api`                          | `GET /health` with real checks (PostgreSQL `SELECT 1`, Redis `PING`, S3 `HeadBucket`), Swagger at `/api/docs`, env validation, Helmet, CORS allowlist                                                                                                                                                                                          |
| `apps/worker`                       | BullMQ worker for the `system` queue with one infrastructure job, `health-test`                                                                                                                                                                                                                                                                |
| `packages/database`                 | Prisma 7 + `pg` adapter. **Phase 2:** core academic schema (23 tables, 18 enums) in migration `core_academic_schema`, with CHECK constraints and integrity triggers (immutable published results / issued certificates, append-only logs); disposable-test-database schema tests; development seed. See [docs/database](../database/README.md) |
| `packages/validation`               | Zod schemas for env, the health contract, the health-test job                                                                                                                                                                                                                                                                                  |
| `packages/types`                    | Queue/job name constants                                                                                                                                                                                                                                                                                                                       |
| `packages/ui`, `packages/documents` | Structure and documentation only                                                                                                                                                                                                                                                                                                               |
| Infrastructure                      | Docker Compose: PostgreSQL 17, Redis 7.4, MinIO (private bucket + least-privilege app user)                                                                                                                                                                                                                                                    |
| Quality                             | ESLint (type-aware), Prettier, Vitest, Supertest, Playwright, GitHub Actions CI                                                                                                                                                                                                                                                                |

## Route conventions (API)

| Prefix      | Purpose                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `/health`   | Infrastructure health (unversioned, for load balancers and monitoring) |
| `/api/v1/*` | All future business endpoints (versioned)                              |
| `/api/docs` | Swagger UI (`SWAGGER_ENABLED`); JSON at `/api/docs/openapi.json`       |

## Health semantics

`GET /health` returns **200** with `status: "ok"` only when every dependency answered a real check within
`HEALTH_CHECK_TIMEOUT_MS`. Otherwise it returns **503** with `status: "error"` and identifies the failing
dependency. Failure details are logged server-side and never returned to callers. This is verified by
integration tests that point each dependency at an unreachable endpoint, wrong credentials or a missing bucket.

## Module system and tooling

- Native **ES modules** everywhere (`"type": "module"`). NestJS 12 is ESM-only.
- Shared packages are compiled with `tsc` to `dist/` (ESM + `.d.ts`); `packages/ui` will be consumed as
  source by Next.js.
- One `.env` at the repository root for local development; every app validates its own variables with
  Zod at startup and exits with a readable message if anything is missing.
- See [ADR-0005](../decisions/ADR-0005-toolchain-baseline.md) for pinned versions and why.

## Planned module map (later phases)

The NestJS module plan, database model plan, import/result/certificate architecture and security plan
are in the initial planning document, [`initial-migration-plan.md`](./initial-migration-plan.md). Where
that document conflicts with [`product-decisions.md`](./product-decisions.md), the product decisions win.
