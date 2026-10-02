-- Automatic checks on fighter submissions (phase 3, step 4): one row per run.

-- CreateEnum
CREATE TYPE "SubmissionCheckStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- CreateTable
CREATE TABLE "submission_check" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "status" "SubmissionCheckStatus" NOT NULL DEFAULT 'QUEUED',
    "requested_by_user_id" UUID,
    "results" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "submission_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_check_submission_id_created_at_idx" ON "submission_check"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "submission_check_status_created_at_idx" ON "submission_check"("status", "created_at");

-- AddForeignKey
ALTER TABLE "submission_check" ADD CONSTRAINT "submission_check_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_check" ADD CONSTRAINT "submission_check_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
