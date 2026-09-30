-- Voting guards. (New enum values can't be used in the migration that adds them.)

-- Submissions on a ballot end up elected or not elected.
ALTER TABLE "submission" DROP CONSTRAINT "submission_shape";
ALTER TABLE "submission" ADD CONSTRAINT "submission_shape" CHECK (
  ("status" = 'DRAFT' AND "closed_at" IS NULL) OR
  ("status" IN ('SUBMITTED', 'CHANGES_REQUESTED') AND "closed_at" IS NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
  ("status" IN ('APPROVED', 'REJECTED', 'ELECTED', 'NOT_ELECTED') AND "closed_at" IS NOT NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
  ("status" = 'WITHDRAWN' AND "closed_at" IS NOT NULL)
);

CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submissions are kept';
  END IF;
  IF (NEW."id", NEW."number", NEW."submitted_by_user_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."number", OLD."submitted_by_user_id", OLD."created_at") THEN
    RAISE EXCEPTION 'who sent a submission is fixed';
  END IF;
  IF OLD."status" IN ('REJECTED', 'WITHDRAWN', 'ELECTED', 'NOT_ELECTED') THEN
    RAISE EXCEPTION 'a % submission can''t change', lower(replace(OLD."status"::text, '_', ' '));
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN'))
    OR (OLD."status" = 'CHANGES_REQUESTED' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('ELECTED', 'NOT_ELECTED'))) THEN
    RAISE EXCEPTION 'a submission can''t go from % to %', OLD."status", NEW."status";
  END IF;
  IF OLD."status" = 'APPROVED' AND NEW."status" = 'APPROVED' THEN
    RAISE EXCEPTION 'an approved submission can''t change';
  END IF;
  IF OLD."status" NOT IN ('DRAFT', 'CHANGES_REQUESTED')
     AND (NEW."community", NEW."fighter_name", NEW."archetype", NEW."description", NEW."rights_basis", NEW."rights_details", NEW."rights_link")
         IS DISTINCT FROM
         (OLD."community", OLD."fighter_name", OLD."archetype", OLD."description", OLD."rights_basis", OLD."rights_details", OLD."rights_link") THEN
    RAISE EXCEPTION 'a submission''s details can''t change while it''s being reviewed';
  END IF;
  IF NEW."status" IN ('ELECTED', 'NOT_ELECTED') AND NOT EXISTS (
       SELECT 1 FROM "ballot_entry" WHERE "submission_id" = NEW."id" AND "elected" = (NEW."status" = 'ELECTED')) THEN
    RAISE EXCEPTION 'a submission is elected or not only by its ballot''s result';
  END IF;
  RETURN NEW;
END $$;

-- Ballots.
ALTER TABLE "ballot"
  ADD CONSTRAINT "ballot_window" CHECK ("closes_at" > "opens_at"),
  ADD CONSTRAINT "ballot_shape" CHECK (("status" = 'CLOSED') = ("closed_at" IS NOT NULL));

CREATE FUNCTION ballot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ballots are kept';
  END IF;
  IF (NEW."id", NEW."season_id", NEW."opens_at", NEW."closes_at", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."season_id", OLD."opens_at", OLD."closes_at", OLD."created_at") THEN
    RAISE EXCEPTION 'a ballot''s season and dates are fixed';
  END IF;
  IF OLD."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'a closed ballot can''t change';
  END IF;
  IF NEW."status" = 'CLOSED' AND EXISTS (SELECT 1 FROM "ballot_entry" WHERE "ballot_id" = NEW."id" AND "votes" IS NULL) THEN
    RAISE EXCEPTION 'a ballot closes only with every result counted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ballot_guard
  BEFORE UPDATE OR DELETE ON "ballot"
  FOR EACH ROW EXECUTE FUNCTION ballot_guard();

-- Entries: results all filled in together, once, while the ballot is still open;
-- never removed; no new fighters once the ballot is closed.
ALTER TABLE "ballot_entry"
  ADD CONSTRAINT "ballot_entry_result" CHECK (
    ("votes" IS NULL AND "rank" IS NULL AND "elected" IS NULL) OR
    ("votes" >= 0 AND "rank" >= 1 AND "elected" IS NOT NULL)
  );

CREATE FUNCTION ballot_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ballot_status "BallotStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ballot entries are kept';
  END IF;
  SELECT "status" INTO ballot_status FROM "ballot" WHERE "id" = NEW."ballot_id";
  IF ballot_status <> 'OPEN' THEN
    RAISE EXCEPTION 'the ballot is closed';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW."ballot_id", NEW."submission_id") IS DISTINCT FROM (OLD."ballot_id", OLD."submission_id") OR OLD."votes" IS NOT NULL THEN
      RAISE EXCEPTION 'a ballot entry''s result is written once';
    END IF;
  ELSIF NEW."votes" IS NOT NULL THEN
    RAISE EXCEPTION 'a new ballot entry has no result yet';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ballot_entry_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "ballot_entry"
  FOR EACH ROW EXECUTE FUNCTION ballot_entry_guard();

-- Votes: cast or taken back only while the ballot is open and before its
-- results are counted; never edited.
CREATE FUNCTION vote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ballot_status "BallotStatus";
  counted boolean;
  row_ballot uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD."ballot_id" ELSE NEW."ballot_id" END;
  row_submission uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD."submission_id" ELSE NEW."submission_id" END;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'votes can''t be edited, only cast or taken back';
  END IF;
  SELECT b."status", e."votes" IS NOT NULL INTO ballot_status, counted
    FROM "ballot" b JOIN "ballot_entry" e ON e."ballot_id" = b."id"
    WHERE b."id" = row_ballot AND e."submission_id" = row_submission;
  IF ballot_status <> 'OPEN' OR counted THEN
    RAISE EXCEPTION 'voting has closed';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER vote_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "vote"
  FOR EACH ROW EXECUTE FUNCTION vote_guard();
