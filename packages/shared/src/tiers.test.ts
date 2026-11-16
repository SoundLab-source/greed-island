import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BAND_TIERS, DEFAULT_TIERS, nextTier, tierForRating, validateTiers, type Tier } from "./tiers.ts";

describe("tierForRating", () => {
  it("bands ratings at the thresholds", () => {
    expect(tierForRating(1449.99)).toBe("P");
    expect(tierForRating(1450)).toBe("B");
    expect(tierForRating(1500)).toBe("B");
    expect(tierForRating(1600)).toBe("A");
    expect(tierForRating(1750)).toBe("S");
  });
});

describe("nextTier", () => {
  it("promotes as soon as the threshold is reached, even across tiers", () => {
    expect(nextTier("B", 1600)).toBe("A");
    expect(nextTier("P", 1800)).toBe("S");
  });

  it("demotes only below threshold minus hysteresis", () => {
    expect(nextTier("A", 1590)).toBe("A");
    expect(nextTier("A", 1575)).toBe("A");
    expect(nextTier("A", 1574.9)).toBe("B");
    expect(nextTier("S", 1400)).toBe("P");
  });

  it("holds the tier during placement fights, then lets the rating decide", () => {
    const cfg = { ...DEFAULT_TIERS, placementFights: 5 };
    // One lucky first win (1500 -> 1662) no longer jumps B to A, nor one loss to P.
    expect(nextTier("B", 1662, cfg, 1)).toBe("B");
    expect(nextTier("B", 1338, cfg, 1)).toBe("B");
    expect(nextTier("B", 1700, cfg, 4)).toBe("B");
    // The fifth fight ends placement.
    expect(nextTier("B", 1700, cfg, 5)).toBe("A");
    expect(nextTier("B", 1400, cfg, 5)).toBe("P");
    // Off, or without a count: as before.
    expect(nextTier("B", 1662, { ...cfg, placementFights: 0 }, 1)).toBe("A");
    expect(nextTier("B", 1662, cfg)).toBe("A");
    expect(nextTier("X", 100, cfg, 1)).toBe("X");
    expect(() => validateTiers({ ...cfg, placementFights: -1 })).toThrow();
    expect(() => validateTiers({ ...cfg, placementFights: 1.5 })).toThrow();
  });

  it("never touches X", () => {
    expect(nextTier("X", 100)).toBe("X");
    expect(nextTier("X", 3000)).toBe("X");
  });

  it("property: the tier lies between the plain band and the band within the buffer", () => {
    const idx = (t: Tier) => BAND_TIERS.indexOf(t as never);
    fc.assert(
      fc.property(fc.constantFrom<Tier>(...BAND_TIERS), fc.double({ min: 0, max: 3000, noNaN: true }), (current, rating) => {
        const next = nextTier(current, rating);
        const plain = tierForRating(rating);
        expect(idx(next)).toBeGreaterThanOrEqual(idx(plain));
        expect(idx(next)).toBeLessThanOrEqual(idx(tierForRating(rating + DEFAULT_TIERS.hysteresis)));
        if (idx(plain) > idx(current)) expect(next).toBe(plain);
      }),
    );
  });
});

describe("validateTiers", () => {
  it("rejects thresholds that don't increase", () => {
    expect(() => validateTiers({ thresholds: { B: 1500, A: 1500, S: 1700 }, hysteresis: 0, placementFights: 0 })).toThrow();
  });
});
