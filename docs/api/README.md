# API

`apps/api` is a NestJS 12 REST API (native ESM). The OpenAPI document is **generated** from the code —
it is never written or maintained by hand.

|              | Local URL                                   |
| ------------ | ------------------------------------------- |
| Swagger UI   | http://localhost:4000/api/docs              |
| OpenAPI JSON | http://localhost:4000/api/docs/openapi.json |

Swagger is served only when `SWAGGER_ENABLED=true` (default `false`; `.env.example` enables it for local
development). Keep it disabled in production unless access is restricted.

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
- Authentication (HTTP-only session cookies, CSRF protection, RBAC) arrives in a later phase — no endpoint
  in Phase 1 requires or accepts credentials.
