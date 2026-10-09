# Historical documents and the student document library (Phase 8)

Staff upload previously issued certificates, marksheets and similar documents (paper scans or files
from the legacy system) as **evidence**, link each to one student registration, and publish it to that
student. These are **not** Docversity-issued credentials (`certificates`) and are never presented as
cryptographically or publicly verified. Contracts: `packages/validation/src/historical-documents/schemas.ts`.
Decision record: [ADR-0013](../decisions/ADR-0013-historical-documents.md).

## Lifecycle

| Status       | Student can see it | How it gets there                                                    |
| ------------ | ------------------ | -------------------------------------------------------------------- |
| `DRAFT`      | no                 | upload (or replacement upload)                                       |
| `PUBLISHED`  | yes                | explicit publish (from DRAFT, or again from WITHDRAWN)               |
| `WITHDRAWN`  | no                 | withdraw with a reason (from DRAFT or PUBLISHED); can be republished |
| `SUPERSEDED` | no                 | its replacement is published; final                                  |

Nothing is ever deleted (database trigger). Metadata changes only while `DRAFT`; a published
document is corrected by a **replacement**: a new draft linked to the original that supersedes it,
in the same transaction, when published.

**Authenticity** is a separate field, `UNVERIFIED` → `CONFIRMED_AGAINST_RECORDS` | `DISPUTED`, recorded
with a note by a reviewer who is **not** the uploader (enforced by the API and a database CHECK).
Publishing never implies authenticity, and verifying never publishes.

## Staff endpoints (staff session; unsafe methods need the staff CSRF token)

| Method | Path                                                                   | Permission                    | Purpose                                                                                                                          |
| ------ | ---------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/historical-documents`                                         | `historicalDocuments.read`    | List; `search` (title, number, student, registration), `status`, `documentType`, `authenticity`, `studentRegistrationId`, paging |
| POST   | `/api/v1/historical-documents`                                         | `historicalDocuments.upload`  | Upload (multipart, see below) → `201` DRAFT                                                                                      |
| GET    | `/api/v1/historical-documents/:id`                                     | `historicalDocuments.read`    | Detail: provenance, legacy identifiers, lifecycle, replacement chain, same-number warnings, history                              |
| PATCH  | `/api/v1/historical-documents/:id`                                     | `historicalDocuments.upload`  | Edit metadata of a DRAFT (`409 DOCUMENT_NOT_EDITABLE` otherwise)                                                                 |
| POST   | `/api/v1/historical-documents/:id/replace`                             | `historicalDocuments.upload`  | Upload a corrected file for a PUBLISHED/WITHDRAWN document → new DRAFT                                                           |
| POST   | `/api/v1/historical-documents/:id/publish`                             | `historicalDocuments.publish` | Publish (supersedes the published original of a replacement)                                                                     |
| POST   | `/api/v1/historical-documents/:id/withdraw`                            | `historicalDocuments.publish` | `{ reason }` (5–1000 chars, staff-only); hides from the student                                                                  |
| POST   | `/api/v1/historical-documents/:id/authenticity`                        | `historicalDocuments.verify`  | `{ authenticity: CONFIRMED_AGAINST_RECORDS \| DISPUTED, note }`; `403` for the uploader                                          |
| GET    | `/api/v1/historical-documents/:id/file?disposition=inline\|attachment` | `historicalDocuments.read`    | The original file; audited                                                                                                       |

Roles: REGISTRAR and SUPER_ADMIN have all four; CERTIFICATE_ADMIN reads and uploads (prepares);
APPROVER reads, publishes and verifies (checks); VIEWER and EXAM_ADMIN have no access (personal documents).

### Upload (multipart/form-data)

Fields: `file` (one PDF, JPEG or PNG, ≤ 15 MB), `studentRegistrationId`, `documentType`
(`DEGREE_CERTIFICATE`, `DIPLOMA_CERTIFICATE`, `PROVISIONAL_CERTIFICATE`, `MARKSHEET`, `TRANSCRIPT`,
`MIGRATION_CERTIFICATE`, `CHARACTER_CERTIFICATE`, `OTHER`), `title`, `provenance`
(`UNIVERSITY_ARCHIVE`, `LEGACY_WORDPRESS`, `STUDENT_PROVIDED_COPY`, `OTHER`), and optionally
`certificateNumber` (as printed), `issuedOn`, `provenanceNote`, `legacySourceSystem`, `legacyRecordId`,
`legacyVerificationUrl` (http/https, reference only — never fetched or rewritten). Unknown fields are
refused.

File checks (by content, never by name or declared type): the signature must be PDF/JPEG/PNG and
match the declared type; PDFs must end with `%%EOF`, must not be encrypted and must not contain active
content (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile(s)`, `/RichMedia`, `/XFA`, `/SubmitForm`,
`/ImportData`, `/GoToE`, `/Sound`, `/Movie`) — including inside Flate-compressed (object) streams and
`#xx`-escaped names, with a 64 MB inflate budget; images must decode fully within 100 megapixels,
be a single still image and at least 300 px on each side. The **original bytes are stored unchanged**
under `documents/<registrationId>/<uuid>.<pdf|jpg|png>` with their SHA-256; the same file cannot be
uploaded twice for one registration (`409`). Storage outage → `503`, nothing recorded; a failed
database write deletes the just-stored object.

## Student endpoints (student session)

| Method | Path                                              | Purpose                                                      |
| ------ | ------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/v1/student/documents`                       | Own PUBLISHED documents (no staff identities, notes or keys) |
| GET    | `/api/v1/student/documents/:id/file?disposition=` | Own PUBLISHED file; anything else is `404`; audited          |

There are no student upload, edit, replace, delete or publish routes.

## File responses

`Content-Type` from the stored (re-sniffed) content, `Content-Disposition` with a generated name
(`historical-document-<id8>.<ext>`; the uploaded name is never echoed into a header),
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and a restrictive
`Content-Security-Policy` (`default-src 'none'`). Storage keys and object URLs are never returned.

## Audit

`HISTORICAL_DOCUMENT_UPLOADED`, `_UPDATED`, `_PUBLISHED`, `_WITHDRAWN`, `_REPLACED`,
`_AUTHENTICITY_REVIEWED`, `_DOWNLOADED` (staff and student, `principal` in metadata). Metadata holds IDs,
registration numbers, types, sizes and hashes — never withdrawal reasons, review notes or file content.
