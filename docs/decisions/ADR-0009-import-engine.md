# ADR-0009: A shared import engine package, run by the worker, with persisted state

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Phase 5 adds bulk student/registration imports from Excel. Parsing and validating thousands of rows and
committing them must not run inside an HTTP request ([ADR-0003](./ADR-0003-background-worker.md)), but the
API also needs parts of the same logic: the template, the upload container check, the state machine,
mapping validation and the per-row DTOs. The import model must be reusable for result imports (Phase 8),
and imports must not bypass the domain rules that manual student entry enforces.

## Decision

1. **`packages/imports` (`@docversity/imports`)** holds the import engine: ZIP/xlsx container checks,
   workbook reading (ExcelJS), deterministic header → field suggestions, pure row validation and
   classification, batched idempotent commit, the template and the error-report generators, and the state
   machine. It is framework-free TypeScript used by both the API (Nest) and the worker (plain Node).
2. **`packages/storage` (`@docversity/storage`)** now holds the `ObjectStorage` port and `S3ObjectStorage`
   (moved from `apps/api`), because the worker reads uploads and writes reports.
3. **The registration relation rules** (active program, non-archived session, program/department
   consistency) moved into `checkRegistrationRelations` in `@docversity/validation`. Manual
   create/update (API) and imports (worker) both call it — one rule set, two ingestion paths.
4. **Every step is persisted** in `import_jobs` / `import_rows` (new columns in migration
   `20261008120000_student_imports`): status, progress, worksheets and suggestions, the mapping, row
   classification, safe failure details and the error-report key. The UI only renders persisted state.
5. **Ownership of a running step** is an `active_run_id` written together with the status change. A worker
   run writes only while it still owns the job (checked under `SELECT … FOR UPDATE`), so stale, cancelled
   or duplicate deliveries stop without writing.

## Consequences

- One more workspace package each for imports and storage; both build like the other packages.
- Imported records are created with the same database invariants (unique normalised registration
  number, CHECK constraints) and the same relation rules as manual entry; audit entries are written for
  every created/updated record with `source: "import"`.
- The worker needs `DATABASE_URL` and the `S3_*` variables in addition to Redis.
- Result imports (Phase 8) add a row validator/committer for `RESULTS` to the same engine and reuse the
  state machine, storage, mapping UI, report and history.
