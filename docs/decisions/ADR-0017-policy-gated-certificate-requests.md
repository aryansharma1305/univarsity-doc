# ADR-0017: Policy-gated certificate applications before issuance

Status: Accepted for Phase 12B infrastructure

## Context

Students need a certificate catalogue and application history; staff need an authorized review
queue. University eligibility, evidence, fees, completion and signing policies are not supplied.
Existing Certificate and historical-document records are credentials/evidence, not applications.

## Decision

Add separate CertificateRequest and append-only CertificateRequestEvent tables. Preserve submitted
fields and the application policy snapshot. Enforce ownership, one open request per student/type,
expected versions, legal transitions and transactional event/audit writes. Database triggers enforce
immutable history and matching events independently of the API.

Expose four university-confirmed categories, with submissions disabled unless a complete approved
server-side policy exists. The only implemented eligibility evaluator is synthetic-test-only and
refuses production/development use. No runtime toggle or seed enables real submissions. Staff review
completion requires a separate explicit policy. Dedicated read/review permissions grant no Finance,
Rector, signing, publication or issuance authority.

Keep payment verification, Rector approval and issuance separate and unavailable. Correction
submission stays unavailable until authorized issued-certificate identity, eligibility and Finance
rules exist. No speculative correction payload or collectible fee is introduced.

## Consequences

The initial catalogue is truthful but unavailable for real applications. Isolated synthetic tests
exercise the lifecycle without enabling university policies. A future phase must implement approved
eligibility/evidence/Finance adapters and Rector authorization before activating processing. Feature
rollback retains application/history tables and all existing records; destructive rollback is excluded.

Implementation and verification: [Phase 12B report](../development/phase-12b-certificate-requests.md).
