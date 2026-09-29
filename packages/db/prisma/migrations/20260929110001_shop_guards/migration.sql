-- Shop guards (separate migration: new enum values can't be used in the transaction that adds them).

-- The sink is a system account like house and issuance: no user, fight or side.
ALTER TABLE "account" DROP CONSTRAINT "account_shape";
ALTER TABLE "account" ADD CONSTRAINT "account_shape" CHECK (
  ("kind" = 'USER'     AND "user_id" IS NOT NULL AND "fight_id" IS NULL     AND "side" IS NULL) OR
  ("kind" = 'ESCROW'   AND "user_id" IS NULL     AND "fight_id" IS NOT NULL AND "side" IN (1, 2)) OR
  ("kind" IN ('HOUSE', 'ISSUANCE', 'SINK') AND "user_id" IS NULL AND "fight_id" IS NULL AND "side" IS NULL)
);

-- Owned characters carry a copy number and purchase time; house characters don't.
ALTER TABLE "character" ADD CONSTRAINT "character_serial_shape" CHECK (
  ("owner_kind" = 'HOUSE' AND "serial" IS NULL AND "first_edition" = false) OR
  ("owner_kind" = 'USER' AND "serial" >= 1 AND "acquired_at" IS NOT NULL)
);
