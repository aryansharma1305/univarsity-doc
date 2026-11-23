# Registration and result import guide

- **Audience:** Registrar (registration import), Exam Admin (result import), Super Admin.
- **Scope:** importing students and registrations from Excel, issuing activation codes afterwards,
  and the result import preview with its separate draft-save step.
- **Applies to release `916b07c`.**

Source references: [docs/api/imports.md](../api/imports.md),
[docs/architecture/imports.md](../architecture/imports.md),
[docs/imports/student-template.md](../imports/student-template.md),
[docs/api/result-import-previews.md](../api/result-import-previews.md),
[docs/api/draft-results.md](../api/draft-results.md).

## Before any real import

- Written authorization for the source workbook (data handling), the exact course, department,
  session and status mappings, and a verified backup taken **before** upload. Upload already places
  personal data on the server.
- Courses, departments and academic sessions must already exist. Imports never create them.
- Never upload a workbook that contains identity numbers you do not need; identity-number columns
  (national ID, Aadhaar, passport, PAN and similar) are never mapped or stored, but the file is still
  personal data.

## Registration import (students and registrations)

**Permissions:** `imports.students.run` to upload, map and validate; `imports.students.run` +
`students.write` + `registrations.write` to commit; `imports.read` to view history and reports.
REGISTRAR holds all of them. EXAM_ADMIN deliberately does not.

1. **Imports & Reports → Registration Import** (`/admin/imports/new`). Download the template if you
   need it (Instructions + Students sheets).
2. Upload the `.xlsx` file. The worker reads it in the background; wait for the worksheet list.
3. Choose the worksheet and confirm the column mapping. Header suggestions are deterministic; check
   each one. Choose the date format (ISO, DMY or MDY).
4. If the file uses its own labels for course, school/department, session or status, map each value
   to the system value (value translation). If the file has no session column, choose one session
   for every row.
5. **Validate.** Review counts and rows: CREATE, UPDATE, SKIP (unchanged) or ERROR, plus warnings.
   Open a row to compare source cells, normalised values and current database values.
6. Download the error workbook if there are errors. Fix the source and upload again; do not edit
   records by hand to "make the numbers match".
7. **Commit.** Updates to existing records are applied only when you explicitly tick apply updates.
   An import may update name, parents' names, date of birth, gender, roll/reference number, admission
   and completion date. It never changes the course, session, department or status of an existing
   registration.
8. Read the final report (created, updated, skipped, failed). A failed step marked retryable can be
   retried from the import page; do not re-upload blindly.
9. **Issue activation codes:** open `/admin/student-accounts?import=<import id>` → select → issue.
   Distribute codes individually and privately.

Limits come from `IMPORT_MAX_FILE_MB`, `IMPORT_MAX_UNCOMPRESSED_MB`, `IMPORT_MAX_ROWS`,
`IMPORT_MAX_COLUMNS` and `IMPORT_BATCH_SIZE`. The "Registration 2025" layout is supported
(`apps/api/test/imports/registration-2025.test.ts`).

**Roll numbers.** The optional "Roll / Reference Number" column is stored as given. Public **Check
Result** finds a published result by course + roll number + period, so registrations without a roll
number cannot be found there (see decisions). A missing roll number produces the warning
`ROLL_REFERENCE_MISSING` when that column is mapped.

## Result import (preview, then a separate draft save)

**Permissions:** `imports.results.run` for upload, mapping, validation and preview (nothing saved);
`imports.results.run` + `results.write` to save drafts. EXAM_ADMIN holds both.

1. **Imports & Reports → Result Import** (`/admin/results/import`). Choose the context: course,
   curriculum version, academic session, semester/year and an examination that is OPEN or
   UNDER_REVIEW. Draft curricula and draft, published or archived examinations are blocked.
2. Download the template if needed (registration column formatted as text; no grade column).
3. Upload the `.xlsx`. Map worksheet columns: registration number and subject code are mandatory;
   map at least one marks column and every required component.
4. **Validate.** The preview classifies rows as valid, warnings or errors: unknown or ambiguous
   subjects, duplicates, missing or negative marks, values above configured maxima, inactive
   registrations and existing results. Grades in the file are ignored. Nothing is calculated
   (no pass/fail, grade, GPA or credits).
5. Download the issues workbook if needed.
6. **Save as drafts** (separate confirmation): the system builds a fresh save plan; confirm it to save
   one atomic batch of DRAFT results. Replays of the same batch are refused.
7. Continue in **Examination → Draft Results / Result Management** (see
   [examination-and-certificate-workflow-guide.md](examination-and-certificate-workflow-guide.md)).

Previews live in Redis and expire two hours after upload; at most five open previews per staff
member. After expiry, upload again.

## Audit and privacy

Import audit entries hold IDs, mapped field names, hashes and counts, never uploaded values,
registration numbers or names. Reports escape spreadsheet formulas. Downloads are `no-store`.
Retention of source workbooks and error reports is not decided (see decisions).
