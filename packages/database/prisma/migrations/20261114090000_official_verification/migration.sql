-- Additive only. No existing records, authority or public disclosure is changed.
ALTER TYPE "DocumentType" ADD VALUE 'ADMISSION_LETTER';
CREATE TABLE verification_policies (
 id uuid PRIMARY KEY, service varchar(32) NOT NULL, program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
 definition jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'DRAFT',
 proposed_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 approved_by_id uuid REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz(3), created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT verification_policy_state CHECK (service IN ('certificate','admission-letter','registration','result') AND status IN ('DRAFT','APPROVED','WITHDRAWN') AND
 (status <> 'APPROVED' OR (approved_by_id IS NOT NULL AND approved_by_id <> proposed_by_id AND approved_at IS NOT NULL)))
);
CREATE INDEX verification_policies_service_program_id_status_idx ON verification_policies(service,program_id,status);
CREATE FUNCTION verification_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND
 (ROW(NEW.id,NEW.service,NEW.program_id,NEW.definition,NEW.proposed_by_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.service,OLD.program_id,OLD.definition,OLD.proposed_by_id,OLD.created_at)
 OR NOT ((OLD.status='DRAFT' AND NEW.status='APPROVED') OR (OLD.status='APPROVED' AND NEW.status='WITHDRAWN'))
 OR (OLD.status='APPROVED' AND ROW(NEW.approved_by_id,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approved_by_id,OLD.approved_at)))) THEN
 RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Verification policy authority is immutable'; END IF;
 IF TG_OP = 'INSERT' AND (NEW.status <> 'DRAFT' OR NEW.approved_by_id IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
 RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Verification policy requires separate approval'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER verification_policy_integrity BEFORE INSERT OR UPDATE OR DELETE ON verification_policies FOR EACH ROW EXECUTE FUNCTION verification_policy_guard();
CREATE TABLE result_publications (
 id uuid PRIMARY KEY, result_id uuid NOT NULL UNIQUE REFERENCES results(id) ON DELETE RESTRICT,
 policy_id uuid NOT NULL REFERENCES verification_policies(id) ON DELETE RESTRICT,
 approval_event_id uuid NOT NULL REFERENCES result_review_events(id) ON DELETE RESTRICT,
 published_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 snapshot_digest char(64) NOT NULL, published_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION result_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Result publication receipt is immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM results r JOIN result_review_events e ON e.result_id=r.id
 JOIN verification_policies p ON p.id=NEW.policy_id JOIN student_registrations s ON s.id=r.student_registration_id
 WHERE r.id=NEW.result_id AND r.publication_status='APPROVED' AND r.approved_at IS NOT NULL
 AND e.id=NEW.approval_event_id AND e.action='APPROVE' AND e.to_status='APPROVED' AND e.result_version=r.version
 AND p.service='result' AND p.program_id=s.program_id AND p.status='APPROVED') THEN
 RAISE EXCEPTION USING ERRCODE='DV001', MESSAGE='Result publication requires current review authority'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER result_publication_integrity BEFORE INSERT OR UPDATE OR DELETE ON result_publications FOR EACH ROW EXECUTE FUNCTION result_publication_guard();

CREATE OR REPLACE FUNCTION docversity_reviewed_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.publication_status='APPROVED' OR EXISTS(SELECT 1 FROM result_review_events WHERE result_id=OLD.id) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reviewed_result_guard: history cannot be deleted' USING ERRCODE='DV001'; END IF;
   -- Only an immutable, approved publication receipt permits the initial transition.
   IF OLD.publication_status='APPROVED' AND NEW.publication_status='PUBLISHED'
    AND NEW.published_at IS NOT NULL
    AND (to_jsonb(NEW)-ARRAY['publication_status','published_at','updated_at']) = (to_jsonb(OLD)-ARRAY['publication_status','published_at','updated_at'])
    AND EXISTS(SELECT 1 FROM result_publications p JOIN result_review_events e ON e.id=p.approval_event_id
      WHERE p.result_id=OLD.id AND e.snapshot=docversity_result_review_snapshot(OLD.id)) THEN RETURN NEW; END IF;
   -- Existing core guards freeze published marks and allow withdrawal/supersession only.
   IF OLD.published_at IS NOT NULL AND EXISTS(SELECT 1 FROM result_publications WHERE result_id=OLD.id) THEN RETURN NEW; END IF;
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
