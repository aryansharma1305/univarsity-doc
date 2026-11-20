# Razorpay test mode (pilot P1–P3)

Design and open decisions: [plan](../plans/razorpay-test-mode-plan.md),
[ADR-0022](../decisions/ADR-0022-razorpay-test-mode-orders.md). Default `PAYMENTS_RAZORPAY_MODE=off`:
the webhook and both student routes answer 404 and no provider call is possible.

| Piece            | Where                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| Config rules     | `apps/api/src/config/api-config.ts` (`PAYMENTS_RAZORPAY_MODE`, `RAZORPAY_*`)           |
| Policy + port    | `apps/api/src/payment-buttons/payment-button-policy.service.ts` (`RAZORPAY_HTTP_PORT`) |
| Client           | `packages/payments/src/razorpay-client.ts` (Orders, Payments, Refunds; fixed base URL) |
| Events/signature | `packages/payments/src/razorpay.ts`                                                    |
| Orders + match   | `apps/api/src/payment-buttons/razorpay-orders.service.ts`                              |
| Webhook          | `apps/api/src/payment-buttons/payment-buttons.service.ts` (`webhook`)                  |
| Tables           | migration `20261119090000_razorpay_test_orders`                                        |

Operator rules:

- **Production must have no `RAZORPAY_*` variable at all** (and no `PAYMENTS_*` other than
  `PAYMENTS_RAZORPAY_MODE=off`). The API refuses to start with any `RAZORPAY_*` while off, and
  refuses deployment names matching `prod`, `production`, `live` or `main` in test mode.
- The Razorpay **test account must keep automatic capture on** (Settings, Capture). An
  `authorized` payment is never treated as paid; without auto-capture, payments stay authorized
  and are auto-refunded by Razorpay.
- Mark each synthetic registration before a pilot (both checks must pass):
  `INSERT INTO razorpay_test_registrations (registration_id, marked_by_user_id, note) VALUES (…, …, 'Synthetic pilot');`
  plus `PAYMENTS_TEST_REGISTRATION_ALLOWLIST`.
- Run `pnpm --filter @docversity/api razorpay:reconcile` daily (exit 0 clean, 2 issues found, 1 error).
  Alerts go to the `PAYMENT_ALERT_SINK` provider (default: a `PaymentAlerts` warning log line);
  wire it to e-mail or chat for the pilot.
- Unpaid orders are abandoned after 30 minutes locally. Razorpay-side order expiry (`expire_by`) is
  **not** sent: the parameter could not be verified for the Orders API, so a capture on an abandoned
  order is flagged as a refund candidate instead.

Routes (test mode only):

- `POST /api/v1/student/re-exam-payments/:id/razorpay-order` (student, CSRF, 5/min/account) →
  `{ orderId, keyId, amountMinor, currency, mode: 'TEST' }`.
- `POST /api/v1/student/re-exam-payments/:id/razorpay-return` (student, CSRF) →
  `{ status: 'AWAITING_CONFIRMATION' }`; never changes the obligation.
- `POST /api/v1/payment-buttons/webhook` (public, HMAC) → always `{ received: true, attributed: false }`.

Flag reasons on `razorpay_order_events` (kind `FLAGGED`) and `RAZORPAY_PAYMENT_CAPTURE_FLAGGED`
audits: `ACCOUNT_MISMATCH`, `NOT_CAPTURED`, `UNUSABLE_REFERENCE`, `PROVIDER_UNVERIFIED` (not
final: reconciliation re-matches it), and the refund candidates `AMOUNT_MISMATCH`,
`ORDER_NOT_OPEN`, `PROVIDER_STATE_MISMATCH`, `OBLIGATION_NOT_OPEN`, `ORDER_ALREADY_PAID`,
`PAYMENT_ALREADY_USED`.

Reconciliation query (captures vs obligations, exact money):

```sql
SELECT o.payment_id, o.provider_order_id, p.status, p.amount_minor AS due, p.currency,
       r.amount_minor AS captured, r.currency AS captured_currency
FROM razorpay_orders o
JOIN re_exam_payments p ON p.id = o.payment_id
LEFT JOIN razorpay_webhook_receipts r
       ON r.provider_payment_id = o.provider_payment_id AND r.captured
WHERE (o.status = 'PAID' AND r.id IS NULL)
   OR (r.id IS NOT NULL AND (r.amount_minor <> p.amount_minor OR r.currency <> p.currency))
   OR (o.status = 'PAID' AND p.status NOT IN ('SUBMITTED', 'VERIFIED'));
```

Not built: the web Checkout launcher, the staging reviewer-gate exception (plan 8.2), refund and
dispute states and events, a scheduler for the reconciliation command, and anything for live mode.

## Completion (checkout UI, staff workspace, refunds, worker job)

**Shared core.** `@docversity/payments/server` holds every money decision once (matching, refunds,
reconciliation, order abandonment). The API and the worker both call it; the worker image does
not need the API.

**State mapping (brief → existing model).** No obligation state was added; the Phase 9C obligation
(`re_exam_payments`) keeps `AWAITING_PAYMENT → SUBMITTED → VERIFIED/REJECTED`, and staff still verify.

| Brief state             | Where it lives                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| PENDING                 | `razorpay_orders.status` RESERVED or CREATED, no FLAGGED event                                 |
| AUTHORIZED              | Never stored as paid. Reconciliation reports `AUTHORIZED_UNCAPTURED`; Razorpay auto-refunds it |
| CAPTURED / PAID         | order PAID + obligation SUBMITTED (signed capture, re-fetched, amount and currency exact)      |
| FAILED                  | order CREATE_FAILED; a failed payment attempt leaves the order PENDING for a retry             |
| RECONCILIATION_REQUIRED | an order with a FLAGGED event (reason code; refund candidates marked)                          |
| ABANDONED               | order ABANDONED (manual submission, void, cancel, expiry, payability re-check)                 |
| REFUND_PENDING          | derived: any refund REQUESTED / APPROVED / PENDING                                             |
| PARTIALLY_REFUNDED      | derived: 0 < PROCESSED total < captured                                                        |
| REFUNDED                | derived: PROCESSED total = captured                                                            |
| refund FAILED           | `razorpay_refunds.status` FAILED (provider refusal or `refund.failed`)                         |

**Student.** `/student/examinations/re-exam/[applicationId]/payment` shows "Pay online (TEST)" only
when the server offers `checkout.kind = ORDER` (mode test, payable obligation, allowlisted and
DB-marked synthetic registration). The server creates the order; the browser gets the public key
id and order id only. States: preparing, open, verifying, awaiting confirmation, cancelled,
failed, unavailable, network. History and an acknowledgement that is **not an official receipt**.

**Staff.** The payment detail page shows the Razorpay TEST workspace (`reExamPayments.read`):
orders, derived states, provider ids, refunds and the Razorpay audit trail. Search by `order_…`
(exact) or the `pay_…` reference. Refund actions need `reExamPayments.verify`.

**Refunds.** Disabled unless `PAYMENTS_RAZORPAY_REFUNDS` is `full_only` or `partial` (test mode only;
default `off` because the university refund policy is open). One person requests, a different one
approves or rejects (service check and DB CHECK). The DB trigger keeps live refunds ≤ the capture
under the order lock. Each refund has a unique `refund-<hex>` key sent as `X-Refund-Idempotency` and
a unique `rf_<hex>` receipt; signed `refund.*` webhooks are matched by receipt and move a refund
forward only. A refund never changes the obligation or the application.

**Worker.** In test mode the worker consumes the `payments` queue and upserts one job scheduler
(`razorpay-reconcile`, every 15 minutes). Mode off schedules and consumes nothing.
`pnpm --filter @docversity/api razorpay:reconcile` runs the same reconciliation by hand.
