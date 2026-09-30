-- Holder guards. (New enum values can't be used in the migration that adds them.)

ALTER TABLE "staff_action" DROP CONSTRAINT "staff_action_shape";
ALTER TABLE "staff_action" ADD CONSTRAINT "staff_action_shape" CHECK (
  ("kind" = 'ROLE_SET' AND "target_user_id" IS NOT NULL) OR
  ("kind" IN ('REVIEW_APPROVED', 'REVIEW_REJECTED', 'REVIEW_CHANGES_REQUESTED') AND "review_item_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
  ("kind" = 'DISPLAY_NAME_RESET' AND "target_user_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
  ("kind" = 'CHARACTER_NAME_RESET' AND "character_id" IS NOT NULL AND "actor_user_id" IS NOT NULL) OR
  ("kind" = 'COLLECTION_SET' AND "actor_user_id" IS NOT NULL)
);

-- Wallets: base58 public keys (32 bytes is 32-44 characters).
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_address" CHECK ("address" ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
ALTER TABLE "wallet_challenge" ADD CONSTRAINT "wallet_challenge_address" CHECK ("address" ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

-- A sign-in message is used once, and nothing else about it changes.
CREATE FUNCTION wallet_challenge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'wallet challenges are kept';
  END IF;
  IF (NEW."id", NEW."user_id", NEW."chain", NEW."address", NEW."nonce", NEW."message", NEW."created_at", NEW."expires_at")
     IS DISTINCT FROM (OLD."id", OLD."user_id", OLD."chain", OLD."address", OLD."nonce", OLD."message", OLD."created_at", OLD."expires_at")
     OR OLD."used_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a wallet challenge is used once and never changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wallet_challenge_guard
  BEFORE UPDATE OR DELETE ON "wallet_challenge"
  FOR EACH ROW EXECUTE FUNCTION wallet_challenge_guard();

-- Collections: a name, and a licence link for any that take submissions.
ALTER TABLE "nft_collection"
  ADD CONSTRAINT "nft_collection_name" CHECK (length("name") BETWEEN 1 AND 60),
  ADD CONSTRAINT "nft_collection_address" CHECK ("address" ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  ADD CONSTRAINT "nft_collection_licence" CHECK (NOT "submissions_allowed" OR "licence_url" LIKE 'https://%');

-- A submission from an NFT records both the NFT and its collection.
ALTER TABLE "submission" ADD CONSTRAINT "submission_nft" CHECK (("nft_asset_id" IS NULL) = ("nft_collection_id" IS NULL));

CREATE OR REPLACE FUNCTION submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'submissions are kept';
  END IF;
  IF (NEW."id", NEW."number", NEW."submitted_by_user_id", NEW."created_at", NEW."nft_asset_id", NEW."nft_collection_id")
     IS DISTINCT FROM (OLD."id", OLD."number", OLD."submitted_by_user_id", OLD."created_at", OLD."nft_asset_id", OLD."nft_collection_id") THEN
    RAISE EXCEPTION 'who sent a submission, and the NFT it came from, are fixed';
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
