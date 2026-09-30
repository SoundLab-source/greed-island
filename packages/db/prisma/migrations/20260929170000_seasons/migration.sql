-- Seasons (phase 3, step 2): seasons, final standings, Season Champion and Season Top Bettor titles.

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('RUNNING', 'ENDED');

-- CreateEnum
CREATE TYPE "StandingKind" AS ENUM ('PLAYER', 'CHARACTER');

-- AlterEnum
ALTER TYPE "PlayerTitleCode" ADD VALUE 'SEASON_TOP_BETTOR';

-- AlterEnum
ALTER TYPE "TitleCode" ADD VALUE 'SEASON_CHAMPION';

-- DropForeignKey
ALTER TABLE "player_title" DROP CONSTRAINT "player_title_tournament_id_fkey";

-- AlterTable
ALTER TABLE "character_title" ADD COLUMN     "season_id" UUID;

-- AlterTable
ALTER TABLE "player_title" ADD COLUMN     "season_id" UUID,
ALTER COLUMN "tournament_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "season" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'RUNNING',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "champion_character_id" UUID,
    "top_bettor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_standing" (
    "season_id" UUID NOT NULL,
    "kind" "StandingKind" NOT NULL,
    "rank" SMALLINT NOT NULL,
    "user_id" UUID,
    "salt_won" DECIMAL(20,0),
    "bets" INTEGER,
    "character_id" UUID,
    "rating" DOUBLE PRECISION,
    "wins" INTEGER,
    "losses" INTEGER,

    CONSTRAINT "season_standing_pkey" PRIMARY KEY ("season_id","kind","rank")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_number_key" ON "season"("number");

-- CreateIndex
CREATE UNIQUE INDEX "player_title_season_id_code_key" ON "player_title"("season_id", "code");

-- AddForeignKey
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_champion_character_id_fkey" FOREIGN KEY ("champion_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season" ADD CONSTRAINT "season_top_bettor_user_id_fkey" FOREIGN KEY ("top_bettor_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_standing" ADD CONSTRAINT "season_standing_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_standing" ADD CONSTRAINT "season_standing_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_standing" ADD CONSTRAINT "season_standing_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

