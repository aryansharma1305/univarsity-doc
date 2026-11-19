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

### 1.4 Gap assessment against current Razorpay documentation (checked 2026-11-19)

Effort: S is up to 1 day, M is 1–3 days, L is more than 3 days. "Blocks pilot" means a Razorpay
test-mode pilot on staging cannot start until the gap is closed.

| #   | Gap                                                                                                                                                                                                                                                                                                    | Location                                                                                 | Effort | Risk if ignored                                                        | Blocks pilot                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------- | ------------------------------------ |
| A1  | The policy is defined in code, carries `webhookSecret`, and is accepted only under `NODE_ENV=test`. A real test secret would have to be committed.                                                                                                                                                     | `apps/api/src/payment-buttons/payment-button-policy.service.ts:7-29`                     | M      | High: secret in Git                                                    | **Yes**                              |
| A2  | No Razorpay variables in the API env schema, so there is no fail-closed mode flag and no live-key refusal.                                                                                                                                                                                             | `apps/api/src/config/api-config.ts:60` (env object)                                      | S      | High: misconfiguration could enable collection                         | **Yes**                              |
| A3  | No Orders API client, order table or Checkout launcher. The only seam returns `null`.                                                                                                                                                                                                                  | `apps/api/src/re-exams/re-exam-payments.service.ts:182-189`; no `razorpay_orders` table  | L      | Medium: only manual attribution is possible                            | **Yes** for an Orders pilot          |
| A4  | The verifier accepts only `payment.captured` / `payment.failed` and ignores `order_id`. Any other signed event (for example `order.paid`, `refund.*`) is refused with 400. Razorpay treats non-2xx as a failure, retries for 24 hours, and then **disables the webhook** ([best practices][rp-wh-bp]). | `packages/payments/src/razorpay.ts:4-19`, `:44-49`; `payment-buttons.service.ts:133-137` | S      | High: one subscribed but unhandled event can disable the whole webhook | **Yes**                              |
| A5  | Reconciliation `buttonId` is pinned to the mentor's re-exam button (contract and DB CHECK), while the test embed must use a different button.                                                                                                                                                          | `packages/validation/src/payment-buttons.ts:46`; `migration.sql:65`                      | S      | Medium: test reconciliation records the wrong button                   | **Yes** for button-based reconciling |
| A6  | The reviewer gate wraps every path, so Razorpay cannot reach the webhook on staging.                                                                                                                                                                                                                   | `deploy/review-site.caddy:17-18`                                                         | S      | High if the bypass is too wide                                         | **Yes**                              |
| A7  | **Resolved (section 8.1):** the bytes are preserved through Caddy, the Next.js proxy and `raw()`, shown by a local check. Remaining hardening: accept any Content-Type on this route, and add a 64 KB cap at Caddy.                                                                                    | `apps/web/src/proxy.ts:9-24`; `apps/api/src/app.setup.ts:42-43`                          | S      | Low                                                                    | No (hardening in P3)                 |
| A8  | The per-IP limit (60/min) returns 429, and the limiter fails closed when Redis is down. Both are non-2xx, so Razorpay retries, and if they persist for 24 hours it disables the webhook.                                                                                                               | `payment-buttons.service.ts:118-123`                                                     | S      | Medium                                                                 | No (monitor)                         |
| A9  | No refund or dispute states on the obligation. Six dispute events and four refund events exist upstream.                                                                                                                                                                                               | `packages/database/prisma/schema.prisma:139-145`                                         | M      | Medium                                                                 | No (blocks only verification step 9) |
| A10 | No authenticated re-fetch of the payment or order before acting. Staff reconcile against a stored snapshot.                                                                                                                                                                                            | `payment-buttons.service.ts:200-227`                                                     | S      | Medium: stale refund state                                             | No                                   |
| A11 | No settlement reconciliation job against `GET /v1/settlements/recon/combined`.                                                                                                                                                                                                                         | none                                                                                     | M      | Low in test mode; high before live                                     | No                                   |
| A12 | The logger redacts keys containing `secret` (which covers `keySecret` and `webhookSecret`), but not `signature`. A logged `x-razorpay-signature` or `razorpay_signature` would appear in clear.                                                                                                        | `apps/api/src/common/json-logger.ts:6`                                                   | S      | Low–Medium                                                             | No (fix in P1)                       |
| A13 | No web Content-Security-Policy was found that allows `checkout.razorpay.com`. If one is added later, Checkout will break. The current CSP state is UNVERIFIED.                                                                                                                                         | `apps/web` (no CSP match found)                                                          | S      | Low                                                                    | No                                   |
| A14 | `packages/payments/README.md` still says the branch is uncommitted.                                                                                                                                                                                                                                    | `packages/payments/README.md`                                                            | S      | Low                                                                    | No                                   |

**Pilot readiness verdict: NOT READY.** Five gaps still block a Razorpay test-mode pilot on staging: A1,
A2, A4 and A6, plus A3 for an Orders pilot or A5 for a button pilot. A7 is resolved (no change is needed
to preserve the bytes). Each remaining gap has a design in section 8. Reaching a minimal Orders-based
pilot needs phases P1–P3 and P6, about 14 engineer-days (revised in section 9.1). Section 9 lists the implementation steps. The signature verification, event-id dedupe
and append-only evidence already on `main` match current Razorpay documentation and can be kept.

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

### 3.0 Razorpay documentation check (2026-11-19)

Each detail below was read from the official page on 2026-11-19. VERIFIED means the page states it.
UNVERIFIED means the page is silent or could not be fetched; do not rely on an UNVERIFIED item
without testing it in staging.

| Topic                        | Finding                                                                                                                                                                                                                                                                                                                                                   | Status                                                                       | Source                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Order amount and currency    | `amount` is an integer in the smallest currency sub-unit (paise for INR); the minimum is 100. `currency` is an ISO code, and the currency must be enabled on the account.                                                                                                                                                                                 | VERIFIED                                                                     | [Create order][rp-order-create]                              |
| Order `receipt`              | At most 40 characters, "has to be unique". The page says that `receipt` is treated as an idempotency key and that a second create with the same value is rejected ("Duplicate request. This request has already been processed.").                                                                                                                        | VERIFIED on the page; behaviour to be confirmed in staging step 8            | [Create order][rp-order-create]                              |
| Order `notes`                | At most 15 key-value pairs, 256 characters each.                                                                                                                                                                                                                                                                                                          | VERIFIED                                                                     | [Create order][rp-order-create]                              |
| Order states                 | `created` → `attempted` → `paid`.                                                                                                                                                                                                                                                                                                                         | VERIFIED                                                                     | [Create order][rp-order-create]                              |
| Find an order by receipt     | `GET /v1/orders?receipt=…` (also `from`, `to`, `count` up to 100, `skip`, `expand[]=payments`).                                                                                                                                                                                                                                                           | VERIFIED                                                                     | [Fetch all orders][rp-order-list]                            |
| Payments of an order         | `GET /v1/orders/{id}/payments`.                                                                                                                                                                                                                                                                                                                           | VERIFIED                                                                     | [Fetch payments for an order][rp-order-pays]                 |
| Fetch one order by id        | `GET /v1/orders/{id}`: not on the page that was fetched.                                                                                                                                                                                                                                                                                                  | UNVERIFIED                                                                   | —                                                            |
| Checkout signature           | `hmac_sha256(order_id + "\|" + razorpay_payment_id, key_secret)`, compared with `razorpay_signature`. The page says to verify it on the server "before fulfilling the order".                                                                                                                                                                             | VERIFIED                                                                     | [Standard Checkout steps][rp-checkout]                       |
| Webhook signature            | Header `X-Razorpay-Signature`: HMAC-SHA256 with the webhook secret as key and the **raw** request body as message ("Do not parse or cast").                                                                                                                                                                                                               | VERIFIED                                                                     | [Validate and test webhooks][rp-wh-validate]                 |
| Webhook event id             | Header `x-razorpay-event-id`, "unique per event", for detecting duplicates. The page does not say the header is signed.                                                                                                                                                                                                                                   | VERIFIED (that it is not signed is inferred)                                 | [Validate and test webhooks][rp-wh-validate]                 |
| Delivery order               | Webhooks may arrive out of order; handlers must not depend on the order.                                                                                                                                                                                                                                                                                  | VERIFIED                                                                     | [Validate and test webhooks][rp-wh-validate]                 |
| Retries and timeout          | Any non-2xx is a delivery failure. There is a 5-second timeout. Retries use exponential backoff for 24 hours from event creation; after 24 hours of continuous failure the webhook is **disabled** and the alert email is notified. IP allow-listing is recommended. Ports 80 and 443 only. Test and Live mode have separate webhook URLs.                | VERIFIED                                                                     | [Best practices][rp-wh-bp], [Webhooks][rp-wh]                |
| Payment events               | `payment.authorized`, `payment.captured`, `payment.failed`, `payment.pending`, `payment.downtime.*`, `order.paid`. The payment entity includes `order_id`, `amount`, `currency`, `status`, `captured`, `amount_refunded` and `notes`; the top level includes `account_id`. `order.paid` carries both the order and the payment entity.                    | VERIFIED                                                                     | [Payment webhooks][rp-wh-pay]                                |
| Refund events                | `refund.created`, `refund.processed`, `refund.failed`, `refund.speed_changed`.                                                                                                                                                                                                                                                                            | VERIFIED                                                                     | [Refund webhooks][rp-wh-refund]                              |
| Dispute events               | `payment.dispute.created`, `.won`, `.lost`, `.closed`, `.under_review`, `.action_required`.                                                                                                                                                                                                                                                               | VERIFIED                                                                     | [Dispute webhooks][rp-wh-dispute]                            |
| Auto-capture                 | Captured automatically by default. Capture settings apply only to Orders API payments. Payments left `authorized` and not captured within the capture window are auto-refunded (the page cites 3 days).                                                                                                                                                   | VERIFIED                                                                     | [Capture settings][rp-capture]                               |
| Refunds API                  | `POST /v1/payments/{id}/refund`. `amount` in the smallest unit; partial refunds are allowed; omitting `amount` refunds in full. `speed` is `normal` or `optimum`. `receipt` and `notes` (15 pairs). Idempotency through the `X-Refund-Idempotency` header (at least 10 characters: letters, digits, `-`, `_`). Status `pending` / `processed` / `failed`. | VERIFIED                                                                     | [Create normal refund][rp-refund]                            |
| Settlement reconciliation    | `GET /v1/settlements/recon/combined?year=&month=[&day=&count=&skip=]`. Each row has a type (`payment`, `refund`, `transfer`, `adjustment`), `amount`, `fee`, `tax`, `payment_id`, `order_id`, `settlement_id`, `settlement_utr`, `dispute_id` and `on_hold`.                                                                                              | VERIFIED                                                                     | [Settlement recon][rp-recon]                                 |
| Settlements in test mode     | Whether test-mode payments produce settlement or recon rows: not stated on the pages that were fetched. The test-mode overview page returned 404.                                                                                                                                                                                                         | UNVERIFIED                                                                   | —                                                            |
| Test keys                    | Generated per mode under Settings → API Keys. The key secret is shown only at generation time. Regeneration can deactivate the old key immediately or within 24 hours. The `rzp_test_` prefix appears on Razorpay's US docs, not on the India page that was fetched.                                                                                      | VERIFIED, except the prefix (UNVERIFIED for India; treat it as a guard only) | [API keys][rp-keys]                                          |
| Test cards                   | The domestic success and failure cards are listed on the test-card page (any future expiry, random CVV). Card numbers are not copied here; use the page.                                                                                                                                                                                                  | VERIFIED                                                                     | [Test cards][rp-cards]                                       |
| Test UPI                     | `success@razorpay` and `failure@razorpay`.                                                                                                                                                                                                                                                                                                                | VERIFIED                                                                     | [Test UPI][rp-upi]                                           |
| Test-mode webhook setup      | The page gives a default OTP for creating or editing webhooks in test mode, and says test events have the same payload structure as live ones.                                                                                                                                                                                                            | VERIFIED                                                                     | [Validate and test webhooks][rp-wh-validate]                 |
| Payment Button events        | `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`.                                                                                                                                                                                                                                                                                 | VERIFIED                                                                     | [Payment Button webhooks][rp-pb-wh]                          |
| Per-student data on a button | Whether a static Payment Button can carry a per-student reference or notes, and whether the webhook names the button: not documented on the button pages. Even if the student types a reference into a field, it is customer-entered and untrusted, so it cannot bind a payment to an obligation.                                                         | UNVERIFIED (and not trustworthy even if available)                           | [Payment Button][rp-pb], [Payment Button webhooks][rp-pb-wh] |

[rp-order-create]: https://razorpay.com/docs/api/orders/create/
[rp-order-list]: https://razorpay.com/docs/api/orders/fetch-all/
[rp-order-pays]: https://razorpay.com/docs/api/orders/fetch-payments/
[rp-checkout]: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
[rp-wh-validate]: https://razorpay.com/docs/webhooks/validate-test/
[rp-wh-bp]: https://razorpay.com/docs/webhooks/best-practices/
[rp-wh]: https://razorpay.com/docs/webhooks/
[rp-wh-pay]: https://razorpay.com/docs/webhooks/payments/
[rp-wh-refund]: https://razorpay.com/docs/webhooks/refunds/
[rp-wh-dispute]: https://razorpay.com/docs/webhooks/disputes/
[rp-capture]: https://razorpay.com/docs/payments/payments/capture-settings/
[rp-refund]: https://razorpay.com/docs/api/refunds/create-normal/
[rp-recon]: https://razorpay.com/docs/api/settlements/fetch-recon/
[rp-keys]: https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/
[rp-cards]: https://razorpay.com/docs/payments/payments/test-card-details/
[rp-upi]: https://razorpay.com/docs/payments/payments/test-upi-details/
[rp-pb]: https://razorpay.com/docs/payments/payment-button/
[rp-pb-wh]: https://razorpay.com/docs/payments/payment-button/subscribe-to-webhooks/

Consequences for this design:

- Subscribe the test webhook **only** to events the handler accepts. Store signed events that are
  valid but unhandled, and answer them with 2xx; never answer them with 4xx. Otherwise 24 hours of
  failures disables the webhook (gap A4).
- Keep the handler under 5 seconds. It is one transaction today. Push any API re-fetch to the worker
  if latency grows.
- Use `order.paid` as the primary fulfilment event, because it carries both the order and the payment.
  `payment.captured` with an `order_id` is an equivalent trigger, and both must fulfil at most once.

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
- **Checkout handler (browser return):** compute
  `HMAC_SHA256(order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET)` and compare it with
  `razorpay_signature` ([docs][rp-checkout]). Use this check only to show "awaiting confirmation". **Fulfil only from the webhook**, because the student can close the tab
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
    order with `GET /v1/orders?receipt=…` before it creates one. The docs state that `receipt` must be
    unique and that a duplicate is rejected ([create][rp-order-create], [list][rp-order-list]).
    Treat that as a second safety net, not the only one, until staging step 8 confirms it. The
    Orders API documents no separate idempotency header.
- **Refunds (section 3.6):** send `X-Refund-Idempotency: refund-<refundRequestId>`, which must be at
  least 10 characters, and store the key before the API call ([refund API][rp-refund]).
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
     Then compare against `GET /v1/settlements/recon/combined` ([docs][rp-recon]): for each row,
     `amount` minus `fee` minus `tax` must equal the net amount settled. Write one `razorpay_reconciliation_runs` row per day with counts and drift in minor units.
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
  `refund.created`, `refund.processed`, `refund.failed` and `refund.speed_changed`
  ([refund webhooks][rp-wh-refund]). It also ingests the dispute events `payment.dispute.created`,
  `.under_review`, `.action_required`, `.won`, `.lost` and `.closed` ([dispute webhooks][rp-wh-dispute]).
- Capture: keep the dashboard default of automatic capture ([capture settings][rp-capture]). An
  `authorized` payment is never treated as paid; if it is not captured in time, Razorpay refunds it
  automatically.
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

Add these to the API env schema (`apps/api/src/config/api-config.ts`, Zod, fail fast at startup). The full schema is in section 8.4:

| Variable                               | Values                               | Rule                                                                                                                                                          |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_RAZORPAY_MODE`               | `off` (default) \| `test` \| `live`  | `live` always refuses to start until a reviewed code change sets the approval constant (section 8.4).                                                         |
| `PAYMENTS_ALLOWED_DEPLOYMENT`          | free text, for example `staging-14c` | Required when the mode is `test`. Must match `DOCVERSITY_DEPLOYMENT` (a new variable, set per instance). The production instance never sets an allowed value. |
| `RAZORPAY_KEY_ID`                      | string                               | Required when the mode is `test`, and must start with `rzp_test_`. Startup refuses `rzp_live_`. The spelling is a guard, not proof; see section 5, step 1.    |
| `RAZORPAY_KEY_SECRET`                  | secret                               | Required when the mode is `test`. 16–256 bytes. Never logged.                                                                                                 |
| `RAZORPAY_WEBHOOK_SECRET`              | secret                               | Required when the mode is `test`. At least 32 bytes. It must differ from `RAZORPAY_KEY_SECRET` and `SESSION_SECRET`.                                          |
| `RAZORPAY_ACCOUNT_ID`                  | `acc_…`                              | Required when the mode is `test`. Compared with the event `account_id`.                                                                                       |
| `PAYMENTS_TEST_REGISTRATION_ALLOWLIST` | comma-separated UUIDs                | Optional. Limits test checkout to synthetic registrations.                                                                                                    |

Startup refuses to boot when:

- the mode is `test` and `DOCVERSITY_DEPLOYMENT` is unset or does not equal `PAYMENTS_ALLOWED_DEPLOYMENT`;
- any `RAZORPAY_*` variable is set while the mode is `off`, which catches misconfiguration;
- the key id looks like a live key.

The contract literals `liveTransactionsEnabled: false` and `checkout.mode: 'TEST'` stay in
`payment-buttons.ts`, so even a misconfigured server cannot send a live checkout to the browser. The
redacting logger (`common/json-logger.ts:6`) already redacts any key containing `secret`. It must
also cover `signature`, which includes `razorpay_signature` and the `x-razorpay-signature` header
(gap A12).

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
4. **Happy path:** a synthetic student creates an order and pays with a success card from the
   [test-card page][rp-cards] or the UPI id `success@razorpay` ([test UPI][rp-upi]). Expected: `payment.captured` and `order.paid` arrive, one obligation becomes
   `VERIFIED`, two audit rows are written, and the application status is unchanged.
5. **Failure catalogue:** run each case using Razorpay's published test instruments.
   - A declined card from the test-card page, and the UPI id `failure@razorpay`: the obligation stays `AWAITING_PAYMENT`, the receipt is stored and
     the student sees "Failed".
   - 3DS / OTP challenge abandoned: no capture, no state change.
   - Student closes the tab after paying: the webhook alone fulfils the obligation.
6. **Delivery failure:** make the endpoint return 503 for a few minutes. Confirm that Razorpay retries
   and that the event is processed once after recovery. Stop well before 24 hours, because the webhook
   is disabled after 24 hours of continuous failure ([best practices][rp-wh-bp]).
7. **Replay and order:** re-deliver the same event from the dashboard and confirm a 200 with no second
   fulfilment. Post the same `X-Razorpay-Event-Id` with a different body and confirm a 409. Deliver
   `payment.captured` before `order.paid` and the reverse, and confirm one fulfilment either way.
8. **Tampering:** send a wrong signature (400), a wrong `account_id` (400), and an amount that
   differs by 1 paise. For the last one, the receipt is stored, the obligation is not fulfilled and it
   is flagged.
9. **Concurrency:** two browsers click Pay at the same moment and must receive one `order_id`.
   Create an order twice with the same `receipt` directly against the API and confirm the documented
   duplicate rejection. Fire
   20 parallel deliveries of one event and confirm one fulfilment.
10. **Refund:** finance issues a full refund, then a partial refund on another payment, both in the
    dashboard. Confirm the `refund.*` events, the obligation states and that the refunded total never
    exceeds the capture.
11. **Reconciliation run:** trigger the daily job by hand. Confirm 0 drift, or an explicit "no test
    settlement" note, and that a deliberately orphaned capture is reported.
12. **Disabled check:** on the same build with `PAYMENTS_RAZORPAY_MODE=off`, the webhook returns
    404 and the panels return `UNAVAILABLE`. A grep of the **production** environment shows no
    `RAZORPAY_*` variables.
13. **Logs:** search the staging logs for the key secret, the webhook secret and signature values.
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
| **P3: webhook matching**      | Extend `verifyRazorpayWebhook` to read `order_id` and accept `order.paid` and the refund and dispute events. Store verified but unhandled events and return 2xx (gap A4). Order-bound automatic fulfilment with the checks in section 3.4. Re-fetch the payment from the API. Unmatched receipts go to the existing manual flow. Fix G2 with a migration that relaxes the `button_id` CHECK.   | 3                      | P2                           |
| **P4: refunds and disputes**  | Migration for the new obligation states and the refund ceiling. Event ingestion. Staff view. Optional API refund with requester ≠ approver.                                                                                                                                                                                                                                                    | 3 (+2 for API refunds) | P3, D4, D6                   |
| **P5: reconciliation**        | Worker job, run table, staff report page, alerts.                                                                                                                                                                                                                                                                                                                                              | 3                      | P3                           |
| **P6: staging verification**  | Edge bypass for the webhook path, with regression scripts. Run section 5 end to end and keep the evidence.                                                                                                                                                                                                                                                                                     | 2                      | P1–P5, staging authorisation |
| **P7: hand-over**             | Runbook covering refunds, disputes, a Razorpay outage (fall back to the manual 9C flow) and key rotation. Update CLAUDE.md §10d and the API docs. Refresh graphify.                                                                                                                                                                                                                            | 1                      | P6                           |

Total: about **19 engineer-days** (21 with API refunds), plus university lead time. Live mode is a
separate, later change and is not estimated here.

### Risks

| Risk                                                                                                       | Likelihood     | Effect                                   | Mitigation                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| University answers (D1–D6) are slow                                                                        | High           | The plan stalls at P0/P2                 | P1 needs no answers. Start there.                                                                                                                                                          |
| The webhook bypass of the reviewer gate widens the attack surface                                          | Medium         | Unauthenticated requests reach the API   | Bypass one path and method only; optionally allow-list Razorpay webhook IPs; the HMAC is the authentication there. Keep the rate limit and the 64 KB body cap. Run the regression scripts. |
| The Next.js proxy changes the body bytes or headers                                                        | Low–Medium     | Every signature fails                    | Verify in step 3. If it fails, have Caddy route the webhook path directly to the API.                                                                                                      |
| Test keys leak into logs, CI or Git                                                                        | Medium         | Credential rotation, loss of trust       | Section 4.2: secret scan, redaction, no CI secrets, rotation after the test window.                                                                                                        |
| Someone adds a `live` value under time pressure                                                            | Medium         | Real money is collected without approval | The schema has no `live` value, the contract literals stay false, and a key-prefix guard refuses `rzp_live_`. An ADR states that live mode needs a separate review.                        |
| The mentor's button IDs belong to an account the university does not control                               | Unknown        | Money settles to the wrong entity        | D5 must be answered before any further use of those IDs.                                                                                                                                   |
| Double payment through the manual QR flow and Razorpay                                                     | Medium         | Refund work and student complaints       | D9. Disable QR start while a Razorpay order is open, and the reverse.                                                                                                                      |
| Razorpay behaviour differs from the docs checked on 2026-11-19 (receipt uniqueness, test-mode settlements) | Low–Medium     | Rework                                   | Section 3.0 marks the UNVERIFIED items; staging steps 9 and 11 test them. Re-check the docs in P0.                                                                                         |
| Currency exponent mistakes for currencies other than INR                                                   | Low (INR only) | Charges 100× too much or too little      | D2. Only INR at first. Write an exponent table test before adding any other currency.                                                                                                      |

## 8. Resolution of the pilot-blocking gaps

### 8.1 A7: are the webhook bytes preserved? Yes, with three caveats

The path on staging is Caddy, then Next.js, then the API. Production is the same (see
`deploy/Caddyfile.production:12-14` for the production edge).

| Hop           | Code                                               | What it does to the body                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caddy         | `deploy/review-site.caddy:7-11`, `:32-36`          | `request_body max_size 16MiB`. `reverse_proxy` streams the body without changing it. The `encode` directive applies to responses only.                                                                                                                                                                                                                                                                                                                   |
| Next.js proxy | `apps/web/src/proxy.ts:9-24`                       | `NextResponse.rewrite` passes only headers (it copies all of them and drops `x-forwarded-for` / `x-real-ip` when it is the edge). Next 16.3.8 clones the body stream chunk by chunk (`next/dist/server/body-streams.js`, `cloneBodyStream`), with no decoding or JSON parsing. The limit is `experimental.proxyClientMaxBodySize` (`apps/web/next.config.ts:38-41`, 16 MiB). **Over the limit, Next only logs a warning and forwards a truncated body.** |
| API           | `apps/api/src/app.setup.ts:42-43`; `main.ts:15-18` | `express.raw({ type: 'application/json', limit: '64kb' })` is mounted in `configureApp`. Nest's own `json()` and `urlencoded()` parsers are registered later, in `NestApplication.init()` → `registerParserMiddleware`, so `raw()` reads the stream first and `json()` then skips it. The handler receives a `Buffer`.                                                                                                                                   |

Evidence: a local check (`apps/api/.local/raw-body-check.mjs`, kept outside Git under the ignored
`.local/` directory; no Docker and no network beyond loopback) used the installed Next 16.3.8
`getCloneableBody` and Express 5.2.1 / body-parser 2.3.0, mounted in the same order as the API. It
sent a body with irregular spacing, `\u` escapes, raw multi-byte UTF-8, an integer larger than 2^53
and a trailing newline, split mid-codepoint across chunks. Results:

- Next clone under the limit: **byte-identical** to the input.
- Next clone over the limit: truncated silently, so the HMAC then fails (fails closed).
- API, `application/json`: `Buffer`, and the HMAC matches.
- API, `application/json; charset=utf-8`: `Buffer`, and the HMAC matches.
- API, `text/plain`: **not** raw-parsed (`req.body` is not a Buffer), so the handler refuses it with 400.
- API, a body over 64 KB: 413.

Where the bytes could still be changed, and the fix for each:

1. **JSON re-serialization.** This happens only if somebody adds a global `express.json()` or Nest
   `rawBody`/`bodyParser` option _before_ `configureApp`, or moves the webhook under a parsed route.
   Fix: keep the existing route-scoped `raw()`, and add an integration test that signs an
   irregular-whitespace body like the one above. The current tests sign `JSON.stringify` output,
   which would also survive a parse-and-re-stringify round trip, so they would not catch this
   regression.
2. **Content type.** A Content-Type that is not JSON skips `raw()` and returns 400. Razorpay retries
   any 4xx, and after 24 hours of failures the webhook is disabled. Razorpay's Content-Type is
   UNVERIFIED. Fix: on this route only, use `raw({ type: () => true, limit: '64kb' })` and let the
   HMAC decide.
3. **Size.** Next truncates silently over 16 MiB, but the 64 KB API limit and the Caddy cap come
   first. Fix: add a 64 KB `request_body` cap on the webhook route at Caddy (section 8.2).
4. **Content-Encoding.** body-parser inflates gzip by default. Whether Razorpay compresses request
   bodies is UNVERIFIED; record the header in staging step 3. If it is ever present, the HMAC must be
   computed over the bytes Razorpay signed, which the docs call the "raw request body".

### 8.2 A6: getting webhooks through the reviewer gate on staging

The gate is a private snippet `(reviewer_gate) { basic_auth @gated {...} }` (generated by
`staging.py review-init`), applied by `@gated not path /robots.txt` (`review-site.caddy:17-18`).
Razorpay cannot send Basic credentials. Design (staging only, opt-in):

```caddy
# deploy/razorpay-webhook.caddy — imported only when staging.py runs with --razorpay-test-webhook
@razorpay_webhook {
	method POST
	path /api/v1/payment-buttons/webhook
}
# review-site.caddy: the gate matcher excludes exactly this method+path
@gated {
	not path /robots.txt
	not {
		method POST
		path /api/v1/payment-buttons/webhook
	}
}
handle @razorpay_webhook {
	request_body {
		max_size 64KB
	}
	reverse_proxy {$WEB_UPSTREAM:web:3000} {
		header_up X-Forwarded-For {client_ip}
	}
}
```

- Route the webhook **through `web`**, as all other `/api` traffic goes. Proxying straight to the API
  would change the hop count that `TRUST_PROXY=2` assumes, and the rate-limit key would then become
  an internal IP. Section 8.1 shows the web hop is byte-safe.
- Without the flag, `@gated` keeps its current form, so the file and the route are absent. The
  production edge (`Caddyfile.production`) has no gate and is not changed.
- `gate_regression.py` (`public_route_order`, `:149-160`) and `edge_regression.py` gain one explicit
  exception, and assert that:
  - `GET` on the webhook path, and any other path, still get 401;
  - `POST /api/v1/payment-buttons/webhookX` and `/api/v1/payment-buttons/webhook/../x` are still gated;
  - the exception exists only when the flag is set.
- Optional: add a `remote_ip` allow-list built from Razorpay's published webhook IPs. The list is
  UNVERIFIED and must be fetched from the docs at setup time.

Security trade-offs:

| Trade-off                                                                    | Effect                                                                                                                            | Mitigation                                                                                                                                                                   |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One unauthenticated POST endpoint becomes reachable on a gated reviewer host | The HMAC is the only authentication on that path. Anyone can make the API do a bounded amount of work (64 KB read plus one HMAC). | 64 KB cap at Caddy and in the API. The HMAC check comes before any database or Redis work (section 8.3). Per-IP limit on _unverified_ requests only. Optional IP allow-list. |
| A leaked webhook secret lets an attacker forge "captured" events             | In test mode the only effect is that synthetic obligations are marked paid.                                                       | Order-bound matching plus amount/currency/account checks, re-fetching the payment with the API key before fulfilment (P3), and rotating the secret after the test window.    |
| The reviewer host becomes discoverable through Razorpay's webhook config     | The hostname is shared with Razorpay.                                                                                             | Use the staging host only. Disable the webhook in the dashboard after the window.                                                                                            |
| Responses leak information                                                   | Error bodies could reveal whether test mode is on.                                                                                | Return identical `{received:true}` bodies for every verified outcome, and the generic 400 for a bad signature. With the mode off, the API returns 404 as it does today.      |
| The bypass could leak into production config                                 | Production would expose an extra route.                                                                                           | The snippet is imported only by `staging.py` behind the flag, and the regression scripts assert that it is absent by default.                                                |

### 8.3 A4: handling events that are signed but not recognized

Rule: **once the signature verifies, Razorpay always gets a 2xx**, unless there is a transient
failure on our side (5xx), which should be retried. Order of steps in the handler (replacing
`payment-buttons.service.ts:116-162`):

1. If the mode is `off`, return 404 (unchanged).
2. Check the size and headers, then the HMAC over the `Buffer`. On failure: increment the per-IP
   unverified-request counter, return **400**, and log a metric with no body. Rate-limit **only** this
   branch. Verified requests are never answered with 429, which removes gap A8.
3. Parse only the envelope (`entity`, `account_id`, `event`, `created_at`), and read the event id
   from the header.
4. Under `pg_advisory_xact_lock(hashtext(eventId))`, check both `razorpay_webhook_receipts` and the
   new `razorpay_webhook_ignored` for that event id.
   - Same id and same body digest: return **200** (replay).
   - Same id, different digest: return **200**, store a `DIGEST_CONFLICT` ignored row, write the audit
     event `RAZORPAY_WEBHOOK_IGNORED` with reason `DIGEST_CONFLICT`, and raise an alert. This replaces
     today's 409 at `:145`, because a signed body is authentic and a 409 would retry for 24 hours and
     then disable the webhook.
5. Decide the outcome:
   - An `account_id` that does not match the configured account: store an ignored row with reason
     `ACCOUNT_MISMATCH`, alert, and return 200.
   - An `event` not in the handled set, or a payload that fails the strict schema for a handled event:
     store an ignored row with reason `UNHANDLED_EVENT` or `UNPARSEABLE`. Keep `event_type`
     (≤ 64 characters, `[a-z._]`), the body SHA-256 and `created_at`, and **no payload**. Audit it
     and return 200.
   - A handled event: process it in the same transaction and return 200.
6. A database, Redis or audit failure returns 5xx so that Razorpay retries. Razorpay disables the
   webhook only after 24 hours of continuous failure ([best practices][rp-wh-bp]). Alert on the
   Razorpay "webhook disabled" email, and on more than 5 % non-2xx responses per hour.

Handled set for the pilot: `payment.captured`, `payment.failed`, `order.paid`. The test webhook is
subscribed to exactly these. Adding `refund.*` or `payment.dispute.*` later is a code change plus a
dashboard change, and while the code lags the dashboard those events are safely ignored.

### 8.4 A1, A2, A3: configuration, data model and API surface

**Configuration.** This replaces the table in section 4.1. It is parsed in `apps/api/src/config/api-config.ts`:

```ts
// shortcut: live approval is a code constant, so enabling live mode is always a reviewed commit.
const RAZORPAY_LIVE_APPROVAL_REF: string | null = null; // e.g. 'ADR-00xx' once the university signs off

const razorpayEnv = z
  .object({
    PAYMENTS_RAZORPAY_MODE: z.enum(['off', 'test', 'live']).default('off'),
    PAYMENTS_RAZORPAY_LIVE_APPROVAL: z.string().optional(), // must equal RAZORPAY_LIVE_APPROVAL_REF
    PAYMENTS_ALLOWED_DEPLOYMENT: z
      .string()
      .regex(/^[a-z0-9-]{3,40}$/)
      .optional(),
    DOCVERSITY_DEPLOYMENT: z
      .string()
      .regex(/^[a-z0-9-]{3,40}$/)
      .optional(),
    RAZORPAY_KEY_ID: z
      .string()
      .regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/)
      .optional(),
    RAZORPAY_KEY_SECRET: z.string().min(16).max(256).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
    RAZORPAY_ACCOUNT_ID: z
      .string()
      .regex(/^acc_[A-Za-z0-9]{1,50}$/)
      .optional(),
    PAYMENTS_TEST_REGISTRATION_ALLOWLIST: z.string().optional(), // comma-separated UUIDs
  })
  .superRefine((e, ctx) => {
    const set = [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET',
      'RAZORPAY_WEBHOOK_SECRET',
      'RAZORPAY_ACCOUNT_ID',
    ] as const;
    if (e.PAYMENTS_RAZORPAY_MODE === 'off') {
      if (set.some((k) => e[k]))
        ctx.addIssue({ code: 'custom', message: 'RAZORPAY_* set while mode is off' });
      return;
    }
    if (set.some((k) => !e[k]))
      ctx.addIssue({ code: 'custom', message: 'missing RAZORPAY_* for enabled mode' });
    if (!e.DOCVERSITY_DEPLOYMENT || e.DOCVERSITY_DEPLOYMENT !== e.PAYMENTS_ALLOWED_DEPLOYMENT)
      ctx.addIssue({ code: 'custom', message: 'deployment not allowed for payments' });
    if (e.RAZORPAY_WEBHOOK_SECRET && [e.RAZORPAY_KEY_SECRET].includes(e.RAZORPAY_WEBHOOK_SECRET))
      ctx.addIssue({ code: 'custom', message: 'webhook secret must differ from key secret' });
    const live = e.RAZORPAY_KEY_ID?.startsWith('rzp_live_');
    if (e.PAYMENTS_RAZORPAY_MODE === 'test' && live)
      ctx.addIssue({ code: 'custom', message: 'live key in test mode' });
    if (
      e.PAYMENTS_RAZORPAY_MODE === 'live' &&
      (RAZORPAY_LIVE_APPROVAL_REF === null ||
        e.PAYMENTS_RAZORPAY_LIVE_APPROVAL !== RAZORPAY_LIVE_APPROVAL_REF)
    )
      ctx.addIssue({ code: 'custom', message: 'live mode is not approved' });
  });
```

The same superRefine also enforces these rules:

- `RAZORPAY_WEBHOOK_SECRET` must differ from `SESSION_SECRET` and `STAFF_MFA_ENCRYPTION_KEY`.
- `live` refuses a `rzp_test_` key.
- While `RAZORPAY_LIVE_APPROVAL_REF` is `null`, `live` **always** fails at startup. The contract
  literals `liveTransactionsEnabled: z.literal(false)` and `checkout.mode: z.literal('TEST')` stay
  until the same reviewed change.
- `PaymentButtonPolicyService.definition()` is deleted. `fixture()` becomes `policy()`, which builds
  from `ApiConfig` (mode, account id, secrets, allowlist). Unit tests inject config through the
  existing `API_CONFIG` token instead of spying on `definition()`.
- The `test`-only `reExamTestButtonId` is dropped from the policy; buttons are not used in the
  Orders pilot.
- `.env.example` and `deploy/env/api.env.example` gain the names with empty values and
  `PAYMENTS_RAZORPAY_MODE=off`.

**Migration outline. Not written; to be generated with `prisma migrate diff`.**

```text
enum RazorpayOrderStatus { RESERVED CREATED PAID ABANDONED CREATE_FAILED }

razorpay_orders
  id                 uuid  pk default uuidv7
  payment_id         uuid  not null fk re_exam_payments(id) on delete restrict
  attempt            int   not null check (attempt between 1 and 99)
  receipt            varchar(40) not null unique      -- 'rx_' || replace(payment_id,'-','') || '_' || attempt
  mode               varchar(4) not null check (mode = 'TEST')   -- widened only by the live-approval change
  account_id         varchar(64) not null
  provider_order_id  varchar(64) unique null          -- 'order_…', write-once
  amount_minor       int   not null check (amount_minor >= 100)
  currency           char(3) not null
  status             RazorpayOrderStatus not null default 'RESERVED'
  student_account_id uuid  not null fk student_accounts(id) on delete restrict
  created_at, updated_at timestamptz(3)
  unique (payment_id, attempt)
  partial unique index (payment_id) where status = ANY (ARRAY['RESERVED','CREATED'])  -- one open order
  trigger DV001: amount_minor/currency must equal re_exam_payments row; provider_order_id write-once;
                 status forward-only (RESERVED→CREATED|CREATE_FAILED, CREATED→PAID|ABANDONED); no DELETE

razorpay_order_events   (append-only, DV001 on UPDATE/DELETE)
  id, order_id fk, kind ('RESERVED'|'CREATED'|'CHECKOUT_RETURNED'|'PAID'|'ABANDONED'|'CREATE_FAILED'),
  receipt_id fk razorpay_webhook_receipts null, actor_user_id null, actor_account_id null, created_at

razorpay_webhook_ignored   (append-only)
  id, event_id varchar(128) not null, event_type varchar(64), body_sha256 char(64),
  reason ('UNHANDLED_EVENT'|'UNPARSEABLE'|'ACCOUNT_MISMATCH'|'DIGEST_CONFLICT'), created_at
  index (event_id)   -- not unique: a DIGEST_CONFLICT row shares the id of the first delivery

alter razorpay_webhook_receipts add provider_order_id varchar(64) null, index
  (append-only trigger already blocks updates; new rows only)
alter razorpay_webhook_receipts: allow event_type 'order.paid' (application-level enum)
drop + recreate razorpay_reconciliation_button CHECK → button_id ~ '^pl_[A-Za-z0-9]{1,50}$' (A5)
enum ReExamPaymentSubmissionSource gains 'RAZORPAY_TEST' (or audit-metadata only; decide in P2 review)
```

**API surface.**

| Route                                                       | Guard                                                                | Behaviour                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/student/re-exam-payments/:id/razorpay-order`  | `@StudentRoute()`, CSRF, own payment, rate limit (5/min per account) | Mode `test` only, otherwise 404. The obligation must be `AWAITING_PAYMENT` with a usable destination and its registration on the allowlist. Reserve, then create at Razorpay, then store. Replays return the same order. Response: `{ orderId, keyId, amountMinor, currency, mode: 'TEST' }`, with no secret and no PII prefill. |
| `POST /api/v1/student/re-exam-payments/:id/razorpay-return` | `@StudentRoute()`, CSRF                                              | Body `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`. Verifies the checkout HMAC and appends a `CHECKOUT_RETURNED` event. **Never** changes payment status. Returns `{ status: 'AWAITING_CONFIRMATION' }`.                                                                                                      |
| `GET /api/v1/student/payment-buttons/re-exam/:id` (exists)  | unchanged                                                            | `checkout` becomes a discriminated union: `{ mode:'TEST', kind:'ORDER' }`, or the existing button shape, which is retained only for the unit tests.                                                                                                                                                                              |
| `POST /api/v1/payment-buttons/webhook` (exists)             | `@Public()`, HMAC                                                    | Section 8.3. Order-bound fulfilment moves the obligation to `VERIFIED`; the academic application is unchanged.                                                                                                                                                                                                                   |
| `GET /api/v1/payment-buttons/re-exam/:id/receipts` (exists) | `reExamPayments.verify`                                              | Adds `orders[]` with status and `providerOrderId`.                                                                                                                                                                                                                                                                               |
| Outbound client `packages/payments/src/razorpay-client.ts`  | server only                                                          | `createOrder`, `findOrdersByReceipt`, `fetchPayment`. Fixed base URL `https://api.razorpay.com/v1` (not configurable), Basic auth from config, `AbortSignal.timeout(8000)`, `redirect: 'error'`, strict Zod response parsing, and no logging of the request or response bodies.                                                  |

---

## 9. Implementation checklist (P1–P3 and P6)

Each step is one reviewable commit. A step is done only when its acceptance tests pass, together
with all of CLAUDE.md §4. Estimates are revised in section 9.1.

**P1: configuration and secrets**

1. **Env schema (section 8.4).** Acceptance: unit tests that
   - (a) `off` with any `RAZORPAY_*` set refuses to start;
   - (b) `test` with a missing secret refuses;
   - (c) `test` with `rzp_live_` refuses;
   - (d) `live` refuses while `RAZORPAY_LIVE_APPROVAL_REF` is null, even with
     `PAYMENTS_RAZORPAY_LIVE_APPROVAL` set;
   - (e) a deployment mismatch refuses;
   - (f) a webhook secret equal to the key secret or `SESSION_SECRET` refuses;
   - (g) the default (`off`) boots, and the webhook returns 404, as in the existing test at
     `re-exam-payments.test.ts:1312`.
2. **Config-backed policy.** Delete `definition()` and inject `ApiConfig`. Acceptance: the existing
   Razorpay API tests pass with config injection instead of `vi.spyOn(..., 'definition')`, and
   `grep -R "webhookSecret:" apps/api/src` returns nothing.
3. **Logger redaction (A12).** Add `signature` to `SENSITIVE_KEY`. Acceptance: a logger unit test
   shows that `{ 'x-razorpay-signature': 'ab', razorpay_signature: 'cd', keySecret: 'x' }` is redacted.
4. **Secret scan.** Acceptance: CI fails on a fixture file containing a `rzp_test_` +14-character
   token, and passes on the current tree.
5. **Example env files and docs.** Acceptance: `deploy/scripts/check-config.py` accepts
   `PAYMENTS_RAZORPAY_MODE=off` with no `RAZORPAY_*` variables.

**P2: orders**

6. **Migration (section 8.4).** Acceptance: `pnpm db:check` is clean. DB tests show that:
   - a second open order for the same payment hits a unique violation;
   - an amount or currency different from the obligation raises DV001;
   - changing `provider_order_id` a second time raises DV001;
   - a backwards status change raises DV001;
   - DELETE raises DV001;
   - the relaxed button CHECK accepts a synthetic `pl_` id.
7. **Outbound client.** Acceptance: unit tests against a local `http.createServer` stub cover a
   timeout (rejects after 8 s, using a fake clock), a 3xx (rejected), a malformed JSON response
   (rejected), a duplicate-receipt error (mapped to `DUPLICATE_RECEIPT`), and no secret appearing in
   error messages.
8. **Order endpoint.** Acceptance: API tests prove that:
   - an owner creates an order;
   - a replay returns the same `orderId`;
   - 10 concurrent calls produce exactly one Razorpay create on the stub and one row;
   - another student gets 404;
   - a crash between the create and the store is recovered through `findOrdersByReceipt`, without a
     second create;
   - mode `off` returns 404;
   - a registration not on the allowlist gets 404;
   - CSRF is required.
9. **Checkout return endpoint.** Acceptance: a valid HMAC appends a `CHECKOUT_RETURNED` event and
   the payment status is unchanged; an invalid HMAC returns 400; a replay is idempotent.
10. **Web launcher.** Acceptance:
    - The Vitest component test loads `checkout.js` only when `checkout.kind === 'ORDER'`.
    - `apps/web/e2e/payment-buttons.spec.ts` still proves that no script is requested when the mode
      is off.
    - axe passes and there is no horizontal overflow at 390 px.

**P3: webhook matching**

11. **Verifier extension.** Read `order_id`, add `order.paid`, and split envelope parsing from strict
    payload parsing. Acceptance: package tests for each handled event, for an unknown event (envelope
    parsed, payload not), for a larger-than-2^53 integer body (signature still valid), and for an
    irregular-whitespace body.
12. **Handler order and the 2xx rule (section 8.3).** Acceptance: API tests prove that:
    - an unknown signed event → 200, an ignored row, an audit row, and no receipt;
    - a signed account mismatch → 200 plus an ignored row;
    - the same event id with a different digest → 200 plus a `DIGEST_CONFLICT` row;
    - a bad signature → 400, and the 61st bad-signature request from one IP → 429;
    - 100 verified requests from one IP are never answered with 429;
    - a database failure → 5xx.
13. **Order-bound fulfilment (section 3.4).** Acceptance: API tests prove that:
    - `payment.captured`, `order.paid`, or both in either order → exactly one `VERIFIED`, one
      `PAID` order event, one audit row, and an unchanged application status;
    - a 1-paise difference, a currency difference, an `authorized` status, or an unknown `order_id`
      → receipt stored, not fulfilled, and the order stays `CREATED`;
    - 20 parallel deliveries → one fulfilment;
    - a capture on a VOID obligation → flagged as a refund candidate, not fulfilled.
14. **Re-fetch before fulfilment (A10).** Acceptance: when the stubbed `fetchPayment` returns
    `refunded`, fulfilment is refused and flagged.
15. **Raw-content-type hardening (section 8.1, item 2).** Acceptance: a `text/plain` body with a
    valid signature is accepted, and a body over 64 KB returns 413.

**P6: staging verification**

16. **Caddy snippet behind a `staging.py` flag (section 8.2).** Acceptance:
    - `gate_regression.py` and `edge_regression.py` pass with the flag both off and on;
    - the new assertions in section 8.2 pass;
    - `caddy adapt` output shows that without the flag every reverse proxy except `/robots.txt` is
      behind `basic_auth`.
17. **Deploy to staging with `PAYMENTS_RAZORPAY_MODE=test`**, using the secrets from section 4.2.
    Acceptance: the boot log shows `payments: razorpay mode=test deployment=<name>` and no secret.
18. **Run section 5, steps 1–13**, keeping the evidence privately. Acceptance: every step passes, the
    Content-Encoding and Content-Type that Razorpay sends are recorded, and the duplicate-receipt
    behaviour is observed.
19. **Tear down.** Set the mode back to `off`, disable the webhook in the dashboard, rotate both
    secrets, and remove the flag. Acceptance: the webhook returns 404 and the gate is back to its
    default form.

### 9.1 Revised estimate (pilot scope)

| Phase           | Was | Now                  | Why                                                                                |
| --------------- | --- | -------------------- | ---------------------------------------------------------------------------------- |
| P1              | 2   | 2.5                  | Policy refactor touches the existing tests; secret scan.                           |
| P2              | 4   | 5                    | Outbound client with a stub server; crash-recovery path; checkout-return endpoint. |
| P3              | 3   | 4                    | Ignored-events table, handler reorder, digest-conflict change, re-fetch.           |
| P6              | 2   | 2.5                  | Caddy snippet, a flag in `staging.py`, and changes to two regression scripts.      |
| **Pilot total** | 11  | **14 engineer-days** | P4, P5 and P7 are unchanged (7–9 days) and not needed for the pilot.               |

### 9.2 Decisions needed before P6

- **Ops:**
  - Authorize the staging-only gate exception and decide whether to add the Razorpay IP allow-list.
  - Name the person who holds the test keys and the alert inbox for Razorpay's "webhook disabled"
    email.
  - Decide which staging hostname is registered in the dashboard, and the test window.
- **University:** D2 (INR amounts for the synthetic pilot can be placeholders, but the real fee
  source must be named), D5 (which account the test keys come from) and D7 (Orders API instead of
  buttons).

---

Not verified here: the branches' local worktrees, any Razorpay dashboard or account, and any real API
call. The Razorpay documentation was read on 2026-11-19 (section 3.0). Items marked UNVERIFIED there
must be confirmed in staging before anyone relies on them.
