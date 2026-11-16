import { describe, expect, it } from "vitest";
import { placeBet } from "./bets.ts";
import { economyReportFor, economyWeeks } from "./economy.ts";
import { createTestFight, economy, useTestDb } from "./test/db.ts";
import { claimDailyGrant, createUser } from "./users.ts";

const db = useTestDb();

describe("the weekly Salt report from the ledger", () => {
  it("counts players' Salt by where it came from, leaves bots out, and counts who bet", async () => {
    const a = (await createUser(db, { kind: "ANONYMOUS" }, economy)).user.id;
    await createUser(db, { kind: "ANONYMOUS" }, economy); // a second player who doesn't bet
    const bot = (await createUser(db, { kind: "BOT", displayName: "TestBot" }, economy)).user.id;
    await claimDailyGrant(db, a, economy);
    const fight = await createTestFight(db);
    await placeBet(db, { userId: a, fightId: fight, side: 1, stake: 50n, idempotencyKey: "economy-a" }, economy);
    await placeBet(db, { userId: bot, fightId: fight, side: 2, stake: 70n, idempotencyKey: "economy-bot" }, economy);

    const { weeks, startingSupply } = await economyWeeks(db, { weeks: 3 });
    expect(weeks).toHaveLength(3);
    expect(startingSupply).toBe(0n);
    expect(weeks.slice(0, 2).map((w) => w.activePlayers)).toEqual([0, 0]);
    const now = weeks[2]!;
    expect(now.week.getUTCDay()).toBe(1); // a Monday
    expect(now.byKind).toEqual({ GRANT_START: 2n * economy.startingBalance, GRANT_DAILY: economy.dailyGrant, BET: -50n });
    expect(now.activePlayers).toBe(1);

    const report = await economyReportFor(db, { weeks: 3 });
    expect(report.weeks[2]).toMatchObject({ in: 2n * economy.startingBalance + economy.dailyGrant, out: 50n, activePlayers: 1 });
    expect(report.weeks[2]!.supply).toBe(2n * economy.startingBalance + economy.dailyGrant - 50n);
  });

  it("carries earlier weeks into the starting supply", async () => {
    await createUser(db, { kind: "ANONYMOUS" }, economy);
    const later = new Date(Date.now() + 21 * 86_400_000);
    const { weeks, startingSupply } = await economyWeeks(db, { weeks: 2, now: later });
    expect(startingSupply).toBe(economy.startingBalance);
    expect(weeks.every((w) => Object.keys(w.byKind).length === 0)).toBe(true);
  });
});
