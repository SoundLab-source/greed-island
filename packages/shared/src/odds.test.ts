import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_ECONOMY } from "./config.ts";
import type { Rating } from "./glicko2.ts";
import { LedgerRuleError, planPlaceBet, planSettlement } from "./ledger-plan.ts";
import { BP_SCALE } from "./money.ts";
import {
  clampChance,
  crowdStats,
  crowdWeightBp,
  DEFAULT_ODDS,
  formatMultiplier,
  liveOdds,
  lockOdds,
  modelChanceBp,
  multiplierBp,
  OddsError,
  validateOdds,
  type OddsConfig,
  type Stake,
} from "./odds.ts";

const r = (rating: number, deviation = 60): Rating => ({ rating, deviation, volatility: 0.06 });
const ratingArb = fc.record({
  rating: fc.double({ min: 800, max: 2600, noNaN: true }),
  deviation: fc.double({ min: 30, max: 350, noNaN: true }),
  volatility: fc.constant(0.06),
});

describe("multiplierBp", () => {
  it("matches the DESIGN §6 table (5% margin, rounded down)", () => {
    expect(formatMultiplier(multiplierBp(8_000n, DEFAULT_ODDS))).toBe("1.18x"); // 1.1875x
    expect(formatMultiplier(multiplierBp(5_000n, DEFAULT_ODDS))).toBe("1.90x");
    expect(formatMultiplier(multiplierBp(2_000n, DEFAULT_ODDS))).toBe("4.75x");
  });

  it("is exactly 1.00x at the 95% clamp", () => {
    expect(multiplierBp(9_500n, DEFAULT_ODDS)).toBe(10_000n);
  });

  it("never goes below the configured floor", () => {
    expect(multiplierBp(9_500n, { ...DEFAULT_ODDS, marginBp: 1_000n })).toBe(10_000n);
  });

  it("rejects impossible chances", () => {
    expect(() => multiplierBp(0n, DEFAULT_ODDS)).toThrow(OddsError);
    expect(() => multiplierBp(10_001n, DEFAULT_ODDS)).toThrow(OddsError);
  });

  it("property: the house always keeps at least the margin, unless the 1.00x floor applies", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 500n, max: 9_500n }), fc.bigInt({ min: 0n, max: 2_000n }), (p, margin) => {
        const cfg = { ...DEFAULT_ODDS, marginBp: margin };
        const m = multiplierBp(p, cfg);
        expect(m).toBeGreaterThanOrEqual(10_000n);
        if (m > cfg.minMultiplierBp) {
          // Expected return per Salt at the true chance p: p × m ≤ 1 − margin.
          expect(p * m).toBeLessThanOrEqual(BP_SCALE * (BP_SCALE - margin));
        }
      }),
    );
  });
});

describe("clampChance", () => {
  it("clamps to 5–95% and keeps the pair summing to 100%", () => {
    expect(clampChance(9_900n, DEFAULT_ODDS)).toEqual([9_500n, 500n]);
    expect(clampChance(100n, DEFAULT_ODDS)).toEqual([500n, 9_500n]);
    expect(clampChance(6_000n, DEFAULT_ODDS)).toEqual([6_000n, 4_000n]);
  });
});

describe("modelChanceBp", () => {
  it("is 50% for equal ratings and favours the higher rating", () => {
    expect(modelChanceBp(r(1500), r(1500))).toBe(5_000n);
    expect(modelChanceBp(r(1700), r(1500))).toBeGreaterThan(5_000n);
  });

  it("property: swapping sides mirrors the chance (±1 bp for rounding)", () => {
    fc.assert(
      fc.property(ratingArb, ratingArb, (a, b) => {
        const diff = modelChanceBp(a, b) + modelChanceBp(b, a) - BP_SCALE;
        expect(diff >= -1n && diff <= 1n).toBe(true);
      }),
    );
  });
});

describe("crowd", () => {
  const stakes: Stake[] = [
    { side: 1, amount: 50_000n }, // a whale, capped at 1000
    { side: 2, amount: 400n },
    { side: 2, amount: 600n },
  ];

  it("caps each account's contribution to the crowd chance", () => {
    const c = crowdStats(stakes, DEFAULT_ODDS);
    expect(c.pool).toEqual({ 1: 50_000n, 2: 1_000n });
    expect(c.cappedPool).toEqual({ 1: 1_000n, 2: 1_000n });
    expect(c.chanceSide1Bp).toBe(5_000n);
  });

  it("has no crowd chance when nobody bet", () => {
    expect(crowdStats([], DEFAULT_ODDS).chanceSide1Bp).toBeNull();
  });

  it("w = pool / (pool + K) scaled by the max weight", () => {
    const cfg = { ...DEFAULT_ODDS, crowdMaxWeightBp: 10_000n, crowdBlendK: 1_000n };
    expect(crowdWeightBp(1_000n, cfg)).toBe(5_000n);
    expect(crowdWeightBp(3_000n, cfg)).toBe(7_500n);
    expect(crowdWeightBp(0n, cfg)).toBe(0n);
    expect(crowdWeightBp(1_000_000n, DEFAULT_ODDS)).toBe(0n); // disabled in phase 1
  });
});

describe("lockOdds", () => {
  const favourite = r(1700);
  const underdog = r(1500);
  const oneSided: Stake[] = Array.from({ length: 20 }, () => ({ side: 2 as const, amount: 1_000n }));

  it("uses the model only in phase 1, but still records the crowd", () => {
    const locked = lockOdds(favourite, underdog, oneSided, DEFAULT_ODDS);
    expect(locked.blendWeightBp).toBe(0n);
    expect(locked.chanceBp).toEqual(locked.modelChanceBp);
    expect(locked.crowdChanceBp).toEqual([0n, 10_000n]);
    expect(locked.pool).toEqual({ 1: 0n, 2: 20_000n });
  });

  it("matches the live estimate when blending is off", () => {
    const live = liveOdds(favourite, underdog, DEFAULT_ODDS);
    const locked = lockOdds(favourite, underdog, oneSided, DEFAULT_ODDS);
    expect(locked.multiplierBp).toEqual(live.multiplierBp);
  });

  it("moves toward the crowd as the pool grows when blending is on", () => {
    const cfg: OddsConfig = { ...DEFAULT_ODDS, crowdMaxWeightBp: 10_000n, crowdBlendK: 10_000n };
    const small = lockOdds(favourite, underdog, oneSided.slice(0, 2), cfg);
    const big = lockOdds(favourite, underdog, oneSided, cfg);
    expect(big.blendWeightBp).toBeGreaterThan(small.blendWeightBp);
    expect(big.chanceBp[0]).toBeLessThan(small.chanceBp[0]);
    expect(big.chanceBp[0]).toBeGreaterThanOrEqual(500n); // still clamped
  });

  it("property: locked odds are clamped, complementary, and pay at least 1.00x", () => {
    const stakeArb = fc.array(fc.record({ side: fc.constantFrom<1 | 2>(1, 2), amount: fc.bigInt({ min: 1n, max: 100_000n }) }), { maxLength: 30 });
    fc.assert(
      fc.property(ratingArb, ratingArb, stakeArb, fc.bigInt({ min: 0n, max: 10_000n }), (a, b, s, weight) => {
        const locked = lockOdds(a, b, s, { ...DEFAULT_ODDS, crowdMaxWeightBp: weight });
        expect(locked.chanceBp[0] + locked.chanceBp[1]).toBe(BP_SCALE);
        for (const p of locked.chanceBp) expect(p >= 500n && p <= 9_500n).toBe(true);
        expect(locked.multiplierBp[1]).toBeGreaterThanOrEqual(10_000n);
        expect(locked.multiplierBp[2]).toBeGreaterThanOrEqual(10_000n);
      }),
    );
  });

  it("property: settling at locked odds never pays above the cap and always balances", () => {
    fc.assert(
      fc.property(ratingArb, ratingArb, fc.constantFrom<1 | 2>(1, 2), fc.array(fc.bigInt({ min: 1n, max: 5_000n }), { maxLength: 10 }), (a, b, winner, amounts) => {
        const bets = amounts.map((stake, i) => ({ betId: `b${i}`, userId: `u${i}`, side: (i % 2 === 0 ? 1 : 2) as 1 | 2, stake }));
        const locked = lockOdds(a, b, bets.map((x) => ({ side: x.side, amount: x.stake })), DEFAULT_ODDS);
        const plan = planSettlement({ fightId: "f", bets, winnerSide: winner, multiplierBp: locked.multiplierBp, maxPayout: 5_000n });
        expect(plan.postings.reduce((sum, p) => sum + p.amount, 0n)).toBe(0n);
        for (const o of plan.outcomes) expect(o.returned).toBeLessThanOrEqual(5_000n);
      }),
    );
  });
});

describe("owner bet cap", () => {
  it("caps owners' stakes on fights with their own character", () => {
    const base = { userId: "u", fightId: "f", betId: "b", side: 1 as const, available: 1_000n };
    expect(() => planPlaceBet({ ...base, stake: 101n, ownerCap: DEFAULT_ODDS.ownerBetCap }, DEFAULT_ECONOMY)).toThrow(LedgerRuleError);
    expect(planPlaceBet({ ...base, stake: 100n, ownerCap: DEFAULT_ODDS.ownerBetCap }, DEFAULT_ECONOMY)).toHaveLength(2);
    expect(planPlaceBet({ ...base, stake: 900n }, DEFAULT_ECONOMY)).toHaveLength(2);
  });
});

describe("validateOdds", () => {
  it("rejects bad settings", () => {
    expect(() => validateOdds({ ...DEFAULT_ODDS, marginBp: 10_000n })).toThrow(OddsError);
    expect(() => validateOdds({ ...DEFAULT_ODDS, minChanceBp: 5_000n })).toThrow(OddsError);
    expect(() => validateOdds({ ...DEFAULT_ODDS, minMultiplierBp: 9_999n })).toThrow(OddsError);
    expect(() => validateOdds({ ...DEFAULT_ODDS, crowdMaxWeightBp: 10_001n })).toThrow(OddsError);
  });
});
