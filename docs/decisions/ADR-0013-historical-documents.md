# ADR-0013: Historical documents are staff-managed evidence, separate from issued credentials

- **Status:** Accepted (amended 2026-10-09 before merge — see Amendment 1)
- **Date:** 2026-10-09

## Context

The university holds certificates and marksheets issued before Docversity (paper archives and the
legacy WordPress system, whose printed QR URLs must keep working). Students should be able to see
their own copies. Requirements B1–B3 and the architecture note (`student-portal-and-documents.md`)
call these documents evidence, not trusted digital credentials.

## Decision

1. **Separate table.** `historical_documents`, not `certificates`. The certificate registry and any
   future public verification can therefore never mistake an uploaded scan for a Docversity-issued
   credential.
2. **Staff-only writes.** Upload, edit, replace, publish, withdraw and review are staff endpoints with
   four permissions (read, upload, publish, verify). Students have read-only, ownership-scoped endpoints
   for PUBLISHED documents only.
3. **Visibility ≠ authenticity.** Status (DRAFT/PUBLISHED/WITHDRAWN/SUPERSEDED) controls what the student
   sees. Authenticity (UNVERIFIED/CONFIRMED_AGAINST_RECORDS/DISPUTED) is a separate, explicit staff review
   by someone other than the uploader. Wording never claims cryptographic or public verification.
4. **History is never rewritten.** No deletes; the file and owner are immutable; metadata is frozen once
   published; corrections are replacements that supersede the original atomically (database trigger +
   CHECKs + partial unique indexes).
5. **Original bytes are kept.** Files are validated by content (static PDFs, decodable images) but
   stored unchanged with a SHA-256, so the stored copy is exactly what the university received.
6. **Legacy identifiers are preserved as given** (certificate number as printed, legacy system, record
   id, printed verification URL). `legacy_mappings`, WordPress data and printed QR URLs are not touched;
   mapping legacy QR codes to these records belongs to the public-verification phase.

## Consequences

- ~~Image metadata (EXIF) in uploaded scans is kept with the original; files are only shown to authorised
  staff and their own student.~~ Superseded by amendment 1: the original keeps it (staff-only evidence),
  students receive a copy without it.
- Bulk migration of legacy documents (manifest + files) is future work on the import subsystem.
- Withdrawn/superseded files stay in private storage indefinitely until a retention policy is agreed.

## Amendment 1 (2026-10-09, pre-merge hardening)

Manual acceptance showed that student downloads of image scans exposed embedded GPS coordinates, a camera
serial number and a scanner operator's name, that certificate numbers were trimmed, and that a
replacement with the same title was ambiguous.

7. **Students receive a metadata-free copy of every image document; the original stays evidence.**
   At upload (or via an idempotent backfill for older rows) a separate object is re-encoded from the
   decoded pixels with `sharp`: orientation applied, sRGB, no resizing, JPEG quality 95 without chroma
   subsampling (PNG lossless), DPI kept in JFIF/pHYs. It is verified at creation and on every read
   (SHA-256 + a structural allow-list of JPEG segments/PNG chunks). Student endpoints serve only the copy
   for images and never fall back to the original; the database refuses to publish an image without one
   and freezes the copy once set. Staff see only the kinds of metadata found (location warning), never
   values. _Rejected:_ lossless byte-level stripping of metadata segments (orientation would then need a
   rewritten EXIF block, and unknown segments could survive); serving the original to students.
8. **Certificate numbers have two forms.** The raw value is stored exactly as provided (invisible/control
   characters are refused, not removed). A separate normalised column (NFKC, upper-case, letters and
   digits) drives search and the same-number warning only.
9. **Versions are identified by reference and revision**, not by title: every document has a short
   reference (random tail of its UUIDv7) and a revision number within its replacement chain; the staff
   detail lists the whole chain.

Additional consequences: PDF documents are still delivered as uploaded; their document-information/XMP
metadata and images embedded inside them are not sanitised (documented risk, decision pending). Rows
created before the hardening migration keep their trimmed certificate numbers. Re-encoding JPEG once at
q95 4:4:4 is visually lossless for scans (tests require ≥ 40 dB PSNR) but not bit-identical — the
bit-identical file is the original, available to authorised staff.
