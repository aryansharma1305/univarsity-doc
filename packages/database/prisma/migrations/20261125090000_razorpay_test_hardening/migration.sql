-- Razorpay test-mode hardening (PR #49 review): a DB-held synthetic-registration marker that every
-- new order must satisfy, and a short create lease so provider calls run outside transactions.

-- AlterTable
ALTER TABLE "razorpay_orders" ADD COLUMN     "create_lease_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "razorpay_test_registrations" (
    "registration_id" UUID NOT NULL,
    "marked_by_user_id" UUID NOT NULL,
    "note" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_test_registrations_pkey" PRIMARY KEY ("registration_id")
);

-- AddForeignKey
ALTER TABLE "razorpay_test_registrations" ADD CONSTRAINT "razorpay_test_registrations_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_test_registrations" ADD CONSTRAINT "razorpay_test_registrations_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE razorpay_test_registrations ADD CONSTRAINT razorpay_test_registrations_note
  CHECK (btrim(note) <> '');

-- Same rules as 20261124090000, plus: an order may only be created for a registration marked
-- synthetic in razorpay_test_registrations (the config allowlist alone is self-attested).
CREATE OR REPLACE FUNCTION docversity_razorpay_orders_guard() RETURNS trigger
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
    SELECT p.amount_minor, p.currency, p.status, p.student_id, a.student_registration_id
      INTO obligation
      FROM re_exam_payments p JOIN re_exam_applications a ON a.id = p.application_id
     WHERE p.id = NEW.payment_id;
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
    IF NOT EXISTS (SELECT 1 FROM razorpay_test_registrations
                    WHERE registration_id = obligation.student_registration_id) THEN
      RAISE EXCEPTION 'razorpay_orders_guard: the registration is not marked synthetic for test payments' USING ERRCODE = 'DV001';
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

-- New flag/event kinds: ABANDONED (obligation closed or order expired) and reconciliation findings.
ALTER TABLE razorpay_order_events DROP CONSTRAINT razorpay_order_events_values;
ALTER TABLE razorpay_order_events ADD CONSTRAINT razorpay_order_events_values CHECK (
  kind IN ('RESERVED','CREATED','CREATE_FAILED','CHECKOUT_RETURNED','PAID','FLAGGED','ABANDONED')
  AND (reason IS NULL OR reason ~ '^[A-Z_]{1,48}$')
  AND (provider_payment_id IS NULL OR provider_payment_id ~ '^pay_[A-Za-z0-9]{1,50}$')
);
