import { seededRandom } from "@greed-island/engine";
import type { Side } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { BOTS, habits, loadBotCount, loves, nextOnline, pickSide, pickStake, planBets, roundish, type Bot, type FightFacts } from "./bots.ts";

const bot = (style: Bot["style"], name = `Test${style}`): Bot => ({ name, style });
// Side 1 is a clear favourite (70%) on a good run; side 2 pays 3x.
const facts: FightFacts = {
  chance: { 1: 0.7, 2: 0.3 },
  multiplier: { 1: 1.36, 2: 3.17 },
  sides: { 1: { fighterId: "champ", form: ["W", "W", "W", "L", "W"] }, 2: { fighterId: "scrub", form: ["L", "L", "W", "L", "L"] } },
};
const limits = { minBet: 1n, maxStake: 50_000n };

/** How often each side is picked over many fights (skips not counted). */
function sideShare(b: Bot, f: FightFacts = facts, n = 2000): Record<Side, number> {
  const r = seededRandom(`sides:${b.name}`);
  const count = { 1: 0, 2: 0 };
  for (let i = 0; i < n; i++) {
    const s = pickSide(b, f, r);
    if (s) count[s]++;
  }
  return { 1: count[1] / n, 2: count[2] / n };
}

describe("bot players", () => {
  it("have unique names a player could have, and a mix of styles in the default 40", () => {
    const names = BOTS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[A-Za-z0-9_]{3,24}$/);
    expect(new Set(BOTS.slice(0, 40).map((b) => b.style)).size).toBe(10);
    expect(loadBotCount({})).toBe(40);
    expect(loadBotCount({ GI_BOTS: "0" })).toBe(0);
    expect(() => loadBotCount({ GI_BOTS: "500" })).toThrow(/GI_BOTS/);
  });

  it("keep the same habits every time", () => {
    expect(habits(BOTS[0]!)).toEqual(habits(BOTS[0]!));
    expect(habits(BOTS[0]!)).not.toEqual(habits(BOTS[1]!));
  });

  it("lean their own way, but not always", () => {
    expect(sideShare(bot("favourite"))[1]).toBeGreaterThan(0.75);
    expect(sideShare(bot("favourite"))[1]).toBeLessThan(0.99);
    expect(sideShare(bot("underdog"))[2]).toBeGreaterThan(0.6);
    expect(sideShare(bot("red"))[1]).toBeGreaterThan(0.85);
    expect(sideShare(bot("blue"))[2]).toBeGreaterThan(0.85);
    expect(sideShare(bot("form"))[1]).toBeGreaterThan(0.65);
    expect(sideShare(bot("contrarian"))[2]).toBeGreaterThan(0.6);
    // A fan backs the fighter it loves, whichever side.
    const fan: Bot = { name: "Fan", style: "fan", loves: ["scrub"] };
    expect(loves(fan, "scrub")).toBe(true);
    expect(sideShare(fan)[2]).toBeGreaterThan(0.85);
    // Gut feeling: each bot has its own taste, so the crowd splits.
    const gut = BOTS.filter((b) => b.style === "gut").map((b) => sideShare(b)[1]);
    expect(Math.max(...gut) - Math.min(...gut)).toBeGreaterThan(0.1);
  });

  it("sometimes sit out a coin flip if they're cautious", () => {
    const even: FightFacts = { ...facts, chance: { 1: 0.52, 2: 0.48 }, multiplier: { 1: 1.83, 2: 1.98 } };
    const s = sideShare(bot("cautious"), even);
    expect(s[1] + s[2]).toBeLessThan(0.8);
    expect(s[1] + s[2]).toBeGreaterThan(0.4);
  });

  it("stake like people: round numbers, the 25% and 50% buttons, all in now and then, never more than they have", () => {
    const r = seededRandom("stakes");
    const stakes = (b: Bot, balance: bigint, mood: "won" | "lost" | null = null) =>
      Array.from({ length: 500 }, () => pickStake(b, facts, 1, balance, { last: mood }, limits, r)!);
    for (const style of ["favourite", "underdog", "yolo", "cautious", "gut"] as const) {
      for (const s of stakes(bot(style), 2_000n)) {
        expect(s).toBeGreaterThanOrEqual(1n);
        expect(s).toBeLessThanOrEqual(2_000n);
      }
    }
    const yolo = stakes(bot("yolo"), 2_000n);
    expect(yolo.filter((s) => s === 2_000n).length).toBeGreaterThan(50);
    const cautious = stakes(bot("cautious"), 2_000n);
    expect(cautious.filter((s) => s === 2_000n)).toEqual([]);
    expect(cautious.reduce((a, b) => a + b, 0n) / 500n).toBeLessThan(200n);
    // Mostly typed round numbers or a button's share.
    const round = stakes(bot("favourite"), 2_000n).filter((s) => s % 5n === 0n || s === 500n || s === 1_000n);
    expect(round.length).toBeGreaterThan(450);
    // Never over the biggest bet allowed, even when rich.
    for (const s of stakes(bot("yolo"), 1_000_000n)) expect(s).toBeLessThanOrEqual(50_000n);
    // Can't bet with nothing.
    expect(pickStake(bot("gut"), facts, 1, 0n, { last: null }, limits, r)).toBeNull();
  });

  it("chase losses", () => {
    const tilted = BOTS.find((b) => b.style === "yolo" && habits(b).tilt > 0.8) ?? bot("yolo");
    const avg = (mood: "won" | "lost" | null) => {
      const r = seededRandom(`chase:${mood}`);
      let sum = 0n;
      for (let i = 0; i < 2000; i++) sum += pickStake(tilted, facts, 1, 10_000n, { last: mood }, limits, r)!;
      return sum / 2000n;
    };
    expect(avg("lost")).toBeGreaterThan(avg(null));
  });

  it("plan bets inside the window, sometimes changing their mind", () => {
    let changed = 0;
    let skipped = 0;
    const r = seededRandom("plans");
    for (let i = 0; i < 3000; i++) {
      const b = BOTS[i % BOTS.length]!;
      const plans = planBets(b, facts, 1_000n, { last: null }, limits, r);
      if (plans.length === 0) skipped++;
      if (plans.length === 2) {
        changed++;
        expect(plans[1]!.at).toBeGreaterThan(plans[0]!.at);
        expect(plans[1]!.side !== plans[0]!.side || plans[1]!.stake > plans[0]!.stake).toBe(true);
      }
      for (const p of plans) {
        expect(p.at).toBeGreaterThan(0);
        expect(p.at).toBeLessThanOrEqual(0.93);
      }
    }
    expect(changed).toBeGreaterThan(30);
    expect(skipped).toBeGreaterThan(300);
    expect(skipped).toBeLessThan(1500);
  });

  it("come and go in sessions", () => {
    const r = seededRandom("sessions");
    let online = false;
    let on = 0;
    for (let i = 0; i < 10_000; i++) if ((online = nextOnline(online, r))) on++;
    // About 40% of the time online.
    expect(on / 10_000).toBeGreaterThan(0.3);
    expect(on / 10_000).toBeLessThan(0.5);
  });

  it("type numbers a person would", () => {
    expect([0.4, 7.4, 13, 48, 123, 444, 1234, 7777].map(roundish)).toEqual([1, 7, 15, 50, 120, 450, 1200, 8000]);
  });
});
