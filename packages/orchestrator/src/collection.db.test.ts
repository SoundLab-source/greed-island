import { createUser } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { loadConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { placeFightBet } from "./betting.ts";
import { FightBus } from "./bus.ts";
import { collectionView, markSeen, SEEN_GRACE_MS } from "./collection.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, type FightDeps } from "./fights.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0 };

let deps: FightDeps;
let userId: string;
const chars: Record<string, string> = {};

beforeEach(async () => {
  deps = { db, config, orch, bus: new FightBus(), now: () => new Date() };
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  for (const [i, id] of ["alpha", "bravo", "charlie", "delta"].entries()) {
    await db.fighter.create({
      data: { id, displayName: id.toUpperCase(), archetype: i % 2 ? "ZONER" : "HEAVY", rarity: id === "delta" ? "RARE" : "COMMON", defPath: `chars/${id}/${id}.def`, licenseNote: "test", createdAt: new Date(2026, 0, i + 1) },
    });
    chars[id] = (await db.character.create({ data: { rosterKey: id, fighterId: id, name: `${id} red`, rating: 1500, deviation: 50, volatility: 0.06, tier: "B" } })).id;
  }
  userId = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
});

async function fight(a: string, b: string) {
  const n = await db.fight.count();
  const f = await db.fight.create({
    data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: n, pairKind: "CROSS_TIER", stageId: "s1", side1CharacterId: chars[a]!, side2CharacterId: chars[b]! },
  });
  await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
  return f.id;
}
async function start(id: string) {
  await applyTransition(deps, id, { type: "LOCK" });
  await applyTransition(deps, id, { type: "ENGINE_STARTED" });
}
async function finish(id: string, winnerSide: 1 | 2) {
  await applyTransition(deps, id, { type: "MATCH_END", winnerSide });
  await applyTransition(deps, id, { type: "SETTLED_OK" });
}

describe("the card collection", () => {
  it("starts empty: every fighter, numbered oldest first, none seen", async () => {
    const c = await collectionView(db, userId);
    expect(c).toMatchObject({ total: 4, seen: 0, backed: 0 });
    expect(c.fighters.map((f) => [f.number, f.id, f.seen, f.backed])).toEqual([
      [1, "alpha", null, null],
      [2, "bravo", null, null],
      [3, "charlie", null, null],
      [4, "delta", null, null],
    ]);
    expect(c.fighters[3]).toMatchObject({ name: "DELTA", archetype: "ZONER", rarity: "RARE", profileId: chars.delta });
  });

  it("adds both fighters of a fight the player watched, once it has started", async () => {
    const f = await fight("alpha", "bravo");
    expect(await markSeen(db, userId, f)).toEqual({ recorded: 0, refused: "not-started" });
    await start(f);
    expect(await markSeen(db, userId, f)).toEqual({ recorded: 2 });
    expect(await markSeen(db, userId, f)).toEqual({ recorded: 0 }); // already there
    await finish(f, 1);
    const c = await collectionView(db, userId);
    expect(c).toMatchObject({ seen: 2, backed: 0 });
    expect(c.fighters.filter((x) => x.seen).map((x) => x.id)).toEqual(["alpha", "bravo"]);
    expect(await markSeen(db, userId, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("refuses a fight that ended long ago", async () => {
    const f = await fight("alpha", "bravo");
    await start(f);
    await finish(f, 2);
    const later = new Date(Date.now() + SEEN_GRACE_MS + 60_000);
    expect(await markSeen(db, userId, f, later)).toEqual({ recorded: 0, refused: "too-late" });
    expect(await markSeen(db, userId, f)).toEqual({ recorded: 2 }); // just after it ended is fine
  });

  it("counts fights bet on as seen, and bets won as backed", async () => {
    const f1 = await fight("charlie", "delta");
    await placeFightBet(db, config, { userId, fightId: f1, side: 2, stake: 10n, idempotencyKey: "collection-bet-1" });
    // Betting alone isn't seeing: the fight has to go ahead.
    expect((await collectionView(db, userId)).seen).toBe(0);
    await start(f1);
    await finish(f1, 2);
    const f2 = await fight("delta", "alpha");
    await placeFightBet(db, config, { userId, fightId: f2, side: 1, stake: 10n, idempotencyKey: "collection-bet-2" });
    await start(f2);
    await finish(f2, 1);
    const f3 = await fight("bravo", "charlie");
    await placeFightBet(db, config, { userId, fightId: f3, side: 1, stake: 10n, idempotencyKey: "collection-bet-3" });
    await start(f3);
    await finish(f3, 2);
    const c = await collectionView(db, userId);
    expect(c).toMatchObject({ total: 4, seen: 4, backed: 1 });
    expect(c.fighters.find((x) => x.id === "delta")!.backed).toEqual({ wins: 2 });
    expect(c.fighters.find((x) => x.id === "bravo")!.backed).toBeNull();
    // Another player's collection is their own.
    const other = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
    expect((await collectionView(db, other)).seen).toBe(0);
  });

  it("keeps a retired fighter the player has, and leaves out retired ones they don't", async () => {
    const f = await fight("alpha", "bravo");
    await start(f);
    await markSeen(db, userId, f);
    await db.fighter.updateMany({ where: { id: { in: ["alpha", "charlie"] } }, data: { enabled: false } });
    const c = await collectionView(db, userId);
    expect(c.fighters.map((x) => x.id)).toEqual(["alpha", "bravo", "delta"]);
    expect(c).toMatchObject({ total: 3, seen: 2 });
  });
});
