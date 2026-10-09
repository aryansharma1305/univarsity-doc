-- Phase 9C: country/region re-exam payment destinations, payment obligations, manual verification.
-- Additive only: six enums, three tables, CHECKs and triggers. No existing table or row changes.

-- CreateEnum
CREATE TYPE "PaymentRegion" AS ENUM ('INDIA', 'NEPAL', 'BANGLADESH', 'PAKISTAN', 'AFGHANISTAN', 'EUROPE', 'CENTRAL_ASIA', 'OTHERS');

-- CreateEnum
CREATE TYPE "PaymentDestinationStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'BANK_TRANSFER', 'MOBILE_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentEvidenceRequirement" AS ENUM ('OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "ReExamPaymentStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ReExamPaymentAmountSource" AS ENUM ('FEE_RULE', 'DESTINATION_RATE');

-- CreateTable
CREATE TABLE "re_exam_payment_destinations" (
    "id" UUID NOT NULL,
    "region" "PaymentRegion" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PaymentDestinationStatus" NOT NULL DEFAULT 'DRAFT',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "country_name" VARCHAR(100),
    "beneficiary_name" VARCHAR(200) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "instructions" VARCHAR(2000) NOT NULL,
    "evidence_requirement" "PaymentEvidenceRequirement" NOT NULL DEFAULT 'OPTIONAL',
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_until" TIMESTAMPTZ(3),
    "qr_storage_key" VARCHAR(255),
    "qr_content_type" VARCHAR(32),
    "qr_size_bytes" INTEGER,
    "qr_sha256" CHAR(64),
    "replaces_destination_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_user_id" UUID,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "re_exam_payment_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "re_exam_payment_destination_rates" (
    "destination_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "amount_minor" INTEGER NOT NULL,

    CONSTRAINT "re_exam_payment_destination_rates_pkey" PRIMARY KEY ("destination_id","attempt_number")
);

-- CreateTable
CREATE TABLE "re_exam_payments" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "destination_id" UUID NOT NULL,
    "region" "PaymentRegion" NOT NULL,
    "destination_version" INTEGER NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "fee_rule_id" UUID NOT NULL,
    "fee_rule_version" INTEGER NOT NULL,
    "amount_source" "ReExamPaymentAmountSource" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "ReExamPaymentStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "created_by_account_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "void_reason" VARCHAR(64),
    "transaction_reference" VARCHAR(64),
    "transaction_reference_normalized" VARCHAR(64),
    "submitted_at" TIMESTAMPTZ(3),
    "submitted_by_account_id" UUID,
    "evidence_storage_key" VARCHAR(255),
    "evidence_content_type" VARCHAR(32),
    "evidence_size_bytes" INTEGER,
    "evidence_sha256" CHAR(64),
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_user_id" UUID,
    "verified_amount_minor" INTEGER,
    "verified_currency" CHAR(3),
    "review_note" VARCHAR(1000),
    "rejection_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "re_exam_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "re_exam_payment_destinations_status_region_idx" ON "re_exam_payment_destinations"("status", "region");

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_payment_destinations_region_version_key" ON "re_exam_payment_destinations"("region", "version");

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_payment_destinations_one_approved_key" ON "re_exam_payment_destinations"("region") WHERE (status = 'APPROVED'::"PaymentDestinationStatus");

-- CreateIndex
CREATE INDEX "re_exam_payments_status_submitted_at_idx" ON "re_exam_payments"("status", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "re_exam_payments_application_id_idx" ON "re_exam_payments"("application_id");

-- CreateIndex
CREATE INDEX "re_exam_payments_student_id_idx" ON "re_exam_payments"("student_id");

-- CreateIndex
CREATE INDEX "re_exam_payments_transaction_reference_normalized_idx" ON "re_exam_payments"("transaction_reference_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_payments_one_live_key" ON "re_exam_payments"("application_id") WHERE (status = ANY (ARRAY['AWAITING_PAYMENT'::"ReExamPaymentStatus", 'SUBMITTED'::"ReExamPaymentStatus", 'VERIFIED'::"ReExamPaymentStatus"]));

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_payments_one_reference_key" ON "re_exam_payments"("transaction_reference_normalized") WHERE (status = ANY (ARRAY['SUBMITTED'::"ReExamPaymentStatus", 'VERIFIED'::"ReExamPaymentStatus"]));

-- AddForeignKey
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_retired_by_user_id_fkey" FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_replaces_destination_id_fkey" FOREIGN KEY ("replaces_destination_id") REFERENCES "re_exam_payment_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payment_destination_rates" ADD CONSTRAINT "re_exam_payment_destination_rates_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "re_exam_payment_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "re_exam_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "re_exam_payment_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_fee_rule_id_fkey" FOREIGN KEY ("fee_rule_id") REFERENCES "re_exam_fee_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_submitted_by_account_id_fkey" FOREIGN KEY ("submitted_by_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;





-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 9C)
-- ---------------------------------------------------------------------------------------------

-- Destinations: valid values; a country only for region groups; QR fields all-or-nothing; lifecycle
-- columns match the status; an APPROVED destination has a QR and was approved by someone other than
-- its creator (maker–checker); only APPROVED destinations can be active.
ALTER TABLE "re_exam_payment_destinations" ADD CONSTRAINT "re_exam_payment_destinations_values_check"
  CHECK (
    version > 0
    AND currency ~ '^[A-Z]{3}$'
    AND btrim(beneficiary_name) <> ''
    AND btrim(instructions) <> ''
    AND (country_name IS NULL
         OR (btrim(country_name) <> '' AND region IN ('EUROPE', 'CENTRAL_ASIA', 'OTHERS')))
    AND (effective_until IS NULL OR effective_until > effective_from)
    AND (
      (qr_storage_key IS NULL AND qr_content_type IS NULL AND qr_size_bytes IS NULL AND qr_sha256 IS NULL)
      OR (qr_storage_key IS NOT NULL AND qr_content_type IN ('image/png', 'image/jpeg')
          AND qr_size_bytes > 0 AND qr_sha256 ~ '^[0-9a-f]{64}$')
    )
    AND (
      (status = 'DRAFT' AND approved_at IS NULL AND approved_by_user_id IS NULL AND retired_at IS NULL
        AND retired_by_user_id IS NULL)
      OR (status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL
        AND approved_by_user_id <> created_by_user_id AND qr_storage_key IS NOT NULL
        AND retired_at IS NULL AND retired_by_user_id IS NULL)
      OR (status = 'RETIRED' AND retired_at IS NOT NULL AND retired_by_user_id IS NOT NULL)
    )
    AND (status = 'APPROVED' OR NOT is_active)
  );

ALTER TABLE "re_exam_payment_destination_rates" ADD CONSTRAINT "re_exam_payment_destination_rates_values_check"
  CHECK (attempt_number >= 1 AND amount_minor > 0);

-- Destinations are never deleted; created as DRAFT; only DRAFTs change their content; DRAFT →
-- APPROVED | RETIRED, APPROVED → RETIRED; afterwards only the active switch of an APPROVED one moves.
CREATE FUNCTION docversity_re_exam_payment_destinations_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  replaced RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 're_exam_payment_destinations_guard: destination % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 're_exam_payment_destinations_guard: destinations are created as DRAFT' USING ERRCODE = 'DV001';
    END IF;
    IF NEW.replaces_destination_id IS NOT NULL THEN
      SELECT region, status INTO replaced FROM re_exam_payment_destinations WHERE id = NEW.replaces_destination_id;
      IF replaced.region IS DISTINCT FROM NEW.region OR replaced.status IS DISTINCT FROM 'APPROVED' THEN
        RAISE EXCEPTION 're_exam_payment_destinations_guard: a replacement must replace the approved destination of the same region' USING ERRCODE = 'DV001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.region, NEW.version, NEW.replaces_destination_id, NEW.created_by_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.region, OLD.version, OLD.replaces_destination_id, OLD.created_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 're_exam_payment_destinations_guard: identity of destination % is immutable', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF OLD.status <> 'DRAFT'
     AND (NEW.country_name, NEW.beneficiary_name, NEW.method, NEW.currency, NEW.instructions,
          NEW.evidence_requirement, NEW.effective_from, NEW.effective_until, NEW.qr_storage_key,
          NEW.qr_content_type, NEW.qr_size_bytes, NEW.qr_sha256, NEW.updated_by_user_id)
         IS DISTINCT FROM
         (OLD.country_name, OLD.beneficiary_name, OLD.method, OLD.currency, OLD.instructions,
          OLD.evidence_requirement, OLD.effective_from, OLD.effective_until, OLD.qr_storage_key,
          OLD.qr_content_type, OLD.qr_size_bytes, OLD.qr_sha256, OLD.updated_by_user_id) THEN
    RAISE EXCEPTION 're_exam_payment_destinations_guard: destination % is frozen once approved or retired', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('APPROVED', 'RETIRED'))
            OR (OLD.status = 'APPROVED' AND NEW.status = 'RETIRED')) THEN
      RAISE EXCEPTION 're_exam_payment_destinations_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
  ELSIF OLD.status <> 'DRAFT'
        AND (NEW.approved_at, NEW.approved_by_user_id, NEW.retired_at, NEW.retired_by_user_id)
            IS DISTINCT FROM (OLD.approved_at, OLD.approved_by_user_id, OLD.retired_at, OLD.retired_by_user_id) THEN
    RAISE EXCEPTION 're_exam_payment_destinations_guard: decisions on destination % are final', OLD.id USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER re_exam_payment_destinations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_payment_destinations"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_payment_destinations_guard();

-- Destination amounts change only while the destination is a DRAFT.
CREATE FUNCTION docversity_re_exam_payment_destination_rates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  destination_status "PaymentDestinationStatus";
BEGIN
  SELECT status INTO destination_status FROM re_exam_payment_destinations
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.destination_id ELSE NEW.destination_id END;
  IF destination_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 're_exam_payment_destination_rates_guard: amounts are frozen once the destination is approved or retired' USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.destination_id IS DISTINCT FROM OLD.destination_id THEN
    RAISE EXCEPTION 're_exam_payment_destination_rates_guard: an amount cannot move to another destination' USING ERRCODE = 'DV001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER re_exam_payment_destination_rates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_payment_destination_rates"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_payment_destination_rates_guard();

-- Payments: exact positive amounts; submission, evidence, review and void columns match the status; a
-- verified amount and currency equal the obligation (no partial or foreign-currency confirmation).
ALTER TABLE "re_exam_payments" ADD CONSTRAINT "re_exam_payments_values_check"
  CHECK (
    amount_minor > 0
    AND currency ~ '^[A-Z]{3}$'
    AND attempt_number >= 1
    AND destination_version > 0
    AND fee_rule_version > 0
    AND (
      (evidence_storage_key IS NULL AND evidence_content_type IS NULL AND evidence_size_bytes IS NULL
        AND evidence_sha256 IS NULL)
      OR (evidence_storage_key IS NOT NULL
        AND evidence_content_type IN ('application/pdf', 'image/png', 'image/jpeg')
        AND evidence_size_bytes > 0 AND evidence_sha256 ~ '^[0-9a-f]{64}$')
    )
    AND (
      (status IN ('AWAITING_PAYMENT', 'VOID')
        AND transaction_reference IS NULL AND transaction_reference_normalized IS NULL
        AND submitted_at IS NULL AND submitted_by_account_id IS NULL AND evidence_storage_key IS NULL)
      OR (status IN ('SUBMITTED', 'VERIFIED', 'REJECTED')
        AND transaction_reference IS NOT NULL AND btrim(transaction_reference) <> ''
        AND transaction_reference_normalized ~ '^[A-Z0-9]{6,64}$'
        AND submitted_at IS NOT NULL AND submitted_by_account_id IS NOT NULL)
    )
    AND (
      (status = 'VOID' AND voided_at IS NOT NULL AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
      OR (status <> 'VOID' AND voided_at IS NULL AND void_reason IS NULL)
    )
    AND (
      (status IN ('AWAITING_PAYMENT', 'SUBMITTED', 'VOID')
        AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND verified_amount_minor IS NULL
        AND verified_currency IS NULL AND review_note IS NULL AND rejection_reason IS NULL)
      OR (status = 'VERIFIED' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL
        AND verified_amount_minor IS NOT NULL AND verified_amount_minor = amount_minor
        AND verified_currency IS NOT NULL AND verified_currency = currency AND rejection_reason IS NULL)
      OR (status = 'REJECTED' AND reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL
        AND verified_amount_minor IS NULL AND verified_currency IS NULL
        AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')
    )
  );

-- Payments are created AWAITING_PAYMENT for the student's own assessed, undecided-or-approved
-- application at an approved, active, in-effect destination, with the amount re-derived here (the
-- application's fee in its currency, or the destination's approved amount for the attempt);
-- snapshots never change; AWAITING_PAYMENT → SUBMITTED | VOID, SUBMITTED → VERIFIED | REJECTED,
-- submissions are not editable and decisions are final; never deleted.
CREATE FUNCTION docversity_re_exam_payments_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  app RECORD;
  dest RECORD;
  rate_amount INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 're_exam_payments_guard: payment % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'AWAITING_PAYMENT' THEN
      RAISE EXCEPTION 're_exam_payments_guard: payments are created as AWAITING_PAYMENT' USING ERRCODE = 'DV001';
    END IF;
    SELECT student_id, status, attempt_number, fee_status, fee_rule_id, fee_rule_version, fee_currency,
           fee_amount_minor
      INTO app FROM re_exam_applications WHERE id = NEW.application_id;
    IF app.student_id IS DISTINCT FROM NEW.student_id THEN
      RAISE EXCEPTION 're_exam_payments_guard: the application does not belong to the student' USING ERRCODE = 'DV001';
    END IF;
    IF app.status NOT IN ('SUBMITTED', 'APPROVED') OR app.fee_status <> 'ASSESSED' THEN
      RAISE EXCEPTION 're_exam_payments_guard: the application has no payable fee' USING ERRCODE = 'DV001';
    END IF;
    IF (NEW.attempt_number, NEW.fee_rule_id, NEW.fee_rule_version)
       IS DISTINCT FROM (app.attempt_number, app.fee_rule_id, app.fee_rule_version) THEN
      RAISE EXCEPTION 're_exam_payments_guard: the payment must snapshot the application''s attempt and fee rule' USING ERRCODE = 'DV001';
    END IF;
    SELECT region, version, status, is_active, currency, effective_from, effective_until
      INTO dest FROM re_exam_payment_destinations WHERE id = NEW.destination_id;
    IF dest.status IS DISTINCT FROM 'APPROVED' OR NOT dest.is_active OR dest.effective_from > now()
       OR (dest.effective_until IS NOT NULL AND dest.effective_until <= now()) THEN
      RAISE EXCEPTION 're_exam_payments_guard: the payment destination is not available' USING ERRCODE = 'DV001';
    END IF;
    IF (NEW.region, NEW.destination_version, NEW.currency)
       IS DISTINCT FROM (dest.region, dest.version, dest.currency) THEN
      RAISE EXCEPTION 're_exam_payments_guard: the payment must snapshot its destination' USING ERRCODE = 'DV001';
    END IF;
    IF dest.currency = app.fee_currency THEN
      IF NEW.amount_source <> 'FEE_RULE' OR NEW.amount_minor IS DISTINCT FROM app.fee_amount_minor THEN
        RAISE EXCEPTION 're_exam_payments_guard: the amount must be the application''s assessed fee' USING ERRCODE = 'DV001';
      END IF;
    ELSE
      SELECT amount_minor INTO rate_amount FROM re_exam_payment_destination_rates
       WHERE destination_id = NEW.destination_id AND attempt_number = app.attempt_number;
      IF rate_amount IS NULL OR NEW.amount_source <> 'DESTINATION_RATE' OR NEW.amount_minor <> rate_amount THEN
        RAISE EXCEPTION 're_exam_payments_guard: the amount must be the destination''s approved amount for this attempt' USING ERRCODE = 'DV001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.application_id, NEW.student_id, NEW.destination_id, NEW.region,
      NEW.destination_version, NEW.attempt_number, NEW.fee_rule_id, NEW.fee_rule_version,
      NEW.amount_source, NEW.amount_minor, NEW.currency, NEW.created_by_account_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.application_id, OLD.student_id, OLD.destination_id, OLD.region,
      OLD.destination_version, OLD.attempt_number, OLD.fee_rule_id, OLD.fee_rule_version,
      OLD.amount_source, OLD.amount_minor, OLD.currency, OLD.created_by_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 're_exam_payments_guard: the obligation of payment % is immutable', OLD.id USING ERRCODE = 'DV001';
  END IF;

  IF OLD.status <> 'AWAITING_PAYMENT'
     AND (NEW.transaction_reference, NEW.transaction_reference_normalized, NEW.submitted_at,
          NEW.submitted_by_account_id, NEW.evidence_storage_key, NEW.evidence_content_type,
          NEW.evidence_size_bytes, NEW.evidence_sha256, NEW.voided_at, NEW.void_reason)
         IS DISTINCT FROM
         (OLD.transaction_reference, OLD.transaction_reference_normalized, OLD.submitted_at,
          OLD.submitted_by_account_id, OLD.evidence_storage_key, OLD.evidence_content_type,
          OLD.evidence_size_bytes, OLD.evidence_sha256, OLD.voided_at, OLD.void_reason) THEN
    RAISE EXCEPTION 're_exam_payments_guard: the submission of payment % cannot be edited', OLD.id USING ERRCODE = 'DV001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'AWAITING_PAYMENT' AND NEW.status IN ('SUBMITTED', 'VOID'))
            OR (OLD.status = 'SUBMITTED' AND NEW.status IN ('VERIFIED', 'REJECTED'))) THEN
      RAISE EXCEPTION 're_exam_payments_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
  ELSIF (NEW.reviewed_at, NEW.reviewed_by_user_id, NEW.verified_amount_minor, NEW.verified_currency,
         NEW.review_note, NEW.rejection_reason)
        IS DISTINCT FROM
        (OLD.reviewed_at, OLD.reviewed_by_user_id, OLD.verified_amount_minor, OLD.verified_currency,
         OLD.review_note, OLD.rejection_reason) THEN
    RAISE EXCEPTION 're_exam_payments_guard: decisions on payment % are final', OLD.id USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER re_exam_payments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_payments"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_payments_guard();
