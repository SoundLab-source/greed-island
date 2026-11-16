import { describe, expect, it } from "vitest";
import { DEFAULT_FOLLOWS, followHeadsUp, followProblem, validateFollows } from "./follows.ts";
import { loadConfig } from "./config.ts";

const sides = [
  { side: 1 as const, fighterId: "free-loot", name: "Free Loot" },
  { side: 2 as const, fighterId: "big-cheese", name: "Big Cheese" },
];

describe("followHeadsUp", () => {
  it("is null when the player follows neither fighter", () => {
    expect(followHeadsUp(sides, new Set())).toBeNull();
    expect(followHeadsUp(sides, new Set(["someone-else"]))).toBeNull();
  });

  it("names the followed side", () => {
    expect(followHeadsUp(sides, new Set(["big-cheese"]))).toEqual({ sides: [2], line: "Big Cheese is up: betting is open" });
    expect(followHeadsUp(sides, new Set(["free-loot"]))).toEqual({ sides: [1], line: "Free Loot is up: betting is open" });
  });

  it("names both when both are followed, including two outfits of one fighter", () => {
    expect(followHeadsUp(sides, new Set(["free-loot", "big-cheese"]))).toEqual({ sides: [1, 2], line: "Free Loot vs Big Cheese, both yours, is up: betting is open" });
    const mirror = [
      { side: 1 as const, fighterId: "tpl-brawler", name: "Crimson Jab" },
      { side: 2 as const, fighterId: "tpl-brawler", name: "Coal Fist" },
    ];
    expect(followHeadsUp(mirror, new Set(["tpl-brawler"]))?.sides).toEqual([1, 2]);
  });
});

describe("followProblem", () => {
  const cfg = { max: 2 };
  it("lets a player follow until the cap", () => {
    expect(followProblem({ alreadyFollowing: false, count: 1, fighterEnabled: true }, cfg)).toBeNull();
    expect(followProblem({ alreadyFollowing: false, count: 2, fighterEnabled: true }, cfg)).toMatch(/up to 2/);
  });
  it("treats following twice as fine, even at the cap", () => {
    expect(followProblem({ alreadyFollowing: true, count: 2, fighterEnabled: false }, cfg)).toBeNull();
  });
  it("refuses a fighter that's off the roster", () => {
    expect(followProblem({ alreadyFollowing: false, count: 0, fighterEnabled: false }, cfg)).toMatch(/isn't on the roster/);
  });
});

describe("follow settings", () => {
  it("defaults to 30 and reads GI_FOLLOW_MAX", () => {
    expect(loadConfig({}).follows).toEqual(DEFAULT_FOLLOWS);
    expect(loadConfig({ GI_FOLLOW_MAX: "5" }).follows.max).toBe(5);
  });
  it("refuses a cap that makes no sense", () => {
    expect(() => validateFollows({ max: 0 })).toThrow(/GI_FOLLOW_MAX/);
    expect(() => validateFollows({ max: 2.5 })).toThrow(/GI_FOLLOW_MAX/);
  });
});
