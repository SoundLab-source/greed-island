-- Upgrade guards.
ALTER TABLE "character" ADD CONSTRAINT "character_levels" CHECK (
  "life_level" BETWEEN 0 AND 5 AND "attack_level" BETWEEN 0 AND 5 AND "defense_level" BETWEEN 0 AND 5 AND "power_level" BETWEEN 0 AND 5
);
ALTER TABLE "character_change" ADD CONSTRAINT "character_change_shape" CHECK (
  ("kind" = 'UPGRADE' AND "stat" IN ('life', 'attack', 'defense', 'power') AND "to_level" = "from_level" + 1) OR
  ("kind" = 'SIDEGRADE' AND "stat" IS NULL AND "from_level" IS NULL AND "to_level" IS NULL)
);
ALTER TABLE "character_change" ADD CONSTRAINT "character_change_cost" CHECK ("cost" >= 0);

-- Change history is append-only.
CREATE TRIGGER character_change_append_only
  BEFORE UPDATE OR DELETE ON "character_change"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
