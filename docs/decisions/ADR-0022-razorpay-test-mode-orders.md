# ADR-0022: Razorpay test-mode collection through the Orders API, fail-closed configuration

Status: accepted for **test mode only** (pilot scope P1–P3 of
`docs/plans/razorpay-test-mode-plan.md`). Live collection is out of scope and needs a new ADR.

## Context

The Payment Button integration (PR #31) can only attribute payments by hand, and its policy was a
code-defined fixture that held the webhook secret and worked only under `NODE_ENV=test`. A staging
pilot needs runtime secrets, a server-trusted link between a Razorpay payment and a Phase 9C
obligation, and a webhook that never answers an authentic event with 4xx.

## Decision

1. `PAYMENTS_RAZORPAY_MODE=off|test|live`, default `off`. Startup refuses any `RAZORPAY_*` while off,
   an incomplete test configuration, a deployment not named in `PAYMENTS_ALLOWED_DEPLOYMENT`, a live
   key id in test mode, a webhook secret equal to another secret, and `live` while the code constant
   `RAZORPAY_LIVE_APPROVAL_REF` is `null` (only a reviewed commit can change it).
2. Orders API + Standard Checkout. One `razorpay_orders` row per obligation attempt; amount and
   currency come only from the obligation snapshot (DB trigger), receipt `rx_<obligation>_<attempt>`.
3. The browser return is checked (`order_id|payment_id` HMAC) and recorded, never treated as paid.
4. Signed `payment.captured` / `order.paid` bound to a stored order, with exact amount and currency
   and a re-fetched provider state, move the obligation `AWAITING_PAYMENT → SUBMITTED` with the
   provider payment id as its reference. `VERIFIED` stays a staff decision (Phase 9C verify), because
   the obligation CHECK requires a reviewing staff member and no one has authorised an automatic
   verification. Payment never decides the academic application.
5. Every signed delivery is answered 2xx (stored as an ignored row when unused); only our own
   failures are 5xx; only unverified requests are rate limited.
6. API refunds exist only as a client method with `X-Refund-Idempotency`; no endpoint until the
   refund policy and approvers (plan D4/D6) are decided. Refunds are issued in the dashboard.

## Consequences

Production keeps `off` and is byte-for-byte unchanged on the disabled path (404). Staging needs the
reviewer-gate exception (plan section 8.2), real test keys and the section 5 run before anyone relies
on this.
