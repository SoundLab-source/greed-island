-- Season guards. (New enum values can't be used in the migration that adds them.)

ALTER TABLE "season"
  ADD CONSTRAINT "season_window" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "season_shape" CHECK (
    ("status" = 'RUNNING' AND "ended_at" IS NULL AND "champion_character_id" IS NULL AND "top_bettor_user_id" IS NULL) OR
    ("status" = 'ENDED' AND "ended_at" IS NOT NULL)
  );

-- One season runs at a time.
CREATE UNIQUE INDEX "season_one_running" ON "season" ((true)) WHERE "status" = 'RUNNING';

-- Seasons follow each other without overlapping, their dates are fixed, and an
-- ended season (champion, top bettor) never changes.
CREATE FUNCTION season_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'seasons are kept';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM "season" WHERE "ends_at" > NEW."starts_at") THEN
      RAISE EXCEPTION 'a season can''t start before the previous one ends';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW."id", NEW."number", NEW."starts_at", NEW."ends_at", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."number", OLD."starts_at", OLD."ends_at", OLD."created_at") THEN
    RAISE EXCEPTION 'a season''s number and dates are fixed';
  END IF;
  IF OLD."status" = 'ENDED' THEN
    RAISE EXCEPTION 'an ended season can''t change';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER season_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "season"
  FOR EACH ROW EXECUTE FUNCTION season_guard();

-- Final standings: a player row or a character row, kept as they were.
ALTER TABLE "season_standing"
  ADD CONSTRAINT "season_standing_rank" CHECK ("rank" >= 1),
  ADD CONSTRAINT "season_standing_shape" CHECK (
    ("kind" = 'PLAYER' AND "user_id" IS NOT NULL AND "salt_won" IS NOT NULL AND "bets" IS NOT NULL
      AND "character_id" IS NULL AND "rating" IS NULL AND "wins" IS NULL AND "losses" IS NULL) OR
    ("kind" = 'CHARACTER' AND "character_id" IS NOT NULL AND "rating" IS NOT NULL AND "wins" IS NOT NULL AND "losses" IS NOT NULL
      AND "user_id" IS NULL AND "salt_won" IS NULL AND "bets" IS NULL)
  );
CREATE TRIGGER season_standing_append_only
  BEFORE UPDATE OR DELETE ON "season_standing"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Season Champion records its season; one per season. Like Tournament Champion,
-- it can be earned again in later seasons.
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_season" CHECK (
  ("code" = 'SEASON_CHAMPION') = ("season_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "character_title_one_season_champion" ON "character_title" ("season_id")
  WHERE "code" = 'SEASON_CHAMPION';
DROP INDEX "character_title_once";
CREATE UNIQUE INDEX "character_title_once" ON "character_title" ("character_id", "code")
  WHERE "code" NOT IN ('TOURNAMENT_CHAMPION', 'SEASON_CHAMPION');

-- A player title belongs to a tournament (podium) or a season (top bettor), never both.
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_source" CHECK (
  ("tournament_id" IS NULL) <> ("season_id" IS NULL)
  AND ("code" = 'SEASON_TOP_BETTOR') = ("season_id" IS NOT NULL)
);
