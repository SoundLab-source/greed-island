import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_STATS } from "./character.ts";
import {
  DEFAULT_UPGRADES,
  effectiveStats,
  maxLevel,
  SIDEGRADES,
  totalCostToMax,
  UPGRADE_STATS,
  upgradeCost,
  widenedDeviation,
  ZERO_LEVELS,
  type Levels,
} from "./upgrades.ts";

describe("upgrade costs", () => {
  it("grow 1.6x per level, rounded down", () => {
    expect([0, 1, 2, 3, 4].map((l) => upgradeCost("life", l))).toEqual([150n, 240n, 384n, 614n, 982n]);
    expect(() => upgradeCost("life", 5)).toThrow(RangeError);
  });

  it("add up to about 10,600 Salt to max everything (docs/PHASE2.md)", () => {
    const total = UPGRADE_STATS.reduce((n, s) => n + totalCostToMax(s), 0n);
    expect(total).toBeGreaterThan(10_000n);
    expect(total).toBeLessThan(11_000n);
  });
});

describe("effectiveStats", () => {
  it("is neutral at level 0 with no sidegrade", () => {
    expect(effectiveStats(ZERO_LEVELS, null)).toEqual(DEFAULT_STATS);
  });

  it("reaches the caps at max level, with diminishing gains", () => {
    const max: Levels = { life: 5, attack: 5, defense: 5, power: 5 };
    expect(effectiveStats(max, null)).toEqual({ lifePct: 120, attackPct: 115, defensePct: 115, startPower: 1000 });
    const gains = [1, 2, 3, 4, 5].map((l) => effectiveStats({ ...ZERO_LEVELS, attack: l }, null).attackPct - effectiveStats({ ...ZERO_LEVELS, attack: l - 1 }, null).attackPct);
    expect(gains).toEqual([5, 4, 3, 2, 1]);
  });

  it("applies sidegrades: bonuses past the cap, penalties down to the floor", () => {
    const max: Levels = { life: 5, attack: 5, defense: 5, power: 5 };
    expect(effectiveStats(max, "BRUISER")).toMatchObject({ lifePct: 130, startPower: 700 });
    expect(effectiveStats(ZERO_LEVELS, "GLASS_CANNON")).toMatchObject({ attackPct: 108, lifePct: 92 });
    expect(effectiveStats(ZERO_LEVELS, "BRUISER").startPower).toBe(0); // floor
    expect(effectiveStats(ZERO_LEVELS, "IRON_WALL")).toMatchObject({ defensePct: 108, attackPct: 95 });
  });

  it("rejects impossible levels", () => {
    expect(() => effectiveStats({ ...ZERO_LEVELS, life: 6 }, null)).toThrow(RangeError);
    expect(() => effectiveStats({ ...ZERO_LEVELS, life: -1 }, null)).toThrow(RangeError);
  });

  it("property: stats stay within floors and cap-plus-bonus, and more levels never lower a stat", () => {
    const level = fc.integer({ min: 0, max: 5 });
    fc.assert(
      fc.property(fc.record({ life: level, attack: level, defense: level, power: level }), fc.constantFrom(null, ...SIDEGRADES), (levels, side) => {
        const s = effectiveStats(levels, side);
        expect(s.lifePct).toBeGreaterThanOrEqual(80);
        expect(s.attackPct).toBeGreaterThanOrEqual(85);
        expect(s.defensePct).toBeGreaterThanOrEqual(85);
        expect(s.startPower).toBeGreaterThanOrEqual(0);
        expect(s.lifePct).toBeLessThanOrEqual(130);
        expect(s.attackPct).toBeLessThanOrEqual(123);
        for (const stat of UPGRADE_STATS) {
          if (levels[stat] < maxLevel(stat)) {
            const up = effectiveStats({ ...levels, [stat]: levels[stat] + 1 }, side);
            expect(Object.values(up).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(Object.values(s).reduce((a, b) => a + b, 0));
          }
        }
      }),
    );
  });
});

describe("widenedDeviation", () => {
  it("adds 30 and never passes 350", () => {
    expect(widenedDeviation(80)).toBe(110);
    expect(widenedDeviation(340)).toBe(350);
    expect(DEFAULT_UPGRADES.deviationWiden).toBe(30);
  });
});
