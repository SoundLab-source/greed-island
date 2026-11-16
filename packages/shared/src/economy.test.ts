import { describe, expect, it } from "vitest";
import { economyReport, weekStart, type EconomyWeekInput } from "./economy.ts";

const week = (i: number, byKind: Record<string, bigint>, activePlayers: number): EconomyWeekInput => ({ week: new Date(Date.UTC(2026, 10, 2 + 7 * i)), byKind, activePlayers });

describe("the weekly Salt report", () => {
  it("adds up where players' Salt came from and went, and the supply at each week's end", () => {
    const r = economyReport([week(0, { GRANT_START: 4_000n, GRANT_DAILY: 1_000n, BET: -3_000n, SETTLE: 2_700n, PURCHASE: -1_000n }, 10)]);
    expect(r.weeks[0]).toMatchObject({ in: 5_000n, out: 1_300n, net: 3_700n, supply: 3_700n, perActive: 370n, supplyGrowthPct: null, inflating: false });
    expect(r.weeks[0]!.flows).toMatchObject({ starting: 4_000n, daily: 1_000n, betting: -300n, shop: -1_000n, upgrades: 0n });
  });

  it("flags weeks where Salt grows faster than active players, and says to raise sinks after two", () => {
    const r = economyReport(
      [
        week(0, { GRANT_START: 10_000n }, 10),
        week(1, { GRANT_DAILY: 5_000n }, 11), // +50% Salt, +10% players
        week(2, { GRANT_DAILY: 5_000n }, 11), // +33% Salt, players flat
      ],
      { tolerancePct: 5 },
    );
    expect(r.weeks.map((w) => w.inflating)).toEqual([false, true, true]);
    expect(r.weeks[1]!.supplyGrowthPct).toBeCloseTo(50);
    expect(r.weeks[1]!.activeGrowthPct).toBeCloseTo(10);
    expect(r.inflatingStreak).toBe(2);
    expect(r.advice).toMatch(/2 weeks in a row: raise sinks/);
  });

  it("doesn't flag Salt growing in step with players, or shrinking", () => {
    const r = economyReport([week(0, { GRANT_START: 10_000n }, 10), week(1, { GRANT_START: 2_000n }, 12), week(2, { PURCHASE: -3_000n }, 5)]);
    expect(r.weeks.map((w) => w.inflating)).toEqual([false, false, false]);
    expect(r.advice).toMatch(/no faster/);
  });

  it("flags Salt piling up while nobody plays, counts unknown kinds as other, and starts from an earlier supply", () => {
    const r = economyReport([week(0, {}, 4), week(1, { OWNER_REWARD: 100n, SOMETHING_NEW: 5n }, 0)], { startingSupply: 1_000n });
    expect(r.weeks[1]).toMatchObject({ supply: 1_105n, inflating: true, perActive: null });
    expect(r.weeks[1]!.flows.other).toBe(5n);
    expect(r.advice).toMatch(/One week can be noise/);
    expect(economyReport([]).advice).toMatch(/No Salt has moved/);
  });

  it("finds a week's Monday in UTC", () => {
    expect(weekStart(new Date("2026-11-16T23:59:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStart(new Date("2026-11-22T12:00:00Z")).toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});
