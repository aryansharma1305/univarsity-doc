-- CreateTable
CREATE TABLE "result_review_events" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "from_status" "ResultPublicationStatus" NOT NULL,
    "to_status" "ResultPublicationStatus" NOT NULL,
    "result_version" INTEGER NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "result_review_events_actor_user_id_idx" ON "result_review_events"("actor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_review_events_result_id_result_version_key" ON "result_review_events"("result_id", "result_version");

-- AddForeignKey
ALTER TABLE "result_review_events" ADD CONSTRAINT "result_review_events_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_review_events" ADD CONSTRAINT "result_review_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- New workflow receipts are append-only; no existing academic rows are changed.
ALTER TABLE result_review_events ADD CONSTRAINT result_review_event_action_check CHECK (
  result_version > 1 AND request_digest ~ '^[a-f0-9]{64}$' AND (
    (action='SUBMIT' AND from_status='DRAFT' AND to_status='UNDER_REVIEW') OR
    (action='APPROVE' AND from_status='UNDER_REVIEW' AND to_status='APPROVED') OR
    (action IN ('RETURN','REJECT') AND from_status IN ('UNDER_REVIEW','APPROVED') AND to_status='DRAFT' AND length(btrim(reason)) > 0 AND reason IS NOT NULL)
  )
);
CREATE TRIGGER result_review_events_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON result_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION docversity_reject_modification();

-- Identifies marks exactly, without student names or mutable lifecycle timestamps.
CREATE FUNCTION docversity_result_review_snapshot(target uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('result', to_jsonb(r) - ARRAY['publication_status','version','approved_at','published_at','created_at','updated_at','calculation_snapshot'],
 'context', (SELECT jsonb_build_object('programId',e.program_id,'curriculumId',e.curriculum_id,'academicSessionId',e.academic_session_id,'periodNumber',e.semester_number,'kind',e.kind,'assignedCurriculumId',reg.curriculum_id) FROM examinations e JOIN student_registrations reg ON reg.id=r.student_registration_id WHERE e.id=r.examination_id),
 'items', coalesce((SELECT jsonb_agg(to_jsonb(i) - ARRAY['created_at','updated_at','source_data'] ORDER BY i.id) FROM result_items i WHERE i.result_id=r.id),'[]'::jsonb))
 FROM results r WHERE r.id=target;
$$;
CREATE FUNCTION docversity_result_review_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 SELECT * INTO r FROM results WHERE id=NEW.result_id FOR UPDATE;
 IF r.published_at IS NOT NULL OR r.publication_status NOT IN ('DRAFT','UNDER_REVIEW','APPROVED')
   OR NEW.from_status<>r.publication_status OR NEW.result_version<>r.version+1
   OR NEW.snapshot IS DISTINCT FROM docversity_result_review_snapshot(r.id) THEN
   RAISE EXCEPTION 'result_review_event_guard: stale or incompatible marks version' USING ERRCODE='DV001';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER result_review_event_guard BEFORE INSERT ON result_review_events FOR EACH ROW EXECUTE FUNCTION docversity_result_review_event_guard();

-- Null outcomes may enter internal review/approval only with a matching immutable receipt.
-- Published outcomes remain required; publication of the new workflow is blocked at the DB too.
ALTER TABLE results DROP CONSTRAINT results_publication_check;
ALTER TABLE results ADD CONSTRAINT results_publication_check CHECK (
  (publication_status <> 'PUBLISHED' OR (outcome IS NOT NULL AND published_at IS NOT NULL))
);
CREATE OR REPLACE FUNCTION docversity_ungraded_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.publication_status IN ('UNDER_REVIEW','APPROVED') AND
   (NEW.outcome IS NULL OR EXISTS(SELECT 1 FROM result_items WHERE result_id=NEW.id AND status IS NULL)) AND
   NOT EXISTS(SELECT 1 FROM result_review_events WHERE result_id=NEW.id AND result_version=NEW.version AND to_status=NEW.publication_status) THEN
   RAISE EXCEPTION 'ungraded_result_guard: internal review requires matching immutable receipt' USING ERRCODE='DV001';
 END IF;
 IF NEW.publication_status NOT IN ('DRAFT','UNDER_REVIEW','APPROVED') AND EXISTS(SELECT 1 FROM result_items WHERE result_id=NEW.id AND status IS NULL) THEN
   RAISE EXCEPTION 'ungraded_result_guard: publication requires official subject outcomes' USING ERRCODE='DV001';
 END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION docversity_reviewed_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.publication_status='APPROVED' OR EXISTS(SELECT 1 FROM result_review_events WHERE result_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reviewed_result_guard: history cannot be deleted' USING ERRCODE='DV001'; END IF;
   IF NEW.publication_status='PUBLISHED' OR NEW.published_at IS NOT NULL THEN
     RAISE EXCEPTION 'reviewed_result_guard: publication configuration required' USING ERRCODE='DV001';
   END IF;
   IF OLD.publication_status<>'DRAFT' OR NEW.publication_status<>'DRAFT' THEN
     IF (to_jsonb(NEW)-ARRAY['publication_status','version','approved_at','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['publication_status','version','approved_at','updated_at']) OR
       NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM result_review_events WHERE result_id=NEW.id
         AND result_version=NEW.version AND from_status=OLD.publication_status AND to_status=NEW.publication_status
         AND snapshot=docversity_result_review_snapshot(OLD.id)) THEN
       RAISE EXCEPTION 'reviewed_result_guard: locked marks or missing transition receipt' USING ERRCODE='DV001';
     END IF;
   END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER reviewed_result_guard BEFORE UPDATE OR DELETE ON results FOR EACH ROW EXECUTE FUNCTION docversity_reviewed_result_guard();
CREATE FUNCTION docversity_reviewed_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; state "ResultPublicationStatus";
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.result_id ELSE NEW.result_id END;
 SELECT publication_status INTO state FROM results WHERE id=target FOR UPDATE;
 IF state<>'DRAFT' AND EXISTS(SELECT 1 FROM result_review_events WHERE result_id=target) THEN
   RAISE EXCEPTION 'reviewed_items_guard: return for correction before editing reviewed marks' USING ERRCODE='DV001';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;
CREATE TRIGGER a_reviewed_items_guard BEFORE INSERT OR UPDATE OR DELETE ON result_items FOR EACH ROW EXECUTE FUNCTION docversity_reviewed_items_guard();

-- Inserts cannot evade the approval/null-outcome rule.
DROP TRIGGER ungraded_result_guard ON results;
CREATE TRIGGER ungraded_result_guard BEFORE INSERT OR UPDATE ON results FOR EACH ROW EXECUTE FUNCTION docversity_ungraded_result_guard();
CREATE FUNCTION docversity_result_review_event_committed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM results WHERE id=NEW.result_id AND version=NEW.result_version AND publication_status=NEW.to_status) THEN
  RAISE EXCEPTION 'result_review_event_committed: transition receipt requires matching committed state' USING ERRCODE='DV001';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER result_review_event_committed AFTER INSERT ON result_review_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION docversity_result_review_event_committed();
