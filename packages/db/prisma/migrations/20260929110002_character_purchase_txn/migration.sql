-- Link owned characters to the purchase that created them.

-- AlterTable
ALTER TABLE "character" ADD COLUMN     "acquired_txn_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "character_acquired_txn_id_key" ON "character"("acquired_txn_id");

-- AddForeignKey
ALTER TABLE "character" ADD CONSTRAINT "character_acquired_txn_id_fkey" FOREIGN KEY ("acquired_txn_id") REFERENCES "ledger_txn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

