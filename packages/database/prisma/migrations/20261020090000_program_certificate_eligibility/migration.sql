-- CreateTable
CREATE TABLE "program_certificate_eligibility" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PROPOSED',
    "certificate_types" VARCHAR(32)[],
    "policy_id" VARCHAR(128) NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "duration_months" SMALLINT NOT NULL,
    "tier" VARCHAR(32) NOT NULL,
    "authority_reference" VARCHAR(200) NOT NULL,
    "rationale" VARCHAR(1000),
    "proposed_by_user_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(1000),
    "superseded_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_certificate_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_certificate_eligibility_proposed_by_user_id_idx" ON "program_certificate_eligibility"("proposed_by_user_id");

-- CreateIndex
CREATE INDEX "program_certificate_eligibility_decided_by_user_id_idx" ON "program_certificate_eligibility"("decided_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificate_eligibility_program_id_revision_key" ON "program_certificate_eligibility"("program_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "program_certificate_eligibility_one_proposed_key" ON "program_certificate_eligibility"("program_id") WHERE ((status)::text = 'PROPOSED'::text);

-- CreateIndex
CREATE UNIQUE INDEX "program_certificate_eligibility_one_approved_key" ON "program_certificate_eligibility"("program_id") WHERE ((status)::text = 'APPROVED'::text);

-- AddForeignKey
ALTER TABLE "program_certificate_eligibility" ADD CONSTRAINT "program_certificate_eligibility_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificate_eligibility" ADD CONSTRAINT "program_certificate_eligibility_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_certificate_eligibility" ADD CONSTRAINT "program_certificate_eligibility_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 12C integrity. Course eligibility is configuration only: no column can express student
-- qualification, course completion, payment, Rector approval or issuance.
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_status_check CHECK (status IN ('PROPOSED','APPROVED','REJECTED','WITHDRAWN','SUPERSEDED'));
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_version_check CHECK (version > 0 AND revision > 0 AND policy_version > 0 AND duration_months > 0);
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_types_check CHECK (
  certificate_types IS NOT NULL
  AND cardinality(certificate_types) BETWEEN 1 AND 5
  AND array_position(certificate_types, NULL) IS NULL
  AND certificate_types <@ ARRAY['COURSE_COMPLETION','TRANSCRIPT','PROVISIONAL','CHARACTER','MIGRATION']::varchar[]
);
-- University course-duration policy v1, re-checked in the database. A future policy version needs a
-- reviewed migration that adds its mapping; unknown versions are rejected.
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_policy_v1_check CHECK (
  policy_id = 'UNIVERSITY_COURSE_DURATION_CERTIFICATES' AND policy_version = 1 AND (
    (tier = 'SHORT_COURSE' AND duration_months IN (2,3,6) AND certificate_types <@ ARRAY['COURSE_COMPLETION']::varchar[])
    OR (tier = 'MORE_THAN_ONE_YEAR' AND duration_months BETWEEN 13 AND 24 AND certificate_types <@ ARRAY['TRANSCRIPT','PROVISIONAL','CHARACTER']::varchar[])
    OR (tier = 'MORE_THAN_TWO_YEARS' AND duration_months > 24 AND certificate_types <@ ARRAY['TRANSCRIPT','PROVISIONAL','CHARACTER','MIGRATION']::varchar[])
  )
);
-- Separation of duties: nobody approves or rejects their own proposal.
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_decider_check CHECK (
  status NOT IN ('APPROVED','REJECTED','SUPERSEDED') OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL AND decided_by_user_id <> proposed_by_user_id)
);
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_decision_check CHECK (
  (status = 'PROPOSED' AND decided_by_user_id IS NULL AND decided_at IS NULL AND decision_note IS NULL AND superseded_at IS NULL)
  OR (status IN ('APPROVED','REJECTED','WITHDRAWN') AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL AND superseded_at IS NULL)
  OR (status = 'SUPERSEDED' AND superseded_at IS NOT NULL)
);
ALTER TABLE program_certificate_eligibility ADD CONSTRAINT program_certificate_eligibility_rejection_note_check CHECK (status <> 'REJECTED' OR decision_note IS NOT NULL);

CREATE FUNCTION program_certificate_eligibility_months(p programs) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p.duration_value IS NULL OR p.duration_value <= 0 THEN NULL
              WHEN p.duration_unit = 'MONTHS' THEN p.duration_value::integer
              WHEN p.duration_unit = 'YEARS' THEN p.duration_value::integer * 12 END
$$;
CREATE FUNCTION program_certificate_eligibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p programs;
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Course certificate eligibility history must be retained'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'PROPOSED' OR NEW.version <> 1 THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='A course certificate set must start as a proposal'; END IF;
  IF (SELECT count(DISTINCT t) FROM unnest(NEW.certificate_types) t) <> cardinality(NEW.certificate_types) THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Duplicate certificate types'; END IF;
  SELECT * INTO p FROM programs WHERE id = NEW.program_id;
  IF program_certificate_eligibility_months(p) IS DISTINCT FROM NEW.duration_months THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Proposal does not match the course duration'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.program_id,NEW.revision,NEW.certificate_types,NEW.policy_id,NEW.policy_version,NEW.duration_months,NEW.tier,NEW.authority_reference,NEW.rationale,NEW.proposed_by_user_id,NEW.proposed_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.program_id,OLD.revision,OLD.certificate_types,OLD.policy_id,OLD.policy_version,OLD.duration_months,OLD.tier,OLD.authority_reference,OLD.rationale,OLD.proposed_by_user_id,OLD.proposed_at)
    OR NEW.version <> OLD.version + 1 THEN
  RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Course certificate set snapshot is immutable';
 END IF;
 IF NOT ((OLD.status = 'PROPOSED' AND NEW.status IN ('APPROVED','REJECTED','WITHDRAWN'))
      OR (OLD.status = 'APPROVED' AND NEW.status = 'SUPERSEDED')) THEN
  RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Invalid course certificate set transition';
 END IF;
 IF OLD.status = 'APPROVED' AND ROW(NEW.decided_by_user_id,NEW.decided_at,NEW.decision_note) IS DISTINCT FROM ROW(OLD.decided_by_user_id,OLD.decided_at,OLD.decision_note) THEN
  RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Approval record is immutable';
 END IF;
 IF NEW.status = 'APPROVED' THEN
  SELECT * INTO p FROM programs WHERE id = NEW.program_id FOR SHARE;
  IF program_certificate_eligibility_months(p) IS DISTINCT FROM NEW.duration_months THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Course duration changed since the proposal'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER program_certificate_eligibility_integrity BEFORE INSERT OR UPDATE OR DELETE ON program_certificate_eligibility FOR EACH ROW EXECUTE FUNCTION program_certificate_eligibility_guard();
CREATE FUNCTION program_certificate_eligibility_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Course certificate eligibility history must be retained'; END $$;
CREATE TRIGGER program_certificate_eligibility_no_truncate BEFORE TRUNCATE ON program_certificate_eligibility EXECUTE FUNCTION program_certificate_eligibility_no_truncate();
