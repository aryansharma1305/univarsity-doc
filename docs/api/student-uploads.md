# Student uploads

Academic and identity documents a student uploads about themself (ADR-0022). One file per category.
Files only: no identity numbers, names or uploaded file names are stored or returned.

Categories (`StudentUploadCategory`): `ACADEMIC_CLASS_10`, `ACADEMIC_CLASS_12`, `ACADEMIC_BACHELORS`,
`ACADEMIC_MASTERS`, `ACADEMIC_OTHER`, `IDENTITY_NATIONAL_ID`, `IDENTITY_PASSPORT`, `IDENTITY_PAN`,
`IDENTITY_DRIVING_LICENCE`, `IDENTITY_OTHER`. Labels: `STUDENT_UPLOAD_CATEGORY_LABELS`.

Item (`studentUploadSchema`): `{ id, category, contentType, sizeBytes, uploadedAt }`.

## Student (student session; unsafe methods need the student `X-CSRF-Token`)

| Method   | Path                                     | Result                                                    |
| -------- | ---------------------------------------- | --------------------------------------------------------- |
| `GET`    | `/api/v1/student/uploads`                | `{ data: StudentUpload[] }`, `no-store`                   |
| `POST`   | `/api/v1/student/uploads/:category`      | multipart `file`; upload or replace → `201 StudentUpload` |
| `DELETE` | `/api/v1/student/uploads/:category`      | `204`; `404` when nothing is uploaded                     |
| `GET`    | `/api/v1/student/uploads/:category/file` | the file; `?disposition=inline\|attachment`               |

Upload errors: `400 UNSUPPORTED_FILE` (type, content mismatch, active/encrypted PDF, unreadable image),
`400 VALIDATION_FAILED` (unknown category, no file), `413 FILE_TOO_LARGE` (> 15 MB),
`429` (more than 20 uploads/deletes per hour), `503` (storage unavailable; nothing changed).
Images are re-encoded without embedded metadata before storage; PDFs are stored as uploaded.

## Staff (`studentUploads.read`: REGISTRAR, SUPER_ADMIN)

| Method | Path                                           | Result                                         |
| ------ | ---------------------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/v1/students/:studentId/uploads`          | `{ data: StudentUpload[] }`; audited           |
| `GET`  | `/api/v1/students/:studentId/uploads/:id/file` | the file; audited; `404` if not this student's |

Read-only. Every list view (`STUDENT_UPLOADS_VIEWED`) and file view/download
(`STUDENT_UPLOAD_DOWNLOADED`) is audited; student uploads and deletes write `STUDENT_UPLOAD_SAVED` /
`STUDENT_UPLOAD_DELETED`. Audit metadata holds IDs, the category and flags only.

Files are sent with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and a
sandboxing `Content-Security-Policy`, under a generated file name.
