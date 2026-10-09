-- Phase 8: staff-managed historical documents (certificates, marksheets, …) and the student document
-- library. Additive only: one new table and its enums; no existing table or row is changed.

-- CreateEnum
CREATE TYPE "HistoricalDocumentType" AS ENUM ('DEGREE_CERTIFICATE', 'DIPLOMA_CERTIFICATE', 'PROVISIONAL_CERTIFICATE', 'MARKSHEET', 'TRANSCRIPT', 'MIGRATION_CERTIFICATE', 'CHARACTER_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "HistoricalDocumentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DocumentAuthenticity" AS ENUM ('UNVERIFIED', 'CONFIRMED_AGAINST_RECORDS', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DocumentProvenance" AS ENUM ('UNIVERSITY_ARCHIVE', 'LEGACY_WORDPRESS', 'STUDENT_PROVIDED_COPY', 'OTHER');

-- CreateTable
CREATE TABLE "historical_documents" (
    "id" UUID NOT NULL,
    "student_registration_id" UUID NOT NULL,
    "document_type" "HistoricalDocumentType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "certificate_number" VARCHAR(64),
    "issued_on" DATE,
    "provenance" "DocumentProvenance" NOT NULL,
    "provenance_note" VARCHAR(1000),
    "legacy_source_system" VARCHAR(32),
    "legacy_record_id" VARCHAR(128),
    "legacy_verification_url" VARCHAR(512),
    "storage_key" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "status" "HistoricalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "uploaded_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "published_by_user_id" UUID,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_by_user_id" UUID,
    "withdrawal_reason" VARCHAR(1000),
    "superseded_at" TIMESTAMPTZ(3),
    "replaces_document_id" UUID,
    "authenticity" "DocumentAuthenticity" NOT NULL DEFAULT 'UNVERIFIED',
    "authenticity_note" VARCHAR(1000),
    "authenticity_reviewed_at" TIMESTAMPTZ(3),
    "authenticity_reviewed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "historical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_documents_student_registration_id_status_idx" ON "historical_documents"("student_registration_id", "status");

-- CreateIndex
CREATE INDEX "historical_documents_status_created_at_idx" ON "historical_documents"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "historical_documents_certificate_number_idx" ON "historical_documents"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "historical_documents_one_file_per_registration_key" ON "historical_documents"("student_registration_id", "sha256") WHERE (status <> 'WITHDRAWN'::"HistoricalDocumentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "historical_documents_one_live_replacement_key" ON "historical_documents"("replaces_document_id") WHERE ((replaces_document_id IS NOT NULL) AND (status <> 'WITHDRAWN'::"HistoricalDocumentStatus"));

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_student_registration_id_fkey" FOREIGN KEY ("student_registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_withdrawn_by_user_id_fkey" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_authenticity_reviewed_by_user_id_fkey" FOREIGN KEY ("authenticity_reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_replaces_document_id_fkey" FOREIGN KEY ("replaces_document_id") REFERENCES "historical_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------
-- Integrity rules (Phase 8)
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_file_check"
  CHECK (
    content_type IN ('application/pdf', 'image/jpeg', 'image/png')
    AND size_bytes > 0
    AND sha256 ~ '^[0-9a-f]{64}$'
    AND storage_key <> '' AND btrim(original_filename) <> ''
    AND btrim(title) <> ''
  );

-- Status ⇔ decision columns. Withdrawal always carries a reason.
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_lifecycle_check"
  CHECK (
    (status = 'DRAFT' AND published_at IS NULL AND superseded_at IS NULL)
    OR (status = 'PUBLISHED' AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL
        AND superseded_at IS NULL)
    OR (status = 'WITHDRAWN' AND withdrawn_at IS NOT NULL AND withdrawn_by_user_id IS NOT NULL
        AND withdrawal_reason IS NOT NULL AND btrim(withdrawal_reason) <> '' AND superseded_at IS NULL)
    OR (status = 'SUPERSEDED' AND superseded_at IS NOT NULL AND published_at IS NOT NULL)
  );

-- Authenticity review is recorded by someone other than the uploader (maker–checker).
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_authenticity_check"
  CHECK (
    (authenticity = 'UNVERIFIED' AND authenticity_reviewed_at IS NULL
      AND authenticity_reviewed_by_user_id IS NULL)
    OR (authenticity <> 'UNVERIFIED' AND authenticity_reviewed_at IS NOT NULL
      AND authenticity_reviewed_by_user_id IS NOT NULL
      AND authenticity_reviewed_by_user_id <> uploaded_by_user_id)
  );

ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_replacement_check"
  CHECK (replaces_document_id IS NULL OR replaces_document_id <> id);

-- History protection: created as DRAFT; the file, its owner registration and the replacement
-- link never change; metadata changes only while DRAFT; allowed status changes are
--   DRAFT → PUBLISHED | WITHDRAWN, PUBLISHED → WITHDRAWN | SUPERSEDED, WITHDRAWN → PUBLISHED;
-- SUPERSEDED is final; a replacement belongs to the same registration; rows are never deleted.
CREATE FUNCTION docversity_historical_documents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  original_registration uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'historical_documents_guard: document % cannot be deleted', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'historical_documents_guard: documents are created as DRAFT'
        USING ERRCODE = 'DV001';
    END IF;
    IF NEW.replaces_document_id IS NOT NULL THEN
      SELECT student_registration_id INTO original_registration
        FROM historical_documents WHERE id = NEW.replaces_document_id;
      IF original_registration IS DISTINCT FROM NEW.student_registration_id THEN
        RAISE EXCEPTION 'historical_documents_guard: a replacement must belong to the same registration'
          USING ERRCODE = 'DV001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.student_registration_id, NEW.storage_key, NEW.content_type, NEW.size_bytes,
      NEW.sha256, NEW.original_filename, NEW.uploaded_by_user_id, NEW.replaces_document_id,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.student_registration_id, OLD.storage_key, OLD.content_type, OLD.size_bytes,
      OLD.sha256, OLD.original_filename, OLD.uploaded_by_user_id, OLD.replaces_document_id,
      OLD.created_at) THEN
    RAISE EXCEPTION 'historical_documents_guard: the file and owner of document % are immutable', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF OLD.status <> 'DRAFT'
     AND (NEW.document_type, NEW.title, NEW.certificate_number, NEW.issued_on, NEW.provenance,
          NEW.provenance_note, NEW.legacy_source_system, NEW.legacy_record_id,
          NEW.legacy_verification_url)
         IS DISTINCT FROM
         (OLD.document_type, OLD.title, OLD.certificate_number, OLD.issued_on, OLD.provenance,
          OLD.provenance_note, OLD.legacy_source_system, OLD.legacy_record_id,
          OLD.legacy_verification_url) THEN
    RAISE EXCEPTION 'historical_documents_guard: metadata of document % can only change while it is a draft (use a replacement)', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF OLD.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'historical_documents_guard: superseded document % is read-only', OLD.id
      USING ERRCODE = 'DV001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'DRAFT' AND NEW.status IN ('PUBLISHED', 'WITHDRAWN'))
    OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('WITHDRAWN', 'SUPERSEDED'))
    OR (OLD.status = 'WITHDRAWN' AND NEW.status = 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'historical_documents_guard: % → % is not allowed', OLD.status, NEW.status
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER historical_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "historical_documents"
  FOR EACH ROW EXECUTE FUNCTION docversity_historical_documents_guard();
