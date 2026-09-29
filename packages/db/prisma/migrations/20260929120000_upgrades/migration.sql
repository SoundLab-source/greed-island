-- Upgrades and sidegrades: levels, change history, UPGRADE transactions.

-- CreateEnum
CREATE TYPE "Sidegrade" AS ENUM ('BRUISER', 'GLASS_CANNON', 'IRON_WALL');

-- CreateEnum
CREATE TYPE "CharacterChangeKind" AS ENUM ('UPGRADE', 'SIDEGRADE');

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'UPGRADE';

-- AlterTable
ALTER TABLE "character" ADD COLUMN     "attack_level" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "defense_level" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "life_level" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "power_level" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "sidegrade" "Sidegrade";

-- CreateTable
CREATE TABLE "character_change" (
    "id" BIGSERIAL NOT NULL,
    "character_id" UUID NOT NULL,
    "kind" "CharacterChangeKind" NOT NULL,
    "stat" TEXT,
    "from_level" SMALLINT,
    "to_level" SMALLINT,
    "from_sidegrade" "Sidegrade",
    "to_sidegrade" "Sidegrade",
    "cost" DECIMAL(20,0) NOT NULL,
    "txn_id" UUID,
    "by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "character_change_txn_id_key" ON "character_change"("txn_id");

-- CreateIndex
CREATE INDEX "character_change_character_id_id_idx" ON "character_change"("character_id", "id");

-- AddForeignKey
ALTER TABLE "character_change" ADD CONSTRAINT "character_change_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_change" ADD CONSTRAINT "character_change_txn_id_fkey" FOREIGN KEY ("txn_id") REFERENCES "ledger_txn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_change" ADD CONSTRAINT "character_change_by_user_id_fkey" FOREIGN KEY ("by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

