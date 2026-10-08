# "Registration 2025.xlsx" — column mapping report

Inspected on 2026-10-08 for **structure only** (headers, cell types, blank counts, value shapes and the
distinct values of institutional columns). No names, registration numbers, dates or identity numbers were
copied, printed or committed. The file is not in the repository and nothing from it was imported.

**Workbook:** 15.8 KB, one worksheet **"Registration List"**, header row + **58 data rows**, 14 columns,
no merged cells, no embedded images, no formulas.

| Col | Header              | Content (shape)                            | Maps to                       | Notes                                                                                                                                                                                                               |
| --- | ------------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | S.No                | integers 1–58                              | — (not imported)              | Row counter                                                                                                                                                                                                         |
| B   | Name                | text, all filled                           | **Student Name** (`fullName`) | Suggested automatically                                                                                                                                                                                             |
| C   | Admission Date      | real date cells, 3 distinct                | **Admission Date**            | Suggested automatically                                                                                                                                                                                             |
| D   | Registration No.    | **numbers**, 56 × 9 digits, 2 × 8 digits   | **Registration Number**       | Read as text; the two 8-digit numbers get `REGISTRATION_NUMBER_MAY_HAVE_LOST_ZEROS` (Excel drops leading zeros from numbers — please confirm)                                                                       |
| E   | Registration Date   | real date cells, 3 distinct                | — (no field yet)              | Client decision: store it? (schema has `admission_date` only)                                                                                                                                                       |
| F   | Date of Birth       | **empty in every row**                     | Date of Birth (optional)      | No warnings when the whole column is empty; students submit DOB later                                                                                                                                               |
| G   | Nationality         | text, 1 distinct value                     | — (not imported)              | No field; client decision                                                                                                                                                                                           |
| H   | National Id No.     | 12-digit numbers or a 2-letter placeholder | **never imported**            | Detected as an identity-number column: cannot be mapped, is dropped before validation, never stored in staging rows, previews, reports or audit. It remains only in the private source workbook (retention applies) |
| I   | Course Type         | 2 values ("Training", "Certificate")       | — (not imported)              | Could inform program level; client decision                                                                                                                                                                         |
| J   | Course Name         | 2 distinct course names (trailing spaces)  | **Program** (`programCode`)   | Matched to programs **by name** (case/spacing-insensitive) or explicitly in "Translate values". The two programs must exist under Programs first                                                                    |
| K   | Duration            | "6 Months", "3 Months", "1 Year"           | — (not imported)              | Program attribute (`duration_semesters`) — not per student                                                                                                                                                          |
| L   | School Name         | 2 distinct values                          | **Department** (optional)     | Matched by name, or translated per value (including "No department")                                                                                                                                                |
| M   | Registration Status | "Active", "Inactive" (trailing spaces)     | **Status**                    | "Active" → ACTIVE automatically; **"Inactive" has no equivalent** — the administrator must translate it (e.g. SUSPENDED) or the rows are rejected. Client decision                                                  |
| N   | Photo               | **empty in every row**                     | —                             | Photos are not imported; students submit them later (planned)                                                                                                                                                       |

**No academic-session column.** The import requires one session for every row ("Academic session for
every row" in the mapping step). Client decision: which session(s) these registrations belong to — the
three admission dates may indicate different intakes.

### What an import of this file needs (once authorised)

1. Create the two programs (with their course names) and, if wanted, departments for the schools.
2. Create the academic session(s).
3. Upload, accept the suggested mapping, choose the session for every row, translate "Inactive".
4. Validate, review the two "lost zeros" warnings against the original records, commit.

A synthetic workbook with exactly these headers (`registration2025Sheet` in
`@docversity/imports/testing`) is covered by unit, API and browser tests.
