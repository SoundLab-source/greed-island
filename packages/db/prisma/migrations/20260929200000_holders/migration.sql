-- Holders and NFTs (phase 3, step 7): verified wallets, sign-in messages, approved collections, submissions from an NFT. Read-only: nothing writes on-chain.

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('SOLANA');

-- AlterEnum
ALTER TYPE "StaffActionKind" ADD VALUE 'COLLECTION_SET';

-- AlterTable
ALTER TABLE "submission" ADD COLUMN     "nft_asset_id" TEXT,
ADD COLUMN     "nft_collection_id" UUID;

-- CreateTable
CREATE TABLE "wallet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "chain" "Chain" NOT NULL,
    "address" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "chain" "Chain" NOT NULL,
    "address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "wallet_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nft_collection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain" "Chain" NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "licence_url" TEXT,
    "licence_note" TEXT NOT NULL DEFAULT '',
    "submissions_allowed" BOOLEAN NOT NULL DEFAULT false,
    "looks_allowed" BOOLEAN NOT NULL DEFAULT false,
    "fighter_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nft_collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_user_id_idx" ON "wallet"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_chain_address_key" ON "wallet"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_challenge_nonce_key" ON "wallet_challenge"("nonce");

-- CreateIndex
CREATE INDEX "wallet_challenge_user_id_created_at_idx" ON "wallet_challenge"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "nft_collection_chain_address_key" ON "nft_collection"("chain", "address");

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_nft_collection_id_fkey" FOREIGN KEY ("nft_collection_id") REFERENCES "nft_collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_challenge" ADD CONSTRAINT "wallet_challenge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nft_collection" ADD CONSTRAINT "nft_collection_fighter_id_fkey" FOREIGN KEY ("fighter_id") REFERENCES "fighter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

