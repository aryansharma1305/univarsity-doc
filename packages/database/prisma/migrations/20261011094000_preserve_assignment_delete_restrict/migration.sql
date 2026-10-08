-- Keep the existing FK RESTRICT semantics for deletion; the new history guard protects updates.
-- Referenced assignments are still undeletable, with the native foreign-key error expected by
-- existing clients and integrity tests. Earlier applied migrations stay unchanged.
CREATE OR REPLACE FUNCTION docversity_assignment_history_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM result_items WHERE program_subject_id = OLD.id) THEN
    RAISE EXCEPTION 'assignment_history_guard: an assignment referenced by results is read-only'
      USING ERRCODE = 'DV001';
  END IF;
  PERFORM id FROM subjects WHERE id = NEW.subject_id FOR SHARE;
  RETURN NEW;
END;
$$;
