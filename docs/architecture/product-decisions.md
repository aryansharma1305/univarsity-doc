# Product decisions already agreed

These decisions are **documented now and implemented in later phases**. None of them is implemented in
Phase 1. Where the initial planning document disagrees, this file wins.

## A. Public result lookup

- The final flow is **Registration Number + a second reference identifier**.
- The second identifier is **not confirmed** by the client. It must **not** be hard-coded as date of birth
  (or anything else) until the client decides.
- Implementation requirements when built: published results only; identical responses for "not found" and
  "identifier mismatch"; strict rate limiting; every attempt recorded in the verification log.

## B. Imports — one subsystem

- A single import subsystem under **`/admin/imports`** serves both **`STUDENT`** and **`RESULT`** imports
  (import history, new import, and the import wizard for a given import).
- Students and Results pages link into it; there is no separate `/admin/results/import` implementation.
- Flow: upload → detect columns → map fields → validate → preview errors → import valid rows →
  downloadable error report. Validation and import run in the worker.
- Official marks are never auto-corrected ("set to max") or edited inline during review.

## C. Historic QR compatibility

- Certificates issued by the legacy WordPress system carry QR codes / verification URLs that already
  exist in **printed documents** (legacy host: `verify.thedocversity.com`).
- The new system must eventually provide **compatibility/redirect mapping** so every legacy URL keeps
  resolving to the correct authoritative record.
- **Phase 1 does not change, redirect or touch any existing QR URL.** The legacy WordPress project is a
  data/URL-compatibility reference only and is never modified.

## D. Certificate verification — one authoritative record

- Verification by **certificate number** and by **QR token** must query **one authoritative certificate
  record**.
- The legacy system's split between two unrelated certificate stores (number-verification table vs
  generated-certificate table) must **never be recreated**. Legacy data from both stores will be migrated
  and reconciled into the single certificate model.

## E. Unsupported claims

The product must not state or imply any of the following unless the capability is actually implemented
**and** formally confirmed by the client in writing:

- Blockchain / distributed ledger / Arweave
- ISO 27001 (or any other certification)
- "GDPR compliant", "FERPA compliant"
- HSM-protected keys, PKI / digital signing

This applies to UI copy, documents, PDFs, marketing pages, API descriptions and documentation.

## Routing reference (agreed targets)

Public: `/`, `/results`, `/verify/registration`, `/verify/certificate`, `/verify/qr`, `/verify/qr/[token]`,
`/document/[token]` (only if the client approves public document access by token).

Admin: `/admin/login`, `/admin`, `/admin/students`, `/admin/students/[id]`, `/admin/results`,
`/admin/results/[id]`, `/admin/examinations`, `/admin/imports`, `/admin/imports/new`,
`/admin/imports/[id]`, `/admin/certificates`, `/admin/certificates/generate`,
`/admin/certificates/[id]`, `/admin/templates`, `/admin/logs`, `/admin/users`, `/admin/settings`.
