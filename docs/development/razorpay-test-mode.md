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

Routes (test mode only):

- `POST /api/v1/student/re-exam-payments/:id/razorpay-order` (student, CSRF, 5/min/account) →
  `{ orderId, keyId, amountMinor, currency, mode: 'TEST' }`.
- `POST /api/v1/student/re-exam-payments/:id/razorpay-return` (student, CSRF) →
  `{ status: 'AWAITING_CONFIRMATION' }`; never changes the obligation.
- `POST /api/v1/payment-buttons/webhook` (public, HMAC) → always `{ received: true, attributed: false }`.

Flag reasons on `razorpay_order_events` (kind `FLAGGED`) and `RAZORPAY_PAYMENT_CAPTURE_FLAGGED`
audits: `AMOUNT_MISMATCH`, `ACCOUNT_MISMATCH`, `NOT_CAPTURED`, `PROVIDER_UNVERIFIED`,
`PROVIDER_STATE_MISMATCH`, `ORDER_NOT_OPEN`, `UNUSABLE_REFERENCE`, and the refund candidates
`OBLIGATION_NOT_OPEN`, `ORDER_ALREADY_PAID`, `PAYMENT_ALREADY_USED`.

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
dispute states and events, the daily settlement reconciliation job, and anything for live mode.
