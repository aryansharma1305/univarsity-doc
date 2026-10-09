-- Phase 9B: re-exam applications, server-derived attempt numbers and versioned fee rules.
-- Additive only: four enums, three tables, CHECKs and triggers. No existing table or row changes.

-- CreateEnum
CREATE TYPE "ReExamFeeScope" AS ENUM ('PER_SUBJECT', 'PER_APPLICATION', 'PER_EXAMINATION_SESSION');

-- CreateEnum
CREATE TYPE "ReExamFeeRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ReExamApplicationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReExamFeeStatus" AS ENUM ('ASSESSED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "re_exam_fee_rules" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReExamFeeRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "scope" "ReExamFeeScope" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "attempt_basis" VARCHAR(64) NOT NULL,
    "note" VARCHAR(1000),
    "created_by_user_id" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "activated_by_user_id" UUID,
    "retired_at" TIMESTAMPTZ(3),
    "retired_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "re_exam_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "re_exam_fee_rates" (
    "rule_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "amount_minor" INTEGER NOT NULL,

    CONSTRAINT "re_exam_fee_rates_pkey" PRIMARY KEY ("rule_id","attempt_number")
);

-- CreateTable
CREATE TABLE "re_exam_applications" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "student_registration_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "program_subject_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL,
    "attempt_basis" VARCHAR(64) NOT NULL,
    "student_name" VARCHAR(200) NOT NULL,
    "registration_number" VARCHAR(64) NOT NULL,
    "program_code" VARCHAR(32) NOT NULL,
    "program_name" VARCHAR(200) NOT NULL,
    "academic_session_name" VARCHAR(120) NOT NULL,
    "period_label" VARCHAR(32) NOT NULL,
    "subject_code" VARCHAR(32) NOT NULL,
    "subject_name" VARCHAR(200) NOT NULL,
    "examination_name" VARCHAR(200) NOT NULL,
    "exam_session" VARCHAR(64) NOT NULL,
    "status" "ReExamApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by_account_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_user_id" UUID,
    "decision_reason" VARCHAR(1000),
    "cancelled_at" TIMESTAMPTZ(3),
    "fee_status" "ReExamFeeStatus" NOT NULL,
    "fee_blocked_reason" VARCHAR(64),
    "fee_rule_id" UUID,
    "fee_rule_version" INTEGER,
    "fee_scope" "ReExamFeeScope",
    "fee_currency" CHAR(3),
    "fee_amount_minor" INTEGER,
    "fee_assessed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "re_exam_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_fee_rules_version_key" ON "re_exam_fee_rules"("version");

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_fee_rules_one_active_key" ON "re_exam_fee_rules"("status") WHERE (status = 'ACTIVE'::"ReExamFeeRuleStatus");

-- CreateIndex
CREATE INDEX "re_exam_applications_status_submitted_at_idx" ON "re_exam_applications"("status", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "re_exam_applications_examination_id_idx" ON "re_exam_applications"("examination_id");

-- CreateIndex
CREATE INDEX "re_exam_applications_student_id_idx" ON "re_exam_applications"("student_id");

-- CreateIndex
CREATE INDEX "re_exam_applications_student_registration_id_subject_id_idx" ON "re_exam_applications"("student_registration_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "re_exam_applications_one_live_key" ON "re_exam_applications"("student_registration_id", "examination_id", "subject_id") WHERE (status = ANY (ARRAY['SUBMITTED'::"ReExamApplicationStatus", 'APPROVED'::"ReExamApplicationStatus"]));

-- AddForeignKey
ALTER TABLE "re_exam_fee_rules" ADD CONSTRAINT "re_exam_fee_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_fee_rules" ADD CONSTRAINT "re_exam_fee_rules_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_fee_rules" ADD CONSTRAINT "re_exam_fee_rules_retired_by_user_id_fkey" FOREIGN KEY ("retired_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_fee_rates" ADD CONSTRAINT "re_exam_fee_rates_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "re_exam_fee_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_student_registration_id_fkey" FOREIGN KEY ("student_registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_program_subject_id_fkey" FOREIGN KEY ("program_subject_id") REFERENCES "program_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_submitted_by_account_id_fkey" FOREIGN KEY ("submitted_by_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_fee_rule_id_fkey" FOREIGN KEY ("fee_rule_id") REFERENCES "re_exam_fee_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;




-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 9B)
-- ---------------------------------------------------------------------------------------------

-- Fee rules: ISO currency code, lifecycle columns match the status.
ALTER TABLE "re_exam_fee_rules" ADD CONSTRAINT "re_exam_fee_rules_values_check"
  CHECK (
    version > 0
    AND currency ~ '^[A-Z]{3}$'
    AND btrim(attempt_basis) <> ''
    AND (
      (status = 'DRAFT' AND activated_at IS NULL AND retired_at IS NULL)
      OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND activated_by_user_id IS NOT NULL
          AND retired_at IS NULL)
      OR (status = 'RETIRED' AND retired_at IS NOT NULL AND retired_by_user_id IS NOT NULL)
    )
  );

-- Amounts are positive integer minor units for attempt 1 and up.
ALTER TABLE "re_exam_fee_rates" ADD CONSTRAINT "re_exam_fee_rates_values_check"
  CHECK (attempt_number >= 1 AND amount_minor > 0);

-- Fee rules are never deleted; only DRAFT rules change; DRAFT → ACTIVE (needs at least one rate) →
-- RETIRED, or DRAFT → RETIRED.
CREATE FUNCTION docversity_re_exam_fee_rules_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 're_exam_fee_rules_guard: fee rule % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 're_exam_fee_rules_guard: fee rules are created as DRAFT' USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.version, NEW.created_by_user_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.version, OLD.created_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 're_exam_fee_rules_guard: identity of fee rule % is immutable', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF OLD.status <> 'DRAFT'
     AND (NEW.scope, NEW.currency, NEW.attempt_basis, NEW.note)
         IS DISTINCT FROM (OLD.scope, OLD.currency, OLD.attempt_basis, OLD.note) THEN
    RAISE EXCEPTION 're_exam_fee_rules_guard: fee rule % is frozen once active or retired', OLD.id USING ERRCODE = 'DV001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('ACTIVE', 'RETIRED'))
            OR (OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED')) THEN
      RAISE EXCEPTION 're_exam_fee_rules_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
    IF NEW.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM re_exam_fee_rates WHERE rule_id = NEW.id) THEN
      RAISE EXCEPTION 're_exam_fee_rules_guard: a fee rule needs at least one attempt fee to be activated' USING ERRCODE = 'DV001';
    END IF;
  ELSIF OLD.status <> 'DRAFT' AND (NEW.activated_at, NEW.activated_by_user_id, NEW.retired_at, NEW.retired_by_user_id)
        IS DISTINCT FROM (OLD.activated_at, OLD.activated_by_user_id, OLD.retired_at, OLD.retired_by_user_id) THEN
    RAISE EXCEPTION 're_exam_fee_rules_guard: decisions on fee rule % are final', OLD.id USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER re_exam_fee_rules_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_fee_rules"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_fee_rules_guard();

-- Rates change only while their rule is a DRAFT.
CREATE FUNCTION docversity_re_exam_fee_rates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rule_status "ReExamFeeRuleStatus";
BEGIN
  SELECT status INTO rule_status FROM re_exam_fee_rules
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.rule_id ELSE NEW.rule_id END;
  IF rule_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 're_exam_fee_rates_guard: attempt fees are frozen once the rule is active or retired' USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.rule_id IS DISTINCT FROM OLD.rule_id THEN
    RAISE EXCEPTION 're_exam_fee_rates_guard: an attempt fee cannot move to another rule' USING ERRCODE = 'DV001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER re_exam_fee_rates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_fee_rates"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_fee_rates_guard();

-- Applications: attempt ≥ 1; fee snapshot all-or-nothing; decision columns match the status.
ALTER TABLE "re_exam_applications" ADD CONSTRAINT "re_exam_applications_values_check"
  CHECK (
    attempt_number >= 1
    AND btrim(attempt_basis) <> ''
    AND (
      (fee_status = 'ASSESSED' AND fee_rule_id IS NOT NULL AND fee_rule_version IS NOT NULL
        AND fee_scope IS NOT NULL AND fee_currency ~ '^[A-Z]{3}$' AND fee_amount_minor > 0
        AND fee_assessed_at IS NOT NULL AND fee_blocked_reason IS NULL)
      OR (fee_status = 'NOT_CONFIGURED' AND fee_rule_id IS NULL AND fee_rule_version IS NULL
        AND fee_scope IS NULL AND fee_currency IS NULL AND fee_amount_minor IS NULL
        AND fee_assessed_at IS NULL AND fee_blocked_reason IS NOT NULL AND btrim(fee_blocked_reason) <> '')
    )
    AND (
      (status = 'SUBMITTED' AND decided_at IS NULL AND decided_by_user_id IS NULL AND cancelled_at IS NULL)
      OR (status = 'APPROVED' AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL
          AND cancelled_at IS NULL)
      OR (status = 'REJECTED' AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL
          AND decision_reason IS NOT NULL AND btrim(decision_reason) <> '' AND cancelled_at IS NULL)
      OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND decided_at IS NULL
          AND decided_by_user_id IS NULL)
    )
  );

-- Applications are created SUBMITTED for a consistent registration/examination/subject; identity,
-- attempt and snapshots never change; a fee can only go NOT_CONFIGURED → ASSESSED while SUBMITTED;
-- SUBMITTED → APPROVED | REJECTED | CANCELLED once; never deleted.
CREATE FUNCTION docversity_re_exam_applications_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  reg RECORD;
  exam RECORD;
  line RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 're_exam_applications_guard: application % cannot be deleted', OLD.id USING ERRCODE = 'DV001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 're_exam_applications_guard: applications are created as SUBMITTED' USING ERRCODE = 'DV001';
    END IF;
    SELECT student_id, curriculum_id INTO reg FROM student_registrations WHERE id = NEW.student_registration_id;
    SELECT curriculum_id, semester_number, kind, status, re_exam_applications_open INTO exam
      FROM examinations WHERE id = NEW.examination_id;
    SELECT curriculum_id, semester_number, subject_id INTO line
      FROM program_subjects WHERE id = NEW.program_subject_id;
    IF reg.student_id IS DISTINCT FROM NEW.student_id THEN
      RAISE EXCEPTION 're_exam_applications_guard: the registration does not belong to the student' USING ERRCODE = 'DV001';
    END IF;
    IF exam.kind <> 'RE_EXAMINATION' OR exam.status <> 'OPEN' OR NOT exam.re_exam_applications_open THEN
      RAISE EXCEPTION 're_exam_applications_guard: the examination is not accepting re-exam applications' USING ERRCODE = 'DV001';
    END IF;
    IF exam.curriculum_id IS NULL OR reg.curriculum_id IS DISTINCT FROM exam.curriculum_id THEN
      RAISE EXCEPTION 're_exam_applications_guard: the registration does not follow the examination''s curriculum' USING ERRCODE = 'DV001';
    END IF;
    IF line.curriculum_id IS DISTINCT FROM exam.curriculum_id
       OR line.semester_number IS DISTINCT FROM exam.semester_number
       OR line.subject_id IS DISTINCT FROM NEW.subject_id THEN
      RAISE EXCEPTION 're_exam_applications_guard: the subject is not part of this examination''s period' USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.student_id, NEW.student_registration_id, NEW.examination_id, NEW.program_subject_id,
      NEW.subject_id, NEW.attempt_number, NEW.attempt_basis, NEW.student_name, NEW.registration_number,
      NEW.program_code, NEW.program_name, NEW.academic_session_name, NEW.period_label, NEW.subject_code,
      NEW.subject_name, NEW.examination_name, NEW.exam_session, NEW.submitted_at,
      NEW.submitted_by_account_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.student_id, OLD.student_registration_id, OLD.examination_id, OLD.program_subject_id,
      OLD.subject_id, OLD.attempt_number, OLD.attempt_basis, OLD.student_name, OLD.registration_number,
      OLD.program_code, OLD.program_name, OLD.academic_session_name, OLD.period_label, OLD.subject_code,
      OLD.subject_name, OLD.examination_name, OLD.exam_session, OLD.submitted_at,
      OLD.submitted_by_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 're_exam_applications_guard: identity and attempt of application % are immutable', OLD.id USING ERRCODE = 'DV001';
  END IF;

  IF (NEW.fee_status, NEW.fee_blocked_reason, NEW.fee_rule_id, NEW.fee_rule_version, NEW.fee_scope,
      NEW.fee_currency, NEW.fee_amount_minor, NEW.fee_assessed_at)
     IS DISTINCT FROM
     (OLD.fee_status, OLD.fee_blocked_reason, OLD.fee_rule_id, OLD.fee_rule_version, OLD.fee_scope,
      OLD.fee_currency, OLD.fee_amount_minor, OLD.fee_assessed_at) THEN
    IF OLD.fee_status = 'ASSESSED' THEN
      RAISE EXCEPTION 're_exam_applications_guard: the fee of application % is fixed once assessed', OLD.id USING ERRCODE = 'DV001';
    END IF;
    IF OLD.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 're_exam_applications_guard: the fee of a decided application cannot change' USING ERRCODE = 'DV001';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'SUBMITTED' AND NEW.status IN ('APPROVED', 'REJECTED', 'CANCELLED')) THEN
      RAISE EXCEPTION 're_exam_applications_guard: % → % is not allowed', OLD.status, NEW.status USING ERRCODE = 'DV001';
    END IF;
  ELSIF (NEW.decided_at, NEW.decided_by_user_id, NEW.decision_reason, NEW.cancelled_at)
        IS DISTINCT FROM (OLD.decided_at, OLD.decided_by_user_id, OLD.decision_reason, OLD.cancelled_at) THEN
    RAISE EXCEPTION 're_exam_applications_guard: decisions on application % are final', OLD.id USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER re_exam_applications_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "re_exam_applications"
  FOR EACH ROW EXECUTE FUNCTION docversity_re_exam_applications_guard();
