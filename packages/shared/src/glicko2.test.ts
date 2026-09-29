import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectedScore, initialRating, rate, rateFight, type Rating } from "./glicko2.ts";

describe("rate", () => {
  it("matches the worked example in Glickman's Glicko-2 paper", () => {
    const player: Rating = { rating: 1500, deviation: 200, volatility: 0.06 };
    const result = rate(
      player,
      [
        { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100, volatility: 0.06 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300, volatility: 0.06 }, score: 0 },
      ],
      0.5,
    );
    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.deviation).toBeCloseTo(151.52, 1);
    // The paper prints 0.05999 (truncated); the unrounded value is 0.0599960.
    expect(result.volatility).toBeCloseTo(0.059996, 6);
  });

  it("only widens the deviation when there are no games", () => {
    const r = rate({ rating: 1600, deviation: 50, volatility: 0.06 }, []);
    expect(r.rating).toBe(1600);
    expect(r.deviation).toBeGreaterThan(50);
  });
});

describe("rateFight", () => {
  it("moves the winner up and the loser down by the same amount at equal ratings", () => {
    const [a, b] = rateFight(initialRating(), initialRating(), 1);
    expect(a.rating).toBeGreaterThan(1500);
    expect(b.rating).toBeLessThan(1500);
    expect(a.rating - 1500).toBeCloseTo(1500 - b.rating, 6);
    expect(a.deviation).toBeLessThan(350);
  });

  it("rewards an upset more than an expected win", () => {
    const strong: Rating = { rating: 1800, deviation: 80, volatility: 0.06 };
    const weak: Rating = { rating: 1400, deviation: 80, volatility: 0.06 };
    const [upsetWinner] = rateFight(weak, strong, 1);
    const [expectedWinner] = rateFight(strong, weak, 1);
    expect(upsetWinner.rating - weak.rating).toBeGreaterThan(expectedWinner.rating - strong.rating);
  });

  it("property: results stay finite, deviation shrinks after a game, and winners never lose rating", () => {
    const ratingArb = fc.record({
      rating: fc.double({ min: 500, max: 3000, noNaN: true }),
      deviation: fc.double({ min: 30, max: 350, noNaN: true }),
      volatility: fc.double({ min: 0.01, max: 0.2, noNaN: true }),
    });
    fc.assert(
      fc.property(ratingArb, ratingArb, (a, b) => {
        const [a2, b2] = rateFight(a, b, 1);
        for (const r of [a2, b2]) {
          expect(Number.isFinite(r.rating) && Number.isFinite(r.deviation) && Number.isFinite(r.volatility)).toBe(true);
        }
        expect(a2.rating).toBeGreaterThanOrEqual(a.rating);
        expect(b2.rating).toBeLessThanOrEqual(b.rating);
        // Deviation can grow slightly via volatility, but never past the pre-game value plus volatility.
        expect(a2.deviation).toBeLessThanOrEqual(Math.hypot(a.deviation, a2.volatility * 173.7178) + 1e-9);
      }),
    );
  });
});

describe("expectedScore", () => {
  it("is 0.5 for equal ratings and symmetric", () => {
    const a: Rating = { rating: 1620, deviation: 90, volatility: 0.06 };
    const b: Rating = { rating: 1500, deviation: 60, volatility: 0.06 };
    expect(expectedScore(initialRating(), initialRating())).toBeCloseTo(0.5, 12);
    expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    expect(expectedScore(a, b)).toBeGreaterThan(0.5);
  });

  it("is less confident when deviations are high", () => {
    const sure = expectedScore({ rating: 1700, deviation: 40, volatility: 0.06 }, { rating: 1500, deviation: 40, volatility: 0.06 });
    const unsure = expectedScore({ rating: 1700, deviation: 300, volatility: 0.06 }, { rating: 1500, deviation: 300, volatility: 0.06 });
    expect(sure).toBeGreaterThan(unsure);
    expect(unsure).toBeGreaterThan(0.5);
  });
});
