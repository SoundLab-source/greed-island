-- Shop and ownership: sink account, purchases, rarity, owned-character serials.

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'RARE', 'LEGENDARY');

-- AlterEnum
ALTER TYPE "AccountKind" ADD VALUE 'SINK';

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'PURCHASE';

-- AlterTable
ALTER TABLE "character" ADD COLUMN     "acquired_at" TIMESTAMPTZ(3),
ADD COLUMN     "first_edition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serial" INTEGER;

-- AlterTable
ALTER TABLE "fighter" ADD COLUMN     "rarity" "Rarity" NOT NULL DEFAULT 'COMMON';

-- CreateIndex
CREATE UNIQUE INDEX "character_fighter_id_serial_key" ON "character"("fighter_id", "serial");

