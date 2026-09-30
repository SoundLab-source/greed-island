-- NFT looks (phase 3, step 7): an NFT's portrait and colours on a character, for good.

-- CreateTable
CREATE TABLE "nft_look" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "character_id" UUID NOT NULL,
    "chain" "Chain" NOT NULL,
    "asset_id" TEXT NOT NULL,
    "collection_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "image_sha256" TEXT NOT NULL,
    "image_type" TEXT NOT NULL,
    "colors" JSONB,
    "traits" JSONB NOT NULL,
    "applied_by_user_id" UUID NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "nft_look_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nft_look_character_id_applied_at_idx" ON "nft_look"("character_id", "applied_at");

-- CreateIndex
CREATE INDEX "nft_look_chain_asset_id_idx" ON "nft_look"("chain", "asset_id");

-- AddForeignKey
ALTER TABLE "nft_look" ADD CONSTRAINT "nft_look_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nft_look" ADD CONSTRAINT "nft_look_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "nft_collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nft_look" ADD CONSTRAINT "nft_look_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

