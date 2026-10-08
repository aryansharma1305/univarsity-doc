-- Phase 6: student portal accounts and single-use activation codes.
--
-- Students are a separate principal from staff (`users`): their accounts carry no roles or
-- permissions, and an account can only be created by redeeming an activation code issued for one of
-- the student's registrations. Earlier migrations are not modified.

-- CreateEnum
CREATE TYPE "StudentAccountStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateTable
CREATE TABLE "student_accounts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "StudentAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" VARCHAR(500),
    "activated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_activation_codes" (
    "id" UUID NOT NULL,
    "student_registration_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "issued_by_user_id" UUID,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "failed_attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_accounts_student_id_key" ON "student_accounts"("student_id");

-- CreateIndex
CREATE INDEX "student_accounts_status_idx" ON "student_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "student_activation_codes_code_hash_key" ON "student_activation_codes"("code_hash");

-- CreateIndex
CREATE INDEX "student_activation_codes_student_registration_id_issued_at_idx" ON "student_activation_codes"("student_registration_id", "issued_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "student_activation_codes_one_open_per_registration_key" ON "student_activation_codes"("student_registration_id") WHERE ((used_at IS NULL) AND (revoked_at IS NULL));

-- AddForeignKey
ALTER TABLE "student_accounts" ADD CONSTRAINT "student_accounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_activation_codes" ADD CONSTRAINT "student_activation_codes_student_registration_id_fkey" FOREIGN KEY ("student_registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_activation_codes" ADD CONSTRAINT "student_activation_codes_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Integrity rules
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "student_accounts" ADD CONSTRAINT "student_accounts_password_hash_check"
  CHECK (password_hash LIKE '$argon2id$%');
ALTER TABLE "student_accounts" ADD CONSTRAINT "student_accounts_status_reason_check"
  CHECK (
    (status <> 'DISABLED' OR (status_reason IS NOT NULL AND btrim(status_reason) <> ''))
    AND (status_reason IS NULL OR char_length(status_reason) <= 500)
  );

ALTER TABLE "student_activation_codes" ADD CONSTRAINT "student_activation_codes_lifecycle_check"
  CHECK (
    expires_at > issued_at
    AND NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL)
    AND failed_attempts >= 0
    AND code_hash ~ '^[0-9a-f]{64}$'
  );
