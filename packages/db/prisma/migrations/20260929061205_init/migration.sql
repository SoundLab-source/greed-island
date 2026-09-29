-- CreateEnum
CREATE TYPE "Asset" AS ENUM ('SALT');

-- CreateEnum
CREATE TYPE "UserKind" AS ENUM ('ANONYMOUS', 'EMAIL');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('USER', 'ESCROW', 'HOUSE', 'ISSUANCE');

-- CreateEnum
CREATE TYPE "TxnKind" AS ENUM ('GRANT_START', 'GRANT_DAILY', 'BAILOUT', 'BET', 'SETTLE', 'VOID');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'REFUNDED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "UserKind" NOT NULL,
    "email" TEXT,
    "session_token_hash" TEXT,
    "wallet_address" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "asset" "Asset" NOT NULL DEFAULT 'SALT',
    "user_id" UUID,
    "fight_id" UUID,
    "side" SMALLINT,
    "balance" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_txn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "kind" "TxnKind" NOT NULL,
    "user_id" UUID,
    "fight_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_txn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" BIGSERIAL NOT NULL,
    "txn_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(20,0) NOT NULL,
    "bet_id" UUID,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bet" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "fight_id" UUID NOT NULL,
    "side" SMALLINT NOT NULL,
    "stake" DECIMAL(20,0) NOT NULL,
    "status" "BetStatus" NOT NULL DEFAULT 'OPEN',
    "returned" DECIMAL(20,0),
    "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_session_token_hash_key" ON "user"("session_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_wallet_address_key" ON "user"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "account_key_key" ON "account"("key");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE INDEX "account_fight_id_idx" ON "account"("fight_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_txn_idempotency_key_key" ON "ledger_txn"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_txn_user_id_idx" ON "ledger_txn"("user_id");

-- CreateIndex
CREATE INDEX "ledger_txn_fight_id_idx" ON "ledger_txn"("fight_id");

-- CreateIndex
CREATE INDEX "ledger_entry_txn_id_idx" ON "ledger_entry"("txn_id");

-- CreateIndex
CREATE INDEX "ledger_entry_account_id_idx" ON "ledger_entry"("account_id");

-- CreateIndex
CREATE INDEX "ledger_entry_bet_id_idx" ON "ledger_entry"("bet_id");

-- CreateIndex
CREATE INDEX "bet_fight_id_status_idx" ON "bet"("fight_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bet_user_id_fight_id_key" ON "bet"("user_id", "fight_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_txn_id_fkey" FOREIGN KEY ("txn_id") REFERENCES "ledger_txn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bet" ADD CONSTRAINT "bet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
