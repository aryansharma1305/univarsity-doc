# Student import columns

Download the template from **Imports → Import students → Download template** (`GET
/api/v1/imports/templates/students`). Universities may also upload their own workbook and map its
columns; header matching is deterministic (normalised header = label or a listed alias) and always
confirmed by the administrator. Row 1 is the header row. Formulas are not allowed in mapped columns.

| Column                  | Required | Format                                            | Notes                                                                                                                                                               |
| ----------------------- | :------: | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration Number     |    ✓     | Text, ≤ 64, letters/digits/space `. _ / -`        | Identifies existing registrations (compared trimmed, case-insensitive). Format the column as Text so `000123` keeps its zeros                                       |
| Roll / Reference Number |          | Text, ≤ 64                                        | Optional; university-specific meaning                                                                                                                               |
| Student Name            |    ✓     | Text, ≤ 200                                       |                                                                                                                                                                     |
| Father Name             |          | Text, ≤ 200                                       |                                                                                                                                                                     |
| Mother Name             |          | Text, ≤ 200                                       |                                                                                                                                                                     |
| Date of Birth           |          | Excel date cell or `YYYY-MM-DD`                   | Optional                                                                                                                                                            |
| Gender                  |          | Text, ≤ 32                                        | Stored as given                                                                                                                                                     |
| Program Code            |    ✓     | Code **or name** of an existing program           | E.g. a course name; translatable per value while mapping. Never created; inactive programs are rejected for new registrations                                       |
| Department Code         |          | Code or name of an existing department            | E.g. a school name; translatable per value (incl. “No department”). If the program belongs to a department it must be that one (empty = filled in from the program) |
| Academic Session Code   |   ✓\*    | Code or name of an existing, non-archived session | \*Or choose one session for every row while mapping (files without a session column). Never created                                                                 |
| Admission Date          |          | Excel date cell or `YYYY-MM-DD`                   |                                                                                                                                                                     |
| Completion Date         |          | Excel date cell or `YYYY-MM-DD`                   | On or after the admission date                                                                                                                                      |
| Status                  |          | `ACTIVE`, `COMPLETED`, `SUSPENDED`, `REVOKED`     | Not case-sensitive; other values (e.g. “Inactive”) must be translated while mapping; empty = `ACTIVE` for new registrations; never changed on existing ones         |

**Columns that are never imported.** Identity numbers (national ID, Aadhaar, passport, PAN …) are
detected from the header and never mapped, staged, previewed or reported. Photos are not imported
(students will submit them later).

**Dates.** Real Excel date cells are always read correctly. Text dates must be `YYYY-MM-DD` (e.g.
`2026-10-08`) unless a day-first (`DD/MM/YYYY`) or month-first (`MM/DD/YYYY`) format is explicitly chosen
when mapping; otherwise `01/02/2026` is rejected as ambiguous. Plain numbers in date columns are rejected.

**Updates.** For existing registration numbers only Student/Father/Mother Name, Date of Birth, Gender,
Roll/Reference Number and Admission/Completion Date can change — shown as a diff and applied only when
updates are explicitly approved. Blank cells never clear values.

## Validation codes

| Code                                                                                                                     | Severity | Meaning                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `MISSING_REGISTRATION_NUMBER`, `MISSING_STUDENT_NAME`, `MISSING_PROGRAM`, `MISSING_ACADEMIC_SESSION`                     | error    | Required value empty                                                                             |
| `INVALID_REGISTRATION_NUMBER`                                                                                            | error    | Not a valid registration number                                                                  |
| `UNKNOWN_PROGRAM`, `UNKNOWN_SESSION`, `UNKNOWN_DEPARTMENT`                                                               | error    | No record with that code or name (and no translation)                                            |
| `INACTIVE_PROGRAM`, `ARCHIVED_SESSION`, `INACTIVE_DEPARTMENT`, `PROGRAM_DEPARTMENT_MISMATCH`                             | error    | Shared registration relation rules                                                               |
| `INVALID_DATE`, `AMBIGUOUS_DATE`, `INVALID_DATE_ORDER`                                                                   | error    | Date problems                                                                                    |
| `INVALID_STATUS`, `VALUE_TOO_LONG`, `INVALID_VALUE`, `FORMULA_NOT_ALLOWED`, `CELL_ERROR`                                 | error    | Cell problems                                                                                    |
| `DUPLICATE_REGISTRATION_IN_FILE`                                                                                         | error    | Same number on several rows (every occurrence is flagged)                                        |
| `PROGRAM_CHANGE_NOT_ALLOWED`, `SESSION_CHANGE_NOT_ALLOWED`, `DEPARTMENT_CHANGE_NOT_ALLOWED`, `STATUS_CHANGE_NOT_ALLOWED` | error    | Identity/relationship change to an existing registration                                         |
| `REGISTRATION_ALREADY_EXISTS`, `RECORD_CHANGED_SINCE_VALIDATION`                                                         | error    | Found at commit time (created/edited after validation)                                           |
| `DATE_OF_BIRTH_MISSING`, `ROLL_REFERENCE_MISSING`                                                                        | warning  | Empty in a column that other rows fill (new registrations); an entirely empty column never warns |
| `REGISTRATION_NUMBER_MAY_HAVE_LOST_ZEROS`                                                                                | warning  | Numeric registration number shorter than most rows — Excel may have removed leading zeros        |
| `COMPLETION_DATE_MISSING`                                                                                                | warning  | Status COMPLETED without a completion date                                                       |
| `ROLL_REFERENCE_CONFLICT`                                                                                                | warning  | Roll number used by another registration in the same program and session                         |

Test fixtures are generated in code (`@docversity/imports/testing`) with obviously fictitious values such
as `DEV-IMPORT-0001` / “Test Student 0001”; no spreadsheet with real data is committed.
