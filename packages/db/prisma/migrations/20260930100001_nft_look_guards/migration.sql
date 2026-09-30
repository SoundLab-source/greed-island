-- NFT look guards.

-- One look on a character at a time, and each NFT's look on one character at a time.
CREATE UNIQUE INDEX "nft_look_one_per_character" ON "nft_look" ("character_id") WHERE "removed_at" IS NULL;
CREATE UNIQUE INDEX "nft_look_one_per_nft" ON "nft_look" ("chain", "asset_id") WHERE "removed_at" IS NULL;

ALTER TABLE "nft_look"
  ADD CONSTRAINT "nft_look_image" CHECK ("image_sha256" ~ '^[0-9a-f]{64}$' AND "image_type" IN ('png', 'jpeg', 'gif', 'webp')),
  ADD CONSTRAINT "nft_look_traits" CHECK (jsonb_typeof("traits") = 'array'),
  ADD CONSTRAINT "nft_look_colors" CHECK ("colors" IS NULL OR jsonb_typeof("colors") = 'object');

-- Looks are kept as the character's history: only taking one off (once) changes a row.
CREATE FUNCTION nft_look_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'looks are kept with the character';
  END IF;
  IF (NEW."id", NEW."character_id", NEW."chain", NEW."asset_id", NEW."collection_id", NEW."name", NEW."image_sha256", NEW."image_type",
      NEW."colors", NEW."traits", NEW."applied_by_user_id", NEW."wallet_address", NEW."applied_at")
     IS DISTINCT FROM
     (OLD."id", OLD."character_id", OLD."chain", OLD."asset_id", OLD."collection_id", OLD."name", OLD."image_sha256", OLD."image_type",
      OLD."colors", OLD."traits", OLD."applied_by_user_id", OLD."wallet_address", OLD."applied_at")
     OR OLD."removed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a look is only ever taken off, once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nft_look_guard
  BEFORE UPDATE OR DELETE ON "nft_look"
  FOR EACH ROW EXECUTE FUNCTION nft_look_guard();
