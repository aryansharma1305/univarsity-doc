-- Razorpay TEST-mode Orders pilot (docs/plans/razorpay-test-mode-plan.md section 8.4). Additive only:
-- one enum, three tables, one nullable receipt column, CHECKs and triggers. No existing row changes.
-- CreateEnum
CREATE TYPE "RazorpayOrderStatus" AS ENUM ('RESERVED', 'CREATED', 'PAID', 'ABANDONED', 'CREATE_FAILED');

-- AlterTable
ALTER TABLE "razorpay_webhook_receipts" ADD COLUMN     "provider_order_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "razorpay_orders" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "attempt" SMALLINT NOT NULL,
    "receipt" VARCHAR(40) NOT NULL,
    "mode" VARCHAR(4) NOT NULL,
    "account_id" VARCHAR(64) NOT NULL,
    "provider_order_id" VARCHAR(64),
    "provider_payment_id" VARCHAR(64),
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "RazorpayOrderStatus" NOT NULL DEFAULT 'RESERVED',
    "student_account_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "razorpay_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(48),
    "receipt_id" UUID,
    "provider_payment_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_webhook_ignored" (
    "id" UUID NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(64),
    "body_sha256" CHAR(64) NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "provider_created_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_webhook_ignored_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_orders_receipt_key" ON "razorpay_orders"("receipt");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_orders_provider_order_id_key" ON "razorpay_orders"("provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_orders_provider_payment_id_key" ON "razorpay_orders"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_orders_payment_id_attempt_key" ON "razorpay_orders"("payment_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_orders_one_open_key" ON "razorpay_orders"("payment_id") WHERE (status = ANY (ARRAY['RESERVED'::"RazorpayOrderStatus", 'CREATED'::"RazorpayOrderStatus"]));

-- CreateIndex
CREATE INDEX "razorpay_order_events_order_id_created_at_idx" ON "razorpay_order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "razorpay_webhook_ignored_event_id_idx" ON "razorpay_webhook_ignored"("event_id");

-- CreateIndex
CREATE INDEX "razorpay_webhook_receipts_provider_order_id_idx" ON "razorpay_webhook_receipts"("provider_order_id");

-- AddForeignKey
ALTER TABLE "razorpay_orders" ADD CONSTRAINT "razorpay_orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "re_exam_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_orders" ADD CONSTRAINT "razorpay_orders_student_account_id_fkey" FOREIGN KEY ("student_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_order_events" ADD CONSTRAINT "razorpay_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "razorpay_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_order_events" ADD CONSTRAINT "razorpay_order_events_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "razorpay_webhook_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Receipts may now record order.paid (always captured) and the signed order id.
ALTER TABLE razorpay_webhook_receipts DROP CONSTRAINT razorpay_receipt_values;
ALTER TABLE razorpay_webhook_receipts ADD CONSTRAINT razorpay_receipt_values CHECK (
  event_type IN ('payment.captured','payment.failed','order.paid') AND amount_minor > 0
  AND amount_refunded BETWEEN 0 AND amount_minor AND currency ~ '^[A-Z]{3}$'
  AND body_sha256 ~ '^[a-f0-9]{64}$'
  AND ((event_type IN ('payment.captured','order.paid') AND captured)
    OR (event_type='payment.failed' AND NOT captured))
  AND (provider_order_id IS NULL OR provider_order_id ~ '^order_[A-Za-z0-9]{1,50}$')
  AND (event_type <> 'order.paid' OR provider_order_id IS NOT NULL)
);

-- Orders: test mode only (widened only by the reviewed live-approval change), Razorpay's minimum
-- amount, the business-derived receipt, and provider ids that match the status.
ALTER TABLE razorpay_orders ADD CONSTRAINT razorpay_orders_values CHECK (
  attempt BETWEEN 1 AND 99 AND mode = 'TEST'
  AND amount_minor BETWEEN 100 AND 1000000000 AND currency ~ '^[A-Z]{3}$'
  AND account_id ~ '^acc_[A-Za-z0-9]{1,50}$'
  AND receipt ~ '^rx_[0-9a-f]{32}_[0-9]{1,2}$'
  AND (provider_order_id IS NULL OR provider_order_id ~ '^order_[A-Za-z0-9]{1,50}$')
  AND (provider_payment_id IS NULL OR provider_payment_id ~ '^pay_[A-Za-z0-9]{1,50}$')
  AND ((status IN ('RESERVED','CREATE_FAILED')) = (provider_order_id IS NULL))
  AND ((status = 'PAID') = (provider_payment_id IS NOT NULL))
);

-- Orders are created RESERVED for an AWAITING_PAYMENT obligation with exactly its amount and
-- currency, by an account of the obligation's student; the snapshot never changes; provider ids are
-- write-once; RESERVED → CREATED | CREATE_FAILED, CREATED → PAID | ABANDONED; never deleted.
CREATE FUNCTION docversity_razorpay_orders_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  obligation RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'razorpay_orders_guard: order % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'RESERVED' OR NEW.provider_order_id IS NOT NULL OR NEW.provider_payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'razorpay_orders_guard: orders are created RESERVED' USING ERRCODE = 'DV001';
    END IF;
    SELECT amount_minor, currency, status, student_id INTO obligation
      FROM re_exam_payments WHERE id = NEW.payment_id;
    IF (NEW.amount_minor, NEW.currency) IS DISTINCT FROM (obligation.amount_minor, obligation.currency) THEN
      RAISE EXCEPTION 'razorpay_orders_guard: the amount and currency must equal the obligation' USING ERRCODE = 'DV001';
    END IF;
    IF obligation.status IS DISTINCT FROM 'AWAITING_PAYMENT' THEN
      RAISE EXCEPTION 'razorpay_orders_guard: the obligation is not awaiting payment' USING ERRCODE = 'DV001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM student_accounts
                    WHERE id = NEW.student_account_id AND student_id = obligation.student_id) THEN
      RAISE EXCEPTION 'razorpay_orders_guard: the account does not belong to the obligation''s student' USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.payment_id, NEW.attempt, NEW.receipt, NEW.mode, NEW.account_id, NEW.amount_minor,
      NEW.currency, NEW.student_account_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.payment_id, OLD.attempt, OLD.receipt, OLD.mode, OLD.account_id, OLD.amount_minor,
      OLD.currency, OLD.student_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 'razorpay_orders_guard: the snapshot of order % is immutable', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id)
     OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id) THEN
    RAISE EXCEPTION 'razorpay_orders_guard: provider ids of order % are write-once', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'RESERVED' AND NEW.status IN ('CREATED', 'CREATE_FAILED'))
            OR (OLD.status = 'CREATED' AND NEW.status IN ('PAID', 'ABANDONED'))) THEN
      RAISE EXCEPTION 'razorpay_orders_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
  ELSIF (NEW.provider_order_id, NEW.provider_payment_id)
        IS DISTINCT FROM (OLD.provider_order_id, OLD.provider_payment_id) THEN
    RAISE EXCEPTION 'razorpay_orders_guard: provider ids change only with the status' USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER razorpay_orders_guard
  BEFORE INSERT OR UPDATE OR DELETE ON razorpay_orders
  FOR EACH ROW EXECUTE FUNCTION docversity_razorpay_orders_guard();

ALTER TABLE razorpay_order_events ADD CONSTRAINT razorpay_order_events_values CHECK (
  kind IN ('RESERVED','CREATED','CREATE_FAILED','CHECKOUT_RETURNED','PAID','FLAGGED')
  AND (reason IS NULL OR reason ~ '^[A-Z_]{1,48}$')
  AND (provider_payment_id IS NULL OR provider_payment_id ~ '^pay_[A-Za-z0-9]{1,50}$')
);
ALTER TABLE razorpay_webhook_ignored ADD CONSTRAINT razorpay_webhook_ignored_values CHECK (
  reason IN ('UNHANDLED_EVENT','UNPARSEABLE','ACCOUNT_MISMATCH','DIGEST_CONFLICT')
  AND body_sha256 ~ '^[a-f0-9]{64}$' AND event_id ~ '^[A-Za-z0-9_-]{1,128}$'
  AND (event_type IS NULL OR event_type ~ '^[a-z][a-z._]{0,63}$')
);
CREATE TRIGGER razorpay_order_events_append_only BEFORE UPDATE OR DELETE ON razorpay_order_events FOR EACH ROW EXECUTE FUNCTION guard_razorpay_evidence_history();
CREATE TRIGGER razorpay_webhook_ignored_append_only BEFORE UPDATE OR DELETE ON razorpay_webhook_ignored FOR EACH ROW EXECUTE FUNCTION guard_razorpay_evidence_history();
