# Razorpay test-mode integration plan

Status: **plan only**. No payment code, keys or configuration change in this document. Production
collection stays disabled. Every step below runs against Razorpay **test mode** on a staging instance.

Baseline: `main` at `5fe3c71` (deployed web). Deployed API `55c2350` is an ancestor of `main`, and
its payment code is the same as `main`: `git diff 55c2350 origin/main` touches no file under
`apps/api/src`, `packages/payments`, `packages/validation/src/payment-buttons.ts` or
`packages/database/prisma`.

Credentials: none were found. A scan of the repository and of the university hand-over folder
(`university-final-integration-2026-11-13/`) found no Razorpay key ID, key secret or webhook secret.
Public Payment Button IDs (`pl_…`) supplied by the mentor are committed in
`packages/validation/src/payment-buttons.ts:4-8`. One of them is also pinned in
`packages/database/prisma/migrations/20261112090000_razorpay_payment_evidence/migration.sql:65` and
quoted in `docs/development/razorpay-payment-integration.md` and
`docs/development/onboarding-razorpay-integration-review.md`. They are not secrets, but they name a
merchant account whose ownership has not been confirmed. This plan does not repeat them.

---

## 1. Current state on `main`

### 1.1 What exists

| Area                               | Location                                                                                                                                                                                     | What it does                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signature verifier                 | `packages/payments/src/razorpay.ts:22-72`                                                                                                                                                    | HMAC-SHA256 over the original bytes, constant-time compare (`:42-43`). Strict Zod event shape, `payment.captured` / `payment.failed` only (`:16`). Checks merchant `account_id` and capture/status consistency (`:51-58`). Returns sanitized evidence without email, contact, card or notes (`:59-71`).                                                                         |
| Raw-body parser                    | `apps/api/src/app.setup.ts:42-43`                                                                                                                                                            | `express.raw` (64 KB) only on `/api/v1/payment-buttons/webhook`, so the HMAC sees the original bytes.                                                                                                                                                                                                                                                                           |
| Webhook route                      | `apps/api/src/payment-buttons/payment-buttons.controller.ts:79-95`                                                                                                                           | `@Public()` `POST /api/v1/payment-buttons/webhook`. Reads `X-Razorpay-Signature` and `X-Razorpay-Event-Id`.                                                                                                                                                                                                                                                                     |
| Webhook handler                    | `apps/api/src/payment-buttons/payment-buttons.service.ts:116-162`                                                                                                                            | Policy gate, per-IP rate limit (60/min), verify, advisory lock on event id, dedupe by `event_id`, conflict if the same id arrives with a different body digest (`:145`), append receipt + audit in one transaction. **Never attributes** a payment to a student (`:146`, `:160`).                                                                                               |
| Staff reconciliation               | `payment-buttons.service.ts:190-273`, controller `:60-77`                                                                                                                                    | `reExamPayments.verify` + CSRF. Staff link one receipt to one `SUBMITTED` re-exam obligation after checking the Razorpay dashboard. The server re-checks merchant, captured, not refunded, amount, currency, provider payment id = student-submitted reference, and application not cancelled or rejected (`:215-227`). Then it sets the obligation to `VERIFIED` (`:244-254`). |
| Student panels                     | `payment-buttons.service.ts:48-115`; web `apps/web/src/features/payments/payment-button.tsx:13-107`                                                                                          | Exam and hard-copy certificate always return `UNAVAILABLE` (`:58-73`). Re-exam returns a `TEST` checkout embed only for allowlisted registrations under a test fixture (`:99-113`). The embed refuses the mentor IDs (`payment-button.tsx:27-28`).                                                                                                                              |
| Consumers                          | `apps/web/src/features/student-portal/student-examinations.tsx:176`, `student-re-exam-payment.tsx:387`, `certificate-requests/views.tsx:655`, `re-exam-payments/payment-detail-view.tsx:299` | Panels and the staff reconciliation form.                                                                                                                                                                                                                                                                                                                                       |
| Contracts                          | `packages/validation/src/payment-buttons.ts:18-87`                                                                                                                                           | `liveTransactionsEnabled: z.literal(false)` and `qrFallbackEnabled: z.literal(false)` (`:37-38`). `checkout.mode` is `z.literal('TEST')` (`:29`).                                                                                                                                                                                                                               |
| Evidence tables                    | `packages/database/prisma/schema.prisma:1852-1886`; migration `20261112090000_razorpay_payment_evidence`                                                                                     | `razorpay_webhook_receipts` (unique `event_id`) and `razorpay_reconciliations` (unique `receipt_id`, `payment_id`, `provider_payment_id`). Both are append-only through the DV001 trigger (`migration.sql:66-72`).                                                                                                                                                              |
| Audit actions                      | `packages/types/src/audit.ts:7-8`                                                                                                                                                            | `RAZORPAY_WEBHOOK_RECEIVED`, `RAZORPAY_PAYMENT_RECONCILED`.                                                                                                                                                                                                                                                                                                                     |
| Manual re-exam payments (Phase 9C) | `apps/api/src/re-exams/re-exam-payments.service.ts`                                                                                                                                          | Server-side obligation: snapshotted `amountMinor` + `currency` (`schema.prisma:1356-1358`), states `AWAITING_PAYMENT → SUBMITTED → VERIFIED / REJECTED / VOID` (`schema.prisma:139-145`). Staff verification requires an exact amount and currency match (`re-exam-payments.service.ts:831-876`).                                                                               |
| Mock provider seam                 | `re-exam-payments.service.ts:182-259`; `packages/payments/src/index.ts`                                                                                                                      | `sandboxProvider()` returns `null` (`:183-185`). The mock signature protocol is invented and is not Razorpay's.                                                                                                                                                                                                                                                                 |
| Durable synthetic gateway          | `apps/api/src/release-workflows/sandbox-gateway.service.ts:51-317`; `schema.prisma:1785-1830`                                                                                                | Persistent order, callback, refund and reconcile flow with request-id idempotency and over-refund refusal (`:207-263`). Gated by `WorkflowPolicyService.definition()` returning `null` (`apps/api/src/release-workflows/workflow-policy.service.ts:17-22`).                                                                                                                     |

Tests:

- API: `apps/api/test/examinations/re-exam-payments.test.ts:1252-1560`, in the block "Razorpay disabled
  collection and manual report reconciliation". It covers disabled-by-default (`:1312`), no payable
  exam or certificate (`:1342`), PII stripping and concurrent dedupe (`:1397`), permission, CSRF and
  exact money match (`:1437`), and fail-closed rate limiting (`:1522`). The synthetic gateway tests
  are at `:1140-1250`.
- Package: `packages/payments/test/razorpay.test.ts` and `packages/payments/test/mock-provider.test.ts`.
- Validation: `packages/validation/test/payment-buttons.test.ts`.
- Web: `apps/web/test/payment-buttons.test.tsx`. End-to-end: `apps/web/e2e/payment-buttons.spec.ts:10-45`,
  which checks that no script from `checkout.razorpay.com` loads and that no provider request is made.

### 1.2 Why the webhook returns 404 today

1. `RazorpayWebhookController.webhook()` calls `PaymentButtonsService.webhook()`
   (`payment-buttons.controller.ts:87-93`).
2. The first line of the handler is `this.policy.requireFixture()` (`payment-buttons.service.ts:117`).
   This happens **before** rate limiting, signature verification or any database access.
3. `PaymentButtonPolicyService.definition()` is hard-coded to `return null`
   (`payment-button-policy.service.ts:23-25`). No environment variable or setting can change it.
4. `fixture()` (`:26-29`) parses `null` with `fixtureSchema`, which fails. It also requires
   `NODE_ENV === 'test'`. The deployed API runs `production`, so the fixture would be refused even if
   `definition()` returned a value.
5. `requireFixture()` therefore throws `Errors.notFound()` (`:30-33`). The global filter turns that
   into **HTTP 404**.

The test at `re-exam-payments.test.ts:1312-1330` asserts this 404, and the release hand-over records it
("Razorpay webhook404"). The 404 is intended behaviour, not a fault. Reconciliation (`:191`) is gated
the same way.

Two more reasons it could not work in staging even if the gate opened:

- The fixture object contains `webhookSecret` (`payment-button-policy.service.ts:11`), and its only
  source is code. A real test-mode secret would have to be committed. That is not acceptable, so the
  policy needs a runtime-secret source (section 4).
- On the reviewer and Render staging edges, every path except `/robots.txt` passes through the
  reviewer gate (`deploy/review-site.caddy:17-18`). Razorpay cannot send reviewer credentials, so
  webhooks would be refused at the edge. Production Caddy (`deploy/Caddyfile.production:12-14`)
  forwards `/api/*` through the Next.js rewrite proxy (`apps/web/src/proxy.ts:15-23`). Before
  relying on that path, verify that it keeps the raw body byte-for-byte.

### 1.3 Gaps in the current design

| #   | Gap                                                                                                                                                                                                 | Effect                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| G1  | Static Payment Buttons carry no server-trusted link to a Docversity obligation.                                                                                                                     | Captured payments can only be attributed by hand. Automatic fulfilment is impossible by design.                           |
| G2  | Reconciliation pins `buttonId` to the mentor's re-exam button (`payment-buttons.ts:46`, DB CHECK `migration.sql:65`), but the test embed must use a **different** button (`payment-buttons.ts:33`). | A test-mode reconciliation records a button that was never used. A new migration is needed to relax or replace the CHECK. |
| G3  | Only `payment.captured` and `payment.failed` are accepted (`razorpay.ts:16`).                                                                                                                       | No `order.paid`, refund or dispute events. Refunds made in the dashboard are invisible.                                   |
| G4  | The receipt is a point-in-time snapshot. No authenticated fetch from the Razorpay API exists.                                                                                                       | Refund or settlement state can be stale when staff reconcile.                                                             |
| G5  | `ReExamPayment` has no `REFUNDED` / `PARTIALLY_REFUNDED` / `DISPUTED` state (`schema.prisma:139-145`).                                                                                              | Refunds cannot be represented.                                                                                            |
| G6  | No settlement or payout reconciliation job.                                                                                                                                                         | Money is not proven: fees, GST and settlement timing are unchecked.                                                       |
| G7  | Exam and hard-copy certificate have no server-side fee obligation.                                                                                                                                  | Nothing to charge against. Both stay `UNAVAILABLE`.                                                                       |
| G8  | Policy is code-defined and allowed only under `NODE_ENV=test`.                                                                                                                                      | Staging, which runs `NODE_ENV=production`, cannot enable test mode without a reviewed config change.                      |

---

## 2. Earlier branches

All three named commits are **already ancestors of `main`**. Nothing from them remains unmerged.

| Branch / commit                                          | How it reached `main`                                             | Contents                                                                                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/razorpay-payment-integration` @ `63245ee`       | Via PR #31, merge `0a5d9aa`                                       | Everything in section 1.1 under `payment-buttons/`, `packages/payments/src/razorpay.ts`, the evidence migration, web panels, tests and `docs/development/razorpay-payment-integration.md` (31 files). |
| `integration/university-onboarding-razorpay` @ `155e639` | PR #31, merge `0a5d9aa`                                           | Joins `63245ee` with clean onboarding (`8e28b34`). The tip commit only adds migration-history validation in CI. Review notes: `docs/development/onboarding-razorpay-integration-review.md`.           |
| `feature/payment-sandbox-foundation` @ `d791afd`         | The ref points at the merge of PR #29 (UI-06), which is on `main` | The sandbox foundation itself (`packages/payments` mock provider, `SandboxGatewayService`, `sandbox_gateway_*` tables) landed through `f07f26c` / PR #30. The branch ref has no unique commits.       |

Uncommitted work may exist in those branches' local worktrees. It was not inspected, as instructed.

### Reusable as is

- `verifyRazorpayWebhook`: the raw-body HMAC, constant-time compare, strict shape and PII stripping.
  Extend the event list; do not rewrite it.
- The route-scoped raw parser (`app.setup.ts:43`) and `no-store` middleware (`payment-buttons.module.ts:19-29`).
- Receipt persistence: unique `event_id`, body-digest conflict check, advisory lock, append-only
  trigger, and the audit write in the same transaction.
- Unique `provider_payment_id` allocation, which guarantees one provider payment per obligation.
- The Phase 9C obligation: server-derived `amountMinor` + `currency`, a DB trigger that re-derives the
  amount, and exact-match verification.
- `SandboxGatewayService` patterns: request-id idempotent order creation, refund ceiling, and a
  reconcile that recomputes totals from receipts. These are the template for a real Orders adapter.
- The student and staff UI panels, the ownership tests, and the e2e check that no provider script loads.

### Obsolete or must change

- `PaymentButtonPolicyService.definition()` as a code-defined fixture that holds the webhook secret.
  Replace it with runtime config (section 4).
- Payment Buttons as the collection surface for per-student obligations (G1). Keep them only if the
  university insists on static buttons. Then attribution stays manual.
- The `buttonId` literal in the reconcile contract and the DB CHECK (G2).
- The mock signature protocol (`MockPaymentProvider.signWebhook`). It is fine for unit tests, but it
  must never be presented as Razorpay behaviour.
- Status claims in `packages/payments/README.md` ("branch remains uncommitted"). This is
  documentation drift, so correct it when the feature work starts.

---

## 3. Test-mode integration design

### 3.1 Payment Buttons vs Orders API

|                                                  | Payment Buttons (current)                                             | Orders API + Standard Checkout (recommended)                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Amount source                                    | Configured in the dashboard per button. Docversity cannot enforce it. | Server sets `amount` and `currency` from the obligation when it creates the order.                    |
| Link to obligation                               | None that the server trusts (G1).                                     | `order_id`, stored server-side against `re_exam_payments.id` before checkout opens.                   |
| Fulfilment                                       | Manual staff reconciliation only.                                     | Automatic on a verified webhook whose `order_id` matches a stored order. Staff review stays optional. |
| Per-student pricing (regional amounts, attempts) | Impossible without one button per price.                              | Native.                                                                                               |
| PCI scope                                        | SAQ A (hosted).                                                       | SAQ A (Razorpay Checkout is hosted; card data never reaches Docversity).                              |
| Work                                             | Done                                                                  | Medium: new table, order endpoint, checkout launcher, extended webhook.                               |

**Recommendation: use the Orders API for re-exam fees.** Keep Payment Buttons only as a fallback the
university explicitly chooses, with manual reconciliation. Exam and hard-copy certificate fees stay
`UNAVAILABLE` until obligations exist for them (G7).

Order lifecycle, one Razorpay order per obligation attempt:

```text
ReExamPayment AWAITING_PAYMENT
   │ student clicks Pay → POST /student/re-exam-payments/:id/razorpay-order
   ▼
razorpay_orders row RESERVED (unique payment_id+attempt) → Orders API create → CREATED(order_id)
   │ Checkout opens with order_id (key_id only in browser)
   ▼
browser handler returns {razorpay_payment_id, razorpay_order_id, razorpay_signature}
   │ server checks the signature → status shown as "Awaiting confirmation", NOT paid
   ▼
webhook payment.captured / order.paid (signed) → order_id matches → amount+currency match
   ▼
ReExamPayment VERIFIED (source RAZORPAY_TEST) + audit      application status unchanged
```

Payment never decides the academic application. This rule is unchanged from Phase 9C (CLAUDE.md §10d).

### 3.2 Signature verification

- **Webhook:** compute `HMAC_SHA256(raw_request_body, RAZORPAY_WEBHOOK_SECRET)` as lowercase hex and
  compare it with `X-Razorpay-Signature` in constant time. `razorpay.ts:42-43` already does this. The
  body must be the original bytes; `app.setup.ts:43` already guarantees that. Never re-serialize
  parsed JSON.
- The webhook secret is the one set in the dashboard webhook configuration. It is **not** the API
  key secret. Test mode and live mode have separate secrets.
- **Checkout handler (browser return):** compute `HMAC_SHA256(order_id + "|" + razorpay_payment_id,
RAZORPAY_KEY_SECRET)` and compare it with `razorpay_signature`. Use this check only to show
  "awaiting confirmation". **Fulfil only from the webhook**, because the student can close the tab
  before the handler runs.
- Refuse a body larger than 64 KB, a missing or malformed signature, or an unknown `account_id`
  (already in place). Freshness: Razorpay does not sign a timestamp header. Rely on the event-id
  dedupe and the `created_at` field. Optionally reject events older than a bound, such as 7 days, and
  park them for manual review.

### 3.3 Idempotency

- **Inbound events:** keep the unique `razorpay_webhook_receipts.event_id` and the body-digest check.
  A replay returns 200 with no side effect. `X-Razorpay-Event-Id` is not covered by the signature, so
  fulfilment must also be idempotent on `provider_payment_id` (unique allocation already exists) and
  on `order_id` (new unique column).
- **Outbound order creation:** derive the key from the business operation:
  `receipt = "rexp_<paymentId>_<attempt>"`. Inside one transaction, insert a `razorpay_orders` row in
  state `RESERVED` with `UNIQUE(payment_id, attempt)`, then call the Orders API, then store `order_id`.
  - If the same student retries, return the stored `order_id`.
  - If the process crashes between the API call and the store, the next attempt looks for an existing
    order with that `receipt` before it creates one. Confirm whether the current Razorpay Orders API
    accepts an idempotency header. Until that is confirmed, do not rely on one.
- **Refunds (section 3.6):** derive the key from the refund request id, and store it before the API call.
- **Ordering:** never apply deltas from event order. On each event, re-read the stored order and
  obligation under `SELECT … FOR UPDATE`. In test mode, also fetch the current payment from the API
  (`GET /v1/payments/:id`) and act on its current state. This addresses G4.

### 3.4 Amount and currency checks

Fulfil only when **all** of the following hold. Otherwise store the receipt, do not fulfil, and flag it
for staff:

1. The event `account_id` equals the configured test account id.
2. `payload.payment.entity.order_id` equals a stored `razorpay_orders.order_id` in state `CREATED`.
3. `amount` (integer paise or other minor unit) equals `re_exam_payments.amount_minor`, **and**
   `currency` equals `re_exam_payments.currency`. Both values come from the server-side obligation
   snapshot, never from the browser, notes or button configuration. Partial or excess payments are
   never fulfilled; this mirrors `re-exam-payments.service.ts:831-876`.
4. `status = captured` and `captured = true`. `authorized` is not paid.
5. The obligation is still `AWAITING_PAYMENT` or `SUBMITTED`, and the application is not
   `CANCELLED` / `REJECTED`. A capture against a voided obligation is a **refund candidate**, not a
   silent success.
6. Currency exponent: the current obligations use minor units. Before enabling any currency other than
   INR, confirm that Razorpay supports it and that the exponent matches ISO 4217 (`JPY` = 0, `KWD` = 3).
   No conversion takes place.

### 3.5 Reconciliation

- **Per payment (real time):** the webhook binds `order_id → obligation`. The existing staff
  reconciliation (`payment-buttons.service.ts:190-273`) becomes the fallback for unmatched receipts.
- **Daily (worker job on the `system` queue):** compare three sources over the previous settlement day:
  1. Razorpay payments and refunds (API list, test mode).
  2. `razorpay_orders` + `razorpay_webhook_receipts`.
  3. `re_exam_payments` in `VERIFIED`, plus refund states.
     Then compare against the settlement report: gross, minus Razorpay fee, minus GST, equals net
     settled. Write one `razorpay_reconciliation_runs` row per day with counts and drift in minor units.
     Alert when drift ≠ 0, when a capture is unmatched, or when a verified obligation has no capture.
     Test-mode settlements may be simulated or absent. Record that in the run rather than reporting a
     false zero.
- Report query shape (illustrative):

```sql
SELECT o.payment_id, o.order_id, p.amount_minor AS due, r.amount_minor AS captured,
       p.currency, r.currency AS captured_currency
FROM razorpay_orders o
JOIN re_exam_payments p ON p.id = o.payment_id
LEFT JOIN razorpay_webhook_receipts r
       ON r.provider_payment_id = o.provider_payment_id AND r.event_type = 'payment.captured'
WHERE (p.status = 'VERIFIED' AND r.id IS NULL)
   OR (r.id IS NOT NULL AND (r.amount_minor <> p.amount_minor OR r.currency <> p.currency));
```

### 3.6 Refunds and disputes

- Phase 1 (test mode): refunds are **issued in the Razorpay dashboard by finance**. Docversity ingests
  `refund.created`, `refund.processed` and `refund.failed`, and the dispute events
  (`payment.dispute.created` / `.won` / `.lost` / `.closed`; confirm the names against the current
  webhook catalogue).
- New obligation states, added through a new migration:
  - `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED` and `DISPUTED`.
  - Transitions: from `VERIFIED` only, driven by signed events or an authorized staff action, and
    audited.
  - The total refunded can never exceed the amount captured. Reuse the ceiling check from
    `sandbox-gateway.service.ts:229`.
- Phase 2 (optional): an API-initiated refund from Docversity.
  - It needs a new permission (for example `payments.refund`).
  - Requester ≠ approver, following the pattern in migration `20261016093000`.
  - Key the refund by request id, and require a reason code.
- A refund **never** changes the academic application automatically. The registrar decides separately.
- A dispute freezes the obligation and notifies finance. The evidence deadline is set by Razorpay and
  is shown in the staff view.

### 3.7 Audit trail

Same-transaction `AuditService.writeAuditEvent`. Metadata holds IDs, codes and amounts only, never
signatures, secrets, email, phone, card or VPA. New actions:

| Action                                 | Entity                      | Metadata                                               |
| -------------------------------------- | --------------------------- | ------------------------------------------------------ |
| `RAZORPAY_ORDER_CREATED`               | `RazorpayOrder`             | paymentId, attempt, amountMinor, currency, mode=`TEST` |
| `RAZORPAY_WEBHOOK_RECEIVED` (exists)   | `RazorpayWebhookReceipt`    | eventType, matched (bool), reason code if unmatched    |
| `RAZORPAY_PAYMENT_CAPTURED_MATCHED`    | `ReExamPayment`             | receiptId, orderId, mode                               |
| `RAZORPAY_PAYMENT_RECONCILED` (exists) | `ReExamPayment`             | manual fallback                                        |
| `RAZORPAY_REFUND_RECORDED`             | `ReExamPayment`             | refundId, amountMinor, status                          |
| `RAZORPAY_DISPUTE_RECORDED`            | `ReExamPayment`             | disputeId, phase                                       |
| `RAZORPAY_RECONCILIATION_RUN`          | `RazorpayReconciliationRun` | day, counts, driftMinor                                |

Receipts and orders stay append-only. Order state changes go into an event table, not into updates,
following the `retotaling_events` pattern.

---

## 4. Configuration flags and secrets

### 4.1 Flags that keep production disabled

Add these to the API env schema (`apps/api/src/config/api-config.ts`, Zod, fail fast at startup):

| Variable                               | Values                               | Rule                                                                                                                                                          |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_RAZORPAY_MODE`               | `disabled` (default) \| `test`       | There is **no `live` value**. Live mode needs a code change, a review and a university sign-off.                                                              |
| `PAYMENTS_ALLOWED_DEPLOYMENT`          | free text, for example `staging-14c` | Required when the mode is `test`. Must match `DOCVERSITY_DEPLOYMENT` (a new variable, set per instance). The production instance never sets an allowed value. |
| `RAZORPAY_KEY_ID`                      | string                               | Required when the mode is `test`, and must start with `rzp_test_`. Startup refuses `rzp_live_`. The spelling is a guard, not proof; see section 5, step 1.    |
| `RAZORPAY_KEY_SECRET`                  | secret                               | Required when the mode is `test`. 16–256 bytes. Never logged.                                                                                                 |
| `RAZORPAY_WEBHOOK_SECRET`              | secret                               | Required when the mode is `test`. At least 32 bytes. It must differ from `RAZORPAY_KEY_SECRET` and `SESSION_SECRET`.                                          |
| `RAZORPAY_ACCOUNT_ID`                  | `acc_…`                              | Required when the mode is `test`. Compared with the event `account_id`.                                                                                       |
| `PAYMENTS_TEST_REGISTRATION_ALLOWLIST` | comma-separated UUIDs                | Optional. Limits test checkout to synthetic registrations.                                                                                                    |

Startup refuses to boot when:

- the mode is `test` and `DOCVERSITY_DEPLOYMENT` is unset or does not equal `PAYMENTS_ALLOWED_DEPLOYMENT`;
- any `RAZORPAY_*` variable is set while the mode is `disabled`, which catches misconfiguration;
- the key id looks like a live key.

The contract literals `liveTransactionsEnabled: false` and `checkout.mode: 'TEST'` stay in
`payment-buttons.ts`, so even a misconfigured server cannot send a live checkout to the browser. The
redacting logger (`common/json-logger.ts`) must list `keySecret`, `webhookSecret`, `signature`,
`razorpay_signature` and the `x-razorpay-signature` header.

### 4.2 Supplying test-mode keys

- Keys are generated by the **account owner** in the Razorpay dashboard, in test mode. They are never
  pasted into chat, issues, PRs or commit messages.
- **Render staging (14C):** add them as Render Secret Files or secret env vars on the private API
  service only. Use the existing `deploy/render/render.py` secret-file flow (`.local/render/secret-files`,
  gitignored), which never prints a secret. The web service gets only `RAZORPAY_KEY_ID`, if it needs
  one at all; the API can return the key id with the order instead.
- **VPS staging (14B):** use a root-owned `0600` env file outside the repository, loaded by
  `deploy/scripts/staging.py`. Never put the keys in `deploy/env/*.example`.
- **CI:** CI never receives real test keys. Unit and integration tests keep using synthetic secrets
  generated in code (as in `re-exam-payments.test.ts:1254`) and signing synthetic payloads locally.
  No GitHub Actions secret is added. If an optional live-sandbox smoke job is ever wanted, it runs
  manually from the operator machine, not in CI.
- **Rotation:** rotate both secrets after the staging test window and whenever someone with access
  leaves. Webhook-secret rotation in Razorpay is immediate, so plan a short window of 4xx responses
  and rely on Razorpay's retries.
- Add a pre-commit or CI secret scan for `rzp_(test|live)_[A-Za-z0-9]{14}` and high-entropy
  `RAZORPAY_*=` lines, using an existing scanner if the repository has one.

---

## 5. Staging-only verification plan (Razorpay test mode)

Preconditions: the university has answered section 6. A staging instance (14B or 14C) is deployed
with `PAYMENTS_RAZORPAY_MODE=test`, and the production instance is untouched. All students and
registrations are synthetic.

1. **Account check:** the owner confirms in the dashboard that test mode is active, that the account
   id matches `RAZORPAY_ACCOUNT_ID`, and that the webhook points to the staging URL. Record a
   screenshot privately; do not commit it.
2. **Ingress:** open a narrowly scoped bypass of the reviewer gate for `POST
/api/v1/payment-buttons/webhook` only (a Caddy `handle` before `reviewer_gate`). The HMAC is the
   authentication on that path. Confirm that every other path still returns the gate challenge
   (`gate_regression.py` and `edge_regression.py` must pass).
3. **Raw-body integrity:** send a dashboard "test webhook" and confirm the signature verifies. This
   proves that Caddy and the Next.js proxy keep the bytes unchanged.
4. **Happy path:** a synthetic student creates an order and pays with a Razorpay test card or a test
   UPI success id. Expected: `payment.captured` and `order.paid` arrive, one obligation becomes
   `VERIFIED`, two audit rows are written, and the application status is unchanged.
5. **Failure catalogue:** run each case using Razorpay's published test instruments.
   - Card declined, and UPI failure: the obligation stays `AWAITING_PAYMENT`, the receipt is stored and
     the student sees "Failed".
   - 3DS / OTP challenge abandoned: no capture, no state change.
   - Student closes the tab after paying: the webhook alone fulfils the obligation.
6. **Replay and order:** re-deliver the same event from the dashboard and confirm a 200 with no second
   fulfilment. Post the same `X-Razorpay-Event-Id` with a different body and confirm a 409. Deliver
   `payment.captured` before `order.paid` and the reverse, and confirm one fulfilment either way.
7. **Tampering:** send a wrong signature (400), a wrong `account_id` (400), and an amount that
   differs by 1 paise. For the last one, the receipt is stored, the obligation is not fulfilled and it
   is flagged.
8. **Concurrency:** two browsers click Pay at the same moment and must receive one `order_id`. Fire
   20 parallel deliveries of one event and confirm one fulfilment.
9. **Refund:** finance issues a full refund, then a partial refund on another payment, both in the
   dashboard. Confirm the `refund.*` events, the obligation states and that the refunded total never
   exceeds the capture.
10. **Reconciliation run:** trigger the daily job by hand. Confirm 0 drift, or an explicit "no test
    settlement" note, and that a deliberately orphaned capture is reported.
11. **Disabled check:** on the same build with `PAYMENTS_RAZORPAY_MODE=disabled`, the webhook returns
    404 and the panels return `UNAVAILABLE`. A grep of the **production** environment shows no
    `RAZORPAY_*` variables.
12. **Logs:** search the staging logs for the key secret, the webhook secret and signature values.
    Expect 0 hits.

Exit criteria: every step passes, the evidence is stored privately, and a reviewer signs off. Live
mode stays out of scope.

---

## 6. Open decisions for the university

| #   | Decision                                                                                                                                                                                                                         | Why it blocks                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1  | **Which fees go online:** re-exam only, or also the regular exam fee and the hard-copy certificate fee? Digital certificates are confirmed free.                                                                                 | Exam and certificate fees have no obligation model (G7).                                                     |
| D2  | **Amounts and currency** per fee and per region group. Is INR the only currency? Are the Phase 9C regional groups (Nepal, Bangladesh, Europe, …) charged in INR through Razorpay, or do they stay on manual bank or QR transfer? | Amount checks need an approved server-side source. Razorpay's multi-currency support depends on the account. |
| D3  | **Who pays the gateway fee and GST:** absorbed by the university, or passed to the student as a convenience fee?                                                                                                                 | Changes the amount charged and how reconciliation is done.                                                   |
| D4  | **Refund policy:** when a refund is allowed (application rejected, duplicate payment, exam cancelled), full or partial, the deadline, and who approves.                                                                          | Refund states and permissions depend on it.                                                                  |
| D5  | **Merchant account owner:** which legal entity owns the Razorpay account, and is it the same account the mentor's button IDs belong to? Which bank account receives settlements?                                                 | Ownership of the committed button IDs is unverified.                                                         |
| D6  | **Approvers and roles:** who may see receipts, reconcile by hand, issue refunds and respond to disputes. Requester and approver must be different people.                                                                        | A new permission and role mapping are needed.                                                                |
| D7  | **Payment Buttons or Orders API:** confirm that static buttons may be retired in favour of per-application orders.                                                                                                               | Static buttons mean manual attribution only.                                                                 |
| D8  | **Receipts:** is the Razorpay email receipt enough, or does the university need its own numbered fee receipt?                                                                                                                    | An official receipt is a new document type.                                                                  |
| D9  | **Manual channels:** do manual QR and bank verification stay available alongside Razorpay? What happens if a student pays twice through both?                                                                                    | Double-payment handling turns into refund work.                                                              |
| D10 | **Data retention** for payment evidence and receipts.                                                                                                                                                                            | Receipts are append-only today, with no retention job.                                                       |

---

## 7. Phased task list

Estimates are engineer-days for one developer familiar with the repository. They include tests and
docs, and exclude waiting on university answers.

| Phase                         | Tasks                                                                                                                                                                                                                                                                                                                                                                                          | Estimate               | Depends on                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------- |
| **P0: decisions and account** | Collect answers to D1–D7. Owner creates test-mode keys and the webhook in the dashboard. Write an ADR for "Orders API, test mode, fail-closed config".                                                                                                                                                                                                                                         | 1 + university time    | none                         |
| **P1: config and secrets**    | Env schema (section 4.1) with refusal rules and tests. Logger redaction. Replace `PaymentButtonPolicyService.definition()` with a config-backed policy; keep the test fixture path for unit tests. Secret scan in CI. Render and VPS secret wiring docs.                                                                                                                                       | 2                      | P0 ADR                       |
| **P2: orders**                | Migration for `razorpay_orders` and `razorpay_order_events` (append-only, unique `(payment_id, attempt)` and `order_id`). HTTP client for Razorpay with timeouts and no key logging. Student endpoint to create an order, with ownership and rate limit. Web Checkout launcher; extend `payment-button.tsx`, keep the e2e test showing no script loads when disabled. Handler signature check. | 4                      | P1, D2, D7                   |
| **P3: webhook matching**      | Extend `verifyRazorpayWebhook` to read `order_id` and accept `order.paid` and the refund and dispute events. Order-bound automatic fulfilment with the checks in section 3.4. Re-fetch the payment from the API. Unmatched receipts go to the existing manual flow. Fix G2 with a migration that relaxes the `button_id` CHECK.                                                                | 3                      | P2                           |
| **P4: refunds and disputes**  | Migration for the new obligation states and the refund ceiling. Event ingestion. Staff view. Optional API refund with requester ≠ approver.                                                                                                                                                                                                                                                    | 3 (+2 for API refunds) | P3, D4, D6                   |
| **P5: reconciliation**        | Worker job, run table, staff report page, alerts.                                                                                                                                                                                                                                                                                                                                              | 3                      | P3                           |
| **P6: staging verification**  | Edge bypass for the webhook path, with regression scripts. Run section 5 end to end and keep the evidence.                                                                                                                                                                                                                                                                                     | 2                      | P1–P5, staging authorisation |
| **P7: hand-over**             | Runbook covering refunds, disputes, a Razorpay outage (fall back to the manual 9C flow) and key rotation. Update CLAUDE.md §10d and the API docs. Refresh graphify.                                                                                                                                                                                                                            | 1                      | P6                           |

Total: about **19 engineer-days** (21 with API refunds), plus university lead time. Live mode is a
separate, later change and is not estimated here.

### Risks

| Risk                                                                                                                 | Likelihood     | Effect                                   | Mitigation                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| University answers (D1–D6) are slow                                                                                  | High           | The plan stalls at P0/P2                 | P1 needs no answers. Start there.                                                                                                                                   |
| The webhook bypass of the reviewer gate widens the attack surface                                                    | Medium         | Unauthenticated requests reach the API   | Bypass one path and method only; the HMAC is the authentication there. Keep the rate limit and the 64 KB body cap. Run the regression scripts.                      |
| The Next.js proxy changes the body bytes or headers                                                                  | Low–Medium     | Every signature fails                    | Verify in step 3. If it fails, have Caddy route the webhook path directly to the API.                                                                               |
| Test keys leak into logs, CI or Git                                                                                  | Medium         | Credential rotation, loss of trust       | Section 4.2: secret scan, redaction, no CI secrets, rotation after the test window.                                                                                 |
| Someone adds a `live` value under time pressure                                                                      | Medium         | Real money is collected without approval | The schema has no `live` value, the contract literals stay false, and a key-prefix guard refuses `rzp_live_`. An ADR states that live mode needs a separate review. |
| The mentor's button IDs belong to an account the university does not control                                         | Unknown        | Money settles to the wrong entity        | D5 must be answered before any further use of those IDs.                                                                                                            |
| Double payment through the manual QR flow and Razorpay                                                               | Medium         | Refund work and student complaints       | D9. Disable QR start while a Razorpay order is open, and the reverse.                                                                                               |
| Razorpay API behaviour assumed in this plan (idempotency, event names, settlement reports) differs from current docs | Medium         | Rework                                   | Check each assumption against the current Razorpay docs in P0 and record the doc version in the ADR.                                                                |
| Currency exponent mistakes for currencies other than INR                                                             | Low (INR only) | Charges 100× too much or too little      | D2. Only INR at first. Write an exponent table test before adding any other currency.                                                                               |

---

Not verified here: the branches' local worktrees, any Razorpay dashboard or account, the live API, and
current Razorpay documentation (event names, idempotency headers and settlement endpoints must be
confirmed in P0).
