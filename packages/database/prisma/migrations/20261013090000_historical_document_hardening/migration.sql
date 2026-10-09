-- Phase 8 hardening: a metadata-free student copy for image documents, the kinds of embedded
-- metadata found in the original, and a normalised certificate number for search and duplicate
-- warnings. Additive only: new nullable columns, one enum, one index, CHECKs and one extra trigger.
-- No existing column value changes; original files and their keys/checksums are untouched.

-- CreateEnum
CREATE TYPE "EmbeddedMetadataCategory" AS ENUM ('LOCATION', 'DEVICE', 'PERSON', 'TEXT', 'OTHER');

-- AlterTable
ALTER TABLE "historical_documents" ADD COLUMN     "certificate_number_normalized" VARCHAR(128),
ADD COLUMN     "embedded_metadata" "EmbeddedMetadataCategory"[] DEFAULT ARRAY[]::"EmbeddedMetadataCategory"[],
ADD COLUMN     "student_copy_content_type" VARCHAR(64),
ADD COLUMN     "student_copy_created_at" TIMESTAMPTZ(3),
ADD COLUMN     "student_copy_sha256" CHAR(64),
ADD COLUMN     "student_copy_size_bytes" INTEGER,
ADD COLUMN     "student_copy_storage_key" VARCHAR(512);

-- CreateIndex
CREATE INDEX "historical_documents_certificate_number_normalized_idx" ON "historical_documents"("certificate_number_normalized");



-- ---------------------------------------------------------------------------------------------
-- Initial fill and integrity rules (Phase 8 hardening)
-- ---------------------------------------------------------------------------------------------

-- Fill the new normalised column for existing rows (the application computes it for new values with
-- `normalizeCertificateNumber`: NFKC, upper-case, letters and digits only; identical for the ASCII
-- values accepted before this migration). The Phase 8 guard makes SUPERSEDED rows read-only, so it
-- is suspended for this single derived-column fill only. A DO block is one statement: if anything
-- fails, the trigger state and the fill roll back together. `certificate_number` itself is not touched.
DO $$
BEGIN
  ALTER TABLE "historical_documents" DISABLE TRIGGER historical_documents_guard;
  UPDATE "historical_documents"
     SET certificate_number_normalized =
           upper(regexp_replace(normalize(certificate_number, NFKC), '[^[:alnum:]]+', '', 'g'))
   WHERE certificate_number IS NOT NULL;
  ALTER TABLE "historical_documents" ENABLE TRIGGER historical_documents_guard;
END;
$$;

-- A certificate number and its normalised form exist together. The raw number is stored exactly as
-- provided (no control characters); the normalised form is non-empty and contains no whitespace.
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_certificate_number_check"
  CHECK (
    (certificate_number IS NULL AND certificate_number_normalized IS NULL)
    OR (certificate_number IS NOT NULL AND btrim(certificate_number) <> ''
        AND certificate_number !~ '[[:cntrl:]]'
        AND certificate_number_normalized IS NOT NULL AND certificate_number_normalized <> ''
        AND certificate_number_normalized !~ '[[:space:]]')
  );

-- The student copy is all-or-nothing, exists only for images (same format, separate object), and
-- embedded-metadata categories are recorded only together with it.
ALTER TABLE "historical_documents" ADD CONSTRAINT "historical_documents_student_copy_check"
  CHECK (
    embedded_metadata IS NOT NULL
    AND (
      (student_copy_storage_key IS NULL AND student_copy_content_type IS NULL
        AND student_copy_size_bytes IS NULL AND student_copy_sha256 IS NULL
        AND student_copy_created_at IS NULL AND cardinality(embedded_metadata) = 0)
      OR (content_type IN ('image/jpeg', 'image/png')
        AND student_copy_content_type = content_type
        AND student_copy_storage_key <> '' AND student_copy_storage_key <> storage_key
        AND student_copy_size_bytes > 0
        AND student_copy_sha256 ~ '^[0-9a-f]{64}$'
        AND student_copy_created_at IS NOT NULL)
    )
  );

-- Student copy rules: set once (at upload, or later by the backfill), then immutable; an image is
-- never published without it (so students are never served an original image); the normalised
-- certificate number changes only while the document is a draft, like the number itself.
CREATE FUNCTION docversity_historical_documents_hardening_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.student_copy_storage_key IS NOT NULL
       AND (NEW.student_copy_storage_key, NEW.student_copy_content_type, NEW.student_copy_size_bytes,
            NEW.student_copy_sha256, NEW.student_copy_created_at, NEW.embedded_metadata)
           IS DISTINCT FROM
           (OLD.student_copy_storage_key, OLD.student_copy_content_type, OLD.student_copy_size_bytes,
            OLD.student_copy_sha256, OLD.student_copy_created_at, OLD.embedded_metadata) THEN
      RAISE EXCEPTION 'historical_documents_hardening_guard: the student copy of document % is immutable', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
    IF OLD.status <> 'DRAFT'
       AND NEW.certificate_number_normalized IS DISTINCT FROM OLD.certificate_number_normalized THEN
      RAISE EXCEPTION 'historical_documents_hardening_guard: metadata of document % can only change while it is a draft (use a replacement)', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
  END IF;

  IF NEW.status = 'PUBLISHED'
     AND NEW.content_type IN ('image/jpeg', 'image/png')
     AND NEW.student_copy_storage_key IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'PUBLISHED') THEN
    RAISE EXCEPTION 'historical_documents_hardening_guard: image document % needs its metadata-free student copy before it can be published', NEW.id
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER historical_documents_hardening_guard
  BEFORE INSERT OR UPDATE ON "historical_documents"
  FOR EACH ROW EXECUTE FUNCTION docversity_historical_documents_hardening_guard();
