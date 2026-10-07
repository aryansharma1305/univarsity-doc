# ADR-0005: Toolchain baseline and version pins

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Phase 1 fixes the versions every later phase builds on. Several "latest" tags on 7 Oct 2026 were unsafe
(release candidates or brand-new majors that the rest of the toolchain does not yet support).

## Decisions

| Area                  | Choice                                                                        | Why                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js               | `>=22.12`, `.nvmrc` = 22                                                      | Installed LTS on the development machine; satisfies Prisma 7 (`^22.12`) and NestJS 12. Node 24 LTS is also supported; move `.nvmrc` to 24 when the team standardises     |
| Module system         | Native ESM everywhere                                                         | NestJS 12 ships ESM-only (`"type": "module"`)                                                                                                                            |
| TypeScript            | **6.0.3** (not 7.x)                                                           | `typescript-eslint` supports `<6.1`; `@nestjs/swagger` and the Nest CLI require `^6`                                                                                     |
| pnpm                  | 12.10.1 (Corepack)                                                            | Build-script allow-listing (`allowBuilds`) and release-age gating                                                                                                        |
| Next.js               | **16.3.8** (not 16.4.0)                                                       | 16.4.0 was <24 h old and blocked by pnpm's minimum-release-age policy; we keep the policy rather than bypass it                                                          |
| `@aws-sdk/client-s3`  | 3.1146.0                                                                      | Same release-age reason                                                                                                                                                  |
| NestJS                | 12.1.2 (+ Swagger 12.0.2)                                                     | Current major; Swagger 12 generates OpenAPI from Standard Schema (Zod)                                                                                                   |
| Prisma                | **7.10.0** (not 8.0.0-rc)                                                     | The `prisma` CLI's `latest` tag pointed at an 8.0 release candidate; `@prisma/client` latest stable is 7.10.0. Uses the `prisma-client` generator + `@prisma/adapter-pg` |
| Zod                   | 4.6.5                                                                         | Implements Standard JSON Schema → single source for validation, types and OpenAPI                                                                                        |
| ESLint                | **9.39.5** (not 10.x)                                                         | `eslint-plugin-react`, `-import`, `-jsx-a11y` do not yet support ESLint 10                                                                                               |
| Test runner           | **Vitest** for all unit/integration tests                                     | One runner across ESM packages, Nest (via `unplugin-swc` for decorator metadata) and Next; Supertest for HTTP; Playwright for the browser                                |
| Lint style            | `typescript-eslint` strict + stylistic type-checked; Prettier owns formatting |                                                                                                                                                                          |
| Worker dev runtime    | Node's built-in TypeScript type stripping (`node --watch src/main.ts`)        | No extra runtime (tsx/ts-node); the worker avoids non-erasable syntax (`erasableSyntaxOnly`) and `tsc` rewrites `.ts` imports on build                                   |
| Infrastructure images | `postgres:17.11-alpine`, `redis:7.4-alpine`, Chainguard MinIO by digest       | See ADR-0004 for MinIO                                                                                                                                                   |

### Supply-chain settings (`pnpm-workspace.yaml`)

`allowBuilds` explicitly allows install scripts only for `prisma`, `@prisma/engines` and `@swc/core`.
It **denies** `@scarf/scarf` (install-time analytics pulled in by `swagger-ui-dist`) and
`msgpackr-extract` (optional native accelerator; BullMQ works without it).

## Consequences

- Upgrades are deliberate: bump a pin, run `pnpm install`, `pnpm lint typecheck test build test:e2e`.
- Revisit TypeScript 7, ESLint 10 and Prisma 8 once their ecosystems catch up.
