import { auditLedger, createCharacter, createUser, getBalance } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { DEFAULT_SHOP, loadConfig, rotationWindow, pickRotation, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FightBus } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, bookFight } from "./fights.ts";
import { buyCharacter } from "./shop.ts";
import { setSidegrade, upgradeStat } from "./upgrades.ts";

const db = useTestDb();
const now = new Date("2026-10-01T12:00:00Z");
const config: Config = { ...loadConfig({}), economy: { ...testEconomy, startingBalance: 20_000n }, shop: { ...DEFAULT_SHOP } };

let userId: string;
let characterId: string;

beforeEach(async () => {
  for (const id of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
    await db.fighter.create({ data: { id, displayName: `F ${id}`, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: `house-${id}`, fighterId: id, name: `House ${id}` }, ratingSettings));
  }
  userId = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
  const onOffer = pickRotation([{ id: "f1" }, { id: "f2" }, { id: "f3" }, { id: "f4" }, { id: "f5" }, { id: "f6" }], rotationWindow(now, config.shop).index, config.shop)[0]!.id;
  characterId = (await buyCharacter(db, config, { userId, fighterId: onOffer, idempotencyKey: "buy-000001" }, now)).characterId;
});

const up = (stat: "life" | "attack" | "defense" | "power", key: string, who = userId) => upgradeStat(db, config, { userId: who, characterId, stat, idempotencyKey: key });
const char = () => db.character.findUniqueOrThrow({ where: { id: characterId } });

describe("upgradeStat", () => {
  it("charges the level's cost, raises the stat and widens the rating deviation", async () => {
    await db.character.update({ where: { id: characterId }, data: { deviation: 100 } });
    const before = await getBalance(db, userId);
    const r = await up("attack", "up-000001");
    expect(r.balance).toBe(before - 200n);
    expect(await char()).toMatchObject({ attackLevel: 1, attackPct: 105, deviation: 130 });
    await up("attack", "up-000002");
    expect(await char()).toMatchObject({ attackLevel: 2, attackPct: 109, deviation: 160 });
    expect(await getBalance(db, userId)).toBe(before - 200n - 320n);
    const history = await db.characterChange.findMany({ where: { characterId }, orderBy: { id: "asc" } });
    expect(history.map((h) => [h.stat, h.fromLevel, h.toLevel, h.cost.toFixed(0)])).toEqual([
      ["attack", 0, 1, "200"],
      ["attack", 1, 2, "320"],
    ]);
    const audit = await auditLedger(db);
    expect(audit.ok).toBe(true);
    expect(audit.stats.sink).toBeGreaterThanOrEqual(520n);
  });

  it("stops at the maximum level", async () => {
    for (let i = 0; i < 5; i++) await up("power", `pw-00000${i}`);
    expect(await char()).toMatchObject({ powerLevel: 5, startPower: 1000 });
    await expect(up("power", "pw-000009")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("only lets the owner upgrade, and needs enough Salt", async () => {
    const other = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
    await expect(up("life", "x-0000001", other)).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const house = await db.character.findFirstOrThrow({ where: { ownerKind: "HOUSE" } });
    await expect(upgradeStat(db, config, { userId, characterId: house.id, stat: "life", idempotencyKey: "x-0000002" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    // A price above the balance is refused.
    const poorCfg = { ...config, upgrades: { ...config.upgrades, baseCost: { ...config.upgrades.baseCost, life: 1_000_000n } } };
    await expect(upgradeStat(db, poorCfg, { userId, characterId, stat: "life", idempotencyKey: "x-0000003" })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("replays a repeated request without charging twice", async () => {
    const a = await up("life", "same-00001");
    const b = await up("life", "same-00001");
    expect(b).toMatchObject({ replayed: true, balance: a.balance });
    expect((await char()).lifeLevel).toBe(1);
  });
});

describe("setSidegrade", () => {
  it("costs 300 to pick or switch, is free to remove, and changes stats", async () => {
    const start = await getBalance(db, userId);
    await setSidegrade(db, config, { userId, characterId, sidegrade: "GLASS_CANNON", idempotencyKey: "sg-000001" });
    expect(await char()).toMatchObject({ sidegrade: "GLASS_CANNON", attackPct: 108, lifePct: 92 });
    await setSidegrade(db, config, { userId, characterId, sidegrade: "IRON_WALL", idempotencyKey: "sg-000002" });
    expect(await char()).toMatchObject({ sidegrade: "IRON_WALL", defensePct: 108, attackPct: 95, lifePct: 100 });
    await setSidegrade(db, config, { userId, characterId, sidegrade: null, idempotencyKey: "sg-000003" });
    expect(await char()).toMatchObject({ sidegrade: null, defensePct: 100, attackPct: 100 });
    expect(await getBalance(db, userId)).toBe(start - 600n);
    await expect(setSidegrade(db, config, { userId, characterId, sidegrade: null, idempotencyKey: "sg-000004" })).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(await db.characterChange.count({ where: { characterId, kind: "SIDEGRADE" } })).toBe(3);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});

describe("frozen loadouts", () => {
  it("don't change when a character is upgraded after betting opened", async () => {
    await db.character.updateMany({ data: { tier: "P", rating: 1350 } });
    await db.stage.create({ data: { id: "s1", displayName: "S", defPath: "stages/s1.def", licenseNote: "test" } });
    const deps = { db, config, orch: { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0 }, bus: new FightBus(), now: () => new Date() };
    // Book until the owned character is in a fight.
    let fightId: string | null = null;
    for (let i = 0; i < 30 && !fightId; i++) {
      const f = (await bookFight(deps, { int: (n) => (i * 7) % n, chance: () => 0.99 }, "fake"))!;
      if (f.side1CharacterId === characterId || f.side2CharacterId === characterId) fightId = f.id;
      else {
        await applyTransition(deps, f.id, { type: "VOID", reason: "ADMIN" });
        await applyTransition(deps, f.id, { type: "VOIDED_OK" });
      }
    }
    expect(fightId).not.toBeNull();
    await applyTransition(deps, fightId!, { type: "OPEN_BETTING" });
    await up("attack", "late-00001");
    const loadout = await db.fightLoadout.findFirstOrThrow({ where: { fightId: fightId!, characterId } });
    expect(loadout.attackPct).toBe(100);
    expect((await char()).attackPct).toBe(105);
  });
});
