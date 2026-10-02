import { describe, expect, it } from "vitest";
import { balanceResult, checksPassed, DEFAULT_CHECKS, tallyRate, validateChecks, type CheckResults } from "./checks.ts";

const reference = { fighterId: "gi-tpl-heavy", name: "Bruiser", fights: 200, wins: 100, draws: 0 };

describe("balanceResult", () => {
  it("counts draws as half a win", () => {
    expect(tallyRate({ fights: 10, wins: 4, draws: 2 })).toBe(0.5);
    expect(tallyRate({ fights: 0, wins: 0, draws: 0 })).toBe(0);
  });

  it("passes within the tolerance, on either side, and exactly at it", () => {
    const at = (wins: number) => balanceResult({ fights: 200, wins, draws: 0 }, reference, ["Sage"], 0.1);
    expect(at(100)).toMatchObject({ ok: true, difference: 0, opponents: ["Sage"], tolerance: 0.1 });
    expect(at(120).ok).toBe(true);
    expect(at(80).ok).toBe(true);
    expect(at(121).ok).toBe(false);
    expect(at(79).ok).toBe(false);
    expect(at(121).difference).toBeCloseTo(0.105, 9);
  });

  it("passes a fighter that plays the reference character itself", () => {
    expect(balanceResult(null, reference, ["Sage"], 0.1)).toMatchObject({ ok: true, fighter: null, difference: null, reference: { winRate: 0.5, name: "Bruiser" } });
  });
});

describe("checksPassed", () => {
  const ok: CheckResults = {
    checkedAs: { fighterId: "gi-tpl-heavy", name: "Bruiser", ownArt: false },
    smoke: { ok: true, detail: "fine" },
    template: { ok: true, findings: [] },
    balance: balanceResult(null, reference, ["Sage"], 0.1),
  };

  it("needs all three checks to have run and passed", () => {
    expect(checksPassed(ok)).toBe(true);
    expect(checksPassed({ ...ok, smoke: { ok: false, detail: "crashed" } })).toBe(false);
    expect(checksPassed({ ...ok, template: { ok: false, findings: ["life is 2000"] } })).toBe(false);
    expect(checksPassed({ ...ok, template: null })).toBe(false);
    expect(checksPassed({ ...ok, balance: null })).toBe(false);
    expect(checksPassed({ ...ok, balance: { ...ok.balance!, ok: false } })).toBe(false);
  });
});

describe("validateChecks", () => {
  it("accepts the defaults and refuses nonsense", () => {
    expect(validateChecks(DEFAULT_CHECKS)).toEqual({ fights: 200, tolerance: 0.1 });
    expect(() => validateChecks({ fights: 5, tolerance: 0.1 })).toThrow(/fights/);
    expect(() => validateChecks({ fights: 200.5, tolerance: 0.1 })).toThrow(/fights/);
    expect(() => validateChecks({ fights: 200, tolerance: 0 })).toThrow(/tolerance/);
    expect(() => validateChecks({ fights: 200, tolerance: 0.6 })).toThrow(/tolerance/);
  });
});
