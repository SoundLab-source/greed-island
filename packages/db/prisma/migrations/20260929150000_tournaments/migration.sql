-- Tournaments: brackets per cycle, T-Salt books, player titles from the T-Salt podium.
-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('RUNNING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlayerTitleCode" AS ENUM ('BETTOR_1ST', 'BETTOR_2ND', 'BETTOR_3RD');

-- AlterEnum
ALTER TYPE "Asset" ADD VALUE 'TSALT';

-- AlterEnum
ALTER TYPE "PairKind" ADD VALUE 'TOURNAMENT';

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'TOURNAMENT_GRANT';

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "tournament_id" UUID;

-- AlterTable
ALTER TABLE "character_title" ADD COLUMN     "tournament_id" UUID;

-- AlterTable
ALTER TABLE "fight" ADD COLUMN     "tournament_match_id" UUID;

-- CreateTable
CREATE TABLE "tournament" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "cycle" INTEGER NOT NULL,
    "tier" "Tier" NOT NULL,
    "size" SMALLINT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'RUNNING',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "champion_character_id" UUID,

    CONSTRAINT "tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_entry" (
    "tournament_id" UUID NOT NULL,
    "seed" SMALLINT NOT NULL,
    "character_id" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "tier" "Tier" NOT NULL,

    CONSTRAINT "tournament_entry_pkey" PRIMARY KEY ("tournament_id","seed")
);

-- CreateTable
CREATE TABLE "tournament_match" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tournament_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL,
    "slot" SMALLINT NOT NULL,
    "side1_character_id" UUID,
    "side2_character_id" UUID,
    "winner_character_id" UUID,
    "walkover" BOOLEAN NOT NULL DEFAULT false,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "tournament_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_title" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "code" "PlayerTitleCode" NOT NULL,
    "tournament_id" UUID NOT NULL,
    "balance" DECIMAL(20,0) NOT NULL,
    "earned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_title_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tournament_number_key" ON "tournament"("number");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_cycle_key" ON "tournament"("cycle");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entry_tournament_id_character_id_key" ON "tournament_entry"("tournament_id", "character_id");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_match_tournament_id_round_slot_key" ON "tournament_match"("tournament_id", "round", "slot");

-- CreateIndex
CREATE INDEX "player_title_user_id_idx" ON "player_title"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_title_tournament_id_code_key" ON "player_title"("tournament_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "player_title_tournament_id_user_id_key" ON "player_title"("tournament_id", "user_id");

-- CreateIndex
CREATE INDEX "account_tournament_id_idx" ON "account"("tournament_id");

-- CreateIndex
CREATE INDEX "fight_tournament_match_id_idx" ON "fight"("tournament_match_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight" ADD CONSTRAINT "fight_tournament_match_id_fkey" FOREIGN KEY ("tournament_match_id") REFERENCES "tournament_match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_champion_character_id_fkey" FOREIGN KEY ("champion_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entry" ADD CONSTRAINT "tournament_entry_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entry" ADD CONSTRAINT "tournament_entry_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_side1_character_id_fkey" FOREIGN KEY ("side1_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_side2_character_id_fkey" FOREIGN KEY ("side2_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_winner_character_id_fkey" FOREIGN KEY ("winner_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

