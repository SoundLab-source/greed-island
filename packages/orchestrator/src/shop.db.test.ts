import { auditLedger, createCharacter, createUser, getBalance } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { createFakeSource, seededRandom } from "@greed-island/engine";
import { DEFAULT_SHOP, loadConfig, pickRotation, rotationWindow, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FightBus } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import type { Rng } from "./matchmaking.ts";
import { Orchestrator } from "./orchestrator.ts";
import { buyCharacter, currentShop } from "./shop.ts";

const db = useTestDb();
const now = new Date("2026-10-01T12:00:00Z");
// Rich enough to buy several characters.
const config: Config = { ...loadConfig({}), economy: { ...testEconomy, startingBalance: 10_000n }, shop: { ...DEFAULT_SHOP, firstEditionSupply: 2, maxOwnedPerUser: 3 } };

let onOffer: string;
let notOnOffer: string;

beforeEach(async () => {
  const ids = Array.from({ length: 8 }, (_, i) => `f${i}`);
  for (const id of ids) {
    await db.fighter.create({ data: { id, displayName: `Fighter ${id}`, archetype: "ALL_ROUNDER", rarity: id === "f0" ? "RARE" : "COMMON", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: `house-${id}`, fighterId: id, name: `House ${id}`, palette: 4 }, ratingSettings));
  }
  const picked = pickRotation(ids.map((id) => ({ id })), rotationWindow(now, config.shop).index, config.shop).map((f) => f.id);
  onOffer = picked[0]!;
  notOnOffer = ids.find((id) => !picked.includes(id))!;
});

const buy = (userId: string, fighterId: string, key: string) => buyCharacter(db, config, { userId, fighterId, idempotencyKey: key }, now);
const rich = async () => (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;

describe("shop", () => {
  it("offers the rotation with prices by rarity and First Edition counts", async () => {
    const shop = await currentShop(db, config, now);
    expect(shop.offers).toHaveLength(6);
    expect(shop.window.endsAt.getTime()).toBeGreaterThan(now.getTime());
    for (const o of shop.offers) {
      expect(o.price).toBe(o.rarity === "RARE" ? 2000n : 1000n);
      expect(o.firstEditionLeft).toBe(2);
    }
  });

  it("sells a player-owned copy: Salt goes to the sink, the copy starts in tier P", async () => {
    const userId = await rich();
    const r = await buy(userId, onOffer, "buy-00000001");
    const c = await db.character.findUniqueOrThrow({ where: { id: r.characterId } });
    const price = (await currentShop(db, config, now)).offers.find((o) => o.fighterId === onOffer)!.price;
    expect(c).toMatchObject({ ownerKind: "USER", ownerUserId: userId, fighterId: onOffer, serial: 1, firstEdition: true, tier: "P", rating: 1350, palette: 4 });
    expect(c.name).toBe(`Fighter ${onOffer} #1`);
    expect(r.balance).toBe(10_000n - price);
    const audit = await auditLedger(db);
    expect(audit.ok).toBe(true);
    expect(audit.stats.sink).toBe(price);
    expect(await db.tierHistory.count({ where: { characterId: c.id, reason: "INITIAL" } })).toBe(1);
  });

  it("numbers copies and stops First Edition after the supply", async () => {
    const [a, b, c] = [await rich(), await rich(), await rich()];
    const serials = [];
    for (const [u, k] of [[a, "k-a-0001"], [b, "k-b-0001"], [c, "k-c-0001"]] as const) {
      const r = await buy(u, onOffer, k);
      serials.push(await db.character.findUniqueOrThrow({ where: { id: r.characterId }, select: { serial: true, firstEdition: true } }));
    }
    expect(serials).toEqual([
      { serial: 1, firstEdition: true },
      { serial: 2, firstEdition: true },
      { serial: 3, firstEdition: false },
    ]);
    expect((await currentShop(db, config, now)).offers.find((o) => o.fighterId === onOffer)).toMatchObject({ sold: 3, firstEditionLeft: 0 });
  });

  it("gives racing buyers different copy numbers", async () => {
    const users = [await rich(), await rich(), await rich()];
    const results = await Promise.all(users.map((u, i) => buy(u, onOffer, `race-${i}-0001`)));
    const serials = await Promise.all(results.map(async (r) => (await db.character.findUniqueOrThrow({ where: { id: r.characterId } })).serial));
    expect(serials.sort()).toEqual([1, 2, 3]);
  });

  it("replays a repeated request without charging twice", async () => {
    const userId = await rich();
    const first = await buy(userId, onOffer, "same-key-01");
    const again = await buy(userId, onOffer, "same-key-01");
    expect(again).toMatchObject({ characterId: first.characterId, replayed: true, balance: first.balance });
    expect(await db.character.count({ where: { ownerUserId: userId } })).toBe(1);
  });

  it("enforces the rules", async () => {
    const userId = await rich();
    await expect(buy(userId, notOnOffer, "k-not-0001")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    for (let i = 0; i < 3; i++) await buy(userId, onOffer, `k-max-000${i}`);
    await expect(buy(userId, onOffer, "k-max-0009")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const poor = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id; // 400 Salt
    await expect(buy(poor, onOffer, "k-poor-001")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    expect(await getBalance(db, poor)).toBe(400n);
  });
});

describe("owned characters on stream", () => {
  it("join matchmaking and are booked into fights", async () => {
    const userId = await rich();
    const { characterId } = await buy(userId, onOffer, "k-stream-01");
    // Move the house characters into tier P too, so the owned copy has opponents.
    await db.character.updateMany({ where: { ownerKind: "HOUSE" }, data: { rating: 1350, tier: "P" } });
    await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
    const r = seededRandom("stream");
    const rng: Rng = { int: (n) => Math.floor(r() * n), chance: () => r() };
    const o = new Orchestrator({
      db,
      config,
      orch: { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10 },
      bus: new FightBus(),
      now: () => new Date(),
      source: createFakeSource({ seed: "stream" }),
      rng,
    });
    await o.run(6);
    const fights = await db.fight.count({ where: { OR: [{ side1CharacterId: characterId }, { side2CharacterId: characterId }] } });
    expect(fights).toBeGreaterThanOrEqual(2);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});
