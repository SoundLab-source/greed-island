-- Fight guards.

ALTER TABLE "fight"
  ADD CONSTRAINT "fight_sides_differ" CHECK ("side1_character_id" <> "side2_character_id"),
  ADD CONSTRAINT "fight_winner_side" CHECK ("winner_side" IS NULL OR "winner_side" IN (1, 2)),
  ADD CONSTRAINT "fight_winner_consistent" CHECK (("winner_side" IS NULL) = ("winner_character_id" IS NULL)),
  ADD CONSTRAINT "fight_rounds_to_win" CHECK ("rounds_to_win" >= 1),
  ADD CONSTRAINT "fight_engine_mode" CHECK ("engine_mode" IN ('live', 'fake')),
  ADD CONSTRAINT "fight_settled_has_winner" CHECK ("state" <> 'SETTLED' OR "winner_side" IS NOT NULL),
  ADD CONSTRAINT "fight_voided_has_reason" CHECK ("state" NOT IN ('VOIDING', 'VOIDED') OR "void_reason" IS NOT NULL);

ALTER TABLE "fight_loadout" ADD CONSTRAINT "fight_loadout_side" CHECK ("side" IN (1, 2));
ALTER TABLE "fight_round"
  ADD CONSTRAINT "fight_round_winner" CHECK ("winner_side" IN (0, 1, 2)),
  ADD CONSTRAINT "fight_round_reason" CHECK ("reason" IN ('ko', 'time'));
ALTER TABLE "fight_odds"
  ADD CONSTRAINT "fight_odds_chances" CHECK ("chance_bp1" + "chance_bp2" = 10000 AND "chance_bp1" > 0 AND "chance_bp2" > 0),
  ADD CONSTRAINT "fight_odds_multipliers" CHECK ("multiplier_bp1" >= 10000 AND "multiplier_bp2" >= 10000);

-- Loadouts are frozen when betting opens: only the post-fight rating columns may change.
CREATE FUNCTION fight_loadout_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."fight_id", NEW."side", NEW."character_id", NEW."fighter_id", NEW."name", NEW."tier", NEW."life_pct",
      NEW."start_power", NEW."attack_pct", NEW."defense_pct", NEW."rating", NEW."deviation", NEW."volatility",
      NEW."wins", NEW."losses")
     IS DISTINCT FROM
     (OLD."fight_id", OLD."side", OLD."character_id", OLD."fighter_id", OLD."name", OLD."tier", OLD."life_pct",
      OLD."start_power", OLD."attack_pct", OLD."defense_pct", OLD."rating", OLD."deviation", OLD."volatility",
      OLD."wins", OLD."losses") THEN
    RAISE EXCEPTION 'fight_loadout is frozen once betting opens';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER fight_loadout_frozen
  BEFORE UPDATE ON "fight_loadout"
  FOR EACH ROW EXECUTE FUNCTION fight_loadout_frozen();

CREATE TRIGGER fight_loadout_no_delete
  BEFORE DELETE ON "fight_loadout"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Odds and the transition audit trail are append-only.
CREATE TRIGGER fight_odds_append_only
  BEFORE UPDATE OR DELETE ON "fight_odds"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TRIGGER fight_transition_append_only
  BEFORE UPDATE OR DELETE ON "fight_transition"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
