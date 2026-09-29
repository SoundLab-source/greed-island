-- Exhibition guards. (New enum values can't be used in the migration that adds them.)

ALTER TABLE "challenge"
  ADD CONSTRAINT "challenge_two_owners" CHECK ("challenger_user_id" <> "challenged_user_id"),
  ADD CONSTRAINT "challenge_two_characters" CHECK ("challenger_character_id" <> "challenged_character_id"),
  ADD CONSTRAINT "challenge_shape" CHECK (
    ("status" = 'PENDING'  AND "accepted_at" IS NULL     AND "closed_at" IS NULL     AND "fight_id" IS NULL) OR
    ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "closed_at" IS NULL     AND "fight_id" IS NULL) OR
    ("status" = 'BOOKED'   AND "accepted_at" IS NOT NULL AND "closed_at" IS NOT NULL AND "fight_id" IS NOT NULL) OR
    ("status" IN ('DECLINED', 'CANCELLED', 'EXPIRED') AND "closed_at" IS NOT NULL AND "fight_id" IS NULL)
  );

-- At most one open challenge between the same two characters, whichever sent it.
CREATE UNIQUE INDEX "challenge_open_pair" ON "challenge" (
  LEAST("challenger_character_id", "challenged_character_id"),
  GREATEST("challenger_character_id", "challenged_character_id")
) WHERE "status" IN ('PENDING', 'ACCEPTED');

-- Challenges are kept, their participants never change, and status only moves forward:
-- PENDING -> ACCEPTED | DECLINED | CANCELLED | EXPIRED, ACCEPTED -> BOOKED | CANCELLED.
CREATE FUNCTION challenge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'challenge rows are kept';
  END IF;
  IF (NEW."id", NEW."challenger_user_id", NEW."challenger_character_id", NEW."challenged_user_id",
      NEW."challenged_character_id", NEW."created_at", NEW."expires_at")
     IS DISTINCT FROM
     (OLD."id", OLD."challenger_user_id", OLD."challenger_character_id", OLD."challenged_user_id",
      OLD."challenged_character_id", OLD."created_at", OLD."expires_at") THEN
    RAISE EXCEPTION 'a challenge''s characters, owners and times are fixed';
  END IF;
  IF NEW."status" = OLD."status" THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'a challenge only changes along with its status';
    END IF;
  ELSIF NOT ((OLD."status" = 'PENDING' AND NEW."status" IN ('ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
          OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('BOOKED', 'CANCELLED'))) THEN
    RAISE EXCEPTION 'a challenge can''t go from % to %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER challenge_guard
  BEFORE UPDATE OR DELETE ON "challenge"
  FOR EACH ROW EXECUTE FUNCTION challenge_guard();

-- Owner rewards belong to a fight and go to one player.
ALTER TABLE "ledger_txn" ADD CONSTRAINT "ledger_txn_owner_reward" CHECK (
  "kind" <> 'OWNER_REWARD' OR ("fight_id" IS NOT NULL AND "user_id" IS NOT NULL)
);
