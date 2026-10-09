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

`departments.read` · `departments.write` · `programs.read` · `programs.write` ·
`academicSessions.read` · `academicSessions.write` · `students.read` · `students.write` ·
`registrations.read` · `registrations.write` · `results.read` · `results.write` · `results.publish` ·
`certificates.read` · `certificates.generate` · `certificates.approve` · `certificates.issue` ·
`certificates.revoke` · `templates.read` · `templates.write` · `imports.read` ·
`imports.students.run` · `imports.results.run` · `studentAccounts.read` · `studentAccounts.manage` ·
`audit.read` ·
`users.manage` · `settings.manage`

## Role mapping (initial proposal — confirm with the client)

| Permission                | SUPER_ADMIN | REGISTRAR | EXAM_ADMIN | CERTIFICATE_ADMIN | APPROVER | VIEWER |
| ------------------------- | :---------: | :-------: | :--------: | :---------------: | :------: | :----: |
| students.read             |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| students.write            |      ✓      |     ✓     |            |                   |          |        |
| results.read              |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| results.write             |      ✓      |           |     ✓      |                   |          |        |
| results.publish           |      ✓      |           |            |                   |    ✓     |        |
| certificates.read         |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| certificates.generate     |      ✓      |     ✓     |            |         ✓         |          |        |
| certificates.approve      |      ✓      |           |            |                   |    ✓     |        |
| certificates.issue        |      ✓      |           |            |                   |    ✓     |        |
| certificates.revoke       |      ✓      |           |            |                   |    ✓     |        |
| templates.read            |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| templates.write           |      ✓      |           |            |         ✓         |          |        |
| imports.read              |      ✓      |     ✓     |            |                   |          |        |
| imports.students.run      |      ✓      |     ✓     |            |                   |          |        |
| imports.results.run       |      ✓      |           |     ✓      |                   |          |        |
| studentAccounts.read      |      ✓      |     ✓     |            |                   |          |        |
| studentAccounts.manage    |      ✓      |     ✓     |            |                   |          |        |
| audit.read                |      ✓      |     ✓     |            |                   |          |        |
| examinations.read         |      ✓      |     ✓     |     ✓      |         ✓         |    ✓     |   ✓    |
| examinations.manage       |      ✓      |           |     ✓      |                   |          |        |
| reExamApplications.read   |      ✓      |     ✓     |     ✓      |                   |    ✓     |        |
| reExamApplications.decide |      ✓      |           |     ✓      |                   |          |        |
| reExamFees.manage         |      ✓      |           |            |                   |          |        |
| reExamPayments.configure  |      ✓      |           |            |                   |          |        |
| reExamPayments.read       |      ✓      |           |            |                   |    ✓     |        |
| reExamPayments.verify     |      ✓      |           |            |                   |    ✓     |        |
| users.manage              |      ✓      |           |            |                   |          |        |
| settings.manage           |      ✓      |           |            |                   |          |        |

Design rules, enforced by tests (`packages/types/test/permissions.test.ts`):

- **Maker–checker:** apart from SUPER_ADMIN, no role can both prepare and approve the same thing
  (`results.write` + `results.publish`; `certificates.generate` + `certificates.issue`).
- **VIEWER is read-only.**
- **Only SUPER_ADMIN manages users and settings.**
- **Academic masters and student records (Phase 4):** every role reads; only SUPER_ADMIN and REGISTRAR change them.
- **Imports (Phase 5):** `imports.run` was split per import type. Only SUPER_ADMIN and REGISTRAR run student
  imports and read import history (`imports.students.run`, `imports.read`); committing additionally
  requires `students.write` + `registrations.write`, so an import can never write what its user could not
  write by hand. EXAM_ADMIN does **not** get student imports; `imports.results.run` is reserved for the
  Phase 8 result import and no endpoint uses it yet. Whether VIEWER may read import history is an open
  client decision — it is not granted (import rows contain personal data).
- **Student accounts (Phase 6):** only SUPER_ADMIN and REGISTRAR see portal states and issue/revoke
  activation codes. Students themselves have **no** permissions at all — they are a separate principal
  (see authentication.md).
- **Examinations (Phase 9A):** every role reads examination records and the external examination
  application links (no personal data); only SUPER_ADMIN and EXAM_ADMIN configure links and create, open
  or archive records.
- **Re-exam applications (Phase 9B):** applications contain personal data, so VIEWER and
  CERTIFICATE_ADMIN do not read them; REGISTRAR, EXAM_ADMIN and APPROVER read and export; only EXAM_ADMIN
  decides. Fee rules are financial policy: SUPER_ADMIN only until the university names a finance role.
- **Re-exam payments (Phase 9C):** configuring payment destinations (`reExamPayments.configure`),
  reviewing payments (`reExamPayments.read` / `.verify`) and deciding applications
  (`reExamApplications.decide`) are three separate permissions. Destinations are SUPER_ADMIN only and
  each approval must come from a different person than the preparer (enforced in the API and by a
  database CHECK). APPROVER reviews and verifies payments; EXAM_ADMIN decides applications and does not
  verify payments. Proposal pending the university naming a finance role (policy P6).
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

The guard is tested through test-only routes (`apps/api/test/support/test-routes.ts`) and, since
Phase 4, through the real academic endpoints (`apps/api/test/academic`).
