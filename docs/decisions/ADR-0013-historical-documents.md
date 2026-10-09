# ADR-0013: Historical documents are staff-managed evidence, separate from issued credentials

- **Status:** Accepted
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

- Image metadata (EXIF) in uploaded scans is kept with the original; files are only shown to authorised
  staff and their own student.
- Bulk migration of legacy documents (manifest + files) is future work on the import subsystem.
- Withdrawn/superseded files stay in private storage indefinitely until a retention policy is agreed.
