-- Ledger guards: the database enforces the ledger rules even if app code is wrong.

-- Account shape and sign rules. User and escrow accounts can never go negative.
ALTER TABLE "account"
  ADD CONSTRAINT "account_balance_sign" CHECK ("balance" >= 0 OR "kind" IN ('HOUSE', 'ISSUANCE')),
  ADD CONSTRAINT "account_shape" CHECK (
    ("kind" = 'USER'     AND "user_id" IS NOT NULL AND "fight_id" IS NULL     AND "side" IS NULL) OR
    ("kind" = 'ESCROW'   AND "user_id" IS NULL     AND "fight_id" IS NOT NULL AND "side" IN (1, 2)) OR
    ("kind" IN ('HOUSE', 'ISSUANCE') AND "user_id" IS NULL AND "fight_id" IS NULL AND "side" IS NULL)
  );

ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_nonzero" CHECK ("amount" <> 0);

ALTER TABLE "bet"
  ADD CONSTRAINT "bet_stake_positive" CHECK ("stake" > 0),
  ADD CONSTRAINT "bet_side" CHECK ("side" IN (1, 2)),
  ADD CONSTRAINT "bet_returned" CHECK ("returned" IS NULL OR "returned" >= 0);

-- Cached balances are maintained here, never by the app. The balance CHECK
-- above therefore rejects any entry that would overdraw a user or escrow.
CREATE FUNCTION ledger_apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "account" SET "balance" = "balance" + NEW."amount" WHERE "id" = NEW."account_id";
  RETURN NULL;
END $$;

CREATE TRIGGER ledger_entry_apply
  AFTER INSERT ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

-- Only the trigger above may change a balance (it runs one trigger level deeper).
CREATE FUNCTION account_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."balance" IS DISTINCT FROM OLD."balance" AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'account.balance is maintained by ledger entries only';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER account_balance_guard
  BEFORE UPDATE ON "account"
  FOR EACH ROW EXECUTE FUNCTION account_balance_guard();

-- Every ledger transaction sums to zero per asset, checked at commit.
CREATE FUNCTION ledger_txn_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ledger_entry" e
    JOIN "account" a ON a."id" = e."account_id"
    WHERE e."txn_id" = NEW."txn_id"
    GROUP BY a."asset"
    HAVING SUM(e."amount") <> 0
  ) THEN
    RAISE EXCEPTION 'ledger txn % does not sum to zero', NEW."txn_id";
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entry_balanced
  AFTER INSERT ON "ledger_entry"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_txn_balanced();

-- The ledger is append-only. (TRUNCATE, used by tests, is not affected.)
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER ledger_entry_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TRIGGER ledger_txn_append_only
  BEFORE UPDATE OR DELETE ON "ledger_txn"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
