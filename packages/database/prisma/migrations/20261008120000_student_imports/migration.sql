-- Phase 5: student / registration bulk imports.
--
-- Adds what the import worker needs to run the persisted wizard (progress, worker-run ownership,
-- worksheet discovery, validation classification, commit results, safe failure details, the error
-- report location) and the per-row action. The Phase 2 migration is frozen and is not modified.

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('CREATE', 'UPDATE', 'SKIP');

-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "active_run_id" UUID,
ADD COLUMN     "apply_updates" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "committed_by_user_id" UUID,
ADD COLUMN     "create_rows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "created_records" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error_report_created_at" TIMESTAMPTZ(3),
ADD COLUMN     "error_report_storage_key" VARCHAR(512),
ADD COLUMN     "failure" JSONB,
ADD COLUMN     "file_sha256" CHAR(64),
ADD COLUMN     "file_size_bytes" INTEGER,
ADD COLUMN     "progress" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "sheets" JSONB,
ADD COLUMN     "unchanged_rows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "update_rows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_records" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validated_at" TIMESTAMPTZ(3),
ADD COLUMN     "worksheet_name" VARCHAR(31);

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN     "action" "ImportRowAction",
ADD COLUMN     "registration_id" UUID;

-- CreateIndex
CREATE INDEX "import_jobs_committed_by_user_id_idx" ON "import_jobs"("committed_by_user_id");

-- CreateIndex
CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "import_rows_import_job_id_action_idx" ON "import_rows"("import_job_id", "action");

-- CreateIndex
CREATE INDEX "import_rows_registration_id_idx" ON "import_rows"("registration_id");

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_committed_by_user_id_fkey" FOREIGN KEY ("committed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "student_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Integrity rules for the new columns
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_phase5_counts_check"
  CHECK (
    create_rows >= 0 AND update_rows >= 0 AND unchanged_rows >= 0
    AND created_records >= 0 AND updated_records >= 0
  );
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_progress_check"
  CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_file_check"
  CHECK (
    (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$')
    AND (file_size_bytes IS NULL OR file_size_bytes > 0)
  );
-- A failed import always says why; nothing else carries a failure.
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_failure_check"
  CHECK ((status = 'FAILED') = (failure IS NOT NULL AND jsonb_typeof(failure) = 'object'));
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_sheets_check"
  CHECK (sheets IS NULL OR jsonb_typeof(sheets) = 'array');

-- Error rows never carry an action. `action` is the student-import classification; rows of other
-- import types (results, Phase 8) or rows not yet classified may have none. A classified row that was
-- imported always points at the registration it created or updated.
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_action_check"
  CHECK (
    (status <> 'ERROR' OR action IS NULL)
    AND (status <> 'IMPORTED' OR action IS NULL OR (registration_id IS NOT NULL AND action IN ('CREATE', 'UPDATE')))
  );
