-- Round detail guards: life is per mille of full life, the first hit is a side (or 0), ticks aren't negative.
ALTER TABLE "fight_round" ADD CONSTRAINT "fight_round_detail" CHECK (
  ("life1" IS NULL OR "life1" BETWEEN 0 AND 1000) AND ("life2" IS NULL OR "life2" BETWEEN 0 AND 1000)
  AND ("low1" IS NULL OR "low1" BETWEEN 0 AND 1000) AND ("low2" IS NULL OR "low2" BETWEEN 0 AND 1000)
  AND ("first_hit" IS NULL OR "first_hit" IN (0, 1, 2)) AND ("ticks" IS NULL OR "ticks" >= 0)
);
