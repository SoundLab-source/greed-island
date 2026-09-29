-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('P', 'B', 'A', 'S', 'X');

-- CreateEnum
CREATE TYPE "Archetype" AS ENUM ('RUSHDOWN', 'ZONER', 'GRAPPLER', 'ALL_ROUNDER', 'HEAVY');

-- CreateEnum
CREATE TYPE "OwnerKind" AS ENUM ('HOUSE', 'USER');

-- CreateEnum
CREATE TYPE "TierChangeReason" AS ENUM ('INITIAL', 'RATING', 'MANUAL');

-- CreateTable
CREATE TABLE "fighter" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "archetype" "Archetype" NOT NULL,
    "def_path" TEXT NOT NULL,
    "license_note" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fighter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "def_path" TEXT NOT NULL,
    "license_note" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roster_key" TEXT,
    "fighter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "palette" SMALLINT NOT NULL DEFAULT 1,
    "owner_kind" "OwnerKind" NOT NULL DEFAULT 'HOUSE',
    "owner_user_id" UUID,
    "life_pct" SMALLINT NOT NULL DEFAULT 100,
    "start_power" INTEGER NOT NULL DEFAULT 0,
    "attack_pct" SMALLINT NOT NULL DEFAULT 100,
    "defense_pct" SMALLINT NOT NULL DEFAULT 100,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "tier" "Tier" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "disabled_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_history" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "from_tier" "Tier",
    "to_tier" "Tier" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "reason" "TierChangeReason" NOT NULL,
    "fight_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tier_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_roster_key_key" ON "character"("roster_key");

-- CreateIndex
CREATE INDEX "character_tier_enabled_idx" ON "character"("tier", "enabled");

-- CreateIndex
CREATE INDEX "character_owner_user_id_idx" ON "character"("owner_user_id");

-- CreateIndex
CREATE INDEX "tier_history_character_id_created_at_idx" ON "tier_history"("character_id", "created_at");

-- AddForeignKey
ALTER TABLE "character" ADD CONSTRAINT "character_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "fighter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character" ADD CONSTRAINT "character_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
