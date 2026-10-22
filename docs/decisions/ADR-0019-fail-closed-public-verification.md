# ADR-0019 — Fail-closed public verification before approved disclosure

Status: Accepted for Phase 13A after final visual and security approval on 2026-10-22.
No real public verification is activated.

## Context

The four public services need stable contracts without publishing private university records.
UI-04 is unmerged. Phase 12C's private eligibility contracts configure course certificate options;
they do not establish qualification, issuance or public disclosure authority. Legacy VerificationLog
enums do not represent UNAVAILABLE or admission-letter checks accurately.

## Decision

Add four explicit versioned public POST handlers returning a constant UNAVAILABLE outcome after
validation, shared Redis abuse limits and privacy-safe append-only audit persistence. Do not query
academic tables or MinIO, introduce activation flags, issue credentials or alter migrations.
Use the existing audit log with domain-separated keyed reference/client hashes; do not mislabel
an unavailable attempt as VALID, INVALID or NOT_FOUND in VerificationLog.

Build an independently testable `/verify` panel for later integration into UI-04, preserving the
existing homepage and authenticated portals. The product accepts only the unavailable response
schema; VERIFIED and NOT_VERIFIED are reserved contract vocabulary without runtime emitters.

## Consequences

Current responses make no claim about record existence or authenticity. Publication/issuance
provenance, approved minimal public fields, revocation/replacement rules, server-issued opaque
credentials, QR integrity, privacy-key lifecycle and retention must precede activation.
Phase 12C schemas remain private integration inputs and must never be projected into public
responses. Phase 12C is merged; Claude's Phase 12C.1 worktree and sample-selection implementation remain untouched. No public response consumes private eligibility or sample-preview contracts.

Detailed contracts, threat model, tests and screenshots:
[Phase 13A report](../development/phase-13a-public-verification-foundation.md).
