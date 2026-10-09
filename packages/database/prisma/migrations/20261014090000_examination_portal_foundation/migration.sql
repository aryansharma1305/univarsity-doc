-- Phase 9A: external examination application links and the examination-record foundation.
-- Additive only: one enum, one table, three nullable/defaulted columns on `examinations`, CHECKs and
-- one trigger. No existing row changes (new columns default to REGULAR / not open / no curriculum).

-- CreateEnum
CREATE TYPE "ExaminationKind" AS ENUM ('REGULAR', 'RE_EXAMINATION');

-- AlterTable
ALTER TABLE "examinations" ADD COLUMN     "curriculum_id" UUID,
ADD COLUMN     "kind" "ExaminationKind" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "re_exam_applications_open" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "external_exam_applications" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "website_url" VARCHAR(512) NOT NULL,
    "android_url" VARCHAR(512),
    "ios_url" VARCHAR(512),
    "instructions" VARCHAR(4000),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_exam_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_exam_applications_is_active_idx" ON "external_exam_applications"("is_active");

-- CreateIndex
CREATE INDEX "examinations_curriculum_id_status_idx" ON "examinations"("curriculum_id", "status");

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_curriculum_id_program_id_fkey" FOREIGN KEY ("curriculum_id", "program_id") REFERENCES "program_curricula"("id", "program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_exam_applications" ADD CONSTRAINT "external_exam_applications_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_exam_applications" ADD CONSTRAINT "external_exam_applications_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 9A)
-- ---------------------------------------------------------------------------------------------

-- Links to the external examination application are https only (no other schemes, no whitespace,
-- no embedded credentials); the API validates the same rules with clearer messages.
ALTER TABLE "external_exam_applications" ADD CONSTRAINT "external_exam_applications_url_check"
  CHECK (
    btrim(name) <> ''
    AND website_url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'
    AND (android_url IS NULL OR android_url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$')
    AND (ios_url IS NULL OR ios_url ~ '^https://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$')
  );

-- Only re-examinations can accept re-exam applications.
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_re_exam_applications_check"
  CHECK (re_exam_applications_open = false OR kind = 'RE_EXAMINATION');

-- An examination linked to a curriculum uses one of that curriculum's periods (semester or year)
-- and never a DRAFT (still editable) curriculum version.
CREATE FUNCTION docversity_examinations_curriculum_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  periods smallint;
  curriculum_status "CurriculumStatus";
BEGIN
  IF NEW.curriculum_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.curriculum_id IS NOT DISTINCT FROM OLD.curriculum_id
     AND NEW.semester_number IS NOT DISTINCT FROM OLD.semester_number THEN
    RETURN NEW;
  END IF;
  SELECT number_of_periods, status INTO periods, curriculum_status
    FROM program_curricula WHERE id = NEW.curriculum_id;
  IF curriculum_status = 'DRAFT' THEN
    RAISE EXCEPTION 'examinations_curriculum_guard: examinations cannot use a DRAFT curriculum version'
      USING ERRCODE = 'DV001';
  END IF;
  IF NEW.semester_number < 1 OR NEW.semester_number > periods THEN
    RAISE EXCEPTION 'examinations_curriculum_guard: period % is outside the curriculum''s % period(s)', NEW.semester_number, periods
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER examinations_curriculum_guard
  BEFORE INSERT OR UPDATE ON "examinations"
  FOR EACH ROW EXECUTE FUNCTION docversity_examinations_curriculum_guard();
