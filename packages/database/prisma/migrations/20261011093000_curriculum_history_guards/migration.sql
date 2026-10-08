-- Phase 7B follow-up: protect catalogue identity, legacy result references and null curriculum
-- assignments. The earlier applied migration remains unchanged.
CREATE FUNCTION docversity_subject_history_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.code, NEW.name, NEW.version, NEW.category)
     IS DISTINCT FROM (OLD.code, OLD.name, OLD.version, OLD.category)
     AND EXISTS (
       SELECT 1 FROM program_subjects ps JOIN program_curricula c ON c.id = ps.curriculum_id
        WHERE ps.subject_id = OLD.id
          AND (c.status <> 'DRAFT' OR EXISTS (SELECT 1 FROM result_items ri WHERE ri.program_subject_id = ps.id))
     ) THEN
    RAISE EXCEPTION 'subject_history_guard: catalogue identity is used in academic history; create a new subject'
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subject_history_guard BEFORE UPDATE ON subjects
  FOR EACH ROW EXECUTE FUNCTION docversity_subject_history_guard();

CREATE FUNCTION docversity_curriculum_history_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Lock catalogue identities before activation: a concurrent catalogue edit either completes
  -- before this transition or observes the committed ACTIVE version and is refused.
  IF OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' THEN
    PERFORM s.id FROM subjects s JOIN program_subjects ps ON ps.subject_id = s.id
      WHERE ps.curriculum_id = OLD.id ORDER BY s.id FOR SHARE OF s;
  END IF;
  IF (NEW.version_code, NEW.name, NEW.description, NEW.structure_type, NEW.number_of_periods,
      NEW.effective_from)
     IS DISTINCT FROM (OLD.version_code, OLD.name, OLD.description, OLD.structure_type,
                       OLD.number_of_periods, OLD.effective_from)
     AND EXISTS (SELECT 1 FROM program_subjects ps JOIN result_items ri ON ri.program_subject_id = ps.id
                  WHERE ps.curriculum_id = OLD.id) THEN
    RAISE EXCEPTION 'curriculum_history_guard: a version referenced by results is read-only'
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER program_curricula_history_guard BEFORE UPDATE ON program_curricula
  FOR EACH ROW EXECUTE FUNCTION docversity_curriculum_history_guard();

CREATE FUNCTION docversity_assignment_history_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM result_items WHERE program_subject_id = OLD.id) THEN
    RAISE EXCEPTION 'assignment_history_guard: an assignment referenced by results is read-only'
      USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  -- Also serialize new references against catalogue identity edits.
  PERFORM id FROM subjects WHERE id = NEW.subject_id FOR SHARE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER program_subjects_history_guard BEFORE INSERT OR UPDATE OR DELETE ON program_subjects
  FOR EACH ROW EXECUTE FUNCTION docversity_assignment_history_guard();

CREATE OR REPLACE FUNCTION docversity_registration_curriculum_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  curriculum RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
     AND EXISTS (SELECT 1 FROM results WHERE student_registration_id = OLD.id) THEN
    RAISE EXCEPTION 'registration_curriculum_guard: registration % has results; its curriculum cannot change', OLD.id
      USING ERRCODE = 'DV001';
  END IF;
  IF NEW.curriculum_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT program_id, status INTO curriculum
    FROM program_curricula WHERE id = NEW.curriculum_id FOR SHARE;
  IF curriculum.program_id IS DISTINCT FROM NEW.program_id THEN
    RAISE EXCEPTION 'registration_curriculum_guard: the curriculum belongs to another program'
      USING ERRCODE = 'DV001';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id)
     AND curriculum.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'registration_curriculum_guard: only an active curriculum can be assigned'
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

