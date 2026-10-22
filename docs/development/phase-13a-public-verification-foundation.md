# Phase 13A — Secure public verification foundation

## Scope and starting point

Base: `add9baefec7f972ba5ac63abd2eb070dcd23fb5d`, latest green main including Phase 12C and PR #23.
GitHub [main CI](https://github.com/aryansharma1305/univarsity-doc/actions/runs/39690712370)
was reconfirmed successful on 2026-10-22 before final delivery. Main remains the exact verified
base, so no integration changes or repeat heavy suites are required. Branch CI is reported by
the draft PR checks after push; the local results below are not presented as remote CI.
Worktree: `docversity-public-verification`; branch: `feature/phase-13a-public-verification`.
The user granted final visual and security approval on 2026-10-22 and authorized commit, push
and draft PR delivery. Merge, deployment and real public verification remain unauthorized.

UI-04 is **not merged**. GitHub merged history and the main source show UI-01 at `/`;
the approved UI-04 homepage remains uncommitted in its own worktree. Neither is overwritten.
Existing `/results`, `/verify/registration`, `/verify/certificate` and `/verify/qr` placeholders
remain unchanged. `/verify` provides a standalone, independently testable four-service panel.
`VerificationPanel` is the integration seam for UI-04 after its separate approval/merge; this
phase does not claim to have delivered that homepage integration. No new homepage navigation is added.

## Architecture

Decision record: [ADR-0019](../decisions/ADR-0019-fail-closed-public-verification.md), accepted for Phase 13A’s unavailable-only foundation.

```text
/verify → shared Radix service tabs + labelled reference form
        → same-origin Next proxy (no ambient session credentials)
        → POST /api/v1/public/verify/{service}
        → existing Origin guard → shared Redis rate limiter → strict contract validation
        → append-only audit event → constant UNAVAILABLE
```

No handler reads student, registration, result, certificate, historical-document, eligibility or
MinIO data. There is no activation environment flag, synthetic-success branch, test bypass,
search/list endpoint, file proxy, URL fetcher, QR decoder or issuance action.
No database schema/migration, certificate renderer, Phase 12C academic implementation,
authentication guard, permission policy or publication rule is changed.

The only shared authentication implementation change hardens `RateLimiter`: aborted Redis
transactions and resolved command errors (including ACL/OOM failures) fail closed instead of
being interpreted as zero counts. Existing sign-in budgets and cookie/CSRF rules are unchanged.

## Versioned contracts

Shared Zod definitions: `packages/validation/src/public-verification/schemas.ts`.
OpenAPI requests/responses derive from those schemas. Four explicit POST endpoints:

| Service                       | Path suffix        |
| ----------------------------- | ------------------ |
| Result Checking               | `result`           |
| Registration Verification     | `registration`     |
| Certificate Verification      | `certificate`      |
| Admission Letter Verification | `admission-letter` |

Base path: `/api/v1/public/verify/`. JSON body:

```json
{ "contractVersion": 1, "reference": "SYNTHETIC-REFERENCE-13A" }
```

Exactly these fields are accepted. Unknown fields, query parameters, unsupported versions,
arrays, missing/oversized references and URLs are rejected. References are at most 128 input
characters, NFKC-normalized and trimmed, then bounded to 3–128 letters/digits/dots/slashes/hyphens.
Result/registration reference hashes use uppercase normalization; certificate/admission opaque
credentials preserve case. These are transport rules, not university numbering/eligibility rules.
A registration number is never a password or identity proof. No personal corroboration fields
are requested while disclosure policy is absent.

Every valid request returns HTTP 200 with `Cache-Control: no-store` and this service outcome:

```json
{
  "contractVersion": 1,
  "service": "result",
  "status": "UNAVAILABLE",
  "message": "Public verification is unavailable. No record has been checked. This response does not indicate whether a record exists or is authentic."
}
```

HTTP 200 acknowledges a processed availability check; it does not certify a record.
The general versioned response vocabulary reserves:

- `VERIFIED`: future authorized public evidence matched under an approved policy. It must not imply
  eligibility or academic achievement beyond that evidence. No runtime path returns this today.
- `NOT_VERIFIED`: future verification did not establish the permitted claim; it must not assert
  fraud, nonexistence, forgery or ineligibility. It is never emitted by this phase.
- `UNAVAILABLE`: verification could not be performed; no conclusion about the record is supported.

No disclosure fields are defined. The frontend and current OpenAPI response use the narrower
UNAVAILABLE-only schema and reject unexpected success or extra fields rather than rendering them.
Invalid input: safe 400 envelope; unsupported routes/methods: 404; rate limit: safe 429 envelope
with Retry-After; Redis/audit failures: safe 503 envelope. No reference is echoed. Generic
validation details avoid reflecting attacker-controlled unknown field names or values.

## Security boundaries and threat model

| Threat                      | Current control / limitation                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record enumeration          | Constant response regardless of existing/absent references; no academic lookup, search or record-dependent branches                                                                                                                                                             |
| Guessing / flood            | Redis fixed-window budget, 20 requests/client/minute shared across all four services and 600/minute global; malformed JSON-contract requests consume budget before validation                                                                                                   |
| Distributed abuse           | Global budget bounds admitted audit writes; an attacker can exhaust it and deny availability. Edge/WAF controls and approved production budgets remain future work                                                                                                              |
| Counter outage or ACL error | Rate limiter fails closed; no audit/lookup follows a failed budget check                                                                                                                                                                                                        |
| Audit outage                | No successful availability response when audit persistence fails                                                                                                                                                                                                                |
| Identifier exposure         | Request body only, no URL/query/localStorage; domain-separated HMAC-SHA256 reference/client hashes; no raw identifiers, user-agent, IP, cookie or body in audit metadata                                                                                                        |
| Correlation/retention       | Hashes remain pseudonymous, not anonymous. Current hashing reuses existing SESSION_SECRET; rotation changes correlation. Dedicated verification privacy keys and retention need approval before activation                                                                      |
| CSRF / ambient privilege    | Public routes deliberately ignore both sessions. JSON requests have no user-controlled side effect beyond bounded audit events. No session token is needed; existing global Origin guard still rejects foreign Origin. All private unsafe routes retain their CSRF requirements |
| CORS                        | Existing exact allow-list, no wildcard; browser uses same-origin proxy with `credentials: omit`                                                                                                                                                                                 |
| IP spoofing                 | Existing trusted-proxy configuration is preserved; Next strips client forwarding headers at the edge. Proxy topology must be reviewed before deployment                                                                                                                         |
| Data/file disclosure        | No academic-lookup/storage dependency, private object key, unrestricted profile, payment data, result or certificate returned                                                                                                                                                   |
| Accidental activation       | No feature flag or production synthetic records; client permits only unavailable responses                                                                                                                                                                                      |
| Payload abuse               | Shared bounded strict Zod schema; existing server body-parser limits remain in force. Non-JSON content is rejected                                                                                                                                                              |

Audit action: `PUBLIC_VERIFICATION_UNAVAILABLE`, entity type `public_verification`, actor/entity IDs
null. Metadata contains only contractVersion, allow-listed service, UNAVAILABLE, referenceHash and
clientHash; correlation ID uses the existing request context. Invalid/throttled requests use existing
safe access logs, not unbounded new per-attempt database audits. Existing `VerificationLog` enums
cannot represent unavailable/admission-letter accurately; this phase does not misuse VALID,
INVALID or NOT_FOUND, nor change those enums/migrations. A future retention policy is required.

No full penetration-test claim is made. Security evidence is scoped to this foundation and its
isolated automated tests, plus review of the connected guards, logger, proxy and audit implementation.

## Certificate provenance and Phase 12C integration

The existing Certificate model is an anchor, not an activation permission. A registration row,
PDF, reviewed result, historical file, certificate application, course offering or eligibility set
is insufficient evidence for public verification. Phase 12C's worktree and migration are untouched;
its private typed contracts remain outside the public verification dependency graph. A read-only review
of main's `docs/api/certificate-eligibility.md` confirms student-session-only v1
contracts for course/registration sample eligibility, with issuance and Rector approval unavailable.
Those private DTOs contain registration details and must not be returned or imported as public
verification responses. No duration policy or eligibility logic is copied into this phase.

Before any positive verification implementation, the university must approve:

1. The authoritative issued record and immutable issuance/publication receipt, actor authority,
   source/template version, timestamps and policy version. Eligibility is distinct from issuance,
   and student-visible historical PUBLISHED is distinct from authorized public disclosure.
2. Independent public visibility, minimal allow-listed public fields and their purpose/legal basis.
   Result publication alone must not imply public access; registrations/admissions require their
   own approved disclosure source. No registration-number-only access to private academic records.
3. Server-generated opaque identifiers and >=256-bit random verification credentials, scoped and
   bound to the issuance receipt, with secure at-rest treatment. Do not use sequential IDs or
   imported/student-supplied certificate references as proof.
4. Integrity-protected QR links: allow-listed university HTTPS origin, opaque server-issued
   reference, version/key identifier and authenticated binding; verification and key rotation
   happen server-side. User-controlled QR claims/URLs never confer trust. No QR verification,
   official signing or credential-generation flow is implemented here.
5. Revocation/replacement/supersession semantics, validity windows and immutable audit history.
   Read current authoritative status before disclosure; revoked/superseded credentials cannot
   silently continue returning positive results. Replacement identifiers must not reveal private
   identity links. Public wording/disclosure for revoked states needs separate approval.
6. Issuer/Rector authority, separation of duties, replay/reconciliation/idempotency rules, retention,
   abuse budgets, privacy review and tests of the complete provenance chain before activation.

Do not infer any of these decisions in frontend logic. No Phase 12C eligibility, Rector approval,
real signing, issuance, payments, official publication or public verification is activated.
Hostinger/Vercel deployment and production infrastructure changes are outside this phase.

## Verification and review evidence

Full verification against this updated base passed on 2026-10-22. The screenshots below were
recaptured from this branch’s production build during its successful browser suite and visually
inspected at all three widths:

- [Desktop, 1440px](phase-13a/verification-1440.png)
- [Tablet, 768px](phase-13a/verification-768.png)
- [Mobile, 390px](phase-13a/verification-390.png)

### Capacity and parallel work

Initial free space was 10 GiB on 2026-10-22. No shared Docker volumes or project data were pruned.
The user relayed Claude's confirmation that the shared test window is available. The isolated
QA stack was checked healthy before heavy work. A 4 GiB free-space floor is enforced before each
major verification stage; no shared resources are deleted.
Original development PostgreSQL and MinIO are not used by this branch's verification environment.
No original database migrations, object-content reads/writes, resets or restores have been executed.
A read-only repeatable-read fingerprint of all 38 original tables and a list of 3,232 original
objects (key/ETag/size metadata only) establish a private preservation baseline during this run.
Final comparison passed after the full browser run: all 38 table fingerprints and all 3,232
original object key/ETag/size entries match. Fingerprints and object keys stay in ignored
`.local/evidence`.

### Phase 12C.1 integration boundary

Phase 12C is merged. Its private registration-specific eligibility contract and future Phase 12C.1
sample-selection behavior do not confer issuance or public disclosure authority. Public handlers
have no dependency on either module, academic repositories or object storage. No student/admin
routes, certificate templates or migrations change. Phase 12C.1 must remain independently mergeable.
Any future public integration requires separately approved issuance/publication provenance and
minimal disclosure contracts; never reuse a student eligibility response as a public response.

### Current command evidence

- `pnpm format:check`: exit 0.
- `pnpm turbo lint typecheck --force --concurrency=2`: exit 0, 28 uncached tasks.
  Existing TanStack React Compiler advisory and shared UI pages-directory warning remain nonfatal.
- Focused validation tests: exit 0, 10/10.
- Focused frontend tests: exit 0, 3/3.
- Isolated Docker startup: exit 0, all three services healthy.
- `pnpm db:deploy`: exit 0, existing Phase 12C migration applied only to synthetic QA database.
- Graphify refresh: exit 0, 7,205 nodes / 18,879 edges / 285 communities. Existing SQL-parser
  dependency and TypeScript barrel extraction warnings remain; the graph is a navigation aid.
- `pnpm test --force --concurrency=2`: exit 0, 871 tests in 16 uncached tasks:
  database 109, validation 68, types 21, storage 4, documents 51, imports 94, worker 7,
  API 396 (including all 12 public-verification tests), web 121.
- `pnpm build --force --concurrency=2`: exit 0, 10 uncached tasks.
- `pnpm db:check`: exit 0, No difference detected on synthetic QA only.
- `E2E_WEB_PORT=3133 E2E_API_PORT=4133 pnpm test:e2e --force --concurrency=2`:
  exit 0, 69/69 browser tests passed in 9.1 minutes, 11 uncached tasks. No failures/skips/retries.
  Includes 4 new public-verification browser tests and regression coverage for existing academic,
  certificate, student/admin, authentication and private-document workflows.
- Final read-only preservation comparison and delivery recheck: exit 0, 38 tables / 3,232 original objects preserved.
- QA services stopped: exit 0; isolated volumes retained, other agents' services left untouched.
- All actual gate exit codes and logs are held in ignored `.local/evidence/exit-codes.json`.

The three QA services were healthy before testing. During browser tests they used approximately
217 MiB combined; free space remained above 8 GiB during the heavy run. The shared testing window
was released to Claude after teardown. No production deployment or production capacity claim is made.

The browser suite verifies every service at all three widths with real UNAVAILABLE responses,
strict validation, no horizontal overflow and axe checks. Keyboard arrows/End, reduced motion,
pending states, rate-limit messaging and rejection of an unexpected VERIFIED payload also pass.
The standalone `/verify` page retains existing branding and header/footer; UI-04 is not replaced.

The secret scan was reviewed: a local S3 app-user string overlaps normalized historical filesystem
path node names in Graphify. These are path labels, not exported credentials or environment values.
No password/secret value from current private QA configuration was found in delivery files.

Operational diagnostics retain request IDs, HTTP status and duration through the existing structured
access logger. Request bodies, query strings and headers are not access-logged. Accepted references
and client IPs appear only as domain-separated HMACs in bounded audit events. Dependency failures
return a generic 503; no internal exception text is returned by these handlers.

### Security review conclusion

No active public disclosure path was found in the changed code: handlers depend only on the
rate limiter, keyed hasher and append-only audit service; all four return the unavailable-only
contract. Production-configuration tests confirm the same behavior without test overrides.
No academic/template/migration or student/admin implementation is changed. The only existing
student-results test edit makes its upstream port follow isolated Playwright configuration.

Remaining activation dependencies are the approved provenance/disclosure policy, issuance or
publication receipts, revocation semantics, privacy-key/retention policy and production edge
abuse controls described above. These are not implemented or bypassed in Phase 13A.

Review status: final visual and security approval received on 2026-10-22. Delivery is authorized
as a draft PR against the unchanged green main. All four real services remain unavailable.
UI-04 homepage integration and the optional removal of unnecessary reference input remain
separate follow-ups. No merge or deployment is authorized.
