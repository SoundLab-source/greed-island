import { describe, expect, it } from "vitest";
import { applyFightRating, createCharacter, loadoutSnapshot, setTierManually } from "./characters.ts";
import { ratingSettings, useTestDb } from "./test/db.ts";

const db = useTestDb();

async function twoCharacters() {
  await db.fighter.create({
    data: { id: "kfm", displayName: "Kung Fu Man", archetype: "ALL_ROUNDER", defPath: "chars/kfm/kfm.def", licenseNote: "test" },
  });
  return db.$transaction(async (tx) => [
    await createCharacter(tx, { fighterId: "kfm", name: "Red" }, ratingSettings),
    await createCharacter(tx, { fighterId: "kfm", name: "Blue", palette: 2 }, ratingSettings),
  ]);
}

describe("createCharacter", () => {
  it("starts at the initial rating, in the matching tier, with history", async () => {
    const [red] = await twoCharacters();
    expect(red).toMatchObject({ rating: 1500, deviation: 350, volatility: 0.06, tier: "B", wins: 0, losses: 0, ownerKind: "HOUSE" });
    expect(red).toMatchObject({ lifePct: 100, startPower: 0, attackPct: 100, defensePct: 100 });
    const history = await db.tierHistory.findMany({ where: { characterId: red!.id } });
    expect(history).toMatchObject([{ fromTier: null, toTier: "B", reason: "INITIAL" }]);
  });
});

describe("applyFightRating", () => {
  it("updates ratings and records for both sides", async () => {
    const [red, blue] = await twoCharacters();
    const [c1, c2] = await db.$transaction((tx) => applyFightRating(tx, { side1: red!.id, side2: blue!.id, scoreSide1: 1 }, ratingSettings));
    expect(c1.after.rating).toBeGreaterThan(1500);
    expect(c2.after.rating).toBeLessThan(1500);
    const [r, b] = await Promise.all([red, blue].map((c) => db.character.findUniqueOrThrow({ where: { id: c!.id } })));
    expect(r).toMatchObject({ wins: 1, losses: 0 });
    expect(b).toMatchObject({ wins: 0, losses: 1 });
    expect(r!.deviation).toBeLessThan(350);
  });

  it("changes tier and records why", async () => {
    const [red, blue] = await twoCharacters();
    // Red wins repeatedly until promoted to A (1600).
    for (let i = 0; i < 10; i++) {
      await db.$transaction((tx) => applyFightRating(tx, { side1: red!.id, side2: blue!.id, scoreSide1: 1 }, ratingSettings));
    }
    const r = await db.character.findUniqueOrThrow({ where: { id: red!.id } });
    expect(r.rating).toBeGreaterThanOrEqual(1600);
    expect(["A", "S"]).toContain(r.tier);
    const changes = await db.tierHistory.findMany({ where: { characterId: red!.id, reason: "RATING" } });
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]!.fromTier).toBe("B");
  });

  it("never moves an X-tier character", async () => {
    const [red, blue] = await twoCharacters();
    await setTierManually(db, red!.id, "X");
    for (let i = 0; i < 5; i++) {
      await db.$transaction((tx) => applyFightRating(tx, { side1: red!.id, side2: blue!.id, scoreSide1: 0 }, ratingSettings));
    }
    expect((await db.character.findUniqueOrThrow({ where: { id: red!.id } })).tier).toBe("X");
    const manual = await db.tierHistory.findMany({ where: { characterId: red!.id, reason: "MANUAL" } });
    expect(manual).toMatchObject([{ fromTier: "B", toTier: "X" }]);
  });

  it("counts a draw as neither win nor loss", async () => {
    const [red, blue] = await twoCharacters();
    await db.$transaction((tx) => applyFightRating(tx, { side1: red!.id, side2: blue!.id, scoreSide1: 0.5 }, ratingSettings));
    expect(await db.character.findUniqueOrThrow({ where: { id: red!.id } })).toMatchObject({ wins: 0, losses: 0 });
  });

  it("refuses a character fighting itself", async () => {
    const [red] = await twoCharacters();
    await expect(db.$transaction((tx) => applyFightRating(tx, { side1: red!.id, side2: red!.id, scoreSide1: 1 }, ratingSettings))).rejects.toThrow(
      /itself/,
    );
  });
});

describe("loadoutSnapshot", () => {
  it("captures stats, rating, deviation and tier", async () => {
    const [red] = await twoCharacters();
    expect(await loadoutSnapshot(db, red!.id)).toEqual({
      characterId: red!.id,
      fighterId: "kfm",
      name: "Red",
      tier: "B",
      stats: { lifePct: 100, startPower: 0, attackPct: 100, defensePct: 100 },
      rating: 1500,
      deviation: 350,
      volatility: 0.06,
      wins: 0,
      losses: 0,
    });
  });
});

describe("database guards", () => {
  it("rejects a house character with an owner, and bad stats", async () => {
    const [red] = await twoCharacters();
    await expect(db.$executeRaw`UPDATE "character" SET "life_pct" = 0 WHERE "id" = ${red!.id}::uuid`).rejects.toThrow(/character_stats_range/);
    await expect(db.$executeRaw`UPDATE "character" SET "owner_user_id" = gen_random_uuid() WHERE "id" = ${red!.id}::uuid`).rejects.toThrow();
  });
});
