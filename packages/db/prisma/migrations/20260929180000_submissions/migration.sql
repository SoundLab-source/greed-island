-- Fighter submissions (phase 3, step 3): submissions, their images, and review of them.

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RightsBasis" AS ENUM ('ORIGINAL', 'LICENSED', 'HOLDER_LICENCE');

-- CreateEnum
CREATE TYPE "SubmissionFileRole" AS ENUM ('SPRITES', 'PORTRAIT', 'INTRO', 'WIN_POSE', 'PALETTE');

-- AlterEnum
ALTER TYPE "ReviewKind" ADD VALUE 'FIGHTER_SUBMISSION';

-- AlterEnum
ALTER TYPE "ReviewStatus" ADD VALUE 'CHANGES_REQUESTED';

-- AlterEnum
ALTER TYPE "StaffActionKind" ADD VALUE 'REVIEW_CHANGES_REQUESTED';

-- AlterTable
ALTER TABLE "review_item" ADD COLUMN     "submission_id" UUID;

-- CreateTable
CREATE TABLE "submission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_user_id" UUID NOT NULL,
    "community" TEXT NOT NULL,
    "community_key" TEXT NOT NULL,
    "fighter_name" TEXT NOT NULL,
    "archetype" "Archetype" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rights_basis" "RightsBasis" NOT NULL,
    "rights_details" TEXT NOT NULL,
    "rights_link" TEXT,
    "rights_confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_file" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "role" "SubmissionFileRole" NOT NULL,
    "label" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "submission_number_key" ON "submission"("number");

-- CreateIndex
CREATE INDEX "submission_status_submitted_at_idx" ON "submission"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "submission_submitted_by_user_id_idx" ON "submission"("submitted_by_user_id");

-- CreateIndex
CREATE INDEX "submission_file_submission_id_role_idx" ON "submission_file"("submission_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "submission_file_submission_id_sha256_key" ON "submission_file"("submission_id", "sha256");

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_file" ADD CONSTRAINT "submission_file_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

