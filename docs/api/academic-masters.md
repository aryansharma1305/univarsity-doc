# Academic masters API (Phase 4)

All endpoints are under `/api/v1`, require a staff session, and are permission-checked. Mutations need
`X-CSRF-Token`. Request and response bodies are the shared Zod schemas in
`packages/validation/src/academic` (also rendered in Swagger at `/api/docs`).

## List contract

```
GET /api/v1/<resource>?page=1&pageSize=25&search=…&status=…&sortBy=<allow-listed>&sortOrder=asc|desc
→ { "data": [...], "meta": { "page": 1, "pageSize": 25, "total": 100, "totalPages": 4 } }
```

`pageSize` ≤ 100. `sortBy` must be one of the resource's allow-listed fields; unknown query parameters are
rejected (`400 VALIDATION_FAILED`). Malformed or unknown IDs answer `404`.

| Resource          | Sort fields                                      | Filters                                                 | Search                                                   |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------- |
| departments       | code, name, status, updatedAt                    | status                                                  | code, name                                               |
| programs          | code, name, level, status, updatedAt             | status, departmentId                                    | code, name                                               |
| academic-sessions | code, name, startsOn, status, updatedAt          | status                                                  | code, name                                               |
| students          | fullName, updatedAt, createdAt                   | status, programId, academicSessionId (on registrations) | full name, registration number                           |
| registrations     | registrationNumber, status, updatedAt, createdAt | status, programId, academicSessionId, studentId         | registration number, roll/reference number, student name |

## Endpoints

| Method & path                                             | Permission                               | Notes                                                                                      |
| --------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /dashboard`                                          | signed in                                | Real counts; `recentActivity` only with `audit.read`                                       |
| `GET /departments`, `GET /departments/:id`                | `departments.read`                       |                                                                                            |
| `POST /departments`                                       | `departments.write`                      | `{ code, name, status? }`                                                                  |
| `PATCH /departments/:id`                                  | `departments.write`                      | Any subset; deactivate via `status` (no delete)                                            |
| `GET /programs`, `GET /programs/:id`                      | `programs.read`                          |                                                                                            |
| `POST /programs`, `PATCH /programs/:id`                   | `programs.write`                         | `level`, `durationSemesters`, `departmentId` optional; department must exist and be active |
| `GET /academic-sessions`, `GET /academic-sessions/:id`    | `academicSessions.read`                  |                                                                                            |
| `POST /academic-sessions`, `PATCH /academic-sessions/:id` | `academicSessions.write`                 | Dates optional; `endsOn ≥ startsOn`, re-checked against stored values on PATCH             |
| `GET /students`, `GET /students/:id`                      | `students.read`                          | List items carry the latest registration                                                   |
| `GET /students/:id/activity`                              | `students.read`                          | Safe audit summaries for the student and their registrations                               |
| `POST /students`                                          | `students.write` + `registrations.write` | `{ student: {...}, registration: {...} }` — one transaction                                |
| `PATCH /students/:id`                                     | `students.write`                         | Personal details                                                                           |
| `GET /registrations`, `GET /registrations/:id`            | `registrations.read`                     |                                                                                            |
| `POST /registrations`                                     | `registrations.write`                    | Adds a registration to an existing student                                                 |
| `PATCH /registrations/:id`                                | `registrations.write`                    | Includes status changes                                                                    |

## Business rules (server-side)

- **No deletes.** Departments, programs and sessions are deactivated/archived via `status`; students and
  registrations are never deleted (registration `status` covers suspension/revocation).
- **Codes and registration numbers** are unique; registration numbers are compared case-insensitively
  (`upper(trim())`, enforced by the database). Conflicts return `409 CONFLICT` with
  `details: [{ path, message }]` so forms can show them next to the field.
- **Relations are resolved on the server** — client-supplied IDs are never trusted as-is:
  - a program being assigned must exist and be **ACTIVE**; a session being assigned must not be **ARCHIVED**;
  - if the program belongs to a department, the registration's department **must be that department**
    (filled in automatically when omitted; a different one is rejected with `400` on `departmentId`);
  - otherwise the department is optional but must be ACTIVE when assigned.
- **Transactions:** `POST /students` creates the student, the registration and both audit entries in
  ONE database transaction. Any failure (duplicate registration number, inactive program, …) rolls
  everything back — no orphan student. Every other mutation also commits its audit entry in the same
  transaction as the change.
- **Dates:** `completionDate ≥ admissionDate`; `endsOn ≥ startsOn` — checked against the merged
  (stored + submitted) values on PATCH.

## Audit events

| Action                                                                | Metadata (safe — no personal values)               |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| `DEPARTMENT_CREATED` / `PROGRAM_CREATED` / `ACADEMIC_SESSION_CREATED` | `code`, `status`                                   |
| `DEPARTMENT_UPDATED` / `PROGRAM_UPDATED` / `ACADEMIC_SESSION_UPDATED` | `code`, `changedFields`                            |
| `*_STATUS_CHANGED`                                                    | `code`, `from`, `to`                               |
| `STUDENT_CREATED`                                                     | —                                                  |
| `STUDENT_UPDATED`                                                     | `changedFields` (names only)                       |
| `REGISTRATION_CREATED`                                                | `studentId`, `registrationNumber`, `status`        |
| `REGISTRATION_UPDATED`                                                | `studentId`, `registrationNumber`, `changedFields` |
| `REGISTRATION_STATUS_CHANGED`                                         | `studentId`, `registrationNumber`, `from`, `to`    |

The Activity tab and dashboard show server-generated summaries ("Registration X status changed from active
to suspended", "Personal details updated (date of birth)"), never raw metadata.

## Photos

Student photo upload is **deferred**: the UI shows initials. The schema keeps `photo_storage_key`; upload
will use the existing S3 abstraction with image-type validation and private, signed retrieval when built.
