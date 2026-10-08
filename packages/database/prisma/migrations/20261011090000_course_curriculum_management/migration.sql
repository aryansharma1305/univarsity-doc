-- Phase 7B: course (program) structure, curriculum versions, subject catalogue fields,
-- curriculum-subject assignments and the registration → curriculum link.
-- Additive. Existing rows stay valid: legacy `program_subjects` rows are linked to backfilled DRAFT
-- curriculum records (one per existing program + curriculum_version label); no registration is
-- assigned to any curriculum.

-- CreateEnum
CREATE TYPE "AcademicStructure" AS ENUM ('SEMESTER_WISE', 'YEAR_WISE');

-- CreateEnum
CREATE TYPE "DurationUnit" AS ENUM ('MONTHS', 'YEARS');

-- CreateEnum
CREATE TYPE "CurriculumStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubjectCategory" AS ENUM ('THEORY', 'PRACTICAL', 'COMBINED');

-- AlterTable (curriculum_id is made NOT NULL after the backfill below)
ALTER TABLE "program_subjects" ADD COLUMN     "classification" "SubjectCategory",
ADD COLUMN     "curriculum_id" UUID,
ADD COLUMN     "display_order" SMALLINT NOT NULL DEFAULT 0,
ALTER COLUMN "credits" DROP NOT NULL;

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "academic_structure" "AcademicStructure",
ADD COLUMN     "description" VARCHAR(1000),
ADD COLUMN     "duration_unit" "DurationUnit",
ADD COLUMN     "duration_value" SMALLINT,
ADD COLUMN     "period_count" SMALLINT;

-- AlterTable
ALTER TABLE "student_registrations" ADD COLUMN     "curriculum_id" UUID;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "category" "SubjectCategory",
ADD COLUMN     "description" VARCHAR(1000);

-- CreateTable
CREATE TABLE "program_curricula" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "version_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "structure_type" "AcademicStructure" NOT NULL,
    "number_of_periods" SMALLINT NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "status" "CurriculumStatus" NOT NULL DEFAULT 'DRAFT',
    "activated_at" TIMESTAMPTZ(3),
    "activated_by_user_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_curricula_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------------------------
-- Backfill (deterministic; derived only from existing structural data)
-- ---------------------------------------------------------------------------------------------

-- Programs that already state a number of semesters are semester-wise with that many periods.
UPDATE "programs"
   SET "academic_structure" = 'SEMESTER_WISE', "period_count" = "duration_semesters"
 WHERE "duration_semesters" IS NOT NULL AND "duration_semesters" <= 40;

-- One DRAFT curriculum per existing (program, curriculum_version label). The Phase 2 column is
-- `semester_number`, so the existing structure is semester-wise; the period count covers every
-- existing assignment and the program's stated duration.
INSERT INTO "program_curricula"
  ("id", "program_id", "version_code", "name", "structure_type", "number_of_periods", "status",
   "created_at", "updated_at")
SELECT gen_random_uuid(), ps."program_id", ps."curriculum_version", ps."curriculum_version",
       'SEMESTER_WISE', LEAST(40, GREATEST(MAX(ps."semester_number"), COALESCE(p."duration_semesters", 1))),
       'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "program_subjects" ps
  JOIN "programs" p ON p."id" = ps."program_id"
 GROUP BY ps."program_id", ps."curriculum_version", p."duration_semesters";

UPDATE "program_subjects" ps
   SET "curriculum_id" = c."id",
       "display_order" = ordered.position
  FROM "program_curricula" c,
       (SELECT "id", (ROW_NUMBER() OVER (
                PARTITION BY "program_id", "curriculum_version", "semester_number"
                ORDER BY "created_at", "id") - 1)::smallint AS position
          FROM "program_subjects") ordered
 WHERE c."program_id" = ps."program_id"
   AND c."version_code" = ps."curriculum_version"
   AND ordered."id" = ps."id";

ALTER TABLE "program_subjects" ALTER COLUMN "curriculum_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "program_curricula_program_id_status_idx" ON "program_curricula"("program_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "program_curricula_program_id_version_code_key" ON "program_curricula"("program_id", "version_code");

-- CreateIndex
CREATE UNIQUE INDEX "program_curricula_id_program_id_key" ON "program_curricula"("id", "program_id");

-- CreateIndex
CREATE INDEX "program_subjects_curriculum_id_semester_number_display_orde_idx" ON "program_subjects"("curriculum_id", "semester_number", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "program_subjects_curriculum_id_subject_id_key" ON "program_subjects"("curriculum_id", "subject_id");

-- CreateIndex
CREATE INDEX "student_registrations_curriculum_id_idx" ON "student_registrations"("curriculum_id");

-- AddForeignKey
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "program_curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_curricula" ADD CONSTRAINT "program_curricula_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_curricula" ADD CONSTRAINT "program_curricula_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_curricula" ADD CONSTRAINT "program_curricula_archived_by_user_id_fkey" FOREIGN KEY ("archived_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_curriculum_id_program_id_fkey" FOREIGN KEY ("curriculum_id", "program_id") REFERENCES "program_curricula"("id", "program_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 7B)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "programs" ADD CONSTRAINT "programs_structure_check"
  CHECK (
    (duration_value IS NULL) = (duration_unit IS NULL)
    AND (duration_value IS NULL OR duration_value BETWEEN 1 AND 240)
    AND (academic_structure IS NULL) = (period_count IS NULL)
    AND (period_count IS NULL OR period_count BETWEEN 1 AND 40)
  );

ALTER TABLE "program_curricula" ADD CONSTRAINT "program_curricula_values_check"
  CHECK (
    version_code <> '' AND version_code = btrim(version_code)
    AND btrim(name) <> ''
    AND number_of_periods BETWEEN 1 AND 40
    AND (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from)
  );

ALTER TABLE "program_curricula" ADD CONSTRAINT "program_curricula_lifecycle_check"
  CHECK (
    (status = 'DRAFT' AND activated_at IS NULL AND archived_at IS NULL AND archived_by_user_id IS NULL)
    OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND archived_at IS NULL AND archived_by_user_id IS NULL)
    OR (status = 'ARCHIVED' AND archived_at IS NOT NULL)
  );

ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_layout_check"
  CHECK (
    display_order >= 0
    AND (component_configuration IS NULL OR jsonb_typeof(component_configuration) = 'object')
  );

-- Curriculum lifecycle: created DRAFT; DRAFT is editable; DRAFT → ACTIVE (needs at least one
-- subject) or ARCHIVED; ACTIVE → ARCHIVED; ACTIVE may only change effective_to; ARCHIVED is frozen;
-- only DRAFT versions can be deleted. ACTIVE versions of one program may not have overlapping
-- effective periods (NULL bounds are open-ended); checks are serialised per program.
CREATE FUNCTION docversity_program_curricula_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  overlapping uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'program_curricula_guard: curriculum % is % and cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'DV001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'program_curricula_guard: curricula are created as DRAFT'
        USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.program_id IS DISTINCT FROM OLD.program_id THEN
    RAISE EXCEPTION 'program_curricula_guard: the program of curriculum % cannot change', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'program_curricula_guard: archived curriculum % is read-only', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF OLD.status = 'ACTIVE' THEN
    IF NEW.status NOT IN ('ACTIVE', 'ARCHIVED') THEN
      RAISE EXCEPTION 'program_curricula_guard: an active curriculum can only be archived'
        USING ERRCODE = 'DV001';
    END IF;
    IF (NEW.version_code, NEW.name, NEW.description, NEW.structure_type, NEW.number_of_periods,
        NEW.effective_from, NEW.activated_at, NEW.activated_by_user_id)
       IS DISTINCT FROM
       (OLD.version_code, OLD.name, OLD.description, OLD.structure_type, OLD.number_of_periods,
        OLD.effective_from, OLD.activated_at, OLD.activated_by_user_id) THEN
      RAISE EXCEPTION 'program_curricula_guard: active curriculum % is read-only (only its end date can change)', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
    IF EXISTS (SELECT 1 FROM program_subjects
                WHERE curriculum_id = NEW.id AND semester_number > NEW.number_of_periods) THEN
      RAISE EXCEPTION 'program_curricula_guard: subjects are assigned beyond period %', NEW.number_of_periods
        USING ERRCODE = 'DV001';
    END IF;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status = 'ACTIVE' THEN
    IF NOT EXISTS (SELECT 1 FROM program_subjects WHERE curriculum_id = NEW.id) THEN
      RAISE EXCEPTION 'program_curricula_guard: a curriculum needs at least one subject to be activated'
        USING ERRCODE = 'DV001';
    END IF;
  END IF;

  IF NEW.status = 'ACTIVE' THEN
    IF NEW.effective_from IS NOT NULL AND NEW.effective_to IS NOT NULL
       AND NEW.effective_to < NEW.effective_from THEN
      RAISE EXCEPTION 'program_curricula_guard: the end date is before the start date'
        USING ERRCODE = 'DV001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('program_curricula:' || NEW.program_id::text, 0));
    SELECT c.id INTO overlapping
      FROM program_curricula c
     WHERE c.program_id = NEW.program_id
       AND c.id <> NEW.id
       AND c.status = 'ACTIVE'
       AND daterange(c.effective_from, c.effective_to, '[]')
           && daterange(NEW.effective_from, NEW.effective_to, '[]')
     LIMIT 1;
    IF overlapping IS NOT NULL THEN
      RAISE EXCEPTION 'program_curricula_guard: the effective period overlaps active curriculum % of this program', overlapping
        USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER program_curricula_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "program_curricula"
  FOR EACH ROW EXECUTE FUNCTION docversity_program_curricula_guard();

-- Keeps the Phase 2 label column in step when a DRAFT version is renamed.
CREATE FUNCTION docversity_program_curricula_sync_label() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE program_subjects SET curriculum_version = NEW.version_code WHERE curriculum_id = NEW.id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER program_curricula_sync_label
  AFTER UPDATE OF version_code ON "program_curricula"
  FOR EACH ROW WHEN (NEW.version_code IS DISTINCT FROM OLD.version_code)
  EXECUTE FUNCTION docversity_program_curricula_sync_label();

-- Subject assignments change only while their curriculum is DRAFT (the curriculum row is locked
-- FOR SHARE, so an assignment cannot slip into a version being activated concurrently); the
-- period lies within the curriculum; the label column mirrors the curriculum's version code.
CREATE FUNCTION docversity_program_subjects_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  curriculum RECORD;
  target uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
                           OR NEW.program_id IS DISTINCT FROM OLD.program_id) THEN
    RAISE EXCEPTION 'program_subjects_guard: an assignment cannot move to another curriculum'
      USING ERRCODE = 'DV001';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.curriculum_id ELSE NEW.curriculum_id END;
  SELECT status, number_of_periods, version_code INTO curriculum
    FROM program_curricula WHERE id = target FOR SHARE;
  IF curriculum.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'program_subjects_guard: curriculum % is not a draft; its subjects cannot change', target
      USING ERRCODE = 'DV001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.semester_number > curriculum.number_of_periods THEN
    RAISE EXCEPTION 'program_subjects_guard: period % is outside the curriculum (1–%)', NEW.semester_number, curriculum.number_of_periods
      USING ERRCODE = 'DV001';
  END IF;
  NEW.curriculum_version := curriculum.version_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER program_subjects_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "program_subjects"
  FOR EACH ROW EXECUTE FUNCTION docversity_program_subjects_guard();

-- A registration's curriculum belongs to its program; NEW assignments need an ACTIVE version;
-- an assignment cannot be changed or removed once the registration has results.
CREATE FUNCTION docversity_registration_curriculum_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  curriculum RECORD;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.curriculum_id IS NOT NULL
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

CREATE TRIGGER registration_curriculum_guard
  BEFORE INSERT OR UPDATE OF curriculum_id, program_id ON "student_registrations"
  FOR EACH ROW EXECUTE FUNCTION docversity_registration_curriculum_guard();
