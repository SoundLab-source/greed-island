import { applyFightRating } from "@greed-island/db";
import { ratingSettings, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { parseRoster, type Roster } from "./schema.ts";
import { RosterSyncError, syncRoster } from "./sync.ts";

const db = useTestDb();

function roster(overrides: Partial<Roster> = {}): Roster {
  return parseRoster({
    fighters: [
      { id: "a", displayName: "Alpha", archetype: "RUSHDOWN", def: "chars/a/a.def", license: "test" },
      { id: "b", displayName: "Beta", archetype: "ZONER", def: "chars/b/b.def", license: "test" },
    ],
    stages: [{ id: "s", displayName: "Stage", def: "stages/s.def", license: "test" }],
    characters: [
      { key: "house-a", fighter: "a", name: "Alpha" },
      { key: "house-b", fighter: "b", name: "Beta", palette: 2 },
    ],
    ...overrides,
  });
}

describe("syncRoster", () => {
  it("leaves community fighters (released from the vote) and their house characters alone", async () => {
    await syncRoster(db, roster(), ratingSettings);
    await db.fighter.create({ data: { id: "community-heron", source: "COMMUNITY", displayName: "Iron Heron", archetype: "ZONER", defPath: "chars/b/b.def", licenseNote: "community" } });
    await db.character.create({ data: { fighterId: "community-heron", name: "Iron Heron", rating: 1500, deviation: 350, volatility: 0.06, tier: "B" } });
    const report = await syncRoster(db, roster(), ratingSettings);
    expect(report.fighters.disabled).toBe(0);
    expect(report.characters.disabled).toBe(0);
    expect((await db.fighter.findUniqueOrThrow({ where: { id: "community-heron" } })).enabled).toBe(true);
    expect(await db.character.count({ where: { fighterId: "community-heron", enabled: true } })).toBe(1);
    // A roster fighter can't pose as a community one, or the other way round.
    await expect(db.fighter.create({ data: { id: "community-fake", displayName: "x", archetype: "ZONER", defPath: "x", licenseNote: "x" } })).rejects.toThrow(/fighter_source_id/);
  });

  it("creates fighters, stages and characters, then is idempotent", async () => {
    const first = await syncRoster(db, roster(), ratingSettings);
    expect(first.characters).toEqual({ created: 2, updated: 0, disabled: 0 });
    const second = await syncRoster(db, roster(), ratingSettings);
    expect(second.characters).toEqual({ created: 0, updated: 2, disabled: 0 });
    expect(await db.character.count()).toBe(2);
    expect(await db.tierHistory.count()).toBe(2);
  });

  it("never resets a character's rating or record", async () => {
    await syncRoster(db, roster(), ratingSettings);
    const [a, b] = await Promise.all(["house-a", "house-b"].map((k) => db.character.findUniqueOrThrow({ where: { rosterKey: k } })));
    await db.$transaction((tx) => applyFightRating(tx, { side1: a!.id, side2: b!.id, scoreSide1: 1 }, ratingSettings));
    const before = await db.character.findUniqueOrThrow({ where: { id: a!.id } });

    const renamed = roster();
    renamed.characters[0]!.name = "Alpha Prime";
    await syncRoster(db, renamed, ratingSettings);
    const after = await db.character.findUniqueOrThrow({ where: { id: a!.id } });
    expect(after.name).toBe("Alpha Prime");
    expect(after).toMatchObject({ rating: before.rating, deviation: before.deviation, wins: 1, tier: before.tier });
  });

  it("disables entries removed from the file instead of deleting them", async () => {
    await syncRoster(db, roster(), ratingSettings);
    const smaller = roster();
    smaller.fighters = smaller.fighters.filter((f) => f.id === "a");
    smaller.characters = smaller.characters.filter((c) => c.fighter === "a");
    smaller.stages = [];
    const report = await syncRoster(db, smaller, ratingSettings);
    expect(report).toMatchObject({ fighters: { disabled: 1 }, stages: { disabled: 1 }, characters: { disabled: 1 } });
    const beta = await db.character.findUniqueOrThrow({ where: { rosterKey: "house-b" } });
    expect(beta).toMatchObject({ enabled: false, disabledReason: "removed from roster.json" });
  });

  it("applies enabled flags and notes from the file", async () => {
    const r = roster();
    r.fighters[1] = { ...r.fighters[1]!, enabled: false, notes: "crashes on load" };
    await syncRoster(db, r, ratingSettings);
    expect(await db.fighter.findUniqueOrThrow({ where: { id: "b" } })).toMatchObject({ enabled: false, disabledReason: "crashes on load" });
  });

  it("refuses to move an existing character to a different fighter", async () => {
    await syncRoster(db, roster(), ratingSettings);
    const moved = roster();
    moved.characters[0]!.fighter = "b";
    await expect(syncRoster(db, moved, ratingSettings)).rejects.toThrow(RosterSyncError);
  });
});
