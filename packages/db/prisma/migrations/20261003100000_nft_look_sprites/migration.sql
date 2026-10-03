-- NFT looks on the fighter's sprites: the look's own character, when its colours were applied to the sprites.
ALTER TABLE "nft_look" ADD COLUMN "def_path" TEXT;

-- Always our own look character's .def, named after the look.
ALTER TABLE "nft_look"
  ADD CONSTRAINT "nft_look_def_path" CHECK ("def_path" IS NULL OR "def_path" = 'chars/gi-look-' || replace("id"::text, '-', '') || '/gi-look-' || replace("id"::text, '-', '') || '.def');

-- Looks are kept as the character's history: only taking one off (once) changes a row (now including def_path).
CREATE OR REPLACE FUNCTION nft_look_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'looks are kept with the character';
  END IF;
  IF (NEW."id", NEW."character_id", NEW."chain", NEW."asset_id", NEW."collection_id", NEW."name", NEW."image_sha256", NEW."image_type",
      NEW."colors", NEW."traits", NEW."applied_by_user_id", NEW."wallet_address", NEW."applied_at", NEW."def_path")
     IS DISTINCT FROM
     (OLD."id", OLD."character_id", OLD."chain", OLD."asset_id", OLD."collection_id", OLD."name", OLD."image_sha256", OLD."image_type",
      OLD."colors", OLD."traits", OLD."applied_by_user_id", OLD."wallet_address", OLD."applied_at", OLD."def_path")
     OR OLD."removed_at" IS NOT NULL THEN
    RAISE EXCEPTION 'a look is only ever taken off, once';
  END IF;
  RETURN NEW;
END $$;
