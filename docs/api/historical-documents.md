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

| Method | Path                                                                                             | Permission                    | Purpose                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/historical-documents`                                                                   | `historicalDocuments.read`    | List; `search` (title, number, student, registration), `status`, `documentType`, `authenticity`, `studentRegistrationId`, paging                         |
| POST   | `/api/v1/historical-documents`                                                                   | `historicalDocuments.upload`  | Upload (multipart, see below) → `201` DRAFT                                                                                                              |
| GET    | `/api/v1/historical-documents/:id`                                                               | `historicalDocuments.read`    | Detail: provenance, legacy identifiers, lifecycle, replacement chain, same-number warnings, history                                                      |
| PATCH  | `/api/v1/historical-documents/:id`                                                               | `historicalDocuments.upload`  | Edit metadata of a DRAFT (`409 DOCUMENT_NOT_EDITABLE` otherwise)                                                                                         |
| POST   | `/api/v1/historical-documents/:id/replace`                                                       | `historicalDocuments.upload`  | Upload a corrected file for a PUBLISHED/WITHDRAWN document → new DRAFT                                                                                   |
| POST   | `/api/v1/historical-documents/:id/publish`                                                       | `historicalDocuments.publish` | Publish (supersedes the published original of a replacement)                                                                                             |
| POST   | `/api/v1/historical-documents/:id/withdraw`                                                      | `historicalDocuments.publish` | `{ reason }` (5–1000 chars, staff-only); hides from the student                                                                                          |
| POST   | `/api/v1/historical-documents/:id/authenticity`                                                  | `historicalDocuments.verify`  | `{ authenticity: CONFIRMED_AGAINST_RECORDS \| DISPUTED, note }`; `403` for the uploader                                                                  |
| GET    | `/api/v1/historical-documents/:id/file?disposition=inline\|attachment&variant=original\|student` | `historicalDocuments.read`    | `original` (default): the evidential upload; `student`: exactly what the student receives (409 `DOCUMENT_NOT_READY` while an image has no copy); audited |

Roles: REGISTRAR and SUPER_ADMIN have all four; CERTIFICATE_ADMIN reads and uploads (prepares);
APPROVER reads, publishes and verifies (checks); VIEWER and EXAM_ADMIN have no access (personal documents).

### Upload (multipart/form-data)

Fields: `file` (one PDF, JPEG or PNG, ≤ 15 MB), `studentRegistrationId`, `documentType`
(`DEGREE_CERTIFICATE`, `DIPLOMA_CERTIFICATE`, `PROVISIONAL_CERTIFICATE`, `MARKSHEET`, `TRANSCRIPT`,
`MIGRATION_CERTIFICATE`, `CHARACTER_CERTIFICATE`, `OTHER`), `title`, `provenance`
(`UNIVERSITY_ARCHIVE`, `LEGACY_WORDPRESS`, `STUDENT_PROVIDED_COPY`, `OTHER`), and optionally
`certificateNumber` (exactly as printed — see "Certificate numbers"), `issuedOn`, `provenanceNote`, `legacySourceSystem`, `legacyRecordId`,
`legacyVerificationUrl` (http/https, reference only — never fetched or rewritten). Unknown fields are
refused.

File checks (by content, never by name or declared type): the signature must be PDF/JPEG/PNG and
match the declared type; PDFs must end with `%%EOF`, must not be encrypted and must not contain active
content (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile(s)`, `/RichMedia`, `/XFA`, `/SubmitForm`,
`/ImportData`, `/GoToE`, `/Sound`, `/Movie`) — including inside Flate-compressed (object) streams and
`#xx`-escaped names, with a 64 MB inflate budget; images must decode fully within 100 megapixels,
be a single still image and at least 300 px on each side. The **original bytes are stored unchanged**
under `documents/<registrationId>/<uuid>.<pdf|jpg|png>` with their SHA-256; the same file cannot be
uploaded twice for one registration (`409`). For JPEG/PNG the student copy (below) is created and
verified **before** anything is stored; if that fails the upload is refused (`400`) and nothing is
stored. Storage outage → `503`, nothing recorded; a failed database write deletes the just-stored
objects.

### Student copies of image documents (embedded metadata)

Scans and photos carry embedded metadata — GPS coordinates, camera/scanner make, model and serial
number, operator or author names, capture time, descriptions, XMP/IPTC blocks, PNG text chunks and
embedded thumbnails. The **original is kept unchanged** (private object, SHA-256, staff-only evidence).
Students receive a **separate copy** (`documents/<registrationId>/student-copy-<uuid>.<jpg|png>`, own
SHA-256):

- re-encoded from the decoded pixels with `sharp`, so nothing embedded travels with it; EXIF orientation
  applied to the pixels; colours converted to sRGB with a standard (non-identifying) profile;
- **not resized**; JPEG re-encoded once at quality 95 without chroma subsampling, PNG lossless; print
  resolution (DPI) kept in the JFIF header / pHYs chunk, not in EXIF;
- verified at creation (format, dimensions after orientation, full decode) and checked **on every read**
  against its SHA-256 and a structural allow-list (JPEG: JFIF APP0, ICC APP2 and image segments only —
  no APP1/APP13/COM/other APPn or trailing data; PNG: IHDR/PLTE/IDAT/IEND/tRNS/pHYs/iCCP/sRGB/gAMA/cHRM/
  sBIT/bKGD only).

**No fallback, ever.** The student endpoints serve only the copy for images. A document without a copy
is `409 DOCUMENT_NOT_READY` (the student list marks it `available: false`, "being prepared"); a missing
or altered copy is `503`. The original image is never served to a student in its place. The database
refuses to publish an image without a copy, and the copy's fields are set once and then immutable.

Staff see only the **kinds** of metadata found in the original (`embeddedMetadata.categories`:
`LOCATION`, `DEVICE`, `PERSON`, `TEXT`, `OTHER`) and a warning when it includes location; values are never
stored, logged or audited.

**Backfill (images uploaded before this change):**

```bash
pnpm documents:backfill-student-copies --dry-run   # check only: stores and changes nothing
pnpm documents:backfill-student-copies             # create the missing copies
```

Prints the target database and bucket and one line per document (`CREATED`, `WOULD_CREATE`,
`ALREADY_DONE`, `ORIGINAL_MISSING`, `ORIGINAL_CHANGED`, `SANITIZATION_FAILED`, `STORAGE_ERROR`,
`DATABASE_ERROR`); exit code 1 if any document could not be given a copy. Safe to repeat and to run while
the API serves requests: originals are only read and must still match their recorded SHA-256 (altered
evidence is reported, never used); each copy is a new object; the row is updated under a row lock only if
it still has no copy, otherwise the new object is removed again; superseded documents are skipped.

### Remaining PDF metadata risks

PDFs are delivered to students as uploaded (after the static-content checks above). A PDF can still carry
a document information dictionary and XMP (author, creator/producer software, creation dates, titles) and
embedded scan images that keep their own EXIF (including GPS). These are not removed: rewriting a PDF
safely would change the evidential file or need a full re-rendering pipeline. Mitigation today: files are
shown only to authorised staff and the document's own student. Options for a later decision: inspect and
warn (like images), or deliver a re-rendered image-only PDF as the student copy.

### Certificate numbers

`certificateNumber` is stored and returned **exactly as provided** — never trimmed or rewritten (rows
created before the hardening migration were stored trimmed). Blank (only whitespace) means "none". Line
breaks, tabs and invisible formatting characters (Unicode `Cc`/`Cf`, e.g. bidi overrides) are refused with
`400` rather than silently removed; at least one letter or digit is required; at most 64 characters.

`certificateNumberNormalized` (staff detail only) is used for search and the same-number warning, never
displayed as the number: Unicode NFKC (folds full-width and compatibility forms), upper-case, letters and
digits only. `"ACC/CERT/1001 "`, `"acc-cert 1001"` and `"ＡＣＣ／ＣＥＲＴ／１００１"` all normalise to
`ACCCERT1001`. Search matches the raw number (substring, case-insensitive) or the normalised form; the
same-number warning compares normalised forms across other registrations (a warning, never a block).

### Identifying versions

Every document has a short `reference` (`HD-1B97-2390`, the random tail of its UUIDv7; display only, the
`id` is authoritative). The detail response adds `revision` (1 for the first document of a chain, 2 for
its replacement, …), `replaces`/`replacedBy` and `versions` (the whole chain, oldest first), each with
`id`, `reference`, `revision`, `title`, `certificateNumber`, `status`, `createdAt` and `publishedAt`, so
versions stay distinguishable when their titles are identical. A withdrawn replacement attempt keeps its
revision number. List rows include `reference` and `isReplacement`.

## Student endpoints (student session)

| Method | Path                                              | Purpose                                                                                                                                                                               |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/student/documents`                       | Own PUBLISHED documents (no staff identities, notes or keys); `reference`, `available`                                                                                                |
| GET    | `/api/v1/student/documents/:id/file?disposition=` | Own PUBLISHED file — for images only the metadata-free copy (`409 DOCUMENT_NOT_READY` until it exists, `503` if missing/altered; never the original); anything else is `404`; audited |

There are no student upload, edit, replace, delete or publish routes.

## File responses

`Content-Type` from the stored (re-sniffed) content, `Content-Disposition` with a generated name
(`historical-document-<last 8 hex digits of the id>.<ext>`; the uploaded name is never echoed into a header),
`Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and a restrictive
`Content-Security-Policy` (`default-src 'none'`). Storage keys and object URLs are never returned.

## Audit

`HISTORICAL_DOCUMENT_UPLOADED`, `_UPDATED`, `_PUBLISHED`, `_WITHDRAWN`, `_REPLACED`,
`_AUTHENTICITY_REVIEWED`, `_DOWNLOADED` (staff and student, `principal` and `variant` in metadata),
`_STUDENT_COPY_CREATED` (backfill, no actor). Metadata holds IDs, registration numbers, types, sizes,
hashes (original and student copy) and embedded-metadata **kinds** — never withdrawal reasons, review
notes, metadata values or file content.
