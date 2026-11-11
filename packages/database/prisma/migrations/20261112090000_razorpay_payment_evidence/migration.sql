-- CreateTable
CREATE TABLE "razorpay_webhook_receipts" (
    "id" UUID NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "body_sha256" CHAR(64) NOT NULL,
    "merchant_id" VARCHAR(64) NOT NULL,
    "provider_payment_id" VARCHAR(64) NOT NULL,
    "event_type" VARCHAR(32) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "captured" BOOLEAN NOT NULL,
    "amount_refunded" INTEGER NOT NULL,
    "provider_created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_reconciliations" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider_payment_id" VARCHAR(64) NOT NULL,
    "button_id" VARCHAR(64) NOT NULL,
    "report_reference_hash" CHAR(64) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_webhook_receipts_event_id_key" ON "razorpay_webhook_receipts"("event_id");

-- CreateIndex
CREATE INDEX "razorpay_webhook_receipts_provider_payment_id_idx" ON "razorpay_webhook_receipts"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_reconciliations_receipt_id_key" ON "razorpay_reconciliations"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_reconciliations_payment_id_key" ON "razorpay_reconciliations"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_reconciliations_provider_payment_id_key" ON "razorpay_reconciliations"("provider_payment_id");

-- AddForeignKey
ALTER TABLE "razorpay_reconciliations" ADD CONSTRAINT "razorpay_reconciliations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "razorpay_webhook_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_reconciliations" ADD CONSTRAINT "razorpay_reconciliations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "re_exam_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "razorpay_reconciliations" ADD CONSTRAINT "razorpay_reconciliations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Provider evidence and attribution are permanent financial records; never overwrite history.
ALTER TABLE razorpay_webhook_receipts ADD CONSTRAINT razorpay_receipt_values CHECK (
  event_type IN ('payment.captured','payment.failed') AND amount_minor > 0
  AND amount_refunded BETWEEN 0 AND amount_minor AND currency ~ '^[A-Z]{3}$'
  AND body_sha256 ~ '^[a-f0-9]{64}$'
  AND ((event_type='payment.captured' AND captured) OR (event_type='payment.failed' AND NOT captured))
);
ALTER TABLE razorpay_reconciliations ADD CONSTRAINT razorpay_reconciliation_button CHECK (button_id='pl_TyWTRF7DImX3Pu' AND report_reference_hash ~ '^[a-f0-9]{64}$');
CREATE FUNCTION guard_razorpay_evidence_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Razorpay evidence is append-only' USING ERRCODE='DV001';
END;
$$;
CREATE TRIGGER razorpay_receipts_append_only BEFORE UPDATE OR DELETE ON razorpay_webhook_receipts FOR EACH ROW EXECUTE FUNCTION guard_razorpay_evidence_history();
CREATE TRIGGER razorpay_reconciliations_append_only BEFORE UPDATE OR DELETE ON razorpay_reconciliations FOR EACH ROW EXECUTE FUNCTION guard_razorpay_evidence_history();
