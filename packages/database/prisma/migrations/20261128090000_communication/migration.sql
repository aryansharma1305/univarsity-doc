-- Chat & Communication: student messages (one shared staff inbox), verification support queries
-- (students and public requesters) and in-app notifications. In-app only; no external delivery.

-- CreateEnum
CREATE TYPE "MessageThreadStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "VerificationQuerySource" AS ENUM ('STUDENT', 'PUBLIC');

-- CreateEnum
CREATE TYPE "VerificationQueryCategory" AS ENUM ('RECORD_NOT_FOUND', 'DETAILS_MISMATCH', 'HOW_TO_VERIFY', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationQueryStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE_RECEIVED', 'MESSAGE_REPLY', 'PROFILE_REQUEST_APPROVED', 'PROFILE_REQUEST_REJECTED', 'CERTIFICATE_REQUEST_UPDATED', 'VERIFICATION_QUERY_RECEIVED', 'VERIFICATION_QUERY_ANSWERED');

-- CreateTable
CREATE TABLE "message_threads" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "status" "MessageThreadStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_at" TIMESTAMPTZ(3) NOT NULL,
    "student_read_at" TIMESTAMPTZ(3),
    "staff_read_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_messages" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "author_user_id" UUID,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_queries" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(16) NOT NULL,
    "source" "VerificationQuerySource" NOT NULL,
    "student_id" UUID,
    "requester_name" VARCHAR(200) NOT NULL,
    "organization" VARCHAR(200),
    "contact_email" VARCHAR(254),
    "category" "VerificationQueryCategory" NOT NULL,
    "document_reference" VARCHAR(100),
    "message" VARCHAR(4000) NOT NULL,
    "access_code_hash" CHAR(64),
    "status" "VerificationQueryStatus" NOT NULL DEFAULT 'OPEN',
    "response" VARCHAR(4000),
    "responded_by_user_id" UUID,
    "responded_at" TIMESTAMPTZ(3),
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "student_id" UUID,
    "user_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "link" VARCHAR(300),
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_threads_student_id_last_message_at_idx" ON "message_threads"("student_id", "last_message_at");

-- CreateIndex
CREATE INDEX "message_threads_status_last_message_at_idx" ON "message_threads"("status", "last_message_at");

-- CreateIndex
CREATE INDEX "thread_messages_thread_id_created_at_idx" ON "thread_messages"("thread_id", "created_at");

-- CreateIndex
CREATE INDEX "verification_queries_status_created_at_idx" ON "verification_queries"("status", "created_at");

-- CreateIndex
CREATE INDEX "verification_queries_student_id_created_at_idx" ON "verification_queries"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "verification_queries_reference_key" ON "verification_queries"("reference");

-- CreateIndex
CREATE INDEX "notifications_student_id_created_at_idx" ON "notifications"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "message_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_responded_by_user_id_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Integrity rules
-- ---------------------------------------------------------------------------------------------

-- A staff message names its author; a student message is the thread's student (no user).
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_author_check"
  CHECK ((author = 'STUDENT' AND author_user_id IS NULL) OR (author = 'STAFF' AND author_user_id IS NOT NULL));
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_body_check" CHECK (length(btrim(body)) > 0);
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_resolved_check"
  CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL));

-- Messages are evidence of what was said: never edited or deleted.
CREATE FUNCTION thread_messages_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'thread_messages is append-only' USING ERRCODE = 'DV001';
END;
$$;
CREATE TRIGGER thread_messages_append_only BEFORE UPDATE OR DELETE ON "thread_messages"
  FOR EACH ROW EXECUTE FUNCTION thread_messages_append_only();

-- A student query belongs to a student and has no access code; a public query is anonymous to the
-- database (no student link) and is reachable only with its reference + access code.
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_source_check"
  CHECK (
    (source = 'STUDENT' AND student_id IS NOT NULL AND access_code_hash IS NULL)
    OR (source = 'PUBLIC' AND student_id IS NULL AND access_code_hash ~ '^[0-9a-f]{64}$')
  );
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_reference_check"
  CHECK (reference ~ '^VQ-[0-9A-HJKMNP-TV-Z]{8}$');
ALTER TABLE "verification_queries" ADD CONSTRAINT "verification_queries_answer_check"
  CHECK (
    (status = 'OPEN' OR (response IS NOT NULL AND responded_by_user_id IS NOT NULL AND responded_at IS NOT NULL))
    AND ((status = 'RESOLVED') = (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL))
  );

-- Exactly one recipient; links stay inside the application.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_check"
  CHECK ((student_id IS NULL) <> (user_id IS NULL));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_check"
  CHECK (link IS NULL OR link ~ '^/(student|admin)(/[A-Za-z0-9_-]*)*$');
