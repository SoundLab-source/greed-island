import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { againstCrowd, bettorStats, crowdSplit, bettorTitlesEarned, currentRun, DEFAULT_BETTORS, longestRun, rankBoard, validateBettors, type SettledBet } from "./bettors.ts";
import { loadConfig } from "./config.ts";

const cfg = DEFAULT_BETTORS;

let n = 0;
function bet(over: Partial<SettledBet> = {}): SettledBet {
  n++;
  return {
    fightNumber: n,
    currency: "SALT",
    won: true,
    stake: 20n,
    returned: 38n,
    chanceBp: 5000,
    multiplierBp: 19000,
    fighterId: "free-loot",
    fighterName: "Free Loot",
    archetype: "GRAPPLER",
    againstCrowd: false,
    ...over,
  };
}

describe("bettor titles", () => {
  const facts = { won: true, chanceBp: 5000, streak: 1, callsOnFighter: 1, contrarianWins: 0 };

  it("Called It: a right call on a side given 20% or less", () => {
    expect(bettorTitlesEarned({ ...facts, chanceBp: 2000 }, new Set(), cfg)).toEqual(["CALLED_IT"]);
    expect(bettorTitlesEarned({ ...facts, chanceBp: 2001 }, new Set(), cfg)).toEqual([]);
    expect(bettorTitlesEarned({ ...facts, won: false, chanceBp: 1000, streak: 0 }, new Set(), cfg)).toEqual([]);
  });

  it("Iron Read, Loyal and Contrarian at their bars", () => {
    expect(bettorTitlesEarned({ ...facts, streak: 10 }, new Set(), cfg)).toEqual(["IRON_READ"]);
    expect(bettorTitlesEarned({ ...facts, streak: 9 }, new Set(), cfg)).toEqual([]);
    // Loyal counts calls, right or wrong.
    expect(bettorTitlesEarned({ ...facts, won: false, streak: 0, callsOnFighter: 50 }, new Set(), cfg)).toEqual(["LOYAL"]);
    expect(bettorTitlesEarned({ ...facts, contrarianWins: 20 }, new Set(), cfg)).toEqual(["CONTRARIAN"]);
  });

  it("only once each", () => {
    const all = { won: true, chanceBp: 500, streak: 12, callsOnFighter: 60, contrarianWins: 25 };
    expect(bettorTitlesEarned(all, new Set(), cfg)).toEqual(["CALLED_IT", "IRON_READ", "LOYAL", "CONTRARIAN"]);
    expect(bettorTitlesEarned(all, new Set(["CALLED_IT", "LOYAL"]), cfg)).toEqual(["IRON_READ", "CONTRARIAN"]);
  });

  it("against the crowd means less of the players' Salt on your side", () => {
    expect(againstCrowd({ own: 50n, other: 200n })).toBe(true);
    expect(crowdSplit({ 1: 720n, 2: 280n })).toEqual({ pct: { 1: 72, 2: 28 }, against: 2 });
    expect(crowdSplit({ 1: 1n, 2: 2n })).toEqual({ pct: { 1: 33, 2: 67 }, against: 1 });
    expect(crowdSplit({ 1: 1n, 2: 1n })).toEqual({ pct: { 1: 50, 2: 50 }, against: null });
    expect(crowdSplit({ 1: 0n, 2: 500n })).toEqual({ pct: { 1: 0, 2: 100 }, against: 1 });
    expect(crowdSplit({ 1: 0n, 2: 0n })).toBeNull();
    expect(againstCrowd({ own: 200n, other: 200n })).toBe(false);
    expect(againstCrowd({ own: 50n, other: 0n })).toBe(false);
  });
});

describe("runs", () => {
  it("longest and current runs of right calls", () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun([true, true, false, true, true, true, false])).toBe(3);
    expect(currentRun([true, false, true, true])).toBe(2);
    expect(currentRun([true, true, false])).toBe(0);
  });

  it("match counting by hand (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 60 }), (xs) => {
        const runs = xs.map((x) => (x ? "1" : "0")).join("").split("0").map((r) => r.length);
        expect(longestRun(xs)).toBe(Math.max(0, ...runs));
        expect(currentRun(xs)).toBe(runs.at(-1) ?? 0);
        expect(currentRun(xs)).toBeLessThanOrEqual(longestRun(xs));
      }),
    );
  });
});

describe("a bettor's numbers", () => {
  it("starts empty", () => {
    const s = bettorStats([], cfg);
    expect(s).toMatchObject({ calls: 0, rightCalls: 0, winRate: null, streak: { current: 0, best: 0 }, upsetsCalled: 0, bestUpset: null, saltProfit: 0n, biggestPayout: null, favourite: null, byStyle: [] });
    expect(s.progress).toEqual({ CALLED_IT: { have: 0, need: 1 }, IRON_READ: { have: 0, need: 10 }, LOYAL: { have: 0, need: 50 }, CONTRARIAN: { have: 0, need: 20 } });
  });

  it("counts calls, upsets, profit, payouts, the favourite and styles", () => {
    const bets = [
      bet({ fightNumber: 1, won: true, stake: 100n, returned: 190n, archetype: "GRAPPLER" }),
      bet({ fightNumber: 2, won: false, stake: 50n, returned: 0n, fighterId: "batty", fighterName: "Batty", archetype: "RUSHDOWN" }),
      // A long shot called right, against the crowd.
      bet({ fightNumber: 3, won: true, stake: 20n, returned: 95n, chanceBp: 1900, multiplierBp: 47500, fighterId: "batty", fighterName: "Batty", archetype: "RUSHDOWN", againstCrowd: true }),
      // Too small to count as a call, but its Salt counts.
      bet({ fightNumber: 4, won: true, stake: 5n, returned: 9n }),
      // T-Salt: a call, but not profit.
      bet({ fightNumber: 5, won: true, stake: 300n, returned: 570n, currency: "TSALT", chanceBp: 2800, fighterId: "batty", fighterName: "Batty", archetype: "RUSHDOWN" }),
    ];
    const s = bettorStats(bets, cfg);
    expect(s).toMatchObject({ calls: 4, rightCalls: 3, winRate: 75, streak: { current: 2, best: 2 }, upsetsCalled: 2 });
    expect(s.bestUpset).toEqual({ fightNumber: 3, fighterName: "Batty", chancePct: 19, multiplierBp: 47500 });
    expect(s.saltProfit).toBe(90n - 50n + 75n + 4n);
    expect(s.biggestPayout).toEqual({ fightNumber: 1, fighterName: "Free Loot", amount: 190n });
    expect(s.favourite).toEqual({ fighterId: "batty", fighterName: "Batty", calls: 3, rightCalls: 2 });
    expect(s.byStyle).toEqual([
      { archetype: "RUSHDOWN", calls: 3, rightCalls: 2, saltProfit: -50n + 75n },
      { archetype: "GRAPPLER", calls: 1, rightCalls: 1, saltProfit: 90n + 4n },
    ]);
    expect(s.progress).toEqual({ CALLED_IT: { have: 1, need: 1 }, IRON_READ: { have: 2, need: 10 }, LOYAL: { have: 3, need: 50 }, CONTRARIAN: { have: 1, need: 20 } });
  });

  it("has no best upset when every right call was a favourite", () => {
    expect(bettorStats([bet({ chanceBp: 6000 })], cfg).bestUpset).toBeNull();
  });
});

describe("boards and settings", () => {
  it("rank best first; ties share a rank, in a stable order", () => {
    const rows = [{ id: "b", v: 3 }, { id: "a", v: 3 }, { id: "c", v: 5 }, { id: "d", v: 1 }];
    expect(rankBoard(rows, (x, y) => y.v - x.v, (r) => r.id).map((r) => [r.rank, r.id])).toEqual([[1, "c"], [2, "a"], [2, "b"], [4, "d"]]);
  });

  it("load from the environment and refuse nonsense", () => {
    const c = loadConfig({ GI_MIN_CALL_STAKE: "25", GI_CALLED_IT_CHANCE_PCT: "12.5", GI_UPSET_CHANCE_PCT: "25", GI_WIN_RATE_MIN_CALLS: "30" }).bettors;
    expect(c).toMatchObject({ minCallStake: 25n, calledItChanceBp: 1250, upsetChanceBp: 2500, winRateMinCalls: 30, ironReadStreak: 10 });
    expect(loadConfig({}).bettors).toEqual(DEFAULT_BETTORS);
    expect(() => validateBettors({ ...cfg, calledItChanceBp: 6000 })).toThrow(/underdog/);
    expect(() => validateBettors({ ...cfg, minCallStake: 0n })).toThrow();
    expect(() => validateBettors({ ...cfg, boardSize: 0 })).toThrow();
  });
});
