-- Razorpay TEST refund safety (PR #49 re-review H1/H2): a SENDING state with a send lease that keeps
-- headroom reserved until the provider answers, refunds of flagged (refund-candidate) captures, and
-- dashboard refunds recorded from signed webhooks. Additive; existing rows stay valid (all STAFF).

-- AlterEnum
ALTER TYPE "RazorpayRefundStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "razorpay_refunds" ADD COLUMN     "send_lease_until" TIMESTAMPTZ(3),
ADD COLUMN     "source" VARCHAR(12) NOT NULL DEFAULT 'STAFF',
ALTER COLUMN "idempotency_key" DROP NOT NULL,
ALTER COLUMN "receipt" DROP NOT NULL,
ALTER COLUMN "requested_by_user_id" DROP NOT NULL;


ALTER TABLE razorpay_refunds DROP CONSTRAINT razorpay_refunds_values;
ALTER TABLE razorpay_refunds ADD CONSTRAINT razorpay_refunds_values CHECK (
  amount_minor > 0 AND currency ~ '^[A-Z]{3}$'
  AND reason ~ '^[A-Z_]{1,48}$'
  AND provider_payment_id ~ '^pay_[A-Za-z0-9]{1,50}$'
  AND (provider_refund_id IS NULL OR provider_refund_id ~ '^rfnd_[A-Za-z0-9]{1,50}$')
  AND (failure_reason IS NULL OR failure_reason ~ '^[A-Z_]{1,48}$')
  AND source IN ('STAFF', 'DASHBOARD')
  -- STAFF: requester, key and receipt; maker-checker (the approver/rejecter is never the requester)
  AND (source <> 'STAFF' OR (
    requested_by_user_id IS NOT NULL
    AND idempotency_key ~ '^refund-[0-9a-f]{32}$' AND receipt ~ '^rf_[0-9a-f]{32}$'
    AND (approved_by_user_id IS NULL OR approved_by_user_id <> requested_by_user_id)
    AND ((status = 'REQUESTED') = (approved_by_user_id IS NULL AND decided_at IS NULL))))
  -- DASHBOARD: a fact reported by Razorpay; nobody in Docversity requested or approved it
  AND (source <> 'DASHBOARD' OR (
    requested_by_user_id IS NULL AND approved_by_user_id IS NULL AND idempotency_key IS NULL
    AND decided_at IS NULL AND provider_refund_id IS NOT NULL))
);

-- Refunds of the PAID payment of an order, or of a capture flagged as a refund candidate on that
-- order. Headroom is per provider payment: refunds that are not REJECTED or FAILED (so REQUESTED,
-- APPROVED, SENDING, PENDING, PROCESSED and dashboard refunds) never exceed the captured amount.
-- FAILED is reachable only from SENDING/PENDING, i.e. after the provider answered.
CREATE OR REPLACE FUNCTION docversity_razorpay_refunds_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ord RECORD;
  captured_amount INTEGER;
  captured_currency CHAR(3);
  live_total BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: refund % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.order_id, NEW.provider_payment_id, NEW.amount_minor, NEW.currency, NEW.reason,
        NEW.idempotency_key, NEW.receipt, NEW.requested_by_user_id, NEW.source, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.order_id, OLD.provider_payment_id, OLD.amount_minor, OLD.currency, OLD.reason,
        OLD.idempotency_key, OLD.receipt, OLD.requested_by_user_id, OLD.source, OLD.created_at) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: refund % is immutable', OLD.id USING ERRCODE = 'DV001';
    END IF;
    IF (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id)
       OR (OLD.approved_by_user_id IS NOT NULL AND NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: decision and provider id are write-once' USING ERRCODE = 'DV001';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'REQUESTED' AND NEW.status::text IN ('APPROVED', 'REJECTED'))
      OR (OLD.status = 'APPROVED' AND NEW.status::text = 'SENDING')
      OR (OLD.status::text = 'SENDING' AND NEW.status::text IN ('PENDING', 'PROCESSED', 'FAILED'))
      OR (OLD.status = 'PENDING' AND NEW.status::text IN ('PROCESSED', 'FAILED'))) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider_refund_id IS NOT NULL AND NEW.source = 'STAFF' THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: staff refunds are created without a provider id' USING ERRCODE = 'DV001';
  END IF;
  IF NEW.source = 'STAFF' AND NEW.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: staff refunds are created REQUESTED' USING ERRCODE = 'DV001';
  END IF;
  IF NEW.source = 'DASHBOARD' AND NEW.status::text NOT IN ('PENDING', 'PROCESSED', 'FAILED') THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: dashboard refunds carry the provider status' USING ERRCODE = 'DV001';
  END IF;
  SELECT status, amount_minor, currency, provider_payment_id, provider_order_id INTO ord
    FROM razorpay_orders WHERE id = NEW.order_id FOR UPDATE;
  IF ord.status = 'PAID' AND ord.provider_payment_id = NEW.provider_payment_id THEN
    captured_amount := ord.amount_minor;
    captured_currency := ord.currency;
  ELSE
    SELECT r.amount_minor, r.currency INTO captured_amount, captured_currency
      FROM razorpay_webhook_receipts r
     WHERE r.provider_payment_id = NEW.provider_payment_id AND r.captured
       AND r.provider_order_id = ord.provider_order_id
     ORDER BY r.created_at LIMIT 1;
    IF captured_amount IS NULL OR (NEW.source = 'STAFF' AND NOT EXISTS (
         SELECT 1 FROM razorpay_order_events e
          WHERE e.order_id = NEW.order_id AND e.kind = 'FLAGGED'
            AND e.provider_payment_id = NEW.provider_payment_id
            AND e.reason IN ('OBLIGATION_NOT_OPEN', 'ORDER_ALREADY_PAID', 'PAYMENT_ALREADY_USED',
                             'AMOUNT_MISMATCH', 'ORDER_NOT_OPEN', 'PROVIDER_STATE_MISMATCH'))) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: refunds need the order''s captured payment or a flagged refund candidate' USING ERRCODE = 'DV001';
    END IF;
  END IF;
  IF captured_currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: the refund currency must be the captured currency' USING ERRCODE = 'DV001';
  END IF;
  IF NEW.source = 'STAFF' THEN
    SELECT COALESCE(SUM(amount_minor), 0) INTO live_total FROM razorpay_refunds
     WHERE provider_payment_id = NEW.provider_payment_id AND status NOT IN ('REJECTED', 'FAILED');
    IF live_total + NEW.amount_minor > captured_amount THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: refunds would exceed the captured amount' USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE razorpay_refund_events DROP CONSTRAINT razorpay_refund_events_values;
ALTER TABLE razorpay_refund_events ADD CONSTRAINT razorpay_refund_events_values CHECK (
  kind IN ('REQUESTED','APPROVED','REJECTED','SUBMITTED','SEND_REJECTED','PENDING','PROCESSED',
           'FAILED','WEBHOOK_IGNORED','DASHBOARD')
  AND (event_id IS NULL OR event_id ~ '^[A-Za-z0-9_-]{1,128}$')
  AND (body_sha256 IS NULL OR body_sha256 ~ '^[a-f0-9]{64}$')
);
