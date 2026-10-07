# Authorization

## Model

| Concept                | Lives in                                             | Why                                                               |
| ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| **Roles**              | `roles` table (records)                              | Assigned to users without a deploy                                |
| **Permissions**        | Code constants — `packages/types/src/permissions.ts` | Checked by code; typos fail type-checking                         |
| **Role → permissions** | Code map `ROLE_PERMISSIONS` (same file)              | Reviewable in pull requests; no speculative permission-editing UI |

A role record whose name has no entry in `ROLE_PERMISSIONS` grants nothing. `pnpm admin:create` (and the
test fixtures) ensure all six code-defined roles exist as records.

## Permissions

`students.read` · `students.write` · `results.read` · `results.write` · `results.publish` ·
`certificates.read` · `certificates.generate` · `certificates.approve` · `certificates.issue` ·
`certificates.revoke` · `templates.read` · `templates.write` · `imports.run` · `audit.read` ·
`users.manage` · `settings.manage`

## Role mapping (initial proposal — confirm with the client)

| Permission            | SUPER_ADMIN | REGISTRAR | EXAM_ADMIN | CERTIFICATE_ADMIN | APPROVER | VIEWER |
| --------------------- | :---------: | :-------: | :--------: | :---------------: | :------: | :----: |
| students.read         |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| students.write        |      ✓      |     ✓     |            |                   |          |        |
| results.read          |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| results.write         |      ✓      |           |     ✓      |                   |          |        |
| results.publish       |      ✓      |           |            |                   |    ✓     |        |
| certificates.read     |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| certificates.generate |      ✓      |     ✓     |            |         ✓         |          |        |
| certificates.approve  |      ✓      |           |            |                   |    ✓     |        |
| certificates.issue    |      ✓      |           |            |                   |    ✓     |        |
| certificates.revoke   |      ✓      |           |            |                   |    ✓     |        |
| templates.read        |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| templates.write       |      ✓      |           |            |         ✓         |          |        |
| imports.run           |      ✓      |     ✓     |     ✓      |                   |          |        |
| audit.read            |      ✓      |     ✓     |            |                   |          |        |
| users.manage          |      ✓      |           |            |                   |          |        |
| settings.manage       |      ✓      |           |            |                   |          |        |

Design rules, enforced by tests (`packages/types/test/permissions.test.ts`):

- **Maker–checker:** apart from SUPER_ADMIN, no role can both prepare and approve the same thing
  (`results.write` + `results.publish`; `certificates.generate` + `certificates.issue`).
- **VIEWER is read-only.**
- **Only SUPER_ADMIN manages users and settings.**
- A user's permissions are the union of their roles' permissions. There is no role hierarchy.

## Guards

All three are global (`APP_GUARD`), run in this order, and are the only place access is decided:

1. **`AuthGuard`** — requires a valid session unless the route is `@Public()` (`'none'` ignores sessions;
   `'optional'` attaches one if present). Reloads the user and roles from PostgreSQL on every request.
   → `401 AUTH_REQUIRED` / `401 AUTH_SESSION_EXPIRED` / `503 AUTH_SERVICE_UNAVAILABLE`.
2. **`CsrfGuard`** — Origin + CSRF token for unsafe methods (see authentication.md). → `403`.
3. **`PermissionsGuard`** — `@RequirePermissions(PERMISSIONS.x, …)` requires **all** listed permissions.
   → `403 FORBIDDEN`.

Controllers never inspect roles. Future feature controllers look like:

```ts
@Post()
@RequirePermissions(PERMISSIONS.studentsWrite)
create(@CurrentAuth() auth: AuthContext, @Body(new ZodValidationPipe(schema)) body: Input) { … }
```

The web app may read `permissions` from `GET /api/v1/auth/me` to hide controls, but the API remains
authoritative.

Phase 3 has no feature endpoints, so the guard is tested through test-only routes
(`apps/api/test/support/test-routes.ts`) that never ship in the application.
