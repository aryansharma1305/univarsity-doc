-- CreateTable
CREATE TABLE "certificate_requests" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(64) NOT NULL,
    "student_id" UUID NOT NULL,
    "certificate_type" VARCHAR(32) NOT NULL,
    "policy_id" VARCHAR(128) NOT NULL,
    "policy_version" INTEGER NOT NULL,
    "policy_snapshot" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    "purpose" VARCHAR(1000) NOT NULL,
    "remarks" VARCHAR(2000),
    "submission_key" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_request_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "student_message" VARCHAR(2000),
    "private_note" VARCHAR(2000),
    "actor_student_id" UUID,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_requests_reference_key" ON "certificate_requests"("reference");

-- CreateIndex
CREATE INDEX "certificate_requests_student_id_submitted_at_idx" ON "certificate_requests"("student_id", "submitted_at");

-- CreateIndex
CREATE INDEX "certificate_requests_status_certificate_type_submitted_at_idx" ON "certificate_requests"("status", "certificate_type", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_requests_student_id_submission_key_key" ON "certificate_requests"("student_id", "submission_key");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_requests_one_open_key" ON "certificate_requests"("student_id", "certificate_type") WHERE ((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'UNDER_REVIEW'::character varying, 'INFORMATION_REQUESTED'::character varying, 'INFORMATION_PROVIDED'::character varying, 'REVIEW_COMPLETED'::character varying])::text[]));

-- CreateIndex
CREATE INDEX "certificate_request_events_actor_user_id_idx" ON "certificate_request_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "certificate_request_events_actor_student_id_idx" ON "certificate_request_events"("actor_student_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_request_events_request_id_version_key" ON "certificate_request_events"("request_id", "version");

-- AddForeignKey
ALTER TABLE "certificate_requests" ADD CONSTRAINT "certificate_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_request_events" ADD CONSTRAINT "certificate_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "certificate_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_request_events" ADD CONSTRAINT "certificate_request_events_actor_student_id_fkey" FOREIGN KEY ("actor_student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_request_events" ADD CONSTRAINT "certificate_request_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Requests cannot express academic approval, payment verification or issuance.
ALTER TABLE certificate_requests ADD CONSTRAINT certificate_request_type_check CHECK (certificate_type IN ('TRANSCRIPT','PROVISIONAL','CHARACTER','MIGRATION'));
ALTER TABLE certificate_requests ADD CONSTRAINT certificate_request_state_check CHECK (status IN ('SUBMITTED','UNDER_REVIEW','INFORMATION_REQUESTED','INFORMATION_PROVIDED','REVIEW_COMPLETED','CANCELLED','CLOSED'));
ALTER TABLE certificate_requests ADD CONSTRAINT certificate_request_version_check CHECK (version > 0 AND policy_version > 0);
ALTER TABLE certificate_request_events ADD CONSTRAINT certificate_event_actor_check CHECK ((actor_student_id IS NULL) <> (actor_user_id IS NULL));
ALTER TABLE certificate_request_events ADD CONSTRAINT certificate_event_action_check CHECK (action IN ('SUBMIT','REQUEST_INFORMATION','RECORD_REVIEW','COMPLETE_REVIEW','RESPOND','CANCEL','CLOSE'));
CREATE FUNCTION certificate_request_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request history must be retained'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'SUBMITTED' OR NEW.version <> 1 THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Invalid initial certificate request'; END IF;
 ELSE
  IF ROW(NEW.id,NEW.reference,NEW.student_id,NEW.certificate_type,NEW.policy_id,NEW.policy_version,NEW.policy_snapshot,NEW.purpose,NEW.remarks,NEW.submission_key,NEW.submitted_at) IS DISTINCT FROM ROW(OLD.id,OLD.reference,OLD.student_id,OLD.certificate_type,OLD.policy_id,OLD.policy_version,OLD.policy_snapshot,OLD.purpose,OLD.remarks,OLD.submission_key,OLD.submitted_at) OR NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request snapshot is immutable'; END IF;
  IF NOT ((OLD.status IN ('SUBMITTED','UNDER_REVIEW','INFORMATION_PROVIDED') AND NEW.status IN ('UNDER_REVIEW','INFORMATION_REQUESTED')) OR (OLD.status='INFORMATION_REQUESTED' AND NEW.status='INFORMATION_PROVIDED') OR (OLD.status IN ('SUBMITTED','UNDER_REVIEW','INFORMATION_REQUESTED','INFORMATION_PROVIDED') AND NEW.status='CANCELLED') OR (OLD.status IN ('UNDER_REVIEW','INFORMATION_PROVIDED') AND NEW.status='REVIEW_COMPLETED') OR (OLD.status IN ('REVIEW_COMPLETED','CANCELLED') AND NEW.status='CLOSED')) THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Invalid certificate request transition'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER certificate_request_integrity BEFORE INSERT OR UPDATE OR DELETE ON certificate_requests FOR EACH ROW EXECUTE FUNCTION certificate_request_guard();
CREATE FUNCTION certificate_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r certificate_requests;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request events are append-only'; END IF;
 SELECT * INTO r FROM certificate_requests WHERE id=NEW.request_id;
 IF NEW.version <> r.version OR NEW.status <> r.status OR (NEW.actor_student_id IS NOT NULL AND NEW.actor_student_id <> r.student_id) OR (NEW.actor_student_id IS NOT NULL AND (NEW.private_note IS NOT NULL OR NEW.action NOT IN ('SUBMIT','RESPOND','CANCEL'))) OR (NEW.actor_user_id IS NOT NULL AND NEW.action IN ('SUBMIT','RESPOND','CANCEL')) THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request event does not match its transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER certificate_event_integrity BEFORE INSERT OR UPDATE OR DELETE ON certificate_request_events FOR EACH ROW EXECUTE FUNCTION certificate_event_guard();
CREATE FUNCTION certificate_request_history_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM certificate_request_events WHERE request_id=NEW.id AND version=NEW.version AND status=NEW.status) THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request transition requires history'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER certificate_request_history AFTER INSERT OR UPDATE ON certificate_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION certificate_request_history_check();
CREATE FUNCTION certificate_request_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Certificate request history must be retained'; END $$;
CREATE TRIGGER certificate_requests_no_truncate BEFORE TRUNCATE ON certificate_requests EXECUTE FUNCTION certificate_request_no_truncate();
CREATE TRIGGER certificate_events_no_truncate BEFORE TRUNCATE ON certificate_request_events EXECUTE FUNCTION certificate_request_no_truncate();
