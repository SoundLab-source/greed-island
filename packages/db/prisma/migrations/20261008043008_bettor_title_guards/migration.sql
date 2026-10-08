-- Bettor title guards (docs/ENGAGEMENT.md §2).

-- A player title comes from a tournament (podium), a season (top bettor) or, for the bettor titles, a fight.
ALTER TABLE "player_title" DROP CONSTRAINT "player_title_source";
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_source" CHECK (
  CASE WHEN "code" IN ('CALLED_IT', 'IRON_READ', 'LOYAL', 'CONTRARIAN')
    THEN "tournament_id" IS NULL AND "season_id" IS NULL AND "fight_id" IS NOT NULL
    ELSE ("tournament_id" IS NULL) <> ("season_id" IS NULL)
      AND ("code" = 'SEASON_TOP_BETTOR') = ("season_id" IS NOT NULL)
      AND "fight_id" IS NULL
  END
);

-- Each bettor title is earned once per player.
CREATE UNIQUE INDEX "player_title_bettor_once" ON "player_title" ("user_id", "code")
  WHERE "code" IN ('CALLED_IT', 'IRON_READ', 'LOYAL', 'CONTRARIAN');
