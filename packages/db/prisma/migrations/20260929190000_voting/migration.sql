-- Voting (phase 3, step 5): season ballots, their entries and votes; elected / not elected submissions.

-- CreateEnum
CREATE TYPE "BallotStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'ELECTED';
ALTER TYPE "SubmissionStatus" ADD VALUE 'NOT_ELECTED';

-- CreateTable
CREATE TABLE "ballot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "status" "BallotStatus" NOT NULL DEFAULT 'OPEN',
    "opens_at" TIMESTAMPTZ(3) NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballot_entry" (
    "ballot_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "votes" INTEGER,
    "rank" SMALLINT,
    "elected" BOOLEAN,

    CONSTRAINT "ballot_entry_pkey" PRIMARY KEY ("ballot_id","submission_id")
);

-- CreateTable
CREATE TABLE "vote" (
    "id" BIGSERIAL NOT NULL,
    "ballot_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ballot_season_id_key" ON "ballot"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballot_entry_submission_id_key" ON "ballot_entry"("submission_id");

-- CreateIndex
CREATE INDEX "vote_ballot_id_submission_id_idx" ON "vote"("ballot_id", "submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "vote_ballot_id_user_id_submission_id_key" ON "vote"("ballot_id", "user_id", "submission_id");

-- AddForeignKey
ALTER TABLE "ballot" ADD CONSTRAINT "ballot_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot_entry" ADD CONSTRAINT "ballot_entry_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballot_entry" ADD CONSTRAINT "ballot_entry_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_ballot_id_submission_id_fkey" FOREIGN KEY ("ballot_id", "submission_id") REFERENCES "ballot_entry"("ballot_id", "submission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

