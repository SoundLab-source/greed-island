-- Seasonal release (phase 3, step 6): community fighters, releases, debut tournaments.

-- CreateEnum
CREATE TYPE "FighterSource" AS ENUM ('ROSTER', 'COMMUNITY');

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'RELEASED';

-- AlterTable
ALTER TABLE "fighter" ADD COLUMN     "source" "FighterSource" NOT NULL DEFAULT 'ROSTER';

-- AlterTable
ALTER TABLE "tournament" ADD COLUMN     "debut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "release" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "fighter_id" TEXT NOT NULL,
    "character_id" UUID NOT NULL,
    "stand_in_fighter_id" TEXT NOT NULL,
    "debut_tournament_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_submission_id_key" ON "release"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_fighter_id_key" ON "release"("fighter_id");

-- CreateIndex
CREATE UNIQUE INDEX "release_character_id_key" ON "release"("character_id");

-- CreateIndex
CREATE INDEX "release_season_id_idx" ON "release"("season_id");

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_stand_in_fighter_id_fkey" FOREIGN KEY ("stand_in_fighter_id") REFERENCES "fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release" ADD CONSTRAINT "release_debut_tournament_id_fkey" FOREIGN KEY ("debut_tournament_id") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

