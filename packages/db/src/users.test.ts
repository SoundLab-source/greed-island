import { LedgerRuleError } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { auditLedger } from "./audit.ts";
import { placeBet } from "./bets.ts";
import { getBalance } from "./ledger.ts";
import { settleFightLedger } from "./settlement.ts";
import { createTestFight, economy, useTestDb } from "./test/db.ts";
import { claimBailout, claimDailyGrant, createUser, findUserBySessionToken } from "./users.ts";

const db = useTestDb();

describe("createUser", () => {
  it("creates an anonymous user with the starting balance and a session token", async () => {
    const created = await createUser(db, { kind: "ANONYMOUS" }, economy);
    expect(created.balance).toBe(400n);
    expect(created.sessionToken).toBeTypeOf("string");
    const found = await findUserBySessionToken(db, created.sessionToken!);
    expect(found?.id).toBe(created.user.id);
    expect(found?.sessionTokenHash).not.toBe(created.sessionToken);
  });

  it("normalizes email and rejects duplicates", async () => {
    const a = await createUser(db, { kind: "EMAIL", email: " Player@Example.com " }, economy);
    expect(a.user.email).toBe("player@example.com");
    expect(a.sessionToken).toBeUndefined();
    await expect(createUser(db, { kind: "EMAIL", email: "player@example.com" }, economy)).rejects.toThrow();
  });

  it("uses the configured starting balance", async () => {
    const created = await createUser(db, { kind: "ANONYMOUS" }, { ...economy, startingBalance: 1234n });
    expect(created.balance).toBe(1234n);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});

describe("claimDailyGrant", () => {
  it("grants once per UTC day", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, economy);
    const day1 = new Date("2026-09-29T00:30:00Z");
    const first = await claimDailyGrant(db, user.id, economy, day1);
    expect(first).toEqual({ status: "GRANTED", amount: 100n, balance: 500n });

    const again = await claimDailyGrant(db, user.id, economy, new Date("2026-09-29T23:59:59Z"));
    expect(again).toEqual({ status: "ALREADY_CLAIMED", amount: 0n, balance: 500n });

    const next = await claimDailyGrant(db, user.id, economy, new Date("2026-09-30T00:00:00Z"));
    expect(next.status).toBe("GRANTED");
    expect(await getBalance(db, user.id)).toBe(600n);
  });

  it("grants only once under concurrent claims", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, economy);
    const now = new Date("2026-09-29T12:00:00Z");
    const results = await Promise.all(Array.from({ length: 8 }, () => claimDailyGrant(db, user.id, economy, now)));
    expect(results.filter((r) => r.status === "GRANTED")).toHaveLength(1);
    expect(await getBalance(db, user.id)).toBe(500n);
  });
});

describe("claimBailout", () => {
  async function brokeUser() {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, { ...economy, startingBalance: 30n });
    return user;
  }

  it("tops a broke user up to the floor", async () => {
    const user = await brokeUser();
    const r = await claimBailout(db, user.id, economy);
    expect(r).toEqual({ status: "GRANTED", amount: 70n, balance: 100n });
  });

  it("is refused at the floor", async () => {
    const user = await brokeUser();
    await claimBailout(db, user.id, economy);
    await expect(claimBailout(db, user.id, economy)).rejects.toThrow(LedgerRuleError);
  });

  it("is refused while the user has an open bet", async () => {
    const user = await brokeUser();
    await placeBet(db, { userId: user.id, fightId: await createTestFight(db), side: 1, stake: 30n, idempotencyKey: "k1" }, economy);
    await expect(claimBailout(db, user.id, economy)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("can happen again after the user goes broke again", async () => {
    const user = await brokeUser();
    await claimBailout(db, user.id, economy);
    const fightId = await createTestFight(db);
    await placeBet(db, { userId: user.id, fightId, side: 1, stake: 100n, idempotencyKey: "all-in" }, economy);
    await settleFightLedger(db, { fightId, winnerSide: 2, multiplierBp: { 1: 20_000n, 2: 20_000n }, maxPayout: economy.maxPayout });
    expect(await getBalance(db, user.id)).toBe(0n);
    const second = await claimBailout(db, user.id, economy);
    expect(second.amount).toBe(100n);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});
