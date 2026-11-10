# Request-backed synthetic credential lifecycle

This is an unsigned SAMPLE workflow for isolated tests, not official certificate issuance. All
endpoints refuse with 404 unless `NODE_ENV=test` and a server-injected contract-v1 SYNTHETIC_ONLY
fixture explicitly allowlists the registration. The default definition is null; no request field,
environment flag, course label or frontend action enables it. Production-mode refusal is tested.
No real signer, Rector action, public verification or live payment is introduced.

Staff use the existing permission and CSRF guards:

| Endpoint                                              | Permission                    | Action                                                                                                                             |
| ----------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POST /certificate-requests/:id/synthetic-credential` | `certificates.generate`       | Prepare from a completed request and an owned, allowlisted registration; optional `replacesId` identifies a synthetic predecessor. |
| `POST /synthetic-certificates/:id/approve`            | `certificates.approve`        | A different person approves the preparation.                                                                                       |
| `POST /synthetic-certificates/:id/issue`              | `certificates.issue`          | Store an existing integrity-pinned, unsigned SAMPLE PDF privately and allocate a `SAMPLE-NOT-VALID-` number.                       |
| `POST /synthetic-certificates/:id/revoke`             | `certificates.revoke`         | Record a bounded reason, preserving the immutable PDF and original identity.                                                       |
| `GET /student/synthetic-certificates/:id/preview`     | Student session and ownership | Serve pinned PDF bytes only while the synthetic credential is ISSUED; no-store, nosniff and restrictive CSP.                       |

POST commands require a UUID `requestId` and `confirmed: true`. Preparation also requires a registration
UUID. Unknown fields, live-signing fields, malformed identities and control characters are refused.
Responses are immutable action receipts with `usage=SYNTHETIC_ONLY`, `unsigned=true` and
`officialIssuanceAllowed=false`; a replay reports that action's original receipt, not current validity.
They never return object keys or verification tokens.

The source request, registration and certificate are locked in a consistent order. Source ownership,
request version/status and active/completed registration are rechecked before approval/issue. State,
number allocation and append-only audit receipts share one transaction. Concurrent identical commands
replay one receipt; changed content with the same key is refused. Successful replacement supersedes
the old issued record atomically. A revoked predecessor remains revoked. Existing objects are never
overwritten or removed by replacement/revocation.

Only the three document types already supported by `Certificate` are accepted: TRANSCRIPT,
PROVISIONAL and CHARACTER. The pinned PDFs retain fictional printed data, SAMPLE watermarks and
unsigned signature lines. This workflow does not qualify a student, implement admission letters,
activate course eligibility or turn a legacy document into an authoritative credential.

A failed issue transaction removes only its newly attempted, unreferenced object. If commit outcome
or cleanup cannot be established, the object is preserved for reconciliation; no referenced PDF is
deleted. Crash/ambiguous-commit recovery and orphan reconciliation are not fully rehearsed. Application
references currently live in the typed JSON snapshot rather than a new FK/migration. Production
qualification, authoritative provenance, signing/key custody, numbering and revocation policy require
separate university authorization and compatibility review before any live implementation.

Verification, 10 November 2026: the composed candidate passed **25 certificate-request API tests**
(15 existing and 10 new), API lint/typecheck/build, dependency builds and schema drift, exit 0.
The preceding scoped run also passed 21 permission, 93 validation and 4 storage tests. Cases cover
default/production refusal, RBAC/CSRF/session separation, ownership, concurrency, replay conflicts,
audit/storage failure, retry, replacement/revocation and unchanged public UNAVAILABLE responses.
No schema/migration or existing template asset changed. Full candidate browser checks and independent
review have not been repeated after this addition; the earlier 1,020-test/78-browser checkpoint is
separate evidence. All changes remain uncommitted.
