-- Additive draft-only persistence; existing marks and lifecycle are retained.
ALTER TABLE results ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE results ADD CONSTRAINT results_version_check CHECK (version > 0);
ALTER TABLE result_items ALTER COLUMN status DROP NOT NULL;
ALTER TABLE result_items ADD COLUMN re_exam_application_id UUID;
CREATE UNIQUE INDEX result_items_re_exam_application_id_key ON result_items(re_exam_application_id);
ALTER TABLE result_items ADD CONSTRAINT result_items_re_exam_application_id_fkey
  FOREIGN KEY (re_exam_application_id) REFERENCES re_exam_applications(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE result_draft_batches (
  id UUID PRIMARY KEY, actor_user_id UUID NOT NULL, preview_id UUID NOT NULL,
  examination_id UUID NOT NULL, request_digest CHAR(64) NOT NULL,
  outcome JSONB NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT result_draft_batches_actor_user_id_fkey FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT result_draft_batches_examination_id_fkey FOREIGN KEY(examination_id) REFERENCES examinations(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX result_draft_batches_preview_id_idx ON result_draft_batches(preview_id);
CREATE TRIGGER result_draft_batches_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON result_draft_batches
  FOR EACH STATEMENT EXECUTE FUNCTION docversity_reject_modification();

CREATE FUNCTION docversity_draft_item_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD; e RECORD; reg RECORD; ps RECORD; app RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.re_exam_application_id IS DISTINCT FROM OLD.re_exam_application_id THEN
    RAISE EXCEPTION 'draft_item_integrity: application identity is immutable' USING ERRCODE = 'DV001';
  END IF;
  SELECT * INTO r FROM results WHERE id=NEW.result_id FOR UPDATE;
  IF NEW.status IS NULL AND (r.publication_status <> 'DRAFT' OR r.published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'draft_item_integrity: ungraded items require DRAFT' USING ERRCODE='DV001';
  END IF;
  IF NEW.status IS NULL OR NEW.re_exam_application_id IS NOT NULL THEN
    SELECT * INTO e FROM examinations WHERE id=r.examination_id;
    SELECT * INTO reg FROM student_registrations WHERE id=r.student_registration_id;
    SELECT * INTO ps FROM program_subjects WHERE id=NEW.program_subject_id;
    IF e.curriculum_id IS NULL OR ps.curriculum_id IS DISTINCT FROM e.curriculum_id
      OR reg.curriculum_id IS DISTINCT FROM e.curriculum_id OR reg.program_id <> e.program_id
      OR ps.semester_number <> e.semester_number OR reg.status <> 'ACTIVE'
      OR e.status NOT IN ('OPEN','UNDER_REVIEW') THEN
      RAISE EXCEPTION 'draft_item_integrity: incompatible academic context' USING ERRCODE='DV001';
    END IF;
    IF e.kind='REGULAR' AND (r.attempt_number <> 1 OR NEW.re_exam_application_id IS NOT NULL) THEN
      RAISE EXCEPTION 'draft_item_integrity: regular attempt must be 1' USING ERRCODE='DV001';
    ELSIF e.kind='RE_EXAMINATION' THEN
      SELECT * INTO app FROM re_exam_applications WHERE id=NEW.re_exam_application_id;
      IF NOT FOUND OR app.status <> 'APPROVED' OR app.student_registration_id <> reg.id
        OR app.examination_id <> e.id OR app.program_subject_id <> ps.id OR app.attempt_number <> r.attempt_number THEN
        RAISE EXCEPTION 'draft_item_integrity: approved application must match attempt' USING ERRCODE='DV001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER draft_item_integrity BEFORE INSERT OR UPDATE ON result_items
  FOR EACH ROW EXECUTE FUNCTION docversity_draft_item_integrity();
CREATE FUNCTION docversity_ungraded_result_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.publication_status <> 'DRAFT' AND EXISTS(SELECT 1 FROM result_items WHERE result_id=NEW.id AND status IS NULL) THEN
    RAISE EXCEPTION 'ungraded_result_guard: resolve subject outcomes before leaving DRAFT' USING ERRCODE='DV001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ungraded_result_guard BEFORE UPDATE ON results
  FOR EACH ROW EXECUTE FUNCTION docversity_ungraded_result_guard();
