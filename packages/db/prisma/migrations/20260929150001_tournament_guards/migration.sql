-- Tournament guards. (New enum values can't be used in the migration that adds them.)

-- Account shapes: SALT accounts as before; TSALT accounts belong to one
-- tournament's book and there is no T-Salt sink (nothing to spend it on).
ALTER TABLE "account" DROP CONSTRAINT "account_shape";
ALTER TABLE "account" ADD CONSTRAINT "account_shape" CHECK (
  (("asset" = 'SALT' AND "tournament_id" IS NULL) OR ("asset" = 'TSALT' AND "tournament_id" IS NOT NULL AND "kind" <> 'SINK'))
  AND (
    ("kind" = 'USER'     AND "user_id" IS NOT NULL AND "fight_id" IS NULL     AND "side" IS NULL) OR
    ("kind" = 'ESCROW'   AND "user_id" IS NULL     AND "fight_id" IS NOT NULL AND "side" IN (1, 2)) OR
    ("kind" IN ('HOUSE', 'ISSUANCE', 'SINK') AND "user_id" IS NULL AND "fight_id" IS NULL AND "side" IS NULL)
  )
);

-- An account's identity never changes (only its trigger-maintained balance does).
CREATE FUNCTION account_identity_fixed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."key", NEW."kind", NEW."asset", NEW."user_id", NEW."fight_id", NEW."side", NEW."tournament_id")
     IS DISTINCT FROM
     (OLD."id", OLD."key", OLD."kind", OLD."asset", OLD."user_id", OLD."fight_id", OLD."side", OLD."tournament_id") THEN
    RAISE EXCEPTION 'an account''s owner, kind and currency are fixed';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER account_identity_fixed
  BEFORE UPDATE ON "account"
  FOR EACH ROW EXECUTE FUNCTION account_identity_fixed();

-- Salt and T-Salt never move between each other: every transaction stays in
-- one book (one currency, and for T-Salt one tournament). Checked at commit.
CREATE FUNCTION ledger_txn_one_book() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(DISTINCT a."asset"::text || ':' || COALESCE(a."tournament_id"::text, ''))
      FROM "ledger_entry" e JOIN "account" a ON a."id" = e."account_id"
      WHERE e."txn_id" = NEW."txn_id") > 1 THEN
    RAISE EXCEPTION 'ledger txn % mixes books: Salt and T-Salt never move between each other', NEW."txn_id";
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entry_one_book
  AFTER INSERT ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_txn_one_book();

ALTER TABLE "ledger_txn" ADD CONSTRAINT "ledger_txn_tournament_grant" CHECK (
  "kind" <> 'TOURNAMENT_GRANT' OR ("user_id" IS NOT NULL AND "fight_id" IS NULL)
);

-- Tournaments.
ALTER TABLE "tournament"
  ADD CONSTRAINT "tournament_tier" CHECK ("tier" <> 'X'),
  ADD CONSTRAINT "tournament_size" CHECK (
    ("status" = 'CANCELLED' AND "size" = 0) OR ("status" <> 'CANCELLED' AND "size" >= 2 AND ("size" & ("size" - 1)) = 0)
  ),
  ADD CONSTRAINT "tournament_finished" CHECK (("status" = 'FINISHED') = ("finished_at" IS NOT NULL AND "champion_character_id" IS NOT NULL)),
  ADD CONSTRAINT "tournament_cancelled" CHECK (("status" = 'CANCELLED') = ("cancel_reason" IS NOT NULL));

-- Kept forever; only RUNNING -> FINISHED (with its champion and time) may change.
CREATE FUNCTION tournament_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tournament rows are kept';
  END IF;
  IF (NEW."id", NEW."number", NEW."cycle", NEW."tier", NEW."size", NEW."cancel_reason", NEW."created_at")
     IS DISTINCT FROM
     (OLD."id", OLD."number", OLD."cycle", OLD."tier", OLD."size", OLD."cancel_reason", OLD."created_at") THEN
    RAISE EXCEPTION 'a tournament''s tier, size and cycle are fixed';
  END IF;
  IF NEW IS DISTINCT FROM OLD AND NOT (OLD."status" = 'RUNNING' AND NEW."status" = 'FINISHED') THEN
    RAISE EXCEPTION 'a tournament can only go from RUNNING to FINISHED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tournament_guard
  BEFORE UPDATE OR DELETE ON "tournament"
  FOR EACH ROW EXECUTE FUNCTION tournament_guard();

CREATE TRIGGER tournament_entry_append_only
  BEFORE UPDATE OR DELETE ON "tournament_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

ALTER TABLE "tournament_entry" ADD CONSTRAINT "tournament_entry_seed" CHECK ("seed" >= 1);

-- Bracket matches.
ALTER TABLE "tournament_match"
  ADD CONSTRAINT "tournament_match_position" CHECK ("round" >= 1 AND "slot" >= 0),
  ADD CONSTRAINT "tournament_match_sides_differ" CHECK (
    "side1_character_id" IS NULL OR "side2_character_id" IS NULL OR "side1_character_id" <> "side2_character_id"
  ),
  ADD CONSTRAINT "tournament_match_winner" CHECK (
    ("winner_character_id" IS NULL AND "decided_at" IS NULL AND NOT "walkover") OR
    ("winner_character_id" IN ("side1_character_id", "side2_character_id") AND "decided_at" IS NOT NULL)
  );

-- A side, once filled, never changes; a decided match never changes; rows are kept.
CREATE FUNCTION tournament_match_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tournament matches are kept';
  END IF;
  IF (NEW."id", NEW."tournament_id", NEW."round", NEW."slot") IS DISTINCT FROM (OLD."id", OLD."tournament_id", OLD."round", OLD."slot")
     OR (OLD."side1_character_id" IS NOT NULL AND NEW."side1_character_id" IS DISTINCT FROM OLD."side1_character_id")
     OR (OLD."side2_character_id" IS NOT NULL AND NEW."side2_character_id" IS DISTINCT FROM OLD."side2_character_id")
     OR (OLD."winner_character_id" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'a decided bracket result can''t change';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tournament_match_guard
  BEFORE UPDATE OR DELETE ON "tournament_match"
  FOR EACH ROW EXECUTE FUNCTION tournament_match_guard();

-- Tournament fights are exactly the ones linked to a bracket match.
ALTER TABLE "fight" ADD CONSTRAINT "fight_tournament_link" CHECK (
  ("pair_kind" = 'TOURNAMENT') = ("tournament_match_id" IS NOT NULL)
  AND ("tournament_match_id" IS NULL OR "segment" = 'TOURNAMENT')
);

-- Tournament Champion records its tournament; one champion per tournament.
ALTER TABLE "character_title" ADD CONSTRAINT "character_title_tournament" CHECK (
  ("code" = 'TOURNAMENT_CHAMPION') = ("tournament_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "character_title_one_champion" ON "character_title" ("tournament_id")
  WHERE "code" = 'TOURNAMENT_CHAMPION';

-- Player titles are permanent.
ALTER TABLE "player_title" ADD CONSTRAINT "player_title_balance" CHECK ("balance" >= 0);
CREATE TRIGGER player_title_append_only
  BEFORE UPDATE OR DELETE ON "player_title"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
