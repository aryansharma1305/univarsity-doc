-- Staff first-login password change and authenticator-app MFA (RFC 6238 TOTP).
--
-- Additive and backward-compatible: nullable columns, one column with a constant default (no table
-- rewrite on PostgreSQL >= 11) and a new table. The previous release never reads or writes these, and
-- its INSERTs into users get the defaults. Existing users are NOT flagged: password_change_required
-- defaults to false and nobody has MFA until they enroll; MFA becomes mandatory only when the API is
-- started with STAFF_MFA_ENFORCED=true.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled_at" TIMESTAMPTZ(3),
ADD COLUMN     "mfa_totp_last_used_step" BIGINT,
ADD COLUMN     "mfa_totp_secret_enc" TEXT,
ADD COLUMN     "password_change_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "staff_mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_mfa_recovery_codes_code_hash_key" ON "staff_mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "staff_mfa_recovery_codes_user_id_idx" ON "staff_mfa_recovery_codes"("user_id");

-- AddForeignKey
ALTER TABLE "staff_mfa_recovery_codes" ADD CONSTRAINT "staff_mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written integrity checks (not modelled by Prisma).
-- A secret exists exactly when MFA is enabled; the replay marker only exists alongside a secret.
ALTER TABLE "users" ADD CONSTRAINT "users_mfa_state_check" CHECK (
  ("mfa_totp_secret_enc" IS NULL) = ("mfa_enabled_at" IS NULL)
  AND ("mfa_totp_last_used_step" IS NULL OR "mfa_totp_secret_enc" IS NOT NULL)
  AND ("mfa_totp_last_used_step" IS NULL OR "mfa_totp_last_used_step" >= 0)
);
-- Recovery codes are stored only as lowercase hex HMAC-SHA256 digests.
ALTER TABLE "staff_mfa_recovery_codes" ADD CONSTRAINT "staff_mfa_recovery_codes_hash_check" CHECK (
  "code_hash" ~ '^[0-9a-f]{64}$'
);
