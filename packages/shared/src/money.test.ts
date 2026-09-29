import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BP_SCALE, MoneyError, parseSalt, payoutFor } from "./money.ts";

describe("parseSalt", () => {
  it("accepts integers in every form", () => {
    expect(parseSalt("400")).toBe(400n);
    expect(parseSalt(" -5 ")).toBe(-5n);
    expect(parseSalt(12)).toBe(12n);
    expect(parseSalt(7n)).toBe(7n);
  });

  it.each(["1.5", "1e3", "", "abc", "0x10"])("rejects %j", (v) => {
    expect(() => parseSalt(v)).toThrow(MoneyError);
  });

  it("rejects fractional and unsafe numbers", () => {
    expect(() => parseSalt(1.5)).toThrow(MoneyError);
    expect(() => parseSalt(2 ** 60)).toThrow(MoneyError);
  });
});

describe("payoutFor", () => {
  it("rounds down", () => {
    // 3 × 1.9999x = 5.9997 → 5
    expect(payoutFor(3n, 19_999n, 1_000n)).toBe(5n);
  });

  it("applies the cap", () => {
    expect(payoutFor(1_000n, 50_000n, 2_000n)).toBe(2_000n);
  });

  it("refuses multipliers below 1.00x", () => {
    expect(() => payoutFor(10n, 9_999n, 1_000n)).toThrow(MoneyError);
  });

  it("property: stake <= payout <= cap and payout never exceeds the exact product", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000n }),
        fc.bigInt({ min: BP_SCALE, max: 250_000n }),
        fc.bigInt({ min: 1n, max: 10_000_000n }),
        (stake, bp, cap) => {
          fc.pre(stake <= cap);
          const p = payoutFor(stake, bp, cap);
          expect(p).toBeGreaterThanOrEqual(stake);
          expect(p).toBeLessThanOrEqual(cap);
          expect(p * BP_SCALE).toBeLessThanOrEqual(stake * bp);
        },
      ),
    );
  });
});
