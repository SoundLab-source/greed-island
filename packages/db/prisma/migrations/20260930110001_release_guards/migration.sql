-- Release guards. (New enum values can't be used in the migration that adds them.)

ALTER TABLE "submission" DROP CONSTRAINT "submission_shape";
ALTER TABLE "submission" ADD CONSTRAINT "submission_shape" CHECK (
  ("status" = 'DRAFT' AND "closed_at" IS NULL) OR
  ("status" IN ('SUBMITTED', 'CHANGES_REQUESTED') AND "closed_at" IS NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
  ("status" IN ('APPROVED', 'REJECTED', 'ELECTED', 'NOT_ELECTED', 'RELEASED') AND "closed_at" IS NOT NULL AND "submitted_at" IS NOT NULL AND "rights_confirmed_at" IS NOT NULL) OR
  ("status" = 'WITHDRAWN' AND "closed_at" IS NOT NULL)
);

CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submissions are kept';
  END IF;
  IF (NEW."id", NEW."number", NEW."submitted_by_user_id", NEW."created_at", NEW."nft_asset_id", NEW."nft_collection_id")
     IS DISTINCT FROM (OLD."id", OLD."number", OLD."submitted_by_user_id", OLD."created_at", OLD."nft_asset_id", OLD."nft_collection_id") THEN
    RAISE EXCEPTION 'who sent a submission, and the NFT it came from, are fixed';
  END IF;
  IF OLD."status" IN ('REJECTED', 'WITHDRAWN', 'NOT_ELECTED', 'RELEASED') THEN
    RAISE EXCEPTION 'a % submission can''t change', lower(replace(OLD."status"::text, '_', ' '));
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
       (OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN'))
    OR (OLD."status" = 'CHANGES_REQUESTED' AND NEW."status" IN ('SUBMITTED', 'WITHDRAWN'))
    OR (OLD."status" = 'APPROVED' AND NEW."status" IN ('ELECTED', 'NOT_ELECTED'))
    OR (OLD."status" = 'ELECTED' AND NEW."status" = 'RELEASED')) THEN
    RAISE EXCEPTION 'a submission can''t go from % to %', OLD."status", NEW."status";
  END IF;
  IF OLD."status" IN ('APPROVED', 'ELECTED') AND NEW."status" = OLD."status" THEN
    RAISE EXCEPTION 'an % submission can''t change', lower(OLD."status"::text);
  END IF;
  IF NEW."status" = 'RELEASED' AND NOT EXISTS (SELECT 1 FROM "release" WHERE "submission_id" = NEW."id") THEN
    RAISE EXCEPTION 'a submission is released only with its release';
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

-- Community fighters' ids start with "community-"; roster fighters' never do.
ALTER TABLE "fighter" ADD CONSTRAINT "fighter_source_id" CHECK (("source" = 'COMMUNITY') = ("id" LIKE 'community-%'));

-- Releases are kept; only the debut tournament is filled in, once.
CREATE FUNCTION release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'releases are kept';
  END IF;
  IF (NEW."id", NEW."season_id", NEW."submission_id", NEW."fighter_id", NEW."character_id", NEW."stand_in_fighter_id", NEW."created_at")
     IS DISTINCT FROM (OLD."id", OLD."season_id", OLD."submission_id", OLD."fighter_id", OLD."character_id", OLD."stand_in_fighter_id", OLD."created_at")
     OR OLD."debut_tournament_id" IS NOT NULL THEN
    RAISE EXCEPTION 'a release only gets its debut tournament, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_guard
  BEFORE UPDATE OR DELETE ON "release"
  FOR EACH ROW EXECUTE FUNCTION release_guard();
