-- Student uploads (Student Portal simplification): academic and identity documents a student
-- uploads about themself, one file per category. Files only; no identity numbers as data.

-- CreateEnum
CREATE TYPE "StudentUploadCategory" AS ENUM ('ACADEMIC_CLASS_10', 'ACADEMIC_CLASS_12', 'ACADEMIC_BACHELORS', 'ACADEMIC_MASTERS', 'ACADEMIC_OTHER', 'IDENTITY_NATIONAL_ID', 'IDENTITY_PASSPORT', 'IDENTITY_PAN', 'IDENTITY_DRIVING_LICENCE', 'IDENTITY_OTHER');

-- CreateTable
CREATE TABLE "student_uploads" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "category" "StudentUploadCategory" NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_uploads_student_id_category_key" ON "student_uploads"("student_id", "category");

-- AddForeignKey
ALTER TABLE "student_uploads" ADD CONSTRAINT "student_uploads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Integrity rules
-- ---------------------------------------------------------------------------------------------

-- Same accepted formats and size limit as historical documents (15 MiB); the key is generated
-- under the student's own prefix, never chosen by a client.
ALTER TABLE "student_uploads" ADD CONSTRAINT "student_uploads_file_check"
  CHECK (
    content_type IN ('application/pdf', 'image/jpeg', 'image/png')
    AND size_bytes > 0 AND size_bytes <= 15728640
    AND sha256 ~ '^[0-9a-f]{64}$'
    AND storage_key LIKE 'students/' || student_id::text || '/uploads/%'
  );
