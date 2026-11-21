# ADR-0023: Student-uploaded academic and identity documents

Status: proposed (feature branch `feature/student-portal-simplification`).

## Context

The university asked for "My Documents" to let students upload their own academic certificates
(Class 10, Class 12, Bachelor's, Master's, others) and identity proofs (National ID, Passport, PAN
Card, Driving Licence, other). Until now students could never upload documents: historical documents
(ADR-0013) are staff evidence, and profile photos (ADR-0011) go through a review workflow. Identity
proofs are highly sensitive personal data, and the import pipeline deliberately never stores identity
numbers (CLAUDE.md §11).

## Decision

1. **New table `student_uploads`** (migration `20261122090000_student_uploads`), one row per
   `(student_id, category)`; `category` is the enum `StudentUploadCategory` (10 values). Replacing
   updates the row and points it at a new object; deleting removes the row and the object. Uploads
   are the student's own copies, not university records, so no lifecycle, review or history table is
   added — the audit log is the history.
2. **Files only.** No identity number, name, expiry date or uploaded file name is stored or returned.
   Download names are generated from the category (`identity-passport.pdf`).
3. **Same content rules as historical documents** (`inspectDocument`): PDF/JPEG/PNG by signature,
   declared type must match, PDFs without encryption/active content/object streams, images fully
   decoded within a pixel budget, 15 MiB (`HISTORICAL_DOCUMENT_RULES`, the existing proxy/edge body
   limit). A CHECK constraint repeats type, size, hash format and the key prefix.
4. **Images are stored only as a re-encoded copy without embedded metadata** (`createStudentCopy`,
   sharp; EXIF/GPS/XMP/IPTC/comments removed and verified). Unlike historical documents, the original
   image bytes are not kept: there is no evidential need, and the original may carry location data.
   PDFs are stored as uploaded, as historical documents are.
5. **Private object storage under generated keys** `students/<studentId>/uploads/<uuid>.<ext>`
   (`objectKeys.studentUpload`); keys are never returned.
6. **Ownership is server-side.** Student routes (`/student/uploads…`) take no student ID; the student
   comes from the session, and lookups are by `(studentId, category)`. Staff routes
   (`/students/:studentId/uploads…`) require the new permission **`studentUploads.read`**, granted to
   REGISTRAR and (via the catch-all) SUPER_ADMIN only; an upload ID must belong to the student in the
   path. Staff access is read-only.
7. **Audit** (metadata = IDs, category, flags only — never contents, names or ID numbers):
   `STUDENT_UPLOAD_SAVED` (`replaced` flag), `STUDENT_UPLOAD_DELETED`, `STUDENT_UPLOADS_VIEWED` (every
   staff list view, with the listed upload IDs) and `STUDENT_UPLOAD_DOWNLOADED` (every staff
   view/download). Student writes are audited inside the same transaction as the change.
8. **Headers and limits.** Files are served with `Cache-Control: private, no-store`, `nosniff` and a
   sandboxing CSP; lists with `no-store`. Rate limits (Redis, fail closed): 20 uploads/deletes per
   student account per hour, 60 own downloads per minute, 120 staff list/download requests per user
   per minute.
9. The staff view is a read-only "Student uploads" tab on the admin student detail page, loaded only
   when opened so the audit trail reflects deliberate views.

## Consequences

- **PDF metadata is kept.** Uploaded PDFs are stored byte-for-byte (as historical documents are), so
  document-info/XMP metadata (author, producer, dates) and EXIF inside embedded images remain in the
  stored file. Only images uploaded as JPEG/PNG are stripped. Stripping or re-rendering PDFs is a
  follow-up.
- **No retention period yet.** Files stay until the student deletes them; how long identity documents
  may be kept is an open university decision. A retention job and an orphan-object sweep (see below)
  are follow-ups.
- The upload rate limit is counted by `UploadThrottleInterceptor` before multer buffers the body, so
  a throttled client never makes the API read a 15 MB upload; deletes are counted in the service.

- A failed object delete after a committed replace/delete leaves an unreferenced private object
  (logged nowhere, referenced nowhere). A storage sweep can be added if this matters.
- "Others" and "Other Identity Proof" hold one file each; more slots need a schema change.
- No retention period is defined yet; files stay until the student deletes them. The university must
  decide retention for identity documents (open question).
- Staff cannot verify or annotate uploads; that would be a separate, reviewed workflow.
