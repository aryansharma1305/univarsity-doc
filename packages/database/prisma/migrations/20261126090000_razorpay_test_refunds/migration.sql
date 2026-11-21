-- Razorpay TEST-mode refunds (maker-checker, idempotent, over-refund guard). Additive only.

-- CreateEnum
CREATE TYPE "RazorpayRefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PENDING', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateTable
CREATE TABLE "razorpay_refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider_payment_id" VARCHAR(64) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(48) NOT NULL,
    "status" "RazorpayRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" VARCHAR(64) NOT NULL,
    "receipt" VARCHAR(40) NOT NULL,
    "provider_refund_id" VARCHAR(64),
    "failure_reason" VARCHAR(48),
    "requested_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "razorpay_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_refund_events" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "event_id" VARCHAR(128),
    "body_sha256" CHAR(64),
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_refund_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_refunds_idempotency_key_key" ON "razorpay_refunds"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_refunds_receipt_key" ON "razorpay_refunds"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_refunds_provider_refund_id_key" ON "razorpay_refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "razorpay_refunds_order_id_idx" ON "razorpay_refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_refund_events_event_id_key" ON "razorpay_refund_events"("event_id");

-- CreateIndex
CREATE INDEX "razorpay_refund_events_refund_id_created_at_idx" ON "razorpay_refund_events"("refund_id", "created_at");

-- AddForeignKey
ALTER TABLE "razorpay_refunds" ADD CONSTRAINT "razorpay_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "razorpay_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_refunds" ADD CONSTRAINT "razorpay_refunds_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_refunds" ADD CONSTRAINT "razorpay_refunds_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_refund_events" ADD CONSTRAINT "razorpay_refund_events_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "razorpay_refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE razorpay_refunds ADD CONSTRAINT razorpay_refunds_values CHECK (
  amount_minor > 0 AND currency ~ '^[A-Z]{3}$'
  AND reason ~ '^[A-Z_]{1,48}$'
  AND idempotency_key ~ '^refund-[0-9a-f]{32}$'
  AND receipt ~ '^rf_[0-9a-f]{32}$'
  AND provider_payment_id ~ '^pay_[A-Za-z0-9]{1,50}$'
  AND (provider_refund_id IS NULL OR provider_refund_id ~ '^rfnd_[A-Za-z0-9]{1,50}$')
  AND (failure_reason IS NULL OR failure_reason ~ '^[A-Z_]{1,48}$')
  -- maker-checker: the approver (or rejecter) is never the requester
  AND (approved_by_user_id IS NULL OR approved_by_user_id <> requested_by_user_id)
  AND ((status = 'REQUESTED') = (approved_by_user_id IS NULL AND decided_at IS NULL))
);

-- Refunds are requested only for a PAID order, in its currency, for its captured payment; the sum of
-- refunds that are not REJECTED or FAILED never exceeds the captured amount (order row locked, so
-- concurrent requests serialize); snapshots are immutable; status moves forward only; never deleted.
CREATE FUNCTION docversity_razorpay_refunds_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ord RECORD;
  live_total BIGINT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: refund % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.order_id, NEW.provider_payment_id, NEW.amount_minor, NEW.currency, NEW.reason,
        NEW.idempotency_key, NEW.receipt, NEW.requested_by_user_id, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.order_id, OLD.provider_payment_id, OLD.amount_minor, OLD.currency, OLD.reason,
        OLD.idempotency_key, OLD.receipt, OLD.requested_by_user_id, OLD.created_at) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: refund % is immutable', OLD.id USING ERRCODE = 'DV001';
    END IF;
    IF (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id)
       OR (OLD.approved_by_user_id IS NOT NULL AND NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: decision and provider id are write-once' USING ERRCODE = 'DV001';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
         (OLD.status = 'REQUESTED' AND NEW.status IN ('APPROVED', 'REJECTED'))
      OR (OLD.status = 'APPROVED' AND NEW.status IN ('PENDING', 'PROCESSED', 'FAILED'))
      OR (OLD.status = 'PENDING' AND NEW.status IN ('PROCESSED', 'FAILED'))) THEN
      RAISE EXCEPTION 'razorpay_refunds_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status <> 'REQUESTED' OR NEW.provider_refund_id IS NOT NULL THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: refunds are created REQUESTED' USING ERRCODE = 'DV001';
  END IF;
  SELECT status, amount_minor, currency, provider_payment_id INTO ord
    FROM razorpay_orders WHERE id = NEW.order_id FOR UPDATE;
  IF ord.status IS DISTINCT FROM 'PAID' OR ord.provider_payment_id IS DISTINCT FROM NEW.provider_payment_id
     OR ord.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: refunds need the PAID order''s captured payment and currency' USING ERRCODE = 'DV001';
  END IF;
  SELECT COALESCE(SUM(amount_minor), 0) INTO live_total FROM razorpay_refunds
   WHERE order_id = NEW.order_id AND status NOT IN ('REJECTED', 'FAILED');
  IF live_total + NEW.amount_minor > ord.amount_minor THEN
    RAISE EXCEPTION 'razorpay_refunds_guard: refunds would exceed the captured amount' USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER razorpay_refunds_guard
  BEFORE INSERT OR UPDATE OR DELETE ON razorpay_refunds
  FOR EACH ROW EXECUTE FUNCTION docversity_razorpay_refunds_guard();

ALTER TABLE razorpay_refund_events ADD CONSTRAINT razorpay_refund_events_values CHECK (
  kind IN ('REQUESTED','APPROVED','REJECTED','SUBMITTED','PENDING','PROCESSED','FAILED','WEBHOOK_IGNORED')
  AND (event_id IS NULL OR event_id ~ '^[A-Za-z0-9_-]{1,128}$')
  AND (body_sha256 IS NULL OR body_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TRIGGER razorpay_refund_events_append_only BEFORE UPDATE OR DELETE ON razorpay_refund_events FOR EACH ROW EXECUTE FUNCTION guard_razorpay_evidence_history();
