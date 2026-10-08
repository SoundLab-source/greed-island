-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PlayerTitleCode" ADD VALUE 'CALLED_IT';
ALTER TYPE "PlayerTitleCode" ADD VALUE 'IRON_READ';
ALTER TYPE "PlayerTitleCode" ADD VALUE 'LOYAL';
ALTER TYPE "PlayerTitleCode" ADD VALUE 'CONTRARIAN';

-- AlterTable
ALTER TABLE "player_title" ADD COLUMN     "fight_id" UUID;

-- AddForeignKey
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;
