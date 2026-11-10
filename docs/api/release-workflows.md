# Synthetic release workflows

This release-candidate foundation is unavailable by default. `WorkflowPolicyService.definition()`
returns `null`; even an injected definition is refused outside `NODE_ENV=test`. Tests explicitly
supply a bounded registration allowlist, fixture reference and synthetic gateway secret. There is
no environment flag, frontend eligibility check or public activation endpoint. These fixtures are
not university grading, admission, financial, signing or disclosure authorization.

## Authorization and contracts

Requests use strict Zod contracts in `packages/validation/src/release-workflows.ts`. Staff endpoints
require `syntheticWorkflows.manage` (SUPER_ADMIN only), staff sessions and CSRF. Student endpoints
use the separate student session and CSRF boundary; ownership is derived from that session. The
only anonymous endpoint is the disabled-by-default, signed **mock** callback. Responses use no-store
middleware. Official `/public/verify/*` handlers are unchanged and always return UNAVAILABLE without
academic or object-storage lookups.

| Endpoint under `/api/v1`                                         | Purpose                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| POST `synthetic-workflows/releases`                              | Prepare a server-owned RESULT, REGISTRATION or ADMISSION_LETTER snapshot  |
| POST `synthetic-workflows/releases/:id/:action`                  | Versioned APPROVE, PUBLISH or WITHDRAW with durable request receipts      |
| POST `synthetic-workflows/verify`                                | Staff-only SAMPLE_VALID / SAMPLE_NOT_VALID adapters for all four services |
| GET `student/results`, `student/results/:id`                     | Owned, approved and published synthetic snapshots only                    |
| GET `student/admission-letters`, `student/admission-letters/:id` | Published sample linkage to the owned registration/recipient              |
| GET/POST `student/retotaling`                                    | List or submit a clerical request for an owned published sample           |
| POST `student/retotaling/:id/:action`                            | RESPOND or CANCEL                                                         |
| GET `synthetic-workflows/retotaling`                             | Staff request history                                                     |
| POST `synthetic-workflows/retotaling/:id/:action`                | REQUEST_INFORMATION or CLOSE                                              |
| POST `synthetic-workflows/migration/dry-run`                     | Persist a bounded synthetic plan and reconciliation report                |
| POST `synthetic-workflows/migration/:id/recover`                 | Resume verification of the immutable plan in bounded checkpoints          |
| POST `student/sandbox-gateway/orders`                            | Persist an order for the student's assessed re-exam obligation            |
| POST `sandbox-gateway/callback`                                  | Authenticate the exact base64-encoded mock payload and timestamp          |
| POST `synthetic-workflows/gateway/:id/refund`                    | Persist an idempotent mock refund within the collected amount             |
| GET `synthetic-workflows/gateway/:id/reconcile`                  | Read durable order and receipt balances                                   |

## Result and admission provenance

Preparation reads locked registration/result rows. A result requires its current APPROVED review
receipt, the matching immutable SUBMIT snapshot and the server-computed synthetic calculation digest.
A separate `SyntheticRelease` stores the source snapshot, SHA-256 digest, registration linkage,
approval event and maker/checker identities. It transitions DRAFT → APPROVED → PUBLISHED → WITHDRAWN.
The preparer cannot approve or publish. Commands use UUID replay keys and expected versions; audits
and transitions commit together. Snapshot/approval history is frozen by SQL guards. Published sample
sources cannot be changed until their sample release is withdrawn.

The original `Result` remains APPROVED with `publishedAt=null`; official result publication remains
blocked independently. Student reads require the session's registration ownership, explicit allowlist,
published receipt and matching digest. Lists are bounded in SQL. DRAFT, unapproved, withdrawn, foreign
and non-allowlisted snapshots are not returned. `publicationAvailable` remains false and every returned
sample explicitly says SAMPLE — not an official result. No official marksheet download is added.
The existing review-snapshot digest format is retained for compatibility; new jsonb receipts use
canonical object-key ordering without changing array order.

Registration/admission adapters use the same approved publication receipts. An admission sample is
linked through a registration to its student recipient; it is not an admission decision, an archive
import or an issued admission-letter PDF. Certificate adapters accept only allowlisted ISSUED,
unsigned synthetic credentials with private PDF metadata. Revoked/superseded samples fail validation.
Adapters disclose only sample status, service and synthetic/unsigned flags, never names, marks, tokens
or storage keys. Their audit stores a reference digest. No public QR route is activated.

## Clerical retotaling

Submission locks the active account, published release and registration. A scoped submission key
prevents duplicates; changed retries conflict. One active request per sample release is permitted.
Versioned events record SUBMIT, REQUEST_INFORMATION, RESPOND, CANCEL and CLOSE. SQL guards preserve
history and require a matching event in the same transaction. Students cannot act on another account's
request. Staff cannot change marks or issue an academic decision through this API. Every receipt
states `feeStatus=NOT_CONFIGURED`, `academicDecision=NONE` and `usage=SYNTHETIC_ONLY`.

## Generic migration dry runs

At most 1,000 synthetic records are accepted. Source systems require a SYNTHETIC_ prefix, identifiers
require SYN-, and target entity names map to existing models. NFKC/whitespace normalization preserves
identifier case. Identical duplicates are skipped; conflicting duplicates, missing/cyclic references,
dependencies on quarantined records and sensitive field names are quarantined. Quarantine output
omits rejected values. Counts reconcile every source row; source and normalized-plan digests preserve
traceability. The plan, actor and source are immutable. Recovery verifies that plan and advances at
most 100 rows per checkpoint, with atomic audit/retry protection. It never writes academic records,
creates accounts, imports files or publishes anything. Actual export mapping and historical import
remain separate university-authorized work.

## Durable mock payments

Orders derive amount, currency and reference from the existing server-owned payment obligation.
The callback is a mock protocol envelope, not a selected merchant's certified webhook adapter.
HMAC validation covers exact decoded bytes and timestamp (five-minute maximum skew). The envelope
must be canonical base64 and at most 16 KiB decoded. Redis enforces 30 callbacks/minute per hashed
client-IP key; limiter failures fail closed. A UUID event ID is globally replay-protected.

Under an order row lock, a matching paid event invokes the existing payment submission logic inside
the **same PostgreSQL transaction** as the order, append-only receipt and audits. Active account,
server amount/currency, application state, approved destination and evidence requirements remain
mandatory. The transition is SUBMITTED for existing staff review, never VERIFIED or academic approval.
A failure or audit error rolls back all changes. Fresh service instances reconcile from PostgreSQL.
Concurrent refunds cannot exceed the paid balance; identical refund commands replay safely. Refunds
are synthetic ledger entries only and do not contact a bank or reverse academic decisions. SQL guards
require matching immutable receipts and balances. Production/live activation remains false.

## Migration and release impact

`20261110090000_synthetic_release_workflows` adds six tables, foreign keys, indexes and integrity
constraints/triggers. Historical migrations and existing records are not rewritten. Its additional
result guard affects only sources referenced by new published synthetic releases. Only isolated
synthetic databases have received this migration locally. Review the new migration before deployment;
never reset an existing database. Application rollback must retain the additive schema and must not
return to vulnerable pre-15A session code. Existing credential-unbound sessions must re-login.

Targeted evidence and final combined gate status are recorded in
[the integration verification report](../final-handover/02-integration-verification.md).
