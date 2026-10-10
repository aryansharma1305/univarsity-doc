# API

`apps/api` is a NestJS 12 REST API (native ESM). The OpenAPI document is **generated** from the code —
it is never written or maintained by hand.

|              | Local URL                                   |
| ------------ | ------------------------------------------- |
| Swagger UI   | http://localhost:4000/api/docs              |
| OpenAPI JSON | http://localhost:4000/api/docs/openapi.json |

Swagger is served only when `SWAGGER_ENABLED=true` (default `false`; `.env.example` enables it for local
development). Keep it disabled in production unless access is restricted.

Feature references: [academic masters](./academic-masters.md) · [course curricula](./curricula.md) · [imports](./imports.md) · [student portal & accounts](./student-accounts.md) · [profile change requests](./profile-requests.md) · [historical documents](./historical-documents.md) · [examinations](./examinations.md) · [result previews](./result-import-previews.md) · [internal draft results](./draft-results.md).

## How the OpenAPI schema is produced (single source of truth)

Request/response contracts are **Zod schemas in `@docversity/validation`**. NestJS Swagger 12 reads Zod's
Standard JSON Schema directly:

```ts
@ApiOkResponse({ description: '…', standardSchema: healthResponseSchema })
```

The same schema is used by the web app to parse the response, so the documentation, the API and its
consumers cannot drift apart. A test (`apps/api/test/swagger.test.ts`) asserts that the generated document
contains the endpoint and the schema component.

## Endpoints (Phase 1)

### `GET /health`

Live infrastructure check. Not versioned and not behind `/api/v1`, so load balancers and monitors can use it.

| Dependency | Check                                                           |
| ---------- | --------------------------------------------------------------- |
| `api`      | `ok` whenever the process is serving requests                   |
| `database` | Prisma `$queryRaw SELECT 1` against PostgreSQL                  |
| `redis`    | `PING`                                                          |
| `storage`  | S3 `HeadBucket` on `S3_BUCKET` with the application credentials |

Each check has a deadline of `HEALTH_CHECK_TIMEOUT_MS` (default 2000 ms) and the checks run in parallel.

**200 OK** — every dependency is healthy:

```json
{
  "status": "ok",
  "services": { "api": "ok", "database": "ok", "redis": "ok", "storage": "ok" }
}
```

**503 Service Unavailable** — at least one dependency failed (same shape; the failing ones are `"error"`):

```json
{
  "status": "error",
  "services": { "api": "ok", "database": "ok", "redis": "error", "storage": "ok" }
}
```

The response carries `Cache-Control: no-store`. Failure reasons are logged server-side only.

## Conventions for future endpoints

- Business endpoints live under **`/api/v1`** (global prefix already configured).
- Request bodies, params and responses are Zod schemas in `@docversity/validation`; controllers document
  them with `standardSchema` so OpenAPI stays generated.
- Errors use Nest's standard HTTP exceptions; internal error details are never returned to clients.
- Every endpoint requires a staff session unless marked `@Public()`; unsafe methods require `X-CSRF-Token`.
  See [authentication](../architecture/authentication.md) and [authorization](../architecture/authorization.md).

## Authentication endpoints (Phase 3)

| Method & path                       | Auth     | CSRF                   | Purpose                                                       |
| ----------------------------------- | -------- | ---------------------- | ------------------------------------------------------------- |
| `GET /api/v1/auth/csrf`             | optional | —                      | CSRF token (session token, or pre-auth token + cookie)        |
| `POST /api/v1/auth/login`           | —        | pre-auth               | Sign in; sets the session cookie                              |
| `POST /api/v1/auth/logout`          | optional | session (if signed in) | Sign out                                                      |
| `GET /api/v1/auth/me`               | required | —                      | Current user `{ id, email, displayName, roles, permissions }` |
| `GET /api/v1/auth/sessions`         | required | —                      | Own sessions (safe metadata)                                  |
| `DELETE /api/v1/auth/sessions/:id`  | required | session                | Revoke one own session                                        |
| `DELETE /api/v1/auth/sessions`      | required | session                | Revoke all other own sessions                                 |
| `POST /api/v1/auth/password`        | required | session                | Change own password                                           |
| `POST /api/v1/auth/forgot-password` | —        | pre-auth               | Start reset (503 while email is not configured)               |
| `POST /api/v1/auth/reset-password`  | —        | pre-auth               | Complete reset with a single-use token                        |

## Error format

Every error (including 404s outside the API prefix) has the shape:

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Unable to sign in with those credentials.",
    "requestId": "…"
  }
}
```

`requestId` equals the `X-Request-Id` response header. Validation errors add
`details: [{ path, message }]` (never the submitted values). Database integrity guards (`DV001`) map to
`409 DOMAIN_INTEGRITY_VIOLATION`, unique violations to `409 UNIQUE_CONSTRAINT_VIOLATION`, FK violations to
`409 REFERENCE_CONSTRAINT_VIOLATION`; SQL, trigger names and stack traces are logged server-side only.
