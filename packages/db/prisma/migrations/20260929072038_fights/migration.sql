-- CreateEnum
CREATE TYPE "FightState" AS ENUM ('BOOKED', 'BETTING_OPEN', 'LOCKED', 'IN_PROGRESS', 'SETTLING', 'SETTLED', 'VOIDING', 'VOIDED');

-- CreateEnum
CREATE TYPE "VoidReason" AS ENUM ('DRAW', 'ENGINE_CRASH', 'ENGINE_TIMEOUT', 'RECONCILE_ORPHANED', 'ADMIN');

-- CreateEnum
CREATE TYPE "CycleSegment" AS ENUM ('MATCHMAKING', 'TOURNAMENT', 'EXHIBITION');

-- CreateEnum
CREATE TYPE "PairKind" AS ENUM ('CLOSE', 'UPSET', 'NEAREST', 'CROSS_TIER');

-- CreateTable
CREATE TABLE "fight" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "state" "FightState" NOT NULL DEFAULT 'BOOKED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "engine_mode" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "segment" "CycleSegment" NOT NULL,
    "segment_index" INTEGER NOT NULL,
    "pair_kind" "PairKind" NOT NULL,
    "stage_id" TEXT NOT NULL,
    "side1_character_id" UUID NOT NULL,
    "side2_character_id" UUID NOT NULL,
    "rounds_to_win" SMALLINT NOT NULL DEFAULT 2,
    "booked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "betting_opens_at" TIMESTAMPTZ(3),
    "betting_closes_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "winner_side" SMALLINT,
    "winner_character_id" UUID,
    "void_reason" "VoidReason",
    "void_detail" TEXT,

    CONSTRAINT "fight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fight_loadout" (
    "fight_id" UUID NOT NULL,
    "side" SMALLINT NOT NULL,
    "character_id" UUID NOT NULL,
    "fighter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "life_pct" SMALLINT NOT NULL,
    "start_power" INTEGER NOT NULL,
    "attack_pct" SMALLINT NOT NULL,
    "defense_pct" SMALLINT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "rating_after" DOUBLE PRECISION,
    "deviation_after" DOUBLE PRECISION,
    "tier_after" "Tier",

    CONSTRAINT "fight_loadout_pkey" PRIMARY KEY ("fight_id","side")
);

-- CreateTable
CREATE TABLE "fight_odds" (
    "fight_id" UUID NOT NULL,
    "model_chance_bp1" INTEGER NOT NULL,
    "model_chance_bp2" INTEGER NOT NULL,
    "crowd_chance_bp1" INTEGER,
    "crowd_chance_bp2" INTEGER,
    "blend_weight_bp" INTEGER NOT NULL,
    "chance_bp1" INTEGER NOT NULL,
    "chance_bp2" INTEGER NOT NULL,
    "multiplier_bp1" INTEGER NOT NULL,
    "multiplier_bp2" INTEGER NOT NULL,
    "pool1" DECIMAL(20,0) NOT NULL,
    "pool2" DECIMAL(20,0) NOT NULL,
    "capped_pool1" DECIMAL(20,0) NOT NULL,
    "capped_pool2" DECIMAL(20,0) NOT NULL,
    "bettors" INTEGER NOT NULL,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fight_odds_pkey" PRIMARY KEY ("fight_id")
);

-- CreateTable
CREATE TABLE "fight_round" (
    "fight_id" UUID NOT NULL,
    "round" SMALLINT NOT NULL,
    "winner_side" SMALLINT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "fight_round_pkey" PRIMARY KEY ("fight_id","round")
);

-- CreateTable
CREATE TABLE "fight_transition" (
    "id" BIGSERIAL NOT NULL,
    "fight_id" UUID NOT NULL,
    "from_state" "FightState",
    "to_state" "FightState" NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fight_transition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fight_number_key" ON "fight"("number");

-- CreateIndex
CREATE INDEX "fight_state_idx" ON "fight"("state");

-- CreateIndex
CREATE INDEX "fight_booked_at_idx" ON "fight"("booked_at");

-- CreateIndex
CREATE INDEX "fight_loadout_character_id_idx" ON "fight_loadout"("character_id");

-- CreateIndex
CREATE INDEX "fight_transition_fight_id_id_idx" ON "fight_transition"("fight_id", "id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_txn" ADD CONSTRAINT "ledger_txn_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet" ADD CONSTRAINT "bet_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight" ADD CONSTRAINT "fight_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight" ADD CONSTRAINT "fight_side1_character_id_fkey" FOREIGN KEY ("side1_character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight" ADD CONSTRAINT "fight_side2_character_id_fkey" FOREIGN KEY ("side2_character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight" ADD CONSTRAINT "fight_winner_character_id_fkey" FOREIGN KEY ("winner_character_id") REFERENCES "character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_loadout" ADD CONSTRAINT "fight_loadout_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_loadout" ADD CONSTRAINT "fight_loadout_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_odds" ADD CONSTRAINT "fight_odds_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_round" ADD CONSTRAINT "fight_round_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fight_transition" ADD CONSTRAINT "fight_transition_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
