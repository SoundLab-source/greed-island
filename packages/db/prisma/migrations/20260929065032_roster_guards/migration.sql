-- Roster guards: character ownership shape, sane stats and ratings.

ALTER TABLE "character"
  ADD CONSTRAINT "character_owner_shape" CHECK (
    ("owner_kind" = 'HOUSE' AND "owner_user_id" IS NULL) OR
    ("owner_kind" = 'USER' AND "owner_user_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "character_stats_range" CHECK (
    "life_pct" > 0 AND "attack_pct" > 0 AND "defense_pct" > 0 AND "start_power" >= 0
  ),
  ADD CONSTRAINT "character_record" CHECK ("wins" >= 0 AND "losses" >= 0),
  ADD CONSTRAINT "character_rating_finite" CHECK (
    "rating" > 0 AND "rating" < 'Infinity' AND "deviation" > 0 AND "deviation" < 'Infinity' AND "volatility" > 0 AND "volatility" < 'Infinity'
  ),
  ADD CONSTRAINT "character_palette" CHECK ("palette" >= 1);

-- Tier history is append-only.
CREATE TRIGGER tier_history_append_only
  BEFORE UPDATE OR DELETE ON "tier_history"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
