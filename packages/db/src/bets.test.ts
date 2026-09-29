import { LedgerRuleError } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLedger } from "./audit.ts";
import { listBets, placeBet } from "./bets.ts";
import { getBalance, IdempotencyKeyReusedError } from "./ledger.ts";
import { settleFightLedger, voidFightLedger } from "./settlement.ts";
import { economy, useTestDb } from "./test/db.ts";
import { createUser } from "./users.ts";

const db = useTestDb();

let userId: string;
let fightId: string;
beforeEach(async () => {
  userId = (await createUser(db, { kind: "ANONYMOUS" }, economy)).user.id;
  fightId = randomUUID();
});

const bet = (side: 1 | 2, stake: bigint, key: string, fight = fightId, user = userId) =>
  placeBet(db, { userId: user, fightId: fight, side, stake, idempotencyKey: key }, economy);

describe("placeBet", () => {
  it("escrows the stake", async () => {
    const r = await bet(1, 150n, "a");
    expect(r.balance).toBe(250n);
    expect(r.bet).toMatchObject({ side: 1, stake: 150n, status: "OPEN", returned: null });
    expect((await auditLedger(db)).stats.escrow).toBe(150n);
  });

  it("keeps only the latest bet: change side and amount", async () => {
    await bet(1, 150n, "a");
    const r = await bet(2, 400n, "b");
    expect(r.balance).toBe(0n);
    expect(r.bet).toMatchObject({ side: 2, stake: 400n });
    expect(await listBets(db, { fightId })).toHaveLength(1);
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("rejects insufficient funds, counting the stake being replaced", async () => {
    await bet(1, 300n, "a");
    await expect(bet(1, 401n, "b")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await getBalance(db, userId)).toBe(100n);
  });

  it("enforces min bet and max stake", async () => {
    await expect(bet(1, 0n, "a")).rejects.toMatchObject({ code: "BELOW_MIN_BET" });
    await expect(bet(1, economy.maxPayout + 1n, "b")).rejects.toMatchObject({ code: "ABOVE_MAX_STAKE" });
  });

  it("replays a repeated idempotency key without charging twice", async () => {
    const first = await bet(1, 100n, "same");
    const again = await bet(1, 100n, "same");
    expect(again.replayed).toBe(true);
    expect(again.bet.id).toBe(first.bet.id);
    expect(await getBalance(db, userId)).toBe(300n);
  });

  it("rejects an idempotency key reused for a different bet", async () => {
    await bet(1, 100n, "same");
    await expect(bet(2, 100n, "same")).rejects.toThrow(IdempotencyKeyReusedError);
  });

  it("scopes idempotency keys per user", async () => {
    const other = (await createUser(db, { kind: "ANONYMOUS" }, economy)).user.id;
    await bet(1, 100n, "k");
    const r = await bet(1, 100n, "k", fightId, other);
    expect(r.replayed).toBe(false);
  });

  it("never overdraws under concurrent bets", async () => {
    // 10 bets of 100 on different fights against a 400 balance: exactly 4 fit.
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => bet(1, 100n, `c${i}`, randomUUID())));
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected");
    expect(ok).toHaveLength(4);
    for (const f of failed) expect((f as PromiseRejectedResult).reason).toBeInstanceOf(LedgerRuleError);
    expect(await getBalance(db, userId)).toBe(0n);
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("charges once when the same request races with itself", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => bet(1, 50n, "dup")));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await getBalance(db, userId)).toBe(350n);
  });

  it("applies the owner cap when the caller passes one", async () => {
    const capped = (stake: bigint, key: string) =>
      placeBet(db, { userId, fightId, side: 1, stake, idempotencyKey: key, ownerCap: 100n }, economy);
    await expect(capped(101n, "o1")).rejects.toMatchObject({ code: "ABOVE_OWNER_CAP" });
    expect((await capped(100n, "o2")).bet.stake).toBe(100n);
  });

  it("is refused once the fight is closed", async () => {
    await voidFightLedger(db, fightId);
    await expect(bet(1, 10n, "late")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("settlement", () => {
  const bp = { 1: 19_000n, 2: 25_000n } as const;

  async function threeBettors() {
    const [a, b, c] = await Promise.all([0, 1, 2].map(() => createUser(db, { kind: "ANONYMOUS" }, economy)));
    await bet(1, 100n, "a", fightId, a!.user.id);
    await bet(2, 60n, "b", fightId, b!.user.id);
    await bet(1, 3n, "c", fightId, c!.user.id);
    return [a!.user.id, b!.user.id, c!.user.id] as const;
  }

  it("pays winners at locked odds, rounded down, and the house takes the rest", async () => {
    const [a, b, c] = await threeBettors();
    const outcomes = await settleFightLedger(db, { fightId, winnerSide: 1, multiplierBp: bp, maxPayout: economy.maxPayout });
    expect(outcomes.map((o) => o.status)).toEqual(["WON", "LOST", "WON"]);
    expect(await getBalance(db, a)).toBe(300n + 190n);
    expect(await getBalance(db, b)).toBe(340n);
    expect(await getBalance(db, c)).toBe(397n + 5n);
    const report = await auditLedger(db);
    expect(report.ok).toBe(true);
    expect(report.stats.escrow).toBe(0n);
    expect(report.stats.house).toBe(60n - 90n - 2n);
  });

  it("caps each payout", async () => {
    const [a] = await threeBettors();
    await settleFightLedger(db, { fightId, winnerSide: 1, multiplierBp: { 1: 100_000n, 2: 10_000n }, maxPayout: 150n });
    expect(await getBalance(db, a)).toBe(300n + 150n);
  });

  it("void refunds everyone in full", async () => {
    const [a, b, c] = await threeBettors();
    const outcomes = await voidFightLedger(db, fightId);
    expect(outcomes.every((o) => o.status === "REFUNDED")).toBe(true);
    for (const u of [a, b, c]) expect(await getBalance(db, u)).toBe(400n);
    expect((await auditLedger(db)).stats.house).toBe(0n);
  });

  it("is idempotent, and settle and void exclude each other", async () => {
    await threeBettors();
    const input = { fightId, winnerSide: 1 as const, multiplierBp: bp, maxPayout: economy.maxPayout };
    const first = await settleFightLedger(db, input);
    expect(await settleFightLedger(db, input)).toEqual(first);
    await expect(settleFightLedger(db, { ...input, winnerSide: 2 })).rejects.toThrow(IdempotencyKeyReusedError);
    await expect(voidFightLedger(db, fightId)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("settles a fight with no bets", async () => {
    expect(await settleFightLedger(db, { fightId, winnerSide: 2, multiplierBp: bp, maxPayout: 10n })).toEqual([]);
  });

  it("refuses a multiplier below 1.00x", async () => {
    await threeBettors();
    await expect(
      settleFightLedger(db, { fightId, winnerSide: 1, multiplierBp: { 1: 9_999n, 2: 10_000n }, maxPayout: economy.maxPayout }),
    ).rejects.toThrow(/below 1.00x/);
  });
});
