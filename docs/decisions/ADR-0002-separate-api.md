# ADR-0002: Separate NestJS API instead of server logic inside Next.js

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

Next.js can host server logic (Route Handlers, Server Actions). Docversity's server side, however, is the
system of record for academic data: authentication and RBAC, maker-checker approval, result publication,
certificate numbering and revocation, public verification with rate limiting, an append-only audit trail,
Excel import orchestration and PDF generation. It must also expose a documented REST contract and share
domain code with a background worker.

## Decision

Keep **Next.js for the user interface** and put **all business logic and data access in a separate NestJS
REST API** (`apps/api`). Next.js talks to the API over HTTP (server-to-server from Server Components; later
same-site browser calls with HTTP-only cookies). Next.js never accesses PostgreSQL, Redis or object storage
directly.

## Rationale

- **One authoritative backend.** Every rule (who may publish, what a public lookup may disclose) is
  enforced in one place, regardless of which client calls it.
- **Structure for a long-lived domain.** NestJS modules, dependency injection, guards (RBAC), pipes
  (validation), interceptors (audit) and lifecycle hooks fit a records system better than ad-hoc handlers.
- **Generated OpenAPI/Swagger** from the same Zod schemas used for validation.
- **Independent scaling and deployment** of UI and API; public verification traffic spikes (e.g. result
  day) can be scaled at the API.
- **Shared code with the worker** (Prisma client, validation, storage) without importing a web framework.
- **Testability:** API integration tests run with Supertest without a browser or Next.js runtime.

## Consequences

- Two server processes to deploy and monitor instead of one; an extra network hop for page rendering.
- CORS/cookie configuration must be deliberate (plan: serve the API same-site so cookies work without
  permissive CORS).
- Next.js Server Actions are not used for business mutations; they may only forward to the API.
