import { describe, expect, it } from "vitest";
import { loadRoster, parseRoster, RosterError, commercialOnly, onlyFighters } from "./schema.ts";

const fighter = { id: "kfm", displayName: "KFM", archetype: "ALL_ROUNDER", def: "chars/kfm/kfm.def", license: "CC BY-NC" };
const stage = { id: "temple", displayName: "Temple", def: "stages/kfm.def", license: "?" };

describe("roster.json", () => {
  it("the committed roster is valid", async () => {
    const roster = await loadRoster();
    expect(roster.fighters.length).toBeGreaterThanOrEqual(2);
    expect(roster.characters.length).toBeGreaterThanOrEqual(2);
    expect(roster.stages.length).toBeGreaterThanOrEqual(1);
  });

  it("fills defaults", () => {
    const r = parseRoster({ fighters: [fighter], stages: [stage], characters: [{ key: "a", fighter: "kfm", name: "A" }] });
    expect(r.fighters[0]!.enabled).toBe(true);
    expect(r.characters[0]).toMatchObject({ palette: 1, enabled: true });
  });

  it.each([
    ["duplicate fighter id", { fighters: [fighter, fighter], stages: [], characters: [] }, /duplicate id "kfm"/],
    ["unknown fighter", { fighters: [fighter], stages: [], characters: [{ key: "a", fighter: "nope", name: "A" }] }, /unknown fighter "nope"/],
    ["path escaping IKEMEN_DIR", { fighters: [{ ...fighter, def: "../evil.def" }], stages: [], characters: [] }, /inside IKEMEN_DIR/],
    ["absolute path", { fighters: [{ ...fighter, def: "/etc/x.def" }], stages: [], characters: [] }, /inside IKEMEN_DIR/],
    ["missing license", { fighters: [{ ...fighter, license: "" }], stages: [], characters: [] }, /license/],
    ["bad archetype", { fighters: [{ ...fighter, archetype: "NINJA" }], stages: [], characters: [] }, /archetype/],
    ["bad slug", { fighters: [{ ...fighter, id: "Bad Id" }], stages: [], characters: [] }, /fighters\.0\.id/],
  ])("rejects %s", (_label, data, message) => {
    expect(() => parseRoster(data)).toThrow(RosterError);
    expect(() => parseRoster(data)).toThrow(message);
  });
});

describe("commercialOnly (GI_COMMERCIAL_ONLY)", () => {
  it("switches off fighters whose license doesn't allow commercial use, and leaves the rest", () => {
    const roster = parseRoster({
      fighters: [
        { id: "kfm", displayName: "Kung Fu Man", archetype: "ALL_ROUNDER", def: "chars/kfm/kfm.def", license: "CC non-commercial" },
        { id: "gi-tpl-zoner", displayName: "Sage", archetype: "ZONER", def: "chars/gi-tpl-zoner/gi-tpl-zoner.def", license: "CC0 art, our code", commercialUse: true },
        { id: "off", displayName: "Off", archetype: "HEAVY", def: "chars/off/off.def", license: "x", enabled: false, notes: "broken" },
      ],
      stages: [{ id: "s", displayName: "S", def: "stages/s.def", license: "x" }],
      characters: [],
    });
    expect(roster.fighters[0]!.commercialUse).toBe(false);
    const only = commercialOnly(roster);
    expect(only.fighters.map((f) => [f.id, f.enabled])).toEqual([["kfm", false], ["gi-tpl-zoner", true], ["off", false]]);
    expect(only.fighters[0]!.notes).toMatch(/commercial/);
    expect(only.fighters[2]!.notes).toBe("broken");
    expect(only.stages[0]!.enabled).toBe(true); // the only stage stays: fights need one
    const withOurs = commercialOnly({ ...roster, stages: [...roster.stages, { id: "ours", displayName: "Ours", def: "stages/ours.def", license: "ours", commercialUse: true, enabled: true }] });
    expect(withOurs.stages.map((s) => [s.id, s.enabled])).toEqual([["s", false], ["ours", true]]);
  });
});

describe("onlyFighters (GI_ROSTER_ONLY)", () => {
  const roster = parseRoster({
    fighters: [
      { id: "barney", displayName: "Barney", archetype: "HEAVY", def: "chars/b/b.def", license: "x", tags: ["meme"] },
      { id: "bonzi", displayName: "Bonzi", archetype: "ZONER", def: "chars/z/z.def", license: "x", tags: ["meme"] },
      { id: "brawler", displayName: "Brawler", archetype: "ALL_ROUNDER", def: "chars/r/r.def", license: "x" },
      { id: "nyan", displayName: "Nyan", archetype: "ZONER", def: "chars/n/n.def", license: "x", tags: ["meme"], enabled: false },
    ],
    stages: [],
    characters: [],
  });

  it("keeps only fighters with one of the tags or ids, and never switches on one that's off", () => {
    const only = onlyFighters(roster, ["meme"]);
    expect(only.fighters.map((f) => [f.id, f.enabled])).toEqual([["barney", true], ["bonzi", true], ["brawler", false], ["nyan", false]]);
    expect(only.fighters[2]!.notes).toBe("not in GI_ROSTER_ONLY=meme");
    expect(onlyFighters(roster, ["brawler", "bonzi"]).fighters.filter((f) => f.enabled).map((f) => f.id)).toEqual(["bonzi", "brawler"]);
  });

  it("tags the meme characters in roster.json", async () => {
    const memes = (await loadRoster()).fighters.filter((f) => f.tags.includes("meme")).map((f) => f.id);
    expect(memes).toEqual(expect.arrayContaining(["mugen-silly-barney", "mugen-bonzibuddy", "mugen-ui-shaggy"]));
  });
});
