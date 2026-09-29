import { describe, expect, it } from "vitest";
import { loadRoster, parseRoster, RosterError } from "./schema.ts";

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
