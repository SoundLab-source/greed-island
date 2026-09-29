-- Title guards.

-- Most titles are earned once per character; Tournament Champion once per tournament.
CREATE UNIQUE INDEX "character_title_once" ON "character_title" ("character_id", "code")
  WHERE "code" <> 'TOURNAMENT_CHAMPION';

ALTER TABLE "character_title" ADD CONSTRAINT "character_title_owner" CHECK (
  ("owner_kind" = 'HOUSE' AND "owner_user_id" IS NULL) OR ("owner_kind" = 'USER' AND "owner_user_id" IS NOT NULL)
);

-- Titles are permanent provenance.
CREATE TRIGGER character_title_append_only
  BEFORE UPDATE OR DELETE ON "character_title"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

ALTER TABLE "character" ADD CONSTRAINT "character_cosmetics_object" CHECK ("cosmetics" IS NULL OR jsonb_typeof("cosmetics") = 'object');
ALTER TABLE "fight_loadout" ADD CONSTRAINT "fight_loadout_cosmetics_object" CHECK (jsonb_typeof("cosmetics") = 'object');

-- Cosmetics are part of the frozen loadout: only the post-fight rating columns may change.
CREATE OR REPLACE FUNCTION fight_loadout_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."fight_id", NEW."side", NEW."character_id", NEW."fighter_id", NEW."name", NEW."tier", NEW."life_pct",
      NEW."start_power", NEW."attack_pct", NEW."defense_pct", NEW."rating", NEW."deviation", NEW."volatility",
      NEW."wins", NEW."losses", NEW."cosmetics")
     IS DISTINCT FROM
     (OLD."fight_id", OLD."side", OLD."character_id", OLD."fighter_id", OLD."name", OLD."tier", OLD."life_pct",
      OLD."start_power", OLD."attack_pct", OLD."defense_pct", OLD."rating", OLD."deviation", OLD."volatility",
      OLD."wins", OLD."losses", OLD."cosmetics") THEN
    RAISE EXCEPTION 'fight_loadout is frozen once betting opens';
  END IF;
  RETURN NEW;
END $$;
