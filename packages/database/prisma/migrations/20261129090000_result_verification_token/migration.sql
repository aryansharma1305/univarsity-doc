-- Public verification portal: an unguessable credential per result publication so the full
-- marksheet can be shown only to someone holding it (QR on the marksheet). Course + roll number +
-- semester alone never reveal marks. Additive; existing publications keep NULL (no marksheet link).

-- AlterTable
ALTER TABLE "result_publications" ADD COLUMN "verification_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "result_publications_verification_token_key" ON "result_publications"("verification_token");

-- 32 random bytes, base64url without padding (43 characters), like certificate QR tokens.
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_verification_token_check"
  CHECK (verification_token IS NULL OR verification_token ~ '^[A-Za-z0-9_-]{43}$');
