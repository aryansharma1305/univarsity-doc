-- CreateEnum
CREATE TYPE "ProfileChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "student_profile_change_requests" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "submitted_by_account_id" UUID NOT NULL,
    "status" "ProfileChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_changes" JSONB NOT NULL,
    "current_snapshot" JSONB NOT NULL,
    "student_note" VARCHAR(500),
    "photo_storage_key" VARCHAR(512),
    "photo_sha256" CHAR(64),
    "photo_size_bytes" INTEGER,
    "photo_width" SMALLINT,
    "photo_height" SMALLINT,
    "base_photo_storage_key" VARCHAR(512),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "rejection_reason" VARCHAR(1000),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_profile_change_requests_student_id_submitted_at_idx" ON "student_profile_change_requests"("student_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "student_profile_change_requests_status_submitted_at_idx" ON "student_profile_change_requests"("status", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "student_profile_change_requests_one_pending_per_student_key" ON "student_profile_change_requests"("student_id") WHERE (status = 'PENDING'::"ProfileChangeRequestStatus");

-- AddForeignKey
ALTER TABLE "student_profile_change_requests" ADD CONSTRAINT "student_profile_change_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile_change_requests" ADD CONSTRAINT "student_profile_change_requests_submitted_by_account_id_fkey" FOREIGN KEY ("submitted_by_account_id") REFERENCES "student_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profile_change_requests" ADD CONSTRAINT "student_profile_change_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 7)
-- ---------------------------------------------------------------------------------------------

-- Decision columns are consistent with the status; a request always proposes something.
ALTER TABLE "student_profile_change_requests" ADD CONSTRAINT "student_profile_change_requests_lifecycle_check"
  CHECK (
    (status = 'PENDING'
      AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL
      AND rejection_reason IS NULL AND cancelled_at IS NULL)
    OR (status = 'APPROVED'
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NULL AND cancelled_at IS NULL)
    OR (status = 'REJECTED'
      AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL
      AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '' AND cancelled_at IS NULL)
    OR (status = 'CANCELLED'
      AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL
      AND rejection_reason IS NULL AND cancelled_at IS NOT NULL)
  );

ALTER TABLE "student_profile_change_requests" ADD CONSTRAINT "student_profile_change_requests_content_check"
  CHECK (
    jsonb_typeof(proposed_changes) = 'object'
    AND jsonb_typeof(current_snapshot) = 'object'
    AND (proposed_changes <> '{}'::jsonb OR photo_storage_key IS NOT NULL)
    AND (
      (photo_storage_key IS NULL AND photo_sha256 IS NULL AND photo_size_bytes IS NULL
        AND photo_width IS NULL AND photo_height IS NULL)
      OR (photo_storage_key IS NOT NULL AND photo_sha256 ~ '^[0-9a-f]{64}$'
        AND photo_size_bytes > 0 AND photo_width > 0 AND photo_height > 0)
    )
  );

-- Submissions are immutable, decisions happen once (PENDING -> APPROVED | REJECTED | CANCELLED),
-- the submitting account belongs to the student, and requests are never deleted (history).
CREATE FUNCTION docversity_profile_change_requests_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'profile_change_requests_guard: request % cannot be deleted', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'profile_change_requests_guard: requests are created PENDING'
        USING ERRCODE = 'DV001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM student_accounts a
      WHERE a.id = NEW.submitted_by_account_id AND a.student_id = NEW.student_id
    ) THEN
      RAISE EXCEPTION 'profile_change_requests_guard: the submitting account does not belong to the student'
        USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.student_id, NEW.submitted_by_account_id, NEW.proposed_changes,
      NEW.current_snapshot, NEW.student_note, NEW.photo_storage_key, NEW.photo_sha256,
      NEW.photo_size_bytes, NEW.photo_width, NEW.photo_height, NEW.base_photo_storage_key,
      NEW.submitted_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.student_id, OLD.submitted_by_account_id, OLD.proposed_changes,
      OLD.current_snapshot, OLD.student_note, OLD.photo_storage_key, OLD.photo_sha256,
      OLD.photo_size_bytes, OLD.photo_width, OLD.photo_height, OLD.base_photo_storage_key,
      OLD.submitted_at, OLD.created_at) THEN
    RAISE EXCEPTION 'profile_change_requests_guard: submitted data of request % is immutable', OLD.id
      USING ERRCODE = 'DV001';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'profile_change_requests_guard: request % has already been decided', OLD.id
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER student_profile_change_requests_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "student_profile_change_requests"
  FOR EACH ROW EXECUTE FUNCTION docversity_profile_change_requests_guard();
