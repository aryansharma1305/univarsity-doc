-- CreateEnum
CREATE TYPE "MasterDataStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AcademicSessionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GradingSchemeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExaminationStatus" AS ENUM ('DRAFT', 'OPEN', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResultPublicationStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'WITHHELD');

-- CreateEnum
CREATE TYPE "ResultOutcome" AS ENUM ('PASS', 'FAIL', 'BACKLOG', 'WITHHELD');

-- CreateEnum
CREATE TYPE "ResultItemStatus" AS ENUM ('PASS', 'FAIL', 'ABSENT', 'BACKLOG', 'WITHHELD');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PROVISIONAL', 'TRANSCRIPT', 'CHARACTER');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PageOrientation" AS ENUM ('PORTRAIT', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'REVOKED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('STUDENTS', 'RESULTS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MAPPING', 'VALIDATING', 'VALIDATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('REGISTRATION', 'RESULT', 'CERTIFICATE', 'QR');

-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VALID', 'INVALID', 'REVOKED', 'CANCELLED', 'NOT_FOUND', 'WITHHELD');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "level" VARCHAR(64),
    "duration_semesters" SMALLINT,
    "department_id" UUID,
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_sessions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "status" "AcademicSessionStatus" NOT NULL DEFAULT 'UPCOMING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "father_name" VARCHAR(200),
    "mother_name" VARCHAR(200),
    "date_of_birth" DATE,
    "gender" VARCHAR(32),
    "photo_storage_key" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_registrations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "registration_number" VARCHAR(64) NOT NULL,
    "registration_number_normalized" VARCHAR(64) NOT NULL,
    "roll_reference_number" VARCHAR(64),
    "program_id" UUID NOT NULL,
    "department_id" UUID,
    "academic_session_id" UUID NOT NULL,
    "admission_date" DATE,
    "completion_date" DATE,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "version" SMALLINT NOT NULL DEFAULT 1,
    "name" VARCHAR(200) NOT NULL,
    "default_credits" DECIMAL(5,2),
    "status" "MasterDataStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_subjects" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "semester_number" SMALLINT NOT NULL,
    "curriculum_version" VARCHAR(32) NOT NULL,
    "credits" DECIMAL(5,2) NOT NULL,
    "max_marks" DECIMAL(7,2),
    "pass_marks" DECIMAL(7,2),
    "component_configuration" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_schemes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "version" SMALLINT NOT NULL,
    "program_id" UUID,
    "effective_from" DATE,
    "effective_to" DATE,
    "rules" JSONB NOT NULL,
    "status" "GradingSchemeStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "grading_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examinations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "program_id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "semester_number" SMALLINT NOT NULL,
    "exam_type" VARCHAR(32),
    "exam_session" VARCHAR(64) NOT NULL,
    "grading_scheme_id" UUID,
    "status" "ExaminationStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "student_registration_id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "attempt_number" SMALLINT NOT NULL DEFAULT 1,
    "revision_number" SMALLINT NOT NULL DEFAULT 1,
    "supersedes_result_id" UUID,
    "total_marks" DECIMAL(7,2),
    "max_marks" DECIMAL(7,2),
    "sgpa" DECIMAL(5,3),
    "cgpa" DECIMAL(5,3),
    "outcome" "ResultOutcome",
    "publication_status" "ResultPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "grading_scheme_id" UUID,
    "calculation_snapshot" JSONB,
    "approved_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_items" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "program_subject_id" UUID NOT NULL,
    "internal_marks" DECIMAL(7,2),
    "external_marks" DECIMAL(7,2),
    "practical_marks" DECIMAL(7,2),
    "other_marks" DECIMAL(7,2),
    "total_marks" DECIMAL(7,2),
    "max_marks" DECIMAL(7,2),
    "grade" VARCHAR(8),
    "grade_point" DECIMAL(5,3),
    "credits_attempted" DECIMAL(5,2),
    "credits_earned" DECIMAL(5,2),
    "status" "ResultItemStatus" NOT NULL,
    "source_data" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "result_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "version" SMALLINT NOT NULL,
    "page_size" VARCHAR(16) NOT NULL DEFAULT 'A4',
    "orientation" "PageOrientation" NOT NULL DEFAULT 'PORTRAIT',
    "template_markup" TEXT,
    "template_styles" TEXT,
    "background_storage_key" VARCHAR(512),
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_document_templates" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "certificate_template_id" UUID NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "program_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "prefix" VARCHAR(32) NOT NULL DEFAULT '',
    "current_value" BIGINT NOT NULL DEFAULT 0,
    "padding" SMALLINT NOT NULL DEFAULT 5,
    "yearly_reset" BOOLEAN NOT NULL DEFAULT false,
    "last_reset_year" SMALLINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificate_number" VARCHAR(64),
    "verification_token" VARCHAR(128),
    "student_registration_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "certificate_template_id" UUID,
    "issue_date" DATE,
    "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
    "source_snapshot" JSONB,
    "pdf_storage_key" VARCHAR(512),
    "pdf_hash" VARCHAR(128),
    "generated_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "issued_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "supersedes_certificate_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(512),
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "warning_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "created_by_user_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "errors" JSONB,
    "warnings" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(128),
    "metadata" JSONB,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" UUID NOT NULL,
    "type" "VerificationType" NOT NULL,
    "reference_hash" VARCHAR(128),
    "certificate_id" UUID,
    "result_id" UUID,
    "student_registration_id" UUID,
    "outcome" "VerificationOutcome" NOT NULL,
    "client_ip_hash" VARCHAR(128),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_mappings" (
    "id" UUID NOT NULL,
    "source_system" VARCHAR(32) NOT NULL,
    "source_entity" VARCHAR(64) NOT NULL,
    "source_identifier" VARCHAR(255) NOT NULL,
    "target_entity" VARCHAR(64) NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateIndex
CREATE INDEX "programs_department_id_idx" ON "programs"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_sessions_code_key" ON "academic_sessions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "student_registrations_registration_number_normalized_key" ON "student_registrations"("registration_number_normalized");

-- CreateIndex
CREATE INDEX "student_registrations_student_id_idx" ON "student_registrations"("student_id");

-- CreateIndex
CREATE INDEX "student_registrations_roll_reference_number_idx" ON "student_registrations"("roll_reference_number");

-- CreateIndex
CREATE INDEX "student_registrations_program_id_academic_session_id_idx" ON "student_registrations"("program_id", "academic_session_id");

-- CreateIndex
CREATE INDEX "student_registrations_academic_session_id_idx" ON "student_registrations"("academic_session_id");

-- CreateIndex
CREATE INDEX "student_registrations_department_id_idx" ON "student_registrations"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_registrations_id_program_id_key" ON "student_registrations"("id", "program_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_version_key" ON "subjects"("code", "version");

-- CreateIndex
CREATE INDEX "program_subjects_program_id_curriculum_version_semester_num_idx" ON "program_subjects"("program_id", "curriculum_version", "semester_number");

-- CreateIndex
CREATE INDEX "program_subjects_subject_id_idx" ON "program_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_subjects_program_id_curriculum_version_subject_id_key" ON "program_subjects"("program_id", "curriculum_version", "subject_id");

-- CreateIndex
CREATE INDEX "grading_schemes_program_id_idx" ON "grading_schemes"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_schemes_name_version_key" ON "grading_schemes"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_code_key" ON "examinations"("code");

-- CreateIndex
CREATE INDEX "examinations_program_id_academic_session_id_semester_number_idx" ON "examinations"("program_id", "academic_session_id", "semester_number");

-- CreateIndex
CREATE INDEX "examinations_academic_session_id_idx" ON "examinations"("academic_session_id");

-- CreateIndex
CREATE INDEX "examinations_grading_scheme_id_idx" ON "examinations"("grading_scheme_id");

-- CreateIndex
CREATE INDEX "examinations_status_idx" ON "examinations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "results_supersedes_result_id_key" ON "results"("supersedes_result_id");

-- CreateIndex
CREATE INDEX "results_examination_id_publication_status_idx" ON "results"("examination_id", "publication_status");

-- CreateIndex
CREATE INDEX "results_grading_scheme_id_idx" ON "results"("grading_scheme_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_student_registration_id_examination_id_attempt_numb_key" ON "results"("student_registration_id", "examination_id", "attempt_number", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "results_one_published_per_attempt_key" ON "results"("student_registration_id", "examination_id", "attempt_number") WHERE (publication_status = 'PUBLISHED');

-- CreateIndex
CREATE UNIQUE INDEX "results_one_working_revision_per_attempt_key" ON "results"("student_registration_id", "examination_id", "attempt_number") WHERE (publication_status = ANY (ARRAY['DRAFT'::"ResultPublicationStatus", 'UNDER_REVIEW'::"ResultPublicationStatus", 'APPROVED'::"ResultPublicationStatus"]));

-- CreateIndex
CREATE INDEX "result_items_program_subject_id_idx" ON "result_items"("program_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_items_result_id_program_subject_id_key" ON "result_items"("result_id", "program_subject_id");

-- CreateIndex
CREATE INDEX "certificate_templates_document_type_status_idx" ON "certificate_templates"("document_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_name_version_key" ON "certificate_templates"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_templates_id_document_type_key" ON "certificate_templates"("id", "document_type");

-- CreateIndex
CREATE INDEX "program_document_templates_program_id_document_type_idx" ON "program_document_templates"("program_id", "document_type");

-- CreateIndex
CREATE INDEX "program_document_templates_certificate_template_id_idx" ON "program_document_templates"("certificate_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "program_document_templates_one_default_key" ON "program_document_templates"("program_id", "document_type") WHERE (is_default);

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_key_key" ON "number_sequences"("key");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verification_token_key" ON "certificates"("verification_token");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_supersedes_certificate_id_key" ON "certificates"("supersedes_certificate_id");

-- CreateIndex
CREATE INDEX "certificates_student_registration_id_document_type_idx" ON "certificates"("student_registration_id", "document_type");

-- CreateIndex
CREATE INDEX "certificates_status_idx" ON "certificates"("status");

-- CreateIndex
CREATE INDEX "certificates_document_type_status_idx" ON "certificates"("document_type", "status");

-- CreateIndex
CREATE INDEX "certificates_program_id_idx" ON "certificates"("program_id");

-- CreateIndex
CREATE INDEX "certificates_certificate_template_id_idx" ON "certificates"("certificate_template_id");

-- CreateIndex
CREATE INDEX "import_jobs_type_status_created_at_idx" ON "import_jobs"("type", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_jobs_created_by_user_id_idx" ON "import_jobs"("created_by_user_id");

-- CreateIndex
CREATE INDEX "import_rows_import_job_id_status_idx" ON "import_rows"("import_job_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_import_job_id_row_number_key" ON "import_rows"("import_job_id", "row_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "verification_logs_type_created_at_idx" ON "verification_logs"("type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "verification_logs_created_at_idx" ON "verification_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "verification_logs_certificate_id_idx" ON "verification_logs"("certificate_id");

-- CreateIndex
CREATE INDEX "verification_logs_result_id_idx" ON "verification_logs"("result_id");

-- CreateIndex
CREATE INDEX "verification_logs_student_registration_id_idx" ON "verification_logs"("student_registration_id");

-- CreateIndex
CREATE INDEX "legacy_mappings_target_entity_target_id_idx" ON "legacy_mappings"("target_entity", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_mappings_source_system_source_entity_source_identifi_key" ON "legacy_mappings"("source_system", "source_entity", "source_identifier");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_grading_scheme_id_fkey" FOREIGN KEY ("grading_scheme_id") REFERENCES "grading_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_student_registration_id_fkey" FOREIGN KEY ("student_registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_grading_scheme_id_fkey" FOREIGN KEY ("grading_scheme_id") REFERENCES "grading_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_supersedes_result_id_fkey" FOREIGN KEY ("supersedes_result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_items" ADD CONSTRAINT "result_items_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_items" ADD CONSTRAINT "result_items_program_subject_id_fkey" FOREIGN KEY ("program_subject_id") REFERENCES "program_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_document_templates" ADD CONSTRAINT "program_document_templates_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_document_templates" ADD CONSTRAINT "program_document_templates_certificate_template_id_documen_fkey" FOREIGN KEY ("certificate_template_id", "document_type") REFERENCES "certificate_templates"("id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_registration_id_program_id_fkey" FOREIGN KEY ("student_registration_id", "program_id") REFERENCES "student_registrations"("id", "program_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_certificate_template_id_fkey" FOREIGN KEY ("certificate_template_id") REFERENCES "certificate_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_generated_by_user_id_fkey" FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_supersedes_certificate_id_fkey" FOREIGN KEY ("supersedes_certificate_id") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_student_registration_id_fkey" FOREIGN KEY ("student_registration_id") REFERENCES "student_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================================
-- Hand-written integrity rules (not expressible in schema.prisma).
-- Prisma's drift check ignores CHECK constraints, functions and triggers, so these never cause
-- false drift. Documented in docs/database/README.md ("Database-enforced invariants").
--
-- Every guard raises SQLSTATE 'DV001' (Docversity integrity guard) with a message prefixed by the
-- guard name. A dedicated code keeps these distinguishable from real FK/unique violations; the API
-- maps DV001 to HTTP 409.
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------------------------

-- Human codes: trimmed and non-empty.
ALTER TABLE "departments"       ADD CONSTRAINT "departments_code_format_check"       CHECK (code <> '' AND code = btrim(code));
ALTER TABLE "programs"          ADD CONSTRAINT "programs_code_format_check"          CHECK (code <> '' AND code = btrim(code));
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_code_format_check" CHECK (code <> '' AND code = btrim(code));
ALTER TABLE "subjects"          ADD CONSTRAINT "subjects_code_format_check"          CHECK (code <> '' AND code = btrim(code));
ALTER TABLE "examinations"      ADD CONSTRAINT "examinations_code_format_check"      CHECK (code <> '' AND code = btrim(code));

ALTER TABLE "programs" ADD CONSTRAINT "programs_duration_semesters_check"
  CHECK (duration_semesters IS NULL OR duration_semesters > 0);

ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_dates_check"
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);

-- The normalised registration number can never disagree with the official one.
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_registration_number_check"
  CHECK (
    registration_number <> ''
    AND registration_number = btrim(registration_number)
    AND registration_number_normalized = upper(registration_number)
  );
ALTER TABLE "student_registrations" ADD CONSTRAINT "student_registrations_dates_check"
  CHECK (admission_date IS NULL OR completion_date IS NULL OR completion_date >= admission_date);

ALTER TABLE "subjects" ADD CONSTRAINT "subjects_version_check" CHECK (version >= 1);
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_default_credits_check"
  CHECK (default_credits IS NULL OR default_credits >= 0);

ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_values_check"
  CHECK (
    semester_number >= 1
    AND credits >= 0
    AND (max_marks IS NULL OR max_marks >= 0)
    AND (pass_marks IS NULL OR pass_marks >= 0)
    AND (max_marks IS NULL OR pass_marks IS NULL OR pass_marks <= max_marks)
  );

ALTER TABLE "grading_schemes" ADD CONSTRAINT "grading_schemes_values_check"
  CHECK (
    version >= 1
    AND jsonb_typeof(rules) = 'object'
    AND (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from)
  );

ALTER TABLE "examinations" ADD CONSTRAINT "examinations_values_check"
  CHECK (semester_number >= 1 AND (status <> 'PUBLISHED' OR published_at IS NOT NULL));

ALTER TABLE "results" ADD CONSTRAINT "results_revision_chain_check"
  CHECK (
    attempt_number >= 1
    AND revision_number >= 1
    AND ((revision_number = 1) = (supersedes_result_id IS NULL))
    AND (supersedes_result_id IS NULL OR supersedes_result_id <> id)
  );
ALTER TABLE "results" ADD CONSTRAINT "results_values_check"
  CHECK (
    (total_marks IS NULL OR total_marks >= 0)
    AND (max_marks IS NULL OR max_marks >= 0)
    AND (total_marks IS NULL OR max_marks IS NULL OR total_marks <= max_marks)
    AND (sgpa IS NULL OR sgpa >= 0)
    AND (cgpa IS NULL OR cgpa >= 0)
  );
ALTER TABLE "results" ADD CONSTRAINT "results_publication_check"
  CHECK (
    (publication_status NOT IN ('APPROVED', 'PUBLISHED') OR outcome IS NOT NULL)
    AND (publication_status <> 'PUBLISHED' OR published_at IS NOT NULL)
  );

ALTER TABLE "result_items" ADD CONSTRAINT "result_items_values_check"
  CHECK (
    (internal_marks IS NULL OR internal_marks >= 0)
    AND (external_marks IS NULL OR external_marks >= 0)
    AND (practical_marks IS NULL OR practical_marks >= 0)
    AND (other_marks IS NULL OR other_marks >= 0)
    AND (total_marks IS NULL OR total_marks >= 0)
    AND (max_marks IS NULL OR max_marks >= 0)
    AND (total_marks IS NULL OR max_marks IS NULL OR total_marks <= max_marks)
    AND (grade_point IS NULL OR grade_point >= 0)
    AND (credits_attempted IS NULL OR credits_attempted >= 0)
    AND (credits_earned IS NULL OR credits_earned >= 0)
    AND (credits_attempted IS NULL OR credits_earned IS NULL OR credits_earned <= credits_attempted)
  );

ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_version_check" CHECK (version >= 1);

-- Default mappings are undated fallbacks; dated mappings are explicit overrides.
ALTER TABLE "program_document_templates" ADD CONSTRAINT "program_document_templates_dates_check"
  CHECK (
    (is_default AND effective_from IS NULL AND effective_to IS NULL)
    OR (NOT is_default AND effective_from IS NOT NULL AND (effective_to IS NULL OR effective_to >= effective_from))
  );

ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_values_check"
  CHECK (
    key <> '' AND key = btrim(key)
    AND current_value >= 0
    AND padding BETWEEN 1 AND 12
    AND (last_reset_year IS NULL OR last_reset_year BETWEEN 2000 AND 2200)
  );

ALTER TABLE "certificates" ADD CONSTRAINT "certificates_token_check"
  CHECK (verification_token IS NULL OR char_length(verification_token) >= 22);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_lifecycle_check"
  CHECK (
    (status NOT IN ('ISSUED', 'REVOKED', 'SUPERSEDED')
      OR (certificate_number IS NOT NULL AND verification_token IS NOT NULL
          AND issue_date IS NOT NULL AND issued_at IS NOT NULL))
    AND (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND btrim(revocation_reason) <> ''))
    AND (status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND btrim(cancellation_reason) <> ''))
    AND (supersedes_certificate_id IS NULL OR supersedes_certificate_id <> id)
  );

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_counts_check"
  CHECK (
    total_rows >= 0 AND valid_rows >= 0 AND warning_rows >= 0 AND error_rows >= 0
    AND imported_rows >= 0 AND skipped_rows >= 0
  );
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_row_number_check" CHECK (row_number >= 1);

-- Emails are stored lower-case so the unique index is effectively case-insensitive.
ALTER TABLE "users" ADD CONSTRAINT "users_email_check"
  CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1);

-- ---------------------------------------------------------------------------------------------
-- Results: revision chain + immutability of published history
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION docversity_results_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prev RECORD;
  frozen boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.publication_status IN ('PUBLISHED', 'SUPERSEDED') OR OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'results_guard: result % has been published and cannot be deleted', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Identity of a revision never changes.
    IF (NEW.id, NEW.student_registration_id, NEW.examination_id, NEW.attempt_number,
        NEW.revision_number, NEW.supersedes_result_id)
       IS DISTINCT FROM
       (OLD.id, OLD.student_registration_id, OLD.examination_id, OLD.attempt_number,
        OLD.revision_number, OLD.supersedes_result_id) THEN
      RAISE EXCEPTION 'results_guard: identity columns of result % are immutable', OLD.id
        USING ERRCODE = 'DV001';
    END IF;

    IF OLD.publication_status = 'SUPERSEDED' THEN
      RAISE EXCEPTION 'results_guard: superseded result % is immutable', OLD.id
        USING ERRCODE = 'DV001';
    END IF;

    -- Anything that has been published (including published-then-withheld) is frozen except for
    -- these status transitions: PUBLISHED -> SUPERSEDED | WITHHELD, WITHHELD -> PUBLISHED | SUPERSEDED.
    frozen := OLD.publication_status = 'PUBLISHED'
              OR (OLD.publication_status = 'WITHHELD' AND OLD.published_at IS NOT NULL);
    IF frozen THEN
      IF (to_jsonb(NEW) - 'publication_status' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'publication_status' - 'updated_at') THEN
        RAISE EXCEPTION 'results_guard: published result % cannot be edited; create a new revision', OLD.id
          USING ERRCODE = 'DV001';
      END IF;
      IF NOT (
        (OLD.publication_status = 'PUBLISHED' AND NEW.publication_status IN ('PUBLISHED', 'SUPERSEDED', 'WITHHELD'))
        OR (OLD.publication_status = 'WITHHELD' AND NEW.publication_status IN ('WITHHELD', 'PUBLISHED', 'SUPERSEDED'))
      ) THEN
        RAISE EXCEPTION 'results_guard: invalid status transition % -> % for result %',
          OLD.publication_status, NEW.publication_status, OLD.id
          USING ERRCODE = 'DV001';
      END IF;
    END IF;

    -- A result may only be marked SUPERSEDED once its replacement revision exists.
    IF NEW.publication_status = 'SUPERSEDED' AND OLD.publication_status <> 'SUPERSEDED'
       AND NOT EXISTS (SELECT 1 FROM results r WHERE r.supersedes_result_id = OLD.id) THEN
      RAISE EXCEPTION 'results_guard: result % has no replacement revision and cannot be superseded', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT
  IF NEW.publication_status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'results_guard: a result cannot be created as SUPERSEDED'
      USING ERRCODE = 'DV001';
  END IF;
  IF NEW.supersedes_result_id IS NOT NULL THEN
    SELECT student_registration_id, examination_id, attempt_number, revision_number
      INTO prev FROM results WHERE id = NEW.supersedes_result_id;
    IF NOT FOUND
       OR prev.student_registration_id <> NEW.student_registration_id
       OR prev.examination_id <> NEW.examination_id
       OR prev.attempt_number <> NEW.attempt_number
       OR prev.revision_number <> NEW.revision_number - 1 THEN
      RAISE EXCEPTION 'results_guard: revision % must supersede revision % of the same registration, examination and attempt',
        NEW.revision_number, NEW.revision_number - 1
        USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER results_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "results"
  FOR EACH ROW EXECUTE FUNCTION docversity_results_guard();

-- Result lines are editable only while their result is a working draft (DRAFT/UNDER_REVIEW, or
-- WITHHELD before ever being published). Approval freezes them; reopen the result to edit.
CREATE FUNCTION docversity_result_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent RECORD;
  target_result uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.result_id <> OLD.result_id THEN
    RAISE EXCEPTION 'result_items_guard: a result item cannot be moved to another result'
      USING ERRCODE = 'DV001';
  END IF;

  target_result := CASE WHEN TG_OP = 'DELETE' THEN OLD.result_id ELSE NEW.result_id END;
  SELECT publication_status, published_at INTO parent FROM results WHERE id = target_result;

  -- Parent already gone: this is the ON DELETE CASCADE of a (guarded) draft deletion.
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF NOT (
    parent.publication_status IN ('DRAFT', 'UNDER_REVIEW')
    OR (parent.publication_status = 'WITHHELD' AND parent.published_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'result_items_guard: items of a % result are frozen', parent.publication_status
      USING ERRCODE = 'DV001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER result_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "result_items"
  FOR EACH ROW EXECUTE FUNCTION docversity_result_items_guard();

-- ---------------------------------------------------------------------------------------------
-- Certificates: one authoritative, immutable-once-issued credential record
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION docversity_certificates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  prev RECORD;
  template_type "DocumentType";
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'certificates_guard: only DRAFT certificates can be deleted (certificate % is %)', OLD.id, OLD.status
        USING ERRCODE = 'DV001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.student_registration_id, NEW.program_id, NEW.document_type, NEW.supersedes_certificate_id)
       IS DISTINCT FROM
       (OLD.id, OLD.student_registration_id, OLD.program_id, OLD.document_type, OLD.supersedes_certificate_id) THEN
      RAISE EXCEPTION 'certificates_guard: identity columns of certificate % are immutable', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
    IF OLD.certificate_number IS NOT NULL AND NEW.certificate_number IS DISTINCT FROM OLD.certificate_number THEN
      RAISE EXCEPTION 'certificates_guard: certificate number of % cannot change once assigned', OLD.id
        USING ERRCODE = 'DV001';
    END IF;
    IF OLD.verification_token IS NOT NULL AND NEW.verification_token IS DISTINCT FROM OLD.verification_token THEN
      RAISE EXCEPTION 'certificates_guard: verification token of % cannot change once assigned', OLD.id
        USING ERRCODE = 'DV001';
    END IF;

    IF OLD.status IN ('REVOKED', 'SUPERSEDED', 'CANCELLED') THEN
      RAISE EXCEPTION 'certificates_guard: % certificate % is immutable', OLD.status, OLD.id
        USING ERRCODE = 'DV001';
    END IF;

    IF OLD.status = 'ISSUED' THEN
      -- Only revocation / supersession bookkeeping may change on an issued certificate.
      IF (to_jsonb(NEW) - 'status' - 'revoked_by_user_id' - 'revoked_at' - 'revocation_reason' - 'updated_at')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'status' - 'revoked_by_user_id' - 'revoked_at' - 'revocation_reason' - 'updated_at') THEN
        RAISE EXCEPTION 'certificates_guard: issued certificate % cannot be edited; issue a replacement', OLD.id
          USING ERRCODE = 'DV001';
      END IF;
      IF NEW.status NOT IN ('ISSUED', 'REVOKED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'certificates_guard: invalid status transition ISSUED -> % for certificate %', NEW.status, OLD.id
          USING ERRCODE = 'DV001';
      END IF;
      IF NEW.status = 'ISSUED' AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RAISE EXCEPTION 'certificates_guard: issued certificate % cannot be edited', OLD.id
          USING ERRCODE = 'DV001';
      END IF;
      IF NEW.status = 'SUPERSEDED'
         AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.supersedes_certificate_id = OLD.id) THEN
        RAISE EXCEPTION 'certificates_guard: certificate % has no replacement and cannot be superseded', OLD.id
          USING ERRCODE = 'DV001';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('REVOKED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'certificates_guard: a certificate cannot be created as %', NEW.status
        USING ERRCODE = 'DV001';
    END IF;
    IF NEW.supersedes_certificate_id IS NOT NULL THEN
      SELECT student_registration_id, document_type, status INTO prev
        FROM certificates WHERE id = NEW.supersedes_certificate_id;
      IF NOT FOUND
         OR prev.student_registration_id <> NEW.student_registration_id
         OR prev.document_type <> NEW.document_type THEN
        RAISE EXCEPTION 'certificates_guard: a replacement must supersede a certificate of the same registration and document type'
          USING ERRCODE = 'DV001';
      END IF;
      IF prev.status NOT IN ('ISSUED', 'REVOKED') THEN
        RAISE EXCEPTION 'certificates_guard: only an issued or revoked certificate can be superseded (found %)', prev.status
          USING ERRCODE = 'DV001';
      END IF;
    END IF;
  END IF;

  -- A certificate's template must be for the same document type.
  IF NEW.certificate_template_id IS NOT NULL THEN
    SELECT document_type INTO template_type FROM certificate_templates WHERE id = NEW.certificate_template_id;
    IF template_type IS DISTINCT FROM NEW.document_type THEN
      RAISE EXCEPTION 'certificates_guard: template % is not a % template', NEW.certificate_template_id, NEW.document_type
        USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER certificates_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "certificates"
  FOR EACH ROW EXECUTE FUNCTION docversity_certificates_guard();

-- ---------------------------------------------------------------------------------------------
-- Versioned configuration: templates and grading schemes are frozen once out of DRAFT
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION docversity_certificate_templates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'certificate_templates_guard: only DRAFT templates can be deleted'
        USING ERRCODE = 'DV001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
      RAISE EXCEPTION 'certificate_templates_guard: template % (v%) is % and cannot be edited; create a new version',
        OLD.name, OLD.version, OLD.status
        USING ERRCODE = 'DV001';
    END IF;
    IF NOT (NEW.status = OLD.status OR (OLD.status = 'ACTIVE' AND NEW.status = 'ARCHIVED')) THEN
      RAISE EXCEPTION 'certificate_templates_guard: invalid status transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER certificate_templates_guard
  BEFORE UPDATE OR DELETE ON "certificate_templates"
  FOR EACH ROW EXECUTE FUNCTION docversity_certificate_templates_guard();

CREATE FUNCTION docversity_grading_schemes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'grading_schemes_guard: only DRAFT grading schemes can be deleted'
        USING ERRCODE = 'DV001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    -- Closing a scheme's validity (effective_to) is allowed; its rules and identity are not.
    IF (to_jsonb(NEW) - 'status' - 'effective_to' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'effective_to' - 'updated_at') THEN
      RAISE EXCEPTION 'grading_schemes_guard: grading scheme % (v%) is % and cannot be edited; create a new version',
        OLD.name, OLD.version, OLD.status
        USING ERRCODE = 'DV001';
    END IF;
    IF NOT (NEW.status = OLD.status OR (OLD.status = 'ACTIVE' AND NEW.status = 'ARCHIVED')) THEN
      RAISE EXCEPTION 'grading_schemes_guard: invalid status transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'DV001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER grading_schemes_guard
  BEFORE UPDATE OR DELETE ON "grading_schemes"
  FOR EACH ROW EXECUTE FUNCTION docversity_grading_schemes_guard();

-- ---------------------------------------------------------------------------------------------
-- Program document templates: dated overrides for one (program, document type) never overlap
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION docversity_program_document_templates_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default THEN
    RETURN NEW;
  END IF;
  -- Serialise concurrent writers for the same (program, document type).
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.program_id::text || ':' || NEW.document_type::text, 0));
  IF EXISTS (
    SELECT 1 FROM program_document_templates m
    WHERE m.program_id = NEW.program_id
      AND m.document_type = NEW.document_type
      AND NOT m.is_default
      AND m.id <> NEW.id
      AND daterange(m.effective_from, m.effective_to, '[]') && daterange(NEW.effective_from, NEW.effective_to, '[]')
  ) THEN
    RAISE EXCEPTION 'program_document_templates_guard: effective dates overlap an existing % mapping for this program',
      NEW.document_type
      USING ERRCODE = 'DV001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER program_document_templates_guard
  BEFORE INSERT OR UPDATE ON "program_document_templates"
  FOR EACH ROW EXECUTE FUNCTION docversity_program_document_templates_guard();

-- ---------------------------------------------------------------------------------------------
-- Append-only logs
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION docversity_reject_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: % is not allowed on this append-only table', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'DV001';
END;
$$;

-- Audit log: no UPDATE, DELETE or TRUNCATE.
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION docversity_reject_modification();
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION docversity_reject_modification();

-- Verification log: no UPDATE (DELETE stays available for a future retention policy).
CREATE TRIGGER verification_logs_append_only
  BEFORE UPDATE ON "verification_logs"
  FOR EACH ROW EXECUTE FUNCTION docversity_reject_modification();
