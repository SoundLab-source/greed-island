-- Titles and overlay cosmetics: earned titles with provenance, equipped cosmetics, frozen per fight.
-- CreateEnum
CREATE TYPE "TitleCode" AS ENUM ('FIRST_BLOOD', 'WINS_10', 'WINS_100', 'GIANT_SLAYER', 'TIER_B', 'TIER_A', 'TIER_S', 'TOURNAMENT_CHAMPION');

-- AlterTable
ALTER TABLE "character" ADD COLUMN     "cosmetics" JSONB;

-- AlterTable
ALTER TABLE "fight_loadout" ADD COLUMN     "cosmetics" JSONB NOT NULL DEFAULT '{"title":null,"nameplate":"standard","badges":[]}';

-- CreateTable
CREATE TABLE "character_title" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "code" "TitleCode" NOT NULL,
    "fight_id" UUID,
    "owner_kind" "OwnerKind" NOT NULL,
    "owner_user_id" UUID,
    "earned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_title_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_title_character_id_id_idx" ON "character_title"("character_id", "id");

-- CreateIndex
CREATE INDEX "character_title_fight_id_idx" ON "character_title"("fight_id");

-- AddForeignKey
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

