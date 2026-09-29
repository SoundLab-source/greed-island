-- Exhibitions and owner rewards: owner-vs-owner challenges, showcase and challenge fights, OWNER_REWARD transactions.
-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'BOOKED');

-- AlterEnum
ALTER TYPE "PairKind" ADD VALUE 'CHALLENGE';
ALTER TYPE "PairKind" ADD VALUE 'SHOWCASE';

-- AlterEnum
ALTER TYPE "TxnKind" ADD VALUE 'OWNER_REWARD';

-- CreateTable
CREATE TABLE "challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "challenger_user_id" UUID NOT NULL,
    "challenger_character_id" UUID NOT NULL,
    "challenged_user_id" UUID NOT NULL,
    "challenged_character_id" UUID NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "fight_id" UUID,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenge_fight_id_key" ON "challenge"("fight_id");

-- CreateIndex
CREATE INDEX "challenge_status_accepted_at_idx" ON "challenge"("status", "accepted_at");

-- CreateIndex
CREATE INDEX "challenge_challenger_user_id_status_idx" ON "challenge"("challenger_user_id", "status");

-- CreateIndex
CREATE INDEX "challenge_challenged_user_id_status_idx" ON "challenge"("challenged_user_id", "status");

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_challenger_user_id_fkey" FOREIGN KEY ("challenger_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_challenger_character_id_fkey" FOREIGN KEY ("challenger_character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_challenged_user_id_fkey" FOREIGN KEY ("challenged_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_challenged_character_id_fkey" FOREIGN KEY ("challenged_character_id") REFERENCES "character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge" ADD CONSTRAINT "challenge_fight_id_fkey" FOREIGN KEY ("fight_id") REFERENCES "fight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

