-- Applied migrations and legacy placements remain unchanged. Prevent an undersized legacy
-- declaration from being activated while retaining archival as a safe exit for existing versions.
CREATE FUNCTION docversity_curriculum_activation_period_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND EXISTS (
    SELECT 1 FROM program_subjects
    WHERE curriculum_id = NEW.id AND semester_number > NEW.number_of_periods
  ) THEN
    RAISE EXCEPTION 'curriculum_activation_period_guard: subjects exist outside declared periods'
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER program_curricula_activation_period_guard
BEFORE UPDATE ON program_curricula
FOR EACH ROW EXECUTE FUNCTION docversity_curriculum_activation_period_guard();
