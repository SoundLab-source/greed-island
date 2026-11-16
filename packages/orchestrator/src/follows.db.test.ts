import { createCharacter, createUser } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { loadConfig, LedgerRuleError, type Config } from "@greed-island/shared";
import type { FastifyInstance } from "fastify";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "./api/server.ts";
import { FightBus } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, type FightDeps } from "./fights.ts";
import { followFighter, myFollows, unfollowFighter } from "./follows.ts";
import { ConsoleMailer } from "./mail.ts";
import { SubmissionStore } from "./submission-store.ts";

const db = useTestDb();
const submissionsDir = await mkdtemp(nodePath.join(tmpdir(), "gi-follows-"));
afterAll(() => rm(submissionsDir, { recursive: true, force: true }));
const config: Config = { ...loadConfig({}), economy: testEconomy, follows: { max: 2 } };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0 };

let app: FastifyInstance;
let chars: Record<string, string>;

beforeEach(async () => {
  chars = {};
  for (const [id, name] of [["loot", "Free Loot"], ["cheese", "Big Cheese"], ["oak", "Old Oak"]] as const) {
    await db.fighter.create({ data: { id, displayName: name, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    chars[id] = (await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name }, ratingSettings))).id;
  }
  await db.fighter.create({ data: { id: "gone", displayName: "Retired", archetype: "ZONER", defPath: "chars/gone/gone.def", licenseNote: "test", enabled: false } });
  await db.stage.create({ data: { id: "s1", displayName: "Stage One", defPath: "stages/s1.def", licenseNote: "test" } });
  app = await buildServer({ db, config, bus: new FightBus(), heartbeatMs: 50, mailer: new ConsoleMailer(() => {}), publicUrl: "https://gi.test/", submissionStore: new SubmissionStore(submissionsDir) });
});
afterEach(() => app.close());

async function session() {
  const res = await app.inject({ method: "POST", url: "/api/session", payload: {} });
  return { authorization: `Bearer ${res.json().token as string}` };
}

/** A fight between two characters with betting open. */
async function openFight(a: string, b: string) {
  const deps: FightDeps = { db, config, orch, bus: new FightBus(), now: () => new Date() };
  const n = await db.fight.count();
  const f = await db.fight.create({
    data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: n, pairKind: "CROSS_TIER", stageId: "s1", side1CharacterId: chars[a]!, side2CharacterId: chars[b]! },
  });
  await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
  return f.id;
}

describe("following fighters", () => {
  it("follows, lists and unfollows through the API, and the player sees their follows", async () => {
    const auth = await session();
    const put = await app.inject({ method: "PUT", url: "/api/me/follows/loot", headers: auth });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual({ following: true, added: true });
    // Following again changes nothing.
    expect((await app.inject({ method: "PUT", url: "/api/me/follows/loot", headers: auth })).json()).toEqual({ following: true, added: false });

    const list = (await app.inject({ method: "GET", url: "/api/me/follows", headers: auth })).json();
    expect(list).toMatchObject([{ fighterId: "loot", name: "Free Loot", archetype: "ALL_ROUNDER", profileId: chars.loot }]);
    const me = (await app.inject({ method: "GET", url: "/api/me", headers: auth })).json();
    expect(me.follows).toEqual([{ fighterId: "loot", name: "Free Loot", archetype: "ALL_ROUNDER", profileId: chars.loot }]);

    const del = await app.inject({ method: "DELETE", url: "/api/me/follows/loot", headers: auth });
    expect(del.json()).toEqual({ following: false, removed: true });
    expect((await app.inject({ method: "DELETE", url: "/api/me/follows/loot", headers: auth })).json()).toEqual({ following: false, removed: false });
    expect((await app.inject({ method: "GET", url: "/api/me/follows", headers: auth })).json()).toEqual([]);
  });

  it("needs a session, a real fighter on the roster, and stops at the cap", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/me/follows/loot" })).statusCode).toBe(401);
    const auth = await session();
    expect((await app.inject({ method: "PUT", url: "/api/me/follows/nobody", headers: auth })).statusCode).toBe(404);
    const retired = await app.inject({ method: "PUT", url: "/api/me/follows/gone", headers: auth });
    expect(retired.statusCode).toBe(409);
    expect(retired.json().message).toMatch(/isn't on the roster/);

    await app.inject({ method: "PUT", url: "/api/me/follows/loot", headers: auth });
    await app.inject({ method: "PUT", url: "/api/me/follows/cheese", headers: auth });
    const third = await app.inject({ method: "PUT", url: "/api/me/follows/oak", headers: auth });
    expect(third.statusCode).toBe(409);
    expect(third.json().message).toMatch(/up to 2 fighters/);
  });

  it("holds the cap when follows arrive together", async () => {
    const userId = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
    const results = await Promise.allSettled(["loot", "cheese", "oak"].map((id) => followFighter(db, userId, id, config.follows)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await db.fighterFollow.count({ where: { userId } })).toBe(2);
  });

  it("keeps a follow when its fighter retires, and lets the player unfollow it", async () => {
    const userId = (await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id;
    await followFighter(db, userId, "oak", config.follows);
    await db.fighter.update({ where: { id: "oak" }, data: { enabled: false } });
    expect((await myFollows(db, userId)).map((f) => f.fighterId)).toEqual(["oak"]);
    // Following it again is still a no-op rather than an error.
    expect(await followFighter(db, userId, "oak", config.follows)).toEqual({ following: true, added: false });
    expect(await unfollowFighter(db, userId, "oak")).toEqual({ following: false, removed: true });
  });

  it("refuses bots", async () => {
    const bot = (await createUser(db, { kind: "BOT", displayName: "Bot" }, config.economy)).user.id;
    await expect(followFighter(db, bot, "loot", config.follows)).rejects.toBeInstanceOf(LedgerRuleError);
  });
});

describe("the heads-up", () => {
  it("is on the fight for a viewer who follows either side, and only for them", async () => {
    const fan = await session();
    const stranger = await session();
    await app.inject({ method: "PUT", url: "/api/me/follows/cheese", headers: fan });
    const fightId = await openFight("loot", "cheese");

    const seen = (await app.inject({ method: "GET", url: "/api/fights/current", headers: fan })).json();
    expect(seen.id).toBe(fightId);
    expect(seen.following).toEqual({ sides: [2], line: "Big Cheese is up: betting is open" });
    expect((await app.inject({ method: "GET", url: `/api/fights/${fightId}`, headers: stranger })).json().following).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/fights/${fightId}` })).json().following).toBeNull();
  });

  it("counts followers on a character's profile", async () => {
    for (let i = 0; i < 3; i++) {
      const auth = await session();
      await app.inject({ method: "PUT", url: "/api/me/follows/loot", headers: auth });
    }
    expect((await app.inject({ method: "GET", url: `/api/characters/${chars.loot}` })).json().followers).toBe(3);
    expect((await app.inject({ method: "GET", url: `/api/characters/${chars.oak}` })).json().followers).toBe(0);
  });
});
