import type { EngineOutcome, WinnerSide } from "@greed-island/shared";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mirrors, roundRobin, type PlannedFight } from "./plan.ts";
import { formatSides, formatSummary } from "./report.ts";
import { runSeries, type FightResult } from "./series.ts";
import { DEFAULT_TARGETS, summarize, summarizeSides, verdict, wilson, winRate } from "./stats.ts";

const IDS = ["a", "b", "c", "d", "e"];
const STAGES = ["s1", "s2", "s3"];

describe("roundRobin", () => {
  it("has every pair meet the asked number of times, half on each side", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 7 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 4 }), (fighters, perPair, stageCount) => {
        const ids = Array.from({ length: fighters }, (_, i) => `f${i}`);
        const stages = Array.from({ length: stageCount }, (_, i) => `s${i}`);
        const plan = roundRobin(ids, perPair, stages);
        expect(plan).toHaveLength(((fighters * (fighters - 1)) / 2) * perPair);
        expect(plan.map((f) => f.index)).toEqual(plan.map((_, i) => i));
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const asP1 = plan.filter((f) => f.p1 === ids[i] && f.p2 === ids[j]).length;
            const asP2 = plan.filter((f) => f.p1 === ids[j] && f.p2 === ids[i]).length;
            expect(asP1 + asP2).toBe(perPair);
            expect(asP1 - asP2).toBe(perPair % 2); // the odd fight out goes to the first-listed fighter
          }
        }
        expect(plan.every((f) => f.p1 !== f.p2 && stages.includes(f.stageId))).toBe(true);
      }),
    );
  });

  it("plays both sides of a pairing on the same stage, then moves to the next stage", () => {
    const plan = roundRobin(["a", "b"], 6, STAGES);
    expect(plan.map((f) => `${f.p1}${f.p2}@${f.stageId}`)).toEqual(["ab@s1", "ba@s1", "ab@s2", "ba@s2", "ab@s3", "ba@s3"]);
  });

  it("goes pass by pass, so stopping early has treated every pair alike", () => {
    const plan = roundRobin(IDS, 4, STAGES);
    const firstPass = plan.slice(0, 10).map((f) => [f.p1, f.p2].sort().join(""));
    expect(new Set(firstPass).size).toBe(10);
  });

  it("can keep only one fighter's pairings", () => {
    const plan = roundRobin(IDS, 3, STAGES, { only: "c" });
    expect(plan).toHaveLength(4 * 3);
    expect(plan.every((f) => f.p1 === "c" || f.p2 === "c")).toBe(true);
  });

  it("refuses plans that make no sense", () => {
    expect(() => roundRobin(["a"], 1, STAGES)).toThrow(/at least two/);
    expect(() => roundRobin(["a", "a"], 1, STAGES)).toThrow(/different/);
    expect(() => roundRobin(IDS, 0, STAGES)).toThrow(/whole number/);
    expect(() => roundRobin(IDS, 1.5, STAGES)).toThrow(/whole number/);
    expect(() => roundRobin(IDS, 1, [])).toThrow(/stage/);
    expect(() => roundRobin(IDS, 1, STAGES, { only: "z" })).toThrow(/not one of/);
  });
});

const finished = (winnerSide: WinnerSide, rounds: (1 | 2)[] = winnerSide === 0 ? [1, 2] : [winnerSide, winnerSide]): EngineOutcome => ({
  kind: "finished",
  winnerSide,
  rounds: rounds.map((w, i) => ({ type: "round_end", round: i + 1, winnerSide: w, reason: "ko" })),
});
const result = (p1: string, p2: string, outcome: EngineOutcome, index = 0): FightResult => ({ fight: { index, p1, p2, stageId: "s1" }, outcome, detail: null });

describe("runSeries", () => {
  it("returns results in plan order and never runs more than `parallel` at once", async () => {
    const plan = roundRobin(IDS, 3, STAGES);
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    const results = await runSeries(
      plan,
      async (fight) => {
        peak = Math.max(peak, ++running);
        await new Promise((r) => setTimeout(r, (fight.index * 7) % 5));
        running--;
        return { outcome: finished(1), detail: null };
      },
      { parallel: 4, onResult: (_r, done, total) => (seen.push(done), expect(total).toBe(plan.length)) },
    );
    expect(results.map((r) => r.fight.index)).toEqual(plan.map((f) => f.index));
    expect(peak).toBe(4);
    expect(seen).toEqual(plan.map((_, i) => i + 1));
  });

  it("starts no new fights after an abort", async () => {
    const plan = roundRobin(IDS, 4, STAGES);
    const abort = new AbortController();
    let started = 0;
    const results = await runSeries(
      plan,
      async () => {
        if (++started === 5) abort.abort();
        return { outcome: finished(2), detail: null };
      },
      { parallel: 2, signal: abort.signal },
    );
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it("refuses a bad parallel count", async () => {
    await expect(runSeries([], async () => ({ outcome: finished(1), detail: null }), { parallel: 0 })).rejects.toThrow(/parallel/);
  });
});

describe("wilson and verdict", () => {
  it("matches known Wilson intervals", () => {
    const { low, high } = wilson(0.5, 100);
    expect(low).toBeCloseTo(0.4038, 3);
    expect(high).toBeCloseTo(0.5962, 3);
    expect(wilson(1, 10).high).toBeCloseTo(1, 9);
    expect(wilson(1, 10).low).toBeCloseTo(0.7225, 3);
    expect(wilson(0.5, 0)).toEqual({ low: 0, high: 1 });
  });

  it("always brackets the observed share and narrows with more fights", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2000 }), fc.double({ min: 0, max: 1, noNaN: true }), (n, share) => {
        const p = Math.round(share * n) / n;
        const a = wilson(p, n);
        const b = wilson(p, n * 4);
        expect(a.low).toBeLessThanOrEqual(p + 1e-12);
        expect(a.high).toBeGreaterThanOrEqual(p - 1e-12);
        expect(b.high - b.low).toBeLessThan(a.high - a.low);
      }),
    );
  });

  it("calls a fighter ok inside the band, leaning when unsure, too strong or weak when sure", () => {
    expect(verdict(0.55, 0.45, 0.65, 0.05)).toBe("ok");
    expect(verdict(0.45, 0.35, 0.55, 0.05)).toBe("ok");
    expect(verdict(0.6, 0.48, 0.71, 0.05)).toBe("leaning strong");
    expect(verdict(0.6, 0.53, 0.67, 0.05)).toBe("too strong");
    expect(verdict(0.4, 0.29, 0.52, 0.05)).toBe("leaning weak");
    expect(verdict(0.4, 0.33, 0.47, 0.05)).toBe("too weak");
  });
});

describe("summarize", () => {
  it("counts wins by side, draws as half and leaves failed fights out", () => {
    const s = summarize(
      [
        result("a", "b", finished(1)),
        result("b", "a", finished(1, [1, 2, 1])),
        result("a", "b", finished(0)),
        result("a", "c", { kind: "engine_crash", detail: "boom" }),
        result("c", "a", { kind: "engine_timeout", detail: "slow" }),
      ],
      ["a", "b", "c"],
    );
    expect(s.fights).toBe(3);
    expect(s.failed).toHaveLength(2);
    const a = s.fighters.find((f) => f.id === "a")!;
    const b = s.fighters.find((f) => f.id === "b")!;
    expect(a).toMatchObject({ fights: 3, wins: 1, losses: 1, draws: 1, winRate: 0.5, roundsWon: 4, roundsLost: 3 });
    expect(b).toMatchObject({ fights: 3, wins: 1, losses: 1, draws: 1, winRate: 0.5, roundsWon: 3, roundsLost: 4 });
    expect(s.fighters.find((f) => f.id === "c")).toMatchObject({ fights: 0, verdict: "ok" });
    expect(s.matchups["a"]!["b"]).toEqual({ fights: 3, wins: 1, losses: 1, draws: 1 });
    expect(s.matchups["b"]!["a"]).toEqual({ fights: 3, wins: 1, losses: 1, draws: 1 });
    expect(s.p1).toEqual({ fights: 3, wins: 2, losses: 0, draws: 1 });
    expect(s.rounds).toBe(7);
    expect(s.avgTicks).toBeNull();
  });

  it("keeps the books straight for any set of results", () => {
    const outcome = fc.constantFrom<EngineOutcome>(finished(1), finished(2), finished(0), finished(1, [2, 1, 1]), { kind: "engine_crash", detail: "x" });
    const pair = fc.tuple(fc.constantFrom(...IDS), fc.constantFrom(...IDS)).filter(([x, y]) => x !== y);
    fc.assert(
      fc.property(fc.array(fc.tuple(pair, outcome), { maxLength: 200 }), (rows) => {
        const s = summarize(rows.map(([[p1, p2], o], i) => result(p1, p2, o, i)), IDS);
        const sum = (k: "fights" | "wins" | "losses" | "draws") => s.fighters.reduce((n, f) => n + f[k], 0);
        expect(s.fights + s.failed.length).toBe(rows.length);
        expect(sum("fights")).toBe(2 * s.fights);
        expect(sum("wins")).toBe(sum("losses"));
        expect(sum("wins") + sum("draws") / 2).toBe(s.fights);
        for (const f of s.fighters) {
          expect(f.wins + f.losses + f.draws).toBe(f.fights);
          expect(f.low).toBeLessThanOrEqual(f.winRate + 1e-12);
          expect(f.high).toBeGreaterThanOrEqual(f.winRate - 1e-12);
        }
        for (const x of IDS) for (const y of IDS) if (x !== y) expect(winRate(s.matchups[x]![y]!) + winRate(s.matchups[y]![x]!)).toBeCloseTo(1, 9);
        expect(s.fighters.map((f) => f.winRate)).toEqual([...s.fighters.map((f) => f.winRate)].sort((x, y) => y - x));
      }),
    );
  });

  it("uses round detail for fight length and how much life winners keep", () => {
    const withDetail: FightResult = {
      ...result("a", "b", finished(1)),
      detail: { ticks: 6000, rounds: [{ winnerSide: 1, ticks: 3000, lifeLeft: { 1: 0.5, 2: 0 }, byTime: false }, { winnerSide: 1, ticks: 3000, lifeLeft: { 1: 0.3, 2: 0 }, byTime: false }] },
    };
    const s = summarize([withDetail], ["a", "b"]);
    expect(s.avgTicks).toBe(6000);
    expect(s.fighters.find((f) => f.id === "a")!.lifeLeftInWins).toBeCloseTo(0.4, 9);
    expect(s.fighters.find((f) => f.id === "b")!.lifeLeftInWins).toBeNull();
  });

  it("finds lopsided matchups and says when everyone is inside the band", () => {
    const even = roundRobin(["a", "b"], 40, ["s1"]).map((f) => result(f.p1, f.p2, finished(f.index % 4 < 2 ? 1 : 2), f.index));
    const balanced = summarize(even, ["a", "b"]);
    expect(balanced).toMatchObject({ balanced: true, spread: 0, lopsided: [] });

    const plan: PlannedFight[] = roundRobin(["a", "b"], 40, ["s1"]);
    const lopsided = summarize(plan.map((f) => result(f.p1, f.p2, finished(f.p1 === "a" ? 1 : 2), f.index)), ["a", "b"]);
    expect(lopsided.balanced).toBe(false);
    expect(lopsided.fighters.map((f) => [f.id, f.verdict])).toEqual([["a", "too strong"], ["b", "too weak"]]);
    expect(lopsided.lopsided).toEqual([{ winner: "a", loser: "b", winRate: 1, fights: 40 }]);
    expect(lopsided.spread).toBe(1);
    expect(lopsided.p1).toMatchObject({ wins: 20, losses: 20 });
    expect(lopsided.targets).toEqual(DEFAULT_TARGETS);
  });
});

describe("formatSummary", () => {
  const plan = roundRobin(["a", "b", "c"], 20, ["s1"]);
  const results = plan.map((f) => result(f.p1, f.p2, finished([f.p1, f.p2].includes("a") ? (f.p1 === "a" ? 1 : 2) : f.index % 4 < 2 ? 1 : 2), f.index));

  it("prints the table, the matchups and the verdict with the fighters' names", () => {
    const text = formatSummary(summarize(results, ["a", "b", "c"]), { a: "Alpha", b: "Bravo" });
    expect(text).toContain("60 fights finished.");
    expect(text).toMatch(/Alpha\s+40\s+40\s+0\s+0\s+100\.0%.*TOO STRONG/);
    expect(text).toMatch(/Bravo\s+40\s+10\s+30\s+0\s+25\.0%.*TOO WEAK/);
    expect(text).toContain("Lopsided matchups (outside 35%–65%): Alpha beats Bravo 100% of 20; Alpha beats c 100% of 20.");
    expect(text).toContain("Gap between strongest and weakest: 75.0 points (Alpha 100.0%, c 25.0%). Target: everyone within 45%–55%.");
    expect(text).toContain("Not balanced yet: Alpha is too strong, Bravo is too weak, c is too weak.");
  });

  it("doesn't judge matchups on a handful of fights, and reports failures", () => {
    const few = [...results.slice(0, 6), result("a", "b", { kind: "engine_crash", detail: "boom" })];
    const text = formatSummary(summarize(few, ["a", "b", "c"]));
    expect(text).toContain("6 fights finished, 1 FAILED");
    expect(text).toContain("Too few fights per pairing to judge matchups");
  });
});

describe("side check (mirror fights)", () => {
  it("plans each fighter against itself, rotating stages", () => {
    const plan = mirrors(["a", "b"], 3, STAGES);
    expect(plan.map((f) => `${f.p1}${f.p2}@${f.stageId}`)).toEqual(["aa@s1", "bb@s2", "aa@s2", "bb@s3", "aa@s3", "bb@s1"]);
    expect(plan.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(() => mirrors([], 1, STAGES)).toThrow(/at least one fighter/);
    expect(() => mirrors(["a"], 0, STAGES)).toThrow(/whole number/);
    expect(() => mirrors(["a"], 1, [])).toThrow(/stage/);
  });

  it("counts wins for the player 1 side per fighter and overall", () => {
    const plan = mirrors(["a", "b"], 100, ["s1"]);
    // a: player 1 wins half; b: player 1 wins a quarter.
    const results = plan.map((f) => result(f.p1, f.p2, finished(f.p1 === "a" ? (f.index % 4 < 2 ? 1 : 2) : f.index % 8 < 2 ? 1 : 2), f.index));
    const s = summarizeSides([...results, result("a", "a", { kind: "engine_crash", detail: "boom" })], ["a", "b"]);
    expect(s.failed).toHaveLength(1);
    expect(s.fighters.map((f) => [f.id, f.fights, f.wins, f.losses])).toEqual([["a", 100, 50, 50], ["b", 100, 25, 75]]);
    expect(s.overall).toMatchObject({ fights: 200, wins: 75, losses: 125, winRate: 0.375 });
    expect(s.fair).toBe(false);
    const text = formatSides(s, { a: "Alpha" });
    expect(text).toContain("200 mirror fights finished, 1 FAILED");
    expect(text).toMatch(/Alpha\s+100\s+50\s+50\s+0\s+50\.0%/);
    expect(text).toContain("The player 2 side has an edge");

    const even = summarizeSides(results.filter((r) => r.fight.p1 === "a"), ["a"]);
    expect(even.fair).toBe(true);
    expect(formatSides(even)).toContain("The sides look even");
  });
});
