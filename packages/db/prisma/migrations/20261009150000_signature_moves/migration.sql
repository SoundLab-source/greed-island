-- Signature moves per round (event mod v3): how many landed per side, and the side that won the round with one.
ALTER TABLE "fight_round" ADD COLUMN "sig1" SMALLINT, ADD COLUMN "sig2" SMALLINT, ADD COLUMN "signature_ko" SMALLINT;
ALTER TABLE "fight_round" ADD CONSTRAINT "fight_round_signatures" CHECK (
  ("sig1" IS NULL OR "sig1" >= 0) AND ("sig2" IS NULL OR "sig2" >= 0) AND ("signature_ko" IS NULL OR "signature_ko" IN (0, 1, 2))
);
