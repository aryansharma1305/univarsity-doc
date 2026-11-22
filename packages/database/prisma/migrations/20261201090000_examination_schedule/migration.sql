-- AlterTable
ALTER TABLE "examinations" ADD COLUMN     "schedule_published_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "examination_schedule_items" (
    "id" UUID NOT NULL,
    "examination_id" UUID NOT NULL,
    "program_subject_id" UUID NOT NULL,
    "exam_date" DATE NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "venue" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "examination_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "examination_schedule_items_examination_id_exam_date_start_t_idx" ON "examination_schedule_items"("examination_id", "exam_date", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "examination_schedule_items_examination_id_program_subject_i_key" ON "examination_schedule_items"("examination_id", "program_subject_id");

-- AddForeignKey
ALTER TABLE "examination_schedule_items" ADD CONSTRAINT "examination_schedule_items_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examination_schedule_items" ADD CONSTRAINT "examination_schedule_items_program_subject_id_fkey" FOREIGN KEY ("program_subject_id") REFERENCES "program_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written integrity: 24-hour HH:MM times, end after start (string order equals time order).
ALTER TABLE "examination_schedule_items" ADD CONSTRAINT "examination_schedule_items_time_format_check"
  CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "examination_schedule_items" ADD CONSTRAINT "examination_schedule_items_time_order_check"
  CHECK ("end_time" > "start_time");
