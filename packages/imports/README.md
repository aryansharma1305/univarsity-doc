# @docversity/imports

The spreadsheet import engine (Phase 5: student / registration imports), shared by the API and the worker.
See [docs/architecture/imports.md](../../docs/architecture/imports.md) and
[ADR-0009](../../docs/decisions/ADR-0009-import-engine.md).

| Module                                       | Purpose                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `container.ts`                               | ZIP/xlsx structure checks and zip-bomb guard (before any parser runs)          |
| `workbook.ts`, `cells.ts`, `dates.ts`        | ExcelJS reading; cells as typed values, formulas never evaluated; strict dates |
| `mapping.ts`                                 | Deterministic header → field suggestions and mapping validation                |
| `student-rows.ts`                            | Pure row validation and CREATE / UPDATE / SKIP / ERROR classification          |
| `engine.ts`, `db.ts`                         | Worker steps (parse, validate, batched idempotent commit), job state, audit    |
| `state-machine.ts`                           | Allowed transitions and actions                                                |
| `template.ts`, `report.ts`, `safety.ts`      | Template, error report, formula-injection and filename safety                  |
| `testing.ts` (`@docversity/imports/testing`) | Programmatic workbook fixtures for tests (no committed spreadsheets)           |
