# Razorpay Payment Button integration — development review

Status: local development only; not deployed, committed or activated. Base: green main
`e1ad1c30c84cc1941602bb013e49f61869aa7eb4`; branch `feature/razorpay-payment-integration`.
The verified Hostinger release and its preserved image archive are unchanged.

## Mentor requirements and current availability

| Service     | Supplied public button ID | Label                         | Current behavior                                                                                                   |
| ----------- | ------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Exam        | `pl_TyWPTClJKY5RFa`       | Pay Exam Fee                  | Owned regular-examination record only; unavailable without an approved exam fee obligation                         |
| Re-exam     | `pl_TyWTRF7DImX3Pu`       | Pay Re-Exam Fee               | Existing own application/payment obligation; status is server-owned; collection disabled                           |
| Certificate | `pl_TyWXU0D8UbPlEC`       | Pay for Hard Copy Certificate | **Hard copies only**, confirmed by owner; current requests have no hard-copy delivery/fee contract, so unavailable |

Digital certificates are free, as confirmed by the owner; digital and SAMPLE PDFs are not made payable. No amount or currency is invented or copied from the
mentor's IDs. An identifier is not proof of merchant ownership, account mode, price or payment.
No supplied button is fetched or loaded in the reviewer environment. An unavailable panel has no
working-looking checkout button. Existing manual regional re-exam payments remain unchanged.

## Source and route inventory

- `packages/validation/src/payment-buttons.ts`: exact mappings, strict read/reconciliation contracts,
  state labels, hard-copy-only scope and literal false live/QR gates.
- `apps/web/src/features/payments/`: reusable student panel, isolated provider-owned DOM embed,
  authorized staff reconciliation form. Existing student examinations, re-exam payment and certificate
  request detail pages consume these components; existing staff payment detail hosts reconciliation.
- `apps/api/src/payment-buttons/`: student ownership checks, test-only policy, signature intake,
  persistent deduplication and manual report-backed reconciliation.
- `packages/payments/src/razorpay.ts`: bounded original-byte SHA-256 HMAC verification and sanitized
  provider contract. The existing mock signature protocol is separate and unchanged.
- Prisma: additive `RazorpayWebhookReceipt` and `RazorpayReconciliation` tables. No existing record
  rewrite, destructive DDL, academic status change, MinIO write or account creation.
- `apps/api/src/app.setup.ts`: only the webhook route uses a bounded raw parser before Nest's JSON
  parser. Express is now a direct dependency at the already installed version 5.2.1.

Student GET routes (student session only, no-store):

- `/api/v1/student/payment-buttons/exam/:registrationId/:id`
- `/api/v1/student/payment-buttons/re-exam/:id`
- `/api/v1/student/payment-buttons/certificate/:id`

Staff routes require `reExamPayments.verify`:

- `GET /api/v1/payment-buttons/re-exam/:paymentId/receipts`
- `POST /api/v1/payment-buttons/reconcile` (session CSRF and existing origin checks)

Provider route: `POST /api/v1/payment-buttons/webhook`. It is deliberately sessionless, HMAC-protected,
rate-limited and unavailable by default. No CORS/CSRF guards were weakened or bypassed.

## Reconciliation and attribution boundaries

Razorpay's official [Payment Button webhook documentation](https://razorpay.com/docs/payments/payment-button/subscribe-to-webhooks)
lists `payment.authorized`, `payment.captured`, `payment.failed` and `order.paid`. This implementation
accepts only captured/failed payment evidence. Other event types are rejected and must not be
subscribed until implemented. Authorized is not treated as paid.

The [signature documentation](https://razorpay.com/docs/webhooks/validate-test) specifies HMAC-SHA256
over the original body, duplicate event IDs and unordered/retried delivery. The handler checks a
bounded Buffer, constant-time signature equality, merchant account ID, event/status/capture
consistency and bounded integer money/currency fields. Duplicate header IDs must match the original
body digest; a transaction advisory lock serializes duplicate deliveries. All inserts and audits
are atomic. Failed Redis/audit operations do not acknowledge a successful write.

The documented [payment payload](https://razorpay.com/docs/webhooks/payments) includes payment,
amount, currency and account data. The supplied static embed does not establish an authenticated
Docversity request/registration binding. No custom note, redirect, browser message, payer email,
phone, screenshot or posted identifier is trusted as that binding. A signature authenticates the
provider notification, not a student's entitlement. **Automatic attribution is not implemented.**
No undocumented `payment_button_id` property or Payment Button management API is invented.

Captured evidence is stored **unattributed**. It never creates or approves an application and never
changes a payment merely because a webhook arrived. Customer email/contact/card/UPI details and
untrusted notes are discarded; only a digest and financial evidence fields are stored. The event
header is not itself signed; changing it cannot fulfill twice because provider-payment allocation
is uniquely constrained independently of event IDs.

For a synthetic, allowlisted re-exam obligation:

1. Student submits the provider payment ID through the existing ownership-checked submission path.
   State becomes Awaiting Verification; a screenshot remains evidence only.
2. Authorized staff inspect actual provider dashboard/report records, confirm receiving merchant,
   re-exam button/service, full amount/currency and the student's application ownership.
3. Staff submit explicit confirmations and a private report reference. The reference is HMAC-hashed;
   no reference contents are copied to audit metadata.
4. The server matches the signed payment ID, merchant, amount and currency, refuses failed/refunded
   evidence and cancelled/rejected applications, and atomically allocates one provider payment to
   one obligation. Payment-row and provider locks serialize retries/concurrent attribution. Duplicate
   identical staff requests replay; changed requests conflict.
5. Only the financial payment status becomes Verified/Paid. Academic application status is unchanged.

Append-only database guards preserve receipts and reconciliations; unique constraints prevent a
provider payment or obligation from being fulfilled twice. No refund API/capture API is called.
The existing, separately authorized manual bank verification workflow is preserved.

## Activation and unresolved inputs

`PaymentButtonPolicyService.definition()` returns null. Only NODE_ENV=test plus an explicit synthetic
registration allowlist and separate test button/merchant fixture can exercise the integration. There
is no production/development environment flag, secret variable or reviewer bypass that activates it.
The mentor's IDs are explicitly rejected by the synthetic embed contract. Test IDs' spelling is not
used as proof of Razorpay mode; test mode must be established in the merchant dashboard/credentials
before a future real sandbox test. Tests stub the provider script and never charge anything.

Before live activation, a separately reviewed change needs:

- University approval, verified Docversity India merchant ownership and receiving account, dashboard
  confirmation of all three button IDs/mode/amounts/currencies and configured button labels.
- Private test credentials and webhook secret, followed by an authorized provider sandbox test.
  No provider credentials were supplied or used here; no real Razorpay API request was made.
- Exam fee eligibility/obligation rules and amounts from an approved server/provider source.
- Hard-copy certificate delivery selection, request linkage, approved fee eligibility and amount.
  Existing certificate requests are student-scoped; registration-specific fulfillment must not be
  guessed, nor should payment grant eligibility or issuance.
- Provider report procedure and finance ownership; retention, refunds, disputes, reconciliation and
  support policy. A signed capture snapshot alone does not establish current settlement/refund state;
  authenticate and fetch current provider records or check the authoritative report before activation.
- If automatic student attribution is required, approve a server-created Orders API integration that
  persists an immutable order→obligation binding, with approved amounts and verified callbacks. A
  static shared button must not be represented as equivalent to a per-application order.
- An approved webhook ingress design for the protected reviewer gate, only after separate deployment
  authorization. This branch does not expose a route around the Caddy gate or change the live VPS.

Optional Pay by QR remains false. During implementation the owner supplied the original
`WhatsApp Image 2026-11-10 at 20.35.51.jpeg` from Downloads. Its 146,296 original bytes are retained
read-only outside Git, unchanged (SHA-256
`7b75f4cd50a72505394e310e8228b93d0f5813c8fc25ff5327883cc1884949a3`). It is not redrawn,
committed, published or substituted into any existing destination. Merchant ownership and receiving
account are not confirmed. A future explicit enablement must use the original asset through the
existing private, approved destination workflow, with Pending/Awaiting Verification and staff checks
against actual account records. Supplying an image alone does not authorize payment activation.
Existing Phase 9 regional QR controls, approvals and data remain unchanged.

## Verification

Final command results, exact totals and preservation checks are recorded below after the local run.
All data is synthetic in a dedicated Compose project with unique credentials, PostgreSQL databases,
Redis instance/prefixes and MinIO buckets. Test storage is temporary; no existing Docker service is
restarted, no volume is removed and no deployed VPS/DNS/payment dashboard is modified.

### Final local results (10 November 2026)

| Check                             | Result                                                                             | Exit |
| --------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| Format, lint, typecheck           | Passed (existing TanStack Table lint warning remains)                              | 0    |
| `pnpm test --force`               | 1,084 tests / 133 files passed, full uncached run                                  | 0    |
| `pnpm build --force`              | All production application/package builds passed                                   | 0    |
| `pnpm db:check`                   | No difference detected; 22 migrations applied to isolated synthetic infrastructure | 0    |
| Complete Playwright, trace off    | 79 passed, 0 failed/skipped, 620.0 seconds                                         | 0    |
| Targeted re-exam/payment API file | 21 passed, included in full total                                                  | 0    |
| Graphify update                   | Regenerated only the three repository-required graph outputs                       | 0    |

The first full test run rejected localhost:3000 because the private harness had been configured for 3310. Only the harness origin was corrected; the two affected files passed 17/17. A second full run
observed an existing result-preview Redis TTL at 7,200,004 ms versus its 7,200,000 ms bound. That file
passed 15/15 on its targeted recheck, and the next complete uncached suite passed. No assertion,
security control, timeout or application expiry code was changed to hide either failure. Native-host
and Docker-VM clock timing remains a local harness limitation; it is not attributed to payment code.

Pre-storage integration initially exposed a missing direct Express dependency and a Prisma advisory
lock result-type issue; Express was declared at the existing resolved version and locks use
`$executeRaw`. Synthetic certificate fixtures now include the required history event. Final API
regressions and full suite pass. The actual deployed reviewer code remains unchanged.

Provider tests use synthetic payloads and stubbed scripts, not real Razorpay credentials or charges.
No gateway sandbox/live network transaction or account ownership verification is claimed. The
three viewport screenshots are retained in ignored local Playwright results as
`razorpay-certificate-1440`, `razorpay-certificate-768` and `razorpay-certificate-390`.
All 21 original container identities/configuration/mounts/start times were preserved and all 41
original volume names remain present. No original bucket was accessed; this is isolation evidence,
not a claim of new row-by-row/object-by-object hashing of university data. No VPS/DNS/ACME operation,
commit, push, PR or deployment was performed.
