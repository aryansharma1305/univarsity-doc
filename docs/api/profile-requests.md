# Student profile change requests (Phase 7)

Students propose corrections to their **own personal details** and a photo; staff approve or reject.
The official `students` row changes **only** on approval. Academic data (program, session, department,
registration status, admission/completion dates, registration number) is never student-editable.

Contracts: `packages/validation/src/student-profile/schemas.ts`. Architecture decision: [ADR-0011](../decisions/ADR-0011-profile-change-requests.md).

## Student endpoints (student session cookie + student CSRF token)

The student is taken from the session on every request; no endpoint accepts a student, account or
registration identifier. Another student's request is answered with `404`.

| Method | Path                                          | Purpose                                                                             |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/v1/student/profile-requests`            | Own requests, newest first (≤ 50)                                                   |
| POST   | `/api/v1/student/profile-requests`            | Submit (multipart: `changes` JSON, optional `note`, optional `photo`) → `201`       |
| GET    | `/api/v1/student/profile-requests/:id`        | One own request                                                                     |
| POST   | `/api/v1/student/profile-requests/:id/cancel` | Cancel an own PENDING request → `200` (`409 PROFILE_REQUEST_NOT_PENDING` otherwise) |
| GET    | `/api/v1/student/profile-requests/:id/photo`  | The photo submitted with an own request (`Cache-Control: no-store`)                 |
| GET    | `/api/v1/student/photo`                       | Own official photo (`404` when none)                                                |

Submission rules:

- `changes` may contain `fullName`, `fatherName`, `motherName` (letters, spaces, `. ' -`, ≤ 200),
  `gender` (`Female`, `Male`, `Transgender`, `Other`) and `dateOfBirth` (`YYYY-MM-DD`, age 10–100).
  Unknown keys and unknown multipart fields are refused (`400`).
- `dateOfBirth` can only be **submitted when it is missing**; an existing date is corrected by the
  registrar's office.
- A value equal to the official value is a field error; an empty request is `400 PROFILE_REQUEST_NO_CHANGES`.
- **One PENDING request per student** (`409 PROFILE_REQUEST_PENDING`), enforced by a partial unique index.
- Photo: declared `image/jpeg|png|webp`, ≤ 5 MB (`413 FILE_TOO_LARGE`), decoded server-side (content, not
  the name or declared type, decides), a single still image, 200×200 to 8000×8000 px
  (`400 UNSUPPORTED_FILE`). It is auto-oriented, resized to ≤ 1200 px and re-encoded as JPEG **without
  metadata** (EXIF/GPS removed), then stored privately under `students/<studentId>/photos/<uuid>.jpg`.
- Storage outage: `503 SERVICE_UNAVAILABLE`, nothing recorded. If recording fails after upload, the
  stored photo is deleted.

## Staff endpoints (staff session + staff CSRF token)

| Method | Path                                                            | Permission                      | Purpose                                                                                                  |
| ------ | --------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/profile-requests`                                      | `studentProfileRequests.read`   | List; `search` (name/registration number), `status`, paging; `sortBy=submittedAt` (default oldest first) |
| GET    | `/api/v1/profile-requests/:id`                                  | `studentProfileRequests.read`   | Submitted vs proposed vs current official values, `stale`, history (audit), other requests               |
| GET    | `/api/v1/profile-requests/:id/photo?variant=proposed\|official` | `studentProfileRequests.read`   | Proposed photo or the student's current official photo                                                   |
| POST   | `/api/v1/profile-requests/:id/approve`                          | `studentProfileRequests.review` | Apply the requested fields (atomic, see below)                                                           |
| POST   | `/api/v1/profile-requests/:id/reject`                           | `studentProfileRequests.review` | `{ reason }` (5–1000 characters, shown to the student)                                                   |

Both permissions are granted to `REGISTRAR` (and `SUPER_ADMIN`). Students can never call these routes
(`401`), and staff sessions can never call the student routes (`401`).

## Approval

In one transaction: lock the request (`FOR UPDATE`), require `PENDING`, lock the student row, compare every
requested field — and, for a photo request, the photo key — with the snapshot taken at submission. Any
difference → `409 PROFILE_REQUEST_STALE` (details name the fields) and nothing changes; staff reject it and
the student resubmits. Otherwise only the requested fields (and the photo key) are written, the request
becomes `APPROVED` with the reviewer and time, and two audit entries are written
(`STUDENT_PROFILE_REQUEST_APPROVED`, `STUDENT_UPDATED` with `source: "profileRequest"`). Concurrent
approve/reject/cancel calls serialise on the row lock: exactly one wins, the others get `409`.

Rejection and cancellation never touch `students`. Audit metadata holds IDs and field **names** only —
never proposed values, the rejection reason or storage keys.
