-- Staff roles, the review queue and the staff log (phase 3, step 1).

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReviewKind" AS ENUM ('CHARACTER_NAME');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "StaffActionKind" AS ENUM ('ROLE_SET', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'DISPLAY_NAME_RESET', 'CHARACTER_NAME_RESET');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'PLAYER';

-- CreateTable
CREATE TABLE "review_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "ReviewKind" NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_by_user_id" UUID NOT NULL,
    "character_id" UUID,
    "proposed_name" TEXT,
    "previous_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),
    "decided_by_user_id" UUID,
    "note" TEXT,

    CONSTRAINT "review_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_action" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "UserRole",
    "kind" "StaffActionKind" NOT NULL,
    "target_user_id" UUID,
    "character_id" UUID,
    "review_item_id" UUID,
    "detail" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_item_status_created_at_idx" ON "review_item"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_item_character_id_created_at_idx" ON "review_item"("character_id", "created_at");

-- CreateIndex
CREATE INDEX "review_item_submitted_by_user_id_idx" ON "review_item"("submitted_by_user_id");

-- CreateIndex
CREATE INDEX "staff_action_target_user_id_idx" ON "staff_action"("target_user_id");

-- CreateIndex
CREATE INDEX "staff_action_character_id_idx" ON "staff_action"("character_id");

-- CreateIndex
CREATE INDEX "staff_action_review_item_id_idx" ON "staff_action"("review_item_id");

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item" ADD CONSTRAINT "review_item_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_review_item_id_fkey" FOREIGN KEY ("review_item_id") REFERENCES "review_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

