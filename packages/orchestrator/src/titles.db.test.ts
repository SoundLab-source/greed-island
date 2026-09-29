import { backfillTitles, createCharacter, createUser, setTierManually } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { createFakeSource, seededRandom } from "@greed-island/engine";
import { loadConfig, type Config, type Tier } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { setCosmetics } from "./cosmetics.ts";
import { applyTransition, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";
import { Orchestrator } from "./orchestrator.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10 };
const rng = (seed: string): Rng => {
  const r = seededRandom(seed);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let events: BusEvent[];
let deps: FightDeps;
let userId: string;

beforeEach(async () => {
  const bus = new FightBus();
  events = [];
  bus.subscribe((e) => events.push(e));
  deps = { db, config, orch, bus, now: () => new Date() };
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  userId = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
});

async function character(id: string, tier: Tier, rating: number, owner?: string) {
  await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
  const c = await db.character.create({
    data: {
      fighterId: id,
      name: `Char ${id}`,
      rating,
      deviation: 50,
      volatility: 0.06,
      tier,
      ...(owner ? { ownerKind: "USER" as const, ownerUserId: owner, serial: 1, firstEdition: true, acquiredAt: new Date() } : { rosterKey: id }),
    },
  });
  return c.id;
}

/** Book a fight between two given characters and play it to settlement. */
async function play(side1: string, side2: string, winnerSide: 1 | 2, beforeFight?: (fightId: string) => Promise<void>) {
  const n = await db.fight.count();
  const fight = await db.fight.create({
    data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: n, pairKind: "CROSS_TIER", stageId: "s1", side1CharacterId: side1, side2CharacterId: side2 },
  });
  await applyTransition(deps, fight.id, { type: "OPEN_BETTING" });
  await beforeFight?.(fight.id);
  await applyTransition(deps, fight.id, { type: "LOCK" });
  await applyTransition(deps, fight.id, { type: "ENGINE_STARTED" });
  await applyTransition(deps, fight.id, { type: "MATCH_END", winnerSide });
  await applyTransition(deps, fight.id, { type: "SETTLED_OK" });
  return fight;
}

const loadout = (fightId: string, side: number) => db.fightLoadout.findUniqueOrThrow({ where: { fightId_side: { fightId, side } } });

describe("titles at settlement", () => {
  it("records an underdog's First Blood and Giant Slayer with its owner, and announces them", async () => {
    const low = await character("low", "P", 1350, userId);
    const high = await character("high", "S", 1800);
    const fight = await play(high, low, 2);
    const titles = await db.characterTitle.findMany({ orderBy: { id: "asc" } });
    expect(titles.map((t) => [t.characterId, t.code, t.fightId, t.ownerKind, t.ownerUserId])).toEqual([
      [low, "FIRST_BLOOD", fight.id, "USER", userId],
      [low, "GIANT_SLAYER", fight.id, "USER", userId],
    ]);
    expect(events.filter((e) => e.type === "title_earned")).toMatchObject([
      { number: fight.number, characterId: low, name: "Char low", code: "FIRST_BLOOD", label: "First Blood" },
      { number: fight.number, characterId: low, name: "Char low", code: "GIANT_SLAYER", label: "Giant Slayer" },
    ]);
    // A second win doesn't repeat them.
    await play(low, high, 1);
    expect(await db.characterTitle.count()).toBe(2);
  });

  it("awards tier firsts on promotion, never twice", async () => {
    const a = await character("a", "P", 1447);
    const b = await character("b", "P", 1447);
    // Deviation 50: a win moves the rating a little, enough to cross 1450.
    const f1 = await play(a, b, 1);
    expect((await loadout(f1.id, 1)).tierAfter).toBe("B");
    expect((await db.characterTitle.findMany({ where: { characterId: a } })).map((t) => t.code)).toEqual(["FIRST_BLOOD", "TIER_B"]);
    // Drop back to P, then climb again: no second B-Tier.
    await db.character.update({ where: { id: a }, data: { tier: "P", rating: 1447 } });
    const f2 = await play(b, a, 2);
    expect((await loadout(f2.id, 2)).tierAfter).toBe("B");
    expect((await db.characterTitle.findMany({ where: { characterId: a } })).map((t) => t.code)).toEqual(["FIRST_BLOOD", "TIER_B"]);
  });

  it("doesn't award the tier a character started in", async () => {
    await db.fighter.create({ data: { id: "c", displayName: "c", archetype: "ALL_ROUNDER", defPath: "chars/c/c.def", licenseNote: "test" } });
    const c = await db.$transaction((tx) => createCharacter(tx, { rosterKey: "c", fighterId: "c", name: "Starter" }, ratingSettings));
    expect(c.tier).toBe("B");
    const d = await character("d", "P", 1447);
    // Dropped to P, then climbs back into B: not a first.
    await db.character.update({ where: { id: c.id }, data: { tier: "P", rating: 1447, deviation: 50 } });
    const f = await play(c.id, d, 1);
    expect((await loadout(f.id, 1)).tierAfter).toBe("B");
    expect((await db.characterTitle.findMany({ where: { characterId: c.id } })).map((t) => t.code)).toEqual(["FIRST_BLOOD"]);
  });
});

describe("cosmetics", () => {
  it("freezes what the overlay shows into each fight, and follows the owner's pick from the next fight", async () => {
    const low = await character("low", "P", 1350, userId);
    const high = await character("high", "S", 1800);
    const first = await play(high, low, 2);
    // Before any title: only the First Edition badge.
    expect((await loadout(first.id, 2)).cosmetics).toEqual({ title: null, nameplate: "standard", badges: ["first-edition"] });

    const second = await play(low, high, 1, async () => {
      // Picked while betting is open: this fight keeps the frozen automatic pick.
      await setCosmetics(db, { userId, characterId: low, choice: { title: "FIRST_BLOOD", badges: [] } });
    });
    expect((await loadout(second.id, 1)).cosmetics).toEqual({ title: "GIANT_SLAYER", nameplate: "crimson", badges: ["giant-slayer", "first-edition", "first-blood"] });
    const third = await play(low, high, 1);
    expect((await loadout(third.id, 1)).cosmetics).toEqual({ title: "FIRST_BLOOD", nameplate: "crimson", badges: [] });
    await expect(db.$executeRaw`UPDATE "fight_loadout" SET "cosmetics" = '{}' WHERE "fight_id" = ${third.id}::uuid`).rejects.toThrow(/frozen/);
  });

  it("only lets the owner pick, and only what's unlocked", async () => {
    const low = await character("low", "P", 1350, userId);
    const high = await character("high", "S", 1800);
    const other = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
    await expect(setCosmetics(db, { userId: other, characterId: low, choice: {} })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(setCosmetics(db, { userId, characterId: high, choice: {} })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(setCosmetics(db, { userId, characterId: low, choice: { nameplate: "gold" } })).rejects.toThrow(/Gold name plate isn't unlocked/);
    await expect(setCosmetics(db, { userId, characterId: low, choice: { title: "FIRST_BLOOD" } })).rejects.toThrow(/hasn't earned First Blood/);
    expect(await setCosmetics(db, { userId, characterId: low, choice: { badges: [] } })).toEqual({ title: null, nameplate: "standard", badges: [] });
    expect((await db.character.findUniqueOrThrow({ where: { id: low } })).cosmetics).toEqual({ badges: [] });
    // An empty pick goes back to automatic.
    await setCosmetics(db, { userId, characterId: low, choice: {} });
    expect((await db.character.findUniqueOrThrow({ where: { id: low } })).cosmetics).toBeNull();
  });
});

describe("titles table", () => {
  it("is permanent and allows each one-time title once per character", async () => {
    const low = await character("low", "P", 1350, userId);
    const high = await character("high", "S", 1800);
    await play(high, low, 2);
    await expect(db.$executeRaw`UPDATE "character_title" SET "code" = 'TIER_S'`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM "character_title"`).rejects.toThrow(/append-only/);
    await expect(db.characterTitle.create({ data: { characterId: low, code: "FIRST_BLOOD", ownerKind: "USER", ownerUserId: userId } })).rejects.toThrow();
    await expect(db.characterTitle.create({ data: { characterId: high, code: "TIER_B", ownerKind: "HOUSE", ownerUserId: userId } })).rejects.toThrow();
    // Tournament Champion can be won again.
    for (let i = 0; i < 2; i++) await db.characterTitle.create({ data: { characterId: high, code: "TOURNAMENT_CHAMPION", ownerKind: "HOUSE" } });
  });
});

describe("backfillTitles", () => {
  it("replays settled fights into exactly the titles awarded live", async () => {
    const make = async (id: string, startRating: number) => {
      await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
      return (await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: id, startRating }, ratingSettings))).id;
    };
    const [p, b, a, s] = [await make("p", 1350), await make("b", 1500), await make("a", 1650), await make("s", 1800)];
    const own = await character("own", "P", 1350, userId);
    // A scripted run that earns every kind of title.
    await play(s, p, 2); // P beats S: First Blood, Giant Slayer and a big promotion
    await setTierManually(db, p, "P"); // dropped by hand, then climbs back: no new tier title
    await play(p, b, 1);
    for (let i = 0; i < 10; i++) await play(b, a, 1); // 10 Wins and promotions
    await play(own, s, 1); // an owned underdog
    // Then some ordinary fights from the orchestrator.
    const o = new Orchestrator({ ...deps, source: createFakeSource({ seed: "titles" }), rng: rng("titles"), orch: { ...orch, matchmaking: { ...orch.matchmaking, rematchCooldown: 0 } } });
    await o.run(10);

    const snapshot = async () =>
      (await db.characterTitle.findMany({ select: { characterId: true, code: true, fightId: true, ownerKind: true, ownerUserId: true } })).map((t) => JSON.stringify(t)).sort();
    const live = await snapshot();
    const codes = new Set(live.map((t) => (JSON.parse(t) as { code: string }).code));
    for (const c of ["FIRST_BLOOD", "WINS_10", "GIANT_SLAYER"]) expect(codes).toContain(c);
    expect([...codes].some((c) => c.startsWith("TIER_"))).toBe(true);
    expect(live.some((t) => t.includes(userId))).toBe(true);

    await db.$executeRawUnsafe(`TRUNCATE "character_title"`);
    expect(await backfillTitles(db)).toBe(live.length);
    expect(await snapshot()).toEqual(live);
    expect(await backfillTitles(db)).toBe(0);
  });
});
