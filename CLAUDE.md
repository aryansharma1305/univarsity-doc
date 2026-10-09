# CLAUDE.md — Docversity

Onboarding guide for contributors and Claude Code. It summarises what **exists in the code today**;
`docs/` holds the detail. Source code, Prisma migrations, tests and ADRs are authoritative — this file,
`README.md` and the graph in `graphify-out/` are navigation aids.

## 1. Product and status

Docversity is a university **Academic Verification & Records Portal**: an admin system for academic
records, a student portal, and (planned) public verification of results, registrations and certificates.
One PostgreSQL database serves admin, student and public features — never duplicate student or
certificate data.

| Phase | Scope                                                                                       | Status (git tag)                                 |
| ----- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1     | Monorepo, Docker infrastructure, health checks, CI                                          | ✅ `phase-1-foundation`                          |
| 2     | Core academic schema (23 tables, CHECKs, integrity triggers)                                | ✅ `phase-2-domain-schema`                       |
| 3     | Staff authentication (sessions, CSRF, rate limits), RBAC, audit                             | ✅ `phase-3-auth-rbac`                           |
| 4     | Design system, public/admin shells, departments/programs/sessions/students/registrations    | ✅ `phase-4-academic-masters`                    |
| 5     | Student/registration Excel import (worker-based, incl. the "Registration 2025" layout)      | ✅ `phase-5-student-imports`                     |
| 6     | Student accounts: activation codes, separate student sign-in, `/student` overview           | ✅ `phase-6-student-accounts`                    |
| 6.5   | Responsive student portal, read-only profile/course/account views, public access navigation | ✅ merged (PR #1)                                |
| 7     | Student profile change requests (DOB, photo, corrections) with staff approval               | ✅ merged (PR #2)                                |
| 7B    | Course management, curriculum versions, subject catalogue and explicit student assignment   | ✅ merged (PR #3)                                |
| 8     | Staff-managed historical certificates and the student document library                      | Review `feature/phase-8-historical-certificates` |

**Not built yet** (do not describe as working): examinations/grading, results entry/import/publication, certificate generation
(PDF/QR), legacy QR mapping and bulk migration of historic documents, public verification (the `/verify/*` and `/results` pages are honest
"not available yet" placeholders), legacy WordPress migration, retention cleanup jobs, email delivery
(password reset refuses with 503 when no notifier is configured). Plan: [docs/roadmap.md](docs/roadmap.md).

Phase 6.5 delivery and screenshot evidence: [docs/development/phase-6.5-student-portal.md](docs/development/phase-6.5-student-portal.md).

## 2. Monorepo

pnpm 12 workspaces + Turborepo, native ESM, TypeScript 6, Node ≥ 22.12 (`.nvmrc` = 22).

```text
apps/web          Next.js 16 (App Router): public pages, /admin, /student
apps/api          NestJS 12 REST API (/api/v1), Swagger, guards, services
apps/worker       BullMQ worker: `system` queue (health-test) + `imports` queue
packages/database Prisma 7 schema, migrations, client factory, seed, test-DB helper
packages/validation Zod schemas: env, API contracts, job payloads, import field catalogue
packages/types    Constants: permissions/roles, audit actions, queue + job names
packages/imports  Import engine (ExcelJS): container checks, parsing, mapping, validation, commit, reports
packages/storage  ObjectStorage port + S3ObjectStorage (MinIO / R2 / S3), generated object keys
packages/ui       shadcn/ui-based components + theme tokens (consumed as source by the web app)
packages/config   Shared TS and ESLint configs
packages/documents Placeholder (official document layouts later)
references/stitch Unmodified design export — visual reference only, never production code
docs/             Architecture, API, database, security docs, ADR-0001…0013
```

Packages are compiled to `dist/` and consumed via their `exports`; Turborepo builds dependencies first.

## 3. Install and run

```bash
corepack enable pnpm
pnpm install
cp .env.example .env            # development defaults matching docker-compose.yml
docker compose up -d --wait     # PostgreSQL 17, Redis 7.4, MinIO (private bucket + app user)
pnpm db:deploy                  # apply migrations
pnpm db:seed                    # optional DEV fixtures; refuses on NODE_ENV=production / non-local DB
pnpm admin:create               # first staff admin (interactive; or ADMIN_EMAIL / ADMIN_DISPLAY_NAME / ADMIN_PASSWORD)
pnpm dev                        # web :3000, API :4000, worker (watch mode)
pnpm queue:check                # with `pnpm dev` running: proves enqueue → worker → result
```

Local URLs: web http://localhost:3000 (admin `/admin`, student portal `/student/login`), API health
http://localhost:4000/health, Swagger http://localhost:4000/api/docs (when `SWAGGER_ENABLED=true`).
Infrastructure listens on 127.0.0.1 only: PostgreSQL 55432, Redis 56379, MinIO 59000 (console 59001).
First Playwright run on a machine: `pnpm --filter @docversity/web exec playwright install chromium`.

## 4. Quality gates (all must pass before a commit/tag)

```bash
pnpm format:check
pnpm lint            # web lint runs `next typegen` first (typed routes)
pnpm typecheck
pnpm test            # needs `docker compose up -d`; uses disposable <db>_api_test / per-package test DBs
pnpm build
pnpm db:check        # migrations vs schema.prisma drift check (must print "No difference detected")
pnpm test:e2e        # builds, prepares <db>_e2e, starts API :4100 + web :3100 + worker, Playwright
```

Use `--force` (e.g. `pnpm test --force`) for an uncached run. CI (`.github/workflows/ci.yml`) runs
`cp .env.example .env`, compose up, `db:deploy`, `db:check`, format, lint, typecheck, test, build, e2e on
every push. A fresh clone must pass — never rely on local leftovers in `.next/` or `dist/`.

## 5. Environment variables (names only — see `.env.example` for development defaults)

Never commit `.env` or real values. Production must use a real random `SESSION_SECRET` (the API refuses the
development placeholder) and `COOKIE_SECURE=true`.

- **General / web:** `NODE_ENV`, `LOG_LEVEL`, `WEB_URL`, `API_URL`, `API_INTERNAL_URL`, `WEB_BEHIND_TRUSTED_PROXY`
- **API:** `API_HOST`, `API_PORT`, `CORS_ORIGINS`, `SWAGGER_ENABLED`, `HEALTH_CHECK_TIMEOUT_MS`, `TRUST_PROXY`
- **PostgreSQL:** `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST_PORT`
- **Redis / queues:** `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_HOST_PORT`, `QUEUE_PREFIX`, `WORKER_CONCURRENCY`, `IMPORT_CONCURRENCY`
- **Object storage:** `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_API_HOST_PORT`, `MINIO_CONSOLE_HOST_PORT`
- **Sessions / auth:** `SESSION_SECRET`, `COOKIE_SECURE`, `SESSION_IDLE_TIMEOUT_SECONDS`, `SESSION_ABSOLUTE_TIMEOUT_SECONDS`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS`, `LOGIN_MAX_ATTEMPTS_PER_ACCOUNT_IP`, `LOGIN_MAX_ATTEMPTS_PER_ACCOUNT`, `LOGIN_MAX_ATTEMPTS_PER_IP`, `PASSWORD_RESET_TOKEN_TTL_SECONDS`, `REDIS_KEY_PREFIX` (optional, default `dv:`)
- **Student accounts:** `STUDENT_ACTIVATION_CODE_TTL_DAYS`, `STUDENT_ACTIVATION_MAX_FAILED_ATTEMPTS`
- **Imports:** `IMPORT_MAX_FILE_MB`, `IMPORT_MAX_UNCOMPRESSED_MB`, `IMPORT_MAX_ROWS`, `IMPORT_MAX_COLUMNS`, `IMPORT_BATCH_SIZE`

Every app validates its environment with Zod at startup and fails fast with a readable message.

## 6. Backend conventions (apps/api)

- **Contracts are Zod schemas in `@docversity/validation`**, used for request validation
  (`ZodValidationPipe`), response typing, Swagger (`standardSchema` / `openApiRequestSchema`) and the web
  client. Never hand-write OpenAPI or duplicate a schema.
- Global guards, in order: `AuthGuard` (staff) → `StudentAuthGuard` → `CsrfGuard` → `PermissionsGuard`.
  Staff routes declare `@RequirePermissions(PERMISSIONS.x)`; `@Public()` opts out of auth; student routes
  use `@StudentRoute()`. Controllers never check roles themselves.
- Errors: throw `AppError` / `Errors.*`; the global filter returns `{ error: { code, message, requestId,
details? } }` with safe messages only. DV001 integrity-trigger errors become 409.
- Lists: `listQuerySchema` (strict, allow-listed `sortBy`) → `{ data, meta: { page, pageSize, total,
totalPages } }`. Unknown query parameters are rejected.
- Writes run in transactions; audit entries are written in the same transaction
  (`AuditService.writeAuditEvent(event, tx)`), metadata = IDs, codes, field **names**, counts — never
  personal values, passwords, tokens or codes. `audit_logs` is append-only (DB trigger).
- Relation rules for registrations (active program, non-archived session, program/department match) live
  in `checkRegistrationRelations` (`@docversity/validation`) and are shared by manual CRUD and imports.
- Step endpoints that change state but create nothing return 200 (`@HttpCode(HttpStatus.OK)`).
- Logs: structured JSON with correlation IDs; sensitive keys are redacted (`common/json-logger.ts`).

## 7. Frontend conventions (apps/web)

- Admin data: client components with TanStack Query (`features/<area>/api.ts`), list state in the URL
  (`useListParams`), `DataTable` (cards on small screens), `PageHeader`, state components
  (`EmptyState`/`ErrorState`/`TableSkeleton`), permission hints via `useCan()` — the API is authoritative.
- API calls go through `lib/api.ts` (`apiRequest`, `apiUpload`, `apiDownload`, `studentRequest`) against
  the same-origin `/api/v1` proxy (`src/proxy.ts`); CSRF tokens are handled there per principal.
- Server components check sessions via `lib/server-auth.ts` (`getSessionState`, `getStudentSessionState`)
  for redirects only.
- Design system in `packages/ui` (theme tokens, shadcn components). Accessibility: real headings, labelled
  controls, WCAG AA contrast (axe runs in e2e), no page-level horizontal scroll at 390 px.
- Animation rules: [docs/architecture/frontend-animation.md](docs/architecture/frontend-animation.md).
  Stitch screens are visual references only ([stitch-migration.md](docs/architecture/stitch-migration.md)).

## 8. Database and migrations (packages/database)

- Prisma 7 with the `pg` adapter, UUIDv7 keys, `partialIndexes` preview. Schema:
  `packages/database/prisma/schema.prisma`; docs: [docs/database/README.md](docs/database/README.md).
- Migrations: `20261007191730_core_academic_schema` (Phase 2, **frozen**),
  `20261008120000_student_imports` (Phase 5), `20261009090000_student_accounts` (Phase 6),
  `20261010090000_student_profile_change_requests` (Phase 7),
  `20261011090000_course_curriculum_management`, `20261011093000_curriculum_history_guards`,
  `20261011094000_preserve_assignment_delete_restrict`,
  `20261011100000_curriculum_activation_period_bounds` (Phase 7B),
  `20261012090000_historical_documents`, `20261013090000_historical_document_hardening` (Phase 8).
- **Never edit an applied/pushed migration.** Every change is a new, reviewed migration; hand-written
  CHECKs/triggers go at the end of the migration that introduces them. Generate SQL with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, apply with
  `pnpm db:deploy`, then `pnpm db:check` and `pnpm db:generate`.
- Partial-index predicates must be written in PostgreSQL's normalised form (e.g. `= ANY (ARRAY[...])`),
  otherwise `db:check` reports perpetual drift.
- Integrity is enforced in the database too (CHECKs, triggers raising SQLSTATE `DV001`); never bypass it.

## 9. Redis and BullMQ

- Redis holds staff sessions (`<prefix>session:*`), student sessions (`<prefix>student-session:*`) and
  rate-limit counters; auth fails closed (503) when Redis is down.
- BullMQ queues (`packages/types/src/queues.ts`): `system` (`health-test`) and `imports`
  (`import.parse`, `import.validate`, `import.commit`). Producer and worker must share `QUEUE_PREFIX`.
- Jobs carry `{ importJobId, runId, actorUserId, correlationId }`; a run writes only while it owns the job
  (`active_run_id`, checked under `SELECT … FOR UPDATE`). Steps are idempotent; file problems fail
  immediately, transient errors retry (3 attempts, exponential backoff).

## 10. Authentication boundaries

|              | Staff                                                                               | Students                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Accounts     | `users` + `roles` (code-defined permissions in `packages/types/src/permissions.ts`) | `student_accounts` (one per student), **no roles or permissions**                                         |
| Sign-in      | `POST /api/v1/auth/login` (email + password)                                        | `POST /api/v1/student-auth/login` (any own registration number + password)                                |
| First access | `pnpm admin:create`                                                                 | `POST /api/v1/student-auth/activate`: registration number **+ single-use activation code** + new password |
| Cookie       | `dv_session` (`__Host-` in production)                                              | `dv_student` (`__Host-` in production)                                                                    |

Staff routes never read the student cookie; student routes never accept a staff session; student
endpoints derive the student from the session and take no student/registration IDs. Activation codes:
60-bit, stored only as HMAC, single use, 30-day expiry, one open code per registration, revoked after
repeated wrong guesses, identical error for every failure; a new code recovers a forgotten password. The
registration number alone is never sufficient. Details: [docs/architecture/authentication.md](docs/architecture/authentication.md),
[authorization.md](docs/architecture/authorization.md), ADR-0007 and ADR-0010.

## 10a. Student profile change requests (Phase 7)

Students propose missing DOB, a photo, or corrections to name/parents' names/gender at `/student/profile`
(edit → review → submit); history at `/student/profile/requests` (cancel while pending). Staff review at
`/admin/profile-requests` (`studentProfileRequests.read` / `.review`, REGISTRAR + SUPER_ADMIN). One PENDING
request per student; approval locks the rows and refuses stale requests (`409 PROFILE_REQUEST_STALE`);
only requested fields change. Photos are decoded and re-encoded server-side (`sharp`, no metadata) and
stored privately; served with `no-store` after an ownership/permission check. Details:
[docs/api/profile-requests.md](docs/api/profile-requests.md), ADR-0011.

## 10b. Course and curriculum management (Phase 7B)

`/admin/programs` is Course Management; each course opens a version list and a semester/year editor.
`/admin/subjects` maintains the reusable catalogue. Draft versions can be edited/copied; activation
freezes their definition and subject placements. Active windows cannot overlap; archiving keeps history.
Staff explicitly assign an active version to registrations (never guessed from dates). Registrations
with results cannot be assigned or moved. Catalogue identity used in active/archived versions or results
is frozen; retiring a subject preserves its history. Students see only their own assigned version at
`/student/course`, with honest unassigned states. Existing `Program`, `Subject`, `ProgramSubject` and
`ResultItem` foundations remain authoritative. See [docs/api/curricula.md](docs/api/curricula.md),
[docs/development/phase-7b-course-curriculum.md](docs/development/phase-7b-course-curriculum.md), ADR-0012.

## 10c. Historical documents (Phase 8)

Staff upload historic certificates/marksheets (PDF/JPEG/PNG, content-checked, original bytes kept with
SHA-256) for one registration at `/admin/historical-documents`; students see only their own PUBLISHED
documents at `/student/documents` and can never upload or change them. Lifecycle DRAFT → PUBLISHED →
WITHDRAWN/SUPERSEDED, never deleted; corrections are replacements. Authenticity review is separate and
never by the uploader. Image scans keep their original bytes as staff-only evidence; students only ever
receive a separate copy re-encoded without embedded metadata (EXIF/GPS/XMP/IPTC/text), checked on every
read — never the original. Older image rows get their copy with `pnpm documents:backfill-student-copies`
(idempotent; `--dry-run`) and cannot be published until then. Certificate numbers are stored exactly as
given, with a normalised form (NFKC, upper-case, letters/digits) for search and duplicate warnings.
Details: [docs/api/historical-documents.md](docs/api/historical-documents.md), ADR-0013.

## 11. Student import workflow (Phase 5)

`/admin/imports` → download template → upload `.xlsx` → worker reads the workbook → choose worksheet and
confirm column mapping (deterministic header suggestions; optional value translation for course/school/
session/status values; one session for every row if the file has no session column) → worker validates →
review counts/rows/errors (CREATE / UPDATE / SKIP / ERROR) → commit (updates only with explicit approval)
→ report + error workbook. Programs, departments and sessions are never created by imports; program,
session, department and status of existing registrations are never changed by imports; identity-number
columns (national ID, Aadhaar, passport, PAN…) are never mapped or staged. Permissions:
`imports.students.run`, `imports.read`. Details: [docs/architecture/imports.md](docs/architecture/imports.md),
[docs/api/imports.md](docs/api/imports.md), [docs/imports/student-template.md](docs/imports/student-template.md).
After an import, `/admin/student-accounts?import=<id>` issues activation codes for its students.

## 12. API conventions

Base path `/api/v1` (health at `/health`). Feature references: [docs/api/](docs/api/README.md)
(academic masters, imports, student accounts). Unsafe methods need `X-CSRF-Token` (from `/auth/csrf` for
staff, `/student-auth/csrf` for students). Downloads are streamed after a permission check with
`Cache-Control: no-store`; storage keys are never returned.

## 13. Security and privacy rules (non-negotiable)

- Never commit real student data, national IDs, workbooks, certificate images, photos, generated
  activation-code sheets, `.env`, credentials or database/Redis/MinIO data. Tests use synthetic fixtures
  generated in code (e.g. `@docversity/imports/testing`, `DEV-IMPORT-0001`, "Test Student One").
- Real workbooks may only be inspected for structure locally (no values printed or copied) and never
  imported without explicit authorisation.
- Never log or audit passwords, session IDs, CSRF tokens, reset tokens, activation codes, S3 or database
  credentials. Activation codes exist in plain text only in the issuing response.
- Never trust the frontend for authorization; never return internal errors or stack traces.
- Uploaded historic documents (`historical_documents`, Phase 8) are evidence, never "cryptographically verified" credentials; visibility to the student and authenticity review are separate.

## 14. Development workflow and Git

- Work happens in **phases**; each phase stops for review. Do not start the next phase without approval.
- Work on the phase feature branch; PRs target `main`. Conventional commits (`feat:`, `fix:`, `chore:`, `fix(ci):`), one commit per phase
  plus fixes, marked with a lightweight tag `phase-<n>-<name>` on the verified commit. AI-assisted commits end with a
  `Co-Authored-By:` trailer.
- Before committing: all quality gates green (uncached), `git diff` reviewed for secrets and real data,
  historical migrations unchanged, docs updated (`docs/`, ADR for architecture decisions).
- Knowledge graph: refresh with `graphify update .` (code) — see
  [docs/development/knowledge-graph.md](docs/development/knowledge-graph.md); never hand-edit `graphify-out/`.
- Open client decisions: [docs/database/open-questions.md](docs/database/open-questions.md).
