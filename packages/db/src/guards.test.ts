/**
 * The database itself must reject ledger violations, even from code that
 * bypasses the app layer. These tests write raw SQL on purpose.
 */
import { describe, expect, it } from "vitest";
import { auditLedger } from "./audit.ts";
import { ensureAccounts } from "./ledger.ts";
import { economy, useTestDb } from "./test/db.ts";
import { createUser } from "./users.ts";

const db = useTestDb();

async function setup() {
  const { user } = await createUser(db, { kind: "ANONYMOUS" }, economy);
  const ids = await db.$transaction((tx) => ensureAccounts(tx, [{ kind: "USER", userId: user.id }, { kind: "HOUSE" }]));
  return { userAcct: ids.get(`user:${user.id}:SALT`)!, houseAcct: ids.get("house:SALT")! };
}

async function rawTxn(entries: [string, bigint][]) {
  await db.$transaction(async (tx) => {
    const [txn] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "ledger_txn" ("idempotency_key", "request_hash", "kind")
      VALUES (${`raw:${Math.random()}`}, 'x', 'BET') RETURNING "id"`;
    for (const [account, amount] of entries) {
      await tx.$executeRaw`
        INSERT INTO "ledger_entry" ("txn_id", "account_id", "amount")
        VALUES (${txn!.id}::uuid, ${account}::uuid, ${amount.toString()}::numeric)`;
    }
  });
}

describe("database ledger guards", () => {
  it("rejects a transaction that doesn't sum to zero, at commit", async () => {
    const { userAcct, houseAcct } = await setup();
    await expect(rawTxn([[userAcct, -10n], [houseAcct, 9n]])).rejects.toThrow(/does not sum to zero/);
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("rejects an overdraft of a user account", async () => {
    const { userAcct, houseAcct } = await setup();
    await expect(rawTxn([[userAcct, -401n], [houseAcct, 401n]])).rejects.toThrow(/account_balance_sign/);
  });

  it("maintains cached balances from entries", async () => {
    const { userAcct, houseAcct } = await setup();
    await rawTxn([[userAcct, -40n], [houseAcct, 40n]]);
    const acct = await db.account.findUniqueOrThrow({ where: { id: userAcct } });
    expect(acct.balance.toString()).toBe("360");
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("refuses direct balance edits", async () => {
    const { userAcct } = await setup();
    await expect(db.$executeRaw`UPDATE "account" SET "balance" = 1000000 WHERE "id" = ${userAcct}::uuid`).rejects.toThrow(
      /maintained by ledger entries only/,
    );
  });

  it("keeps the ledger append-only", async () => {
    await setup();
    await expect(db.$executeRaw`DELETE FROM "ledger_entry"`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`UPDATE "ledger_txn" SET "kind" = 'VOID'`).rejects.toThrow(/append-only/);
  });
});
