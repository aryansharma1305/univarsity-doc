# Phase 10B — results import preview

The staff workflow at `/admin/results/import` selects an existing course, curriculum version,
semester/year, academic session and examination, uploads an XLSX, maps worksheet columns, validates
rows, previews normalized marks and downloads an issue report. The banner states:
“Preview only — no marks have been saved to official records.”

## Delivered boundary

- Shared Phase 5 workbook reader, upload interceptor, mapping normalization, template/report helpers,
  file dropzone, stepper and responsive DataTable; shared Phase 10A marks validation.
- Shared Zod contracts and staff permission `imports.results.run`; no student endpoints.
- Semester-wise and year-wise curricula, server-checked examination associations and lifecycle.
- Row status/counts, original Excel row number, registration/subject/marks, field-specific issues,
  status filters, issue-code filtering, search, pagination and private spreadsheet-safe reports.
- Required/duplicate/missing/sensitive mapping checks; formulas and numeric registration identifiers
  rejected; curriculum/period/subject checks; component maxima and decimal precision checks.
- Inactive-registration, existing-result and ignored-grade warnings; unknown component names remain
  explicit configuration notices. No invented university policy or attempt number.
- Private Redis previews with fixed two-hour retention and an atomic five-preview limit. Atomic
  validation storage cannot restore a discarded preview. Combined worksheet rows are bounded.
- Audit events hold IDs, hashes, mapped field names and counts, without spreadsheet values.
- A focusable, labelled scroll region fixes keyboard access to wide tables.

There is no result commit, manual marks save, approval, publication, GPA/CGPA calculation, re-exam
replacement, payment-provider integration, schema migration or persistent RESULTS job in this phase.
Graph output was not regenerated, as requested.

## Verification

The baseline was `e462fec48c1ee9d0df5b588e341546e328dc1756` on main, with successful CI, and the
existing uncommitted Phase 10B work was preserved on `feature/phase-10b-results-import-preview`.

Tests use synthetic learners, workbooks and examination data in the existing disposable API/E2E
scratch databases. The development database is never reset or seeded. API coverage includes access
control, CSRF, ownership isolation, context mismatch/lifecycle, manual and suggested mappings, row
validation, safe reports, unchanged official registrations/results/payments, corrupt/oversized
uploads, aggregate worksheet limits, concurrent caps, expiry and discard cleanup. Browser coverage
exercises semester/year setup, upload, missing mapping recovery, validation, filtering, report,
reload, discard, viewer denial, desktop/390px overflow and serious/critical accessibility checks.

### Final local gates

- `pnpm format:check`: passed.
- `pnpm lint --force`: passed; the existing TanStack Table/React Compiler warning remains.
- `pnpm typecheck --force`: passed (16 tasks, no cache).
- `pnpm test --force --concurrency=2 -- --maxWorkers=2`: 618 tests passed across eight packages.
- `pnpm build --force --concurrency=2`: passed (10 tasks, no cache).
- `pnpm db:check`: “No difference detected.”

Concurrency was limited after overlapping heavy checks caused unrelated timeouts. An early overlapping
API rerun also interfered with the shared disposable API scratch database; the final successful run
used one API test process. No development data was reset. `pnpm test:e2e -- --timeout=90000`: all 40 browser tests passed. The local timeout override gives the
existing long workflows room to finish; CI retains its configured default. After screenshot review,
results-only layout corrections (marks spacing, mobile badges, word wrapping and stable label IDs)
were verified with web lint/typecheck, the three focused component tests, a fresh web build and all
three results browser tests at the default timeout. Both semester/year flows passed desktop/390px
accessibility and overflow checks. Screenshots were reviewed visually.

### Preservation evidence

A read-only snapshot taken at resume covered all 36 development PostgreSQL tables (row counts and
content hashes) and 1,491 existing MinIO objects (keys, sizes and ETags). Rechecking during verification
found every table unchanged and every pre-existing object unchanged, both during the run and at the
final check. The final object count was 1,620 (129 additional synthetic test objects). Tests add synthetic objects;
they do not replace existing objects. Snapshot files remain private in `/tmp`, outside Git.

## Screenshots (synthetic data only)

- [Semester context, desktop](phase-10b/results-context-semester_wise-desktop.png)
- [Year context, desktop](phase-10b/results-context-year_wise-desktop.png)
- [Semester preview, desktop](phase-10b/results-preview-semester_wise-desktop.png)
- [Semester preview, 390px](phase-10b/results-preview-semester_wise-mobile.png)
- [Year preview, desktop](phase-10b/results-preview-year_wise-desktop.png)
- [Year preview, 390px](phase-10b/results-preview-year_wise-mobile.png)
