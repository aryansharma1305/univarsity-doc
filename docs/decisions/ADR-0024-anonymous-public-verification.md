# ADR-0024: Anonymous public verification under explicit policy allowlists

- Status: Accepted (implementation); every disclosure still needs university authorization
- Date: 2026-11-22

## Context

The mentor-approved homepage must let visitors use all four services (registration, admission
letter, certificate, result) without signing in. Until now, registration and result checks required
the owning student's session (`identityFactor: 'AUTHENTICATED_OWNER'`), and document checks returned
only minimal metadata. Course + roll number + semester, a registration number or a date of birth are
identifiers, not secrets; treating them as passwords would let anyone harvest records.

## Decision

1. **Opt-in per course and service.** A verification policy definition may carry an optional
   `publicDisclosure` block: `{ anonymousLookup: true, fields: [...], documentWithCredential }`.
   Without it nothing changes (owner path, existing QR/number checks). The 12 policies in production
   have no such block, so this release discloses nothing new until the university approves new
   policies through the existing two-person workflow (proposer ≠ approver, server gate).
2. **Fixed allowlists in code.** `PUBLIC_DISCLOSURE_FIELDS` lists the only fields each service can
   ever return anonymously. Photos, dates of birth, nationality, identity numbers, contact details and
   student uploads are absent and cannot be enabled by policy. Proposals with other fields are 400.
3. **Disclosure follows the latest approved policy; validity follows the issuing policy.** A document
   is valid only under the policy it was issued under (unchanged). What an anonymous visitor sees is
   decided by the course's latest approved policy, so withdrawing it removes disclosure at once.
4. **No enumeration oracle.** An unknown number, a record in a course without anonymous disclosure,
   an unpublished period and an ambiguous roll number all return the same response.
5. **Credentials for confidential content.** Issued PDFs and full marksheets require the record's
   43-character random QR credential, sent in the POST body (links keep it in the URL fragment, which
   is never sent to servers). Result publications now get such a credential
   (`result_publications.verification_token`, migration `20261129090000_result_verification_token`);
   only the owning student sees the marksheet QR link. Course + roll number + semester reveal a
   published status (and, if approved, the outcome) — never marks.
6. **Same controls as before.** Per-client and per-reference rate limits, strict bodies (no query
   parameters), `no-store`, uniform failure handling, and one audit event per check with hashed
   references only (never the credential).

## Consequences

- The public UI can show the mentor layouts with real data as soon as the university approves fields.
- Documents issued before a disclosure policy is approved gain the approved fields automatically;
  their PDFs open only for QR holders and only if `documentWithCredential` is approved.
- Publications made before this migration have no marksheet credential (status-only verification).
- Student photographs remain unavailable publicly; adding them needs a separate, explicitly approved
  design (consent, minimised image, credential-gated delivery).
