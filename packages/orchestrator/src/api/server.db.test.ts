import { createCharacter } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { createFakeSource, seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { FightBus } from "../bus.ts";
import { DEFAULT_ORCHESTRATOR } from "../config.ts";
import { applyTransition, bookFight, type FightDeps } from "../fights.ts";
import type { Rng } from "../matchmaking.ts";
import { Orchestrator } from "../orchestrator.ts";
import { ConsoleMailer } from "../mail.ts";
import { setRole } from "../staff.ts";
import { SubmissionStore } from "../submission-store.ts";
import { png } from "../testing/png.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { buildServer, loadTwitchChannel } from "./server.ts";

const db = useTestDb();
const submissionsDir = await mkdtemp(nodePath.join(tmpdir(), "gi-api-submissions-"));
afterAll(() => rm(submissionsDir, { recursive: true, force: true }));
const config: Config = { ...loadConfig({}), economy: testEconomy };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0 };
const rng = (seed = "api"): Rng => {
  const r = seededRandom(seed);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let app: FastifyInstance;
let bus: FightBus;
let deps: FightDeps;
let mailer: ConsoleMailer;

beforeEach(async () => {
  bus = new FightBus();
  deps = { db, config, orch, bus, now: () => new Date() };
  for (const id of ["f1", "f2"]) {
    await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `Char ${id}` }, ratingSettings));
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage One", defPath: "stages/s1.def", licenseNote: "test" } });
  mailer = new ConsoleMailer(() => {});
  app = await buildServer({ db, config, bus, heartbeatMs: 50, mailer, publicUrl: "https://gi.test/", submissionStore: new SubmissionStore(submissionsDir) });
});
afterEach(() => app.close());

async function session(displayName?: string) {
  const res = await app.inject({ method: "POST", url: "/api/session", payload: displayName ? { displayName } : {} });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return { token: body.token as string, auth: { authorization: `Bearer ${body.token}` }, me: body.me };
}

async function openFight() {
  const f = (await bookFight(deps, rng(), "fake"))!;
  await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
  return f;
}

describe("sessions and the player", () => {
  it("creates an anonymous player with the starting balance", async () => {
    const s = await session("Tester");
    expect(s.me).toMatchObject({ name: "Tester", balance: "400", dailyGrantAvailable: true, bailoutAvailable: false });
    const me = await app.inject({ method: "GET", url: "/api/me", headers: s.auth });
    expect(me.json().balance).toBe("400");
  });

  it("requires a session for player routes", async () => {
    for (const [method, url] of [["GET", "/api/me"], ["GET", "/api/me/bets"], ["POST", "/api/me/daily-grant"]] as const) {
      const res = await app.inject({ method, url, headers: { authorization: "Bearer nope" } });
      expect(res.statusCode).toBe(401);
    }
  });

  it("grants the daily Salt once", async () => {
    const s = await session();
    const a = await app.inject({ method: "POST", url: "/api/me/daily-grant", headers: s.auth });
    const b = await app.inject({ method: "POST", url: "/api/me/daily-grant", headers: s.auth });
    expect(a.json()).toMatchObject({ status: "GRANTED", amount: "100", balance: "500" });
    expect(b.json()).toMatchObject({ status: "ALREADY_CLAIMED", amount: "0" });
  });

  it("refuses a bailout above the floor", async () => {
    const s = await session();
    const res = await app.inject({ method: "POST", url: "/api/me/bailout", headers: s.auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("NOT_ELIGIBLE");
  });
});

describe("email sign-in", () => {
  const linkToken = () => {
    const m = /\?login=([^\s]+)/.exec(mailer.sent.at(-1)!.text);
    return decodeURIComponent(m![1]!);
  };

  it("emails a one-time link that signs in and creates the account", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/email", payload: { email: "Pat@Example.com" } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ sent: true, email: "pat@example.com" });
    expect(mailer.sent.at(-1)).toMatchObject({ to: "pat@example.com" });
    expect(mailer.sent.at(-1)!.text).toContain("https://gi.test/?login=");
    const verify = await app.inject({ method: "POST", url: "/api/auth/verify", payload: { token: linkToken() } });
    expect(verify.statusCode).toBe(200);
    const body = verify.json();
    expect(body).toMatchObject({ created: true, me: { kind: "EMAIL", email: "pat@example.com", balance: "400" } });
    const me = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${body.token}` } });
    expect(me.json().email).toBe("pat@example.com");
    // The link only works once.
    expect((await app.inject({ method: "POST", url: "/api/auth/verify", payload: { token: linkToken() } })).statusCode).toBe(400);
  });

  it("lets an anonymous player keep their Salt by adding an email", async () => {
    const s = await session();
    await app.inject({ method: "POST", url: "/api/me/daily-grant", headers: s.auth });
    await app.inject({ method: "POST", url: "/api/auth/email", headers: s.auth, payload: { email: "keep@example.com" } });
    const verify = (await app.inject({ method: "POST", url: "/api/auth/verify", payload: { token: linkToken() } })).json();
    expect(verify.me).toMatchObject({ id: s.me.id, kind: "EMAIL", email: "keep@example.com", balance: "500" });
  });

  it("signs out a device", async () => {
    const s = await session();
    expect((await app.inject({ method: "POST", url: "/api/auth/logout", headers: s.auth })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: s.auth })).statusCode).toBe(401);
  });

  it("rejects bad emails and rate-limits link requests", async () => {
    expect((await app.inject({ method: "POST", url: "/api/auth/email", payload: { email: "nope" } })).json().error).toBe("INVALID_EMAIL");
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await app.inject({ method: "POST", url: "/api/auth/email", payload: { email: "flood@example.com" } })).statusCode;
    expect(last).toBe(429);
  });
});

describe("fights and bets", () => {
  it("shows the current fight with frozen stats and live odds", async () => {
    const f = await openFight();
    const res = await app.inject({ method: "GET", url: "/api/fights/current" });
    const view = res.json();
    expect(view).toMatchObject({ id: f.id, number: f.number, state: "BETTING_OPEN", stage: { displayName: "Stage One" } });
    expect(view.sides[1]).toMatchObject({ tier: "B", rating: 1500, record: { wins: 0, losses: 0 }, winRate: null, last10: [], frozen: true });
    expect(view.odds).toMatchObject({ locked: false, multiplier: { 1: "1.90x", 2: "1.90x" } });
    expect(view.headToHead).toEqual({ fights: 0, wins: { 1: 0, 2: 0 } });
    expect(view.odds.pool).toBeUndefined(); // no crowd split before lock
  });

  it("places, changes and replays a bet; shows it as the viewer's bet", async () => {
    const f = await openFight();
    const s = await session();
    const bet = (side: number, stake: unknown, key: string) =>
      app.inject({ method: "POST", url: `/api/fights/${f.id}/bets`, headers: s.auth, payload: { side, stake, idempotencyKey: key } });
    expect((await bet(1, "50", "key-00000001")).json()).toMatchObject({ bet: { side: 1, stake: "50" }, balance: "350", replayed: false });
    expect((await bet(2, 80, "key-00000002")).json()).toMatchObject({ bet: { side: 2, stake: "80" }, balance: "320" });
    expect((await bet(2, 80, "key-00000002")).json()).toMatchObject({ replayed: true, balance: "320" });
    const view = (await app.inject({ method: "GET", url: `/api/fights/${f.id}`, headers: s.auth })).json();
    expect(view.myBet).toEqual({ side: 2, stake: "80", status: "OPEN", returned: null });
    const history = (await app.inject({ method: "GET", url: "/api/me/bets", headers: s.auth })).json();
    expect(history).toHaveLength(1);
  });

  it.each([
    [{ side: 1, stake: "1.5", idempotencyKey: "key-00000001" }, 400, "INVALID_AMOUNT"],
    [{ side: 1, stake: 2.5, idempotencyKey: "key-00000001" }, 400, "INVALID_AMOUNT"],
    [{ side: 3, stake: "5", idempotencyKey: "key-00000001" }, 400, "INVALID_REQUEST"],
    [{ side: 1, stake: "0", idempotencyKey: "key-00000001" }, 400, "BELOW_MIN_BET"],
    [{ side: 1, stake: "401", idempotencyKey: "key-00000001" }, 409, "INSUFFICIENT_FUNDS"],
    [{ side: 1, stake: "5", idempotencyKey: "short" }, 400, "INVALID_REQUEST"],
  ])("rejects %j with %i %s", async (payload, status, error) => {
    const f = await openFight();
    const s = await session();
    const res = await app.inject({ method: "POST", url: `/api/fights/${f.id}/bets`, headers: s.auth, payload });
    expect(res.statusCode).toBe(status);
    expect(res.json().error).toBe(error);
  });

  it("rejects bets once betting has closed, and unknown fights", async () => {
    const f = await openFight();
    await applyTransition(deps, f.id, { type: "LOCK" });
    const s = await session();
    const res = await app.inject({ method: "POST", url: `/api/fights/${f.id}/bets`, headers: s.auth, payload: { side: 1, stake: "5", idempotencyKey: "key-00000001" } });
    expect(res.statusCode).toBe(409);
    const view = (await app.inject({ method: "GET", url: `/api/fights/${f.id}` })).json();
    expect(view.odds).toMatchObject({ locked: true, bettors: 0, pool: { 1: "0", 2: "0" } });
    expect((await app.inject({ method: "GET", url: "/api/fights/00000000-0000-0000-0000-000000000000" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/fights/not-a-uuid" })).statusCode).toBe(400);
  });
});

describe("shop", () => {
  it("lists the rotation and sells an owned character to a player who can afford it", async () => {
    const rich = await buildServer({ db, config: { ...config, economy: { ...config.economy, startingBalance: 5_000n } }, bus, mailer });
    try {
      const s = (await rich.inject({ method: "POST", url: "/api/session" })).json();
      const auth = { authorization: `Bearer ${s.token}` };
      const shop = (await rich.inject({ method: "GET", url: "/api/shop" })).json();
      expect(shop.offers.length).toBeGreaterThan(0);
      expect(shop.offers[0]).toMatchObject({ price: "1000", firstEditionLeft: 25 });
      const buy = await rich.inject({ method: "POST", url: "/api/shop/buy", headers: auth, payload: { fighterId: shop.offers[0].fighterId, idempotencyKey: "buy-key-0001" } });
      expect(buy.statusCode).toBe(201);
      expect(buy.json()).toMatchObject({ balance: "4000", replayed: false, character: { serial: 1, firstEdition: true, tier: "P", owner: { kind: "player" } } });
      const mine = (await rich.inject({ method: "GET", url: "/api/me/characters", headers: auth })).json();
      expect(mine).toHaveLength(1);
      const again = await rich.inject({ method: "POST", url: "/api/shop/buy", headers: auth, payload: { fighterId: shop.offers[0].fighterId, idempotencyKey: "buy-key-0001" } });
      expect(again.statusCode).toBe(200);
      expect(again.json().replayed).toBe(true);
      // Upgrades and sidegrades through the API.
      const id = mine[0].id;
      expect(mine[0].prices).toEqual({ next: { life: "150", attack: "200", defense: "200", power: "120" }, sidegrade: "300" });
      const upg = await rich.inject({ method: "POST", url: `/api/characters/${id}/upgrade`, headers: auth, payload: { stat: "life", idempotencyKey: "upg-key-0001" } });
      expect(upg.statusCode).toBe(200);
      expect(upg.json()).toMatchObject({ balance: "3850", character: { levels: { life: 1 }, stats: { lifePct: 106 } } });
      const side = await rich.inject({ method: "POST", url: `/api/characters/${id}/sidegrade`, headers: auth, payload: { sidegrade: "BRUISER", idempotencyKey: "side-key-001" } });
      expect(side.json()).toMatchObject({ balance: "3550", character: { sidegrade: "BRUISER", stats: { lifePct: 116 } } });
      expect(side.json().character.upgrades).toHaveLength(2);
      const bad = await rich.inject({ method: "POST", url: `/api/characters/${id}/upgrade`, headers: auth, payload: { stat: "speed", idempotencyKey: "upg-key-0002" } });
      expect(bad.statusCode).toBe(400);
      // Cosmetics: a First Edition copy starts with its badge and can pick what to show.
      expect(mine[0].cosmetics).toMatchObject({ title: null, nameplate: { id: "standard" }, badges: [{ id: "first-edition", label: "First Edition" }] });
      expect(mine[0].unlocked).toEqual({ titles: [], nameplates: [{ id: "standard", label: "Standard" }], badges: [{ id: "first-edition", label: "First Edition" }] });
      const put = (payload: unknown, headers: Record<string, string> = auth) => rich.inject({ method: "PUT", url: `/api/characters/${id}/cosmetics`, headers, payload: payload as object });
      const hide = await put({ badges: [] });
      expect(hide.statusCode).toBe(200);
      expect(hide.json()).toMatchObject({ equipped: { badges: [] }, character: { cosmeticChoice: { badges: [] }, titles: [] } });
      expect((await put({ nameplate: "gold" })).json()).toMatchObject({ error: "NOT_ELIGIBLE" });
      expect((await put({ glow: true })).statusCode).toBe(400);
      expect((await put({}, {})).statusCode).toBe(401);
      expect((await put({})).json().character.cosmeticChoice).toBeNull();
    } finally {
      await rich.close();
    }
  });

  it("refuses a player who can't afford it, and requires a session", async () => {
    const s = await session();
    const shop = (await app.inject({ method: "GET", url: "/api/shop" })).json();
    const res = await app.inject({ method: "POST", url: "/api/shop/buy", headers: s.auth, payload: { fighterId: shop.offers[0].fighterId, idempotencyKey: "buy-key-0002" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("INSUFFICIENT_FUNDS");
    expect((await app.inject({ method: "POST", url: "/api/shop/buy", payload: { fighterId: "f1", idempotencyKey: "buy-key-0003" } })).statusCode).toBe(401);
  });
});

describe("exhibition challenges", () => {
  it("lists options, sends, answers and shows challenges", async () => {
    const [a, b] = [await session("Alice"), await session("Bob")];
    for (const [s, id] of [[a, "f1"], [b, "f2"]] as const) {
      await db.character.create({
        data: { fighterId: id, name: `${s.me.name}'s ${id}`, rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: s.me.id, serial: 2, acquiredAt: new Date() },
      });
    }
    const options = (await app.inject({ method: "GET", url: "/api/challenges/options", headers: a.auth })).json();
    expect(options.mine).toHaveLength(1);
    expect(options.opponents).toMatchObject([{ owner: "Bob", name: "Bob's f2" }]);
    const payload = { challengerCharacterId: options.mine[0].id, challengedCharacterId: options.opponents[0].id };
    const sent = await app.inject({ method: "POST", url: "/api/challenges", headers: a.auth, payload });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().challenges.outgoing[0]).toMatchObject({ status: "PENDING", challenger: { owner: "Alice" }, challenged: { owner: "Bob" } });
    expect((await app.inject({ method: "POST", url: "/api/challenges", headers: a.auth, payload })).json()).toMatchObject({ replayed: true });

    const incoming = (await app.inject({ method: "GET", url: "/api/me/challenges", headers: b.auth })).json().incoming;
    expect(incoming).toHaveLength(1);
    const id = incoming[0].id;
    const accepted = await app.inject({ method: "POST", url: `/api/challenges/${id}/accept`, headers: b.auth });
    expect(accepted.json()).toMatchObject({ status: "ACCEPTED", challenges: { incoming: [{ id, queuePosition: 1 }] } });
    expect((await app.inject({ method: "POST", url: `/api/challenges/${id}/decline`, headers: b.auth })).statusCode).toBe(409);
    const stranger = await session("Carol");
    expect((await app.inject({ method: "POST", url: `/api/challenges/${id}/cancel`, headers: stranger.auth })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/challenges/${id}/cancel` })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/api/challenges/${id}/cancel`, headers: a.auth })).json().status).toBe("CANCELLED");
    // House characters can't be challenged.
    const house = await db.character.findFirstOrThrow({ where: { ownerKind: "HOUSE" } });
    const bad = await app.inject({ method: "POST", url: "/api/challenges", headers: a.auth, payload: { ...payload, challengedCharacterId: house.id } });
    expect(bad.json()).toMatchObject({ error: "NOT_ELIGIBLE" });
  });
});

describe("tournaments", () => {
  it("shows the bracket and takes bets in T-Salt", async () => {
    // Tournament first: the two house characters (B tier) fill an S-tier final.
    const tdeps = { ...deps, orch: { ...orch, cycle: { matchmakingFights: 0, tournamentSize: 16, exhibitionFights: 1 } } };
    const f = (await bookFight(tdeps, rng(), "fake"))!;
    await applyTransition(tdeps, f.id, { type: "OPEN_BETTING" });
    const s = await session("Tia");
    const current = (await app.inject({ method: "GET", url: "/api/fights/current", headers: s.auth })).json();
    expect(current).toMatchObject({ currency: "T-Salt", tournament: { tier: "S", roundName: "final" } });
    expect((await app.inject({ method: "GET", url: "/api/me", headers: s.auth })).json().tournament).toMatchObject({ balance: "1000", joined: false });
    const bet = await app.inject({ method: "POST", url: `/api/fights/${f.id}/bets`, headers: s.auth, payload: { side: 1, stake: "250", idempotencyKey: "tbet-000001" } });
    expect(bet.json()).toMatchObject({ balance: "750" });
    const me = (await app.inject({ method: "GET", url: "/api/me", headers: s.auth })).json();
    expect(me).toMatchObject({ balance: "400", inOpenBets: "0", tournament: { balance: "750", joined: true } });
    const bracket = (await app.inject({ method: "GET", url: "/api/tournaments/current", headers: s.auth })).json();
    expect(bracket).toMatchObject({ status: "RUNNING", size: 2, myBalance: "750", rounds: [{ name: "final", matches: [{ fights: [{ number: f.number }] }] }] });
    expect((await app.inject({ method: "GET", url: "/api/tournaments" })).json()).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: `/api/tournaments/${randomUUID()}` })).statusCode).toBe(404);
    const history = (await app.inject({ method: "GET", url: "/api/me/bets", headers: s.auth })).json();
    expect(history[0]).toMatchObject({ currency: "T-Salt", stake: "250" });
  });
});

describe("stats after fights", () => {
  it("reports results, rankings, form, head-to-head and profiles", async () => {
    const o = new Orchestrator({ ...deps, source: createFakeSource({ seed: "stats" }), rng: rng("stats"), orch: { ...orch, matchmaking: { ...orch.matchmaking, rematchCooldown: 0 } } });
    await o.run(3);
    const results = (await app.inject({ method: "GET", url: "/api/results" })).json();
    expect(results).toHaveLength(3);
    const chars = (await app.inject({ method: "GET", url: "/api/characters" })).json();
    expect(chars).toHaveLength(2);
    expect(chars[0].rating).toBeGreaterThanOrEqual(chars[1].rating);
    const profile = (await app.inject({ method: "GET", url: `/api/characters/${chars[0].id}` })).json();
    expect(profile.recentFights).toHaveLength(3);
    expect(profile.last10.length).toBeGreaterThan(0);
    expect(profile.tierHistory.at(-1)).toMatchObject({ reason: "INITIAL" });
    expect(profile.license).toBe("test");
    // The top-rated character has won at least once: First Blood, earned under the house.
    expect(profile.titles[0]).toMatchObject({ code: "FIRST_BLOOD", label: "First Blood", earnedBy: { kind: "house", name: "House" } });
    expect(profile.titles[0].fightNumber).toBeGreaterThan(0);
    expect(chars[0].title).toMatchObject({ code: expect.any(String) });
    const catalog = (await app.inject({ method: "GET", url: "/api/cosmetics" })).json();
    expect(catalog).toMatchObject({ maxBadges: 3 });
    expect(catalog.titles.map((t: { code: string }) => t.code)).toContain("GIANT_SLAYER");
    const current = (await app.inject({ method: "GET", url: "/api/fights/current" })).json();
    expect(current.headToHead.fights).toBe(3);
    expect(current.sides[1].cosmetics).toMatchObject({ nameplate: { id: expect.any(String) } });
    expect(current.result).not.toBeNull();
    const board = (await app.inject({ method: "GET", url: "/api/leaderboard" })).json();
    expect(Array.isArray(board)).toBe(true);
  });
});

describe("seasons", () => {
  it("serves the running season, past seasons and the season leaderboard", async () => {
    expect((await app.inject({ method: "GET", url: "/api/seasons/current" })).json()).toBeNull();
    expect((await app.inject({ method: "GET", url: "/api/leaderboard" })).json()).toEqual([]);
    const s = await session("Bettor");
    // The first booking starts Season 1.
    const f = await openFight();
    const bet = await app.inject({ method: "POST", url: `/api/fights/${f.id}/bets`, headers: s.auth, payload: { side: 1, stake: "10", idempotencyKey: "season-bet-1" } });
    expect(bet.statusCode).toBe(200);
    for (const type of ["LOCK", "ENGINE_STARTED"] as const) await applyTransition(deps, f.id, { type });
    await applyTransition(deps, f.id, { type: "MATCH_END", winnerSide: 2 });
    await applyTransition(deps, f.id, { type: "SETTLED_OK" });

    const current = (await app.inject({ method: "GET", url: "/api/seasons/current", headers: s.auth })).json();
    expect(current).toMatchObject({ number: 1, status: "RUNNING", champion: null, rules: { minFights: 10, minBets: 10 }, me: { rank: 1, saltWon: "-10", bets: 1 } });
    expect(current.players).toEqual([{ rank: 1, name: "Bettor", saltWon: "-10", bets: 1, eligible: false }]);
    expect(current.characters).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: "/api/leaderboard" })).json()).toEqual(current.players);
    expect((await app.inject({ method: "GET", url: "/api/seasons/1" })).json()).toMatchObject({ number: 1, status: "RUNNING" });
    expect((await app.inject({ method: "GET", url: "/api/seasons" })).json()).toMatchObject([{ number: 1, status: "RUNNING" }]);
    expect((await app.inject({ method: "GET", url: "/api/seasons/99" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/seasons/first" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: s.auth })).json().season).toMatchObject({ number: 1, rank: 1, saltWon: "-10", bets: 1, minBets: 10 });
  });
});

describe("staff and custom names", () => {
  async function signIn(email: string) {
    await app.inject({ method: "POST", url: "/api/auth/email", payload: { email } });
    const token = decodeURIComponent(/\?login=([^\s]+)/.exec(mailer.sent.at(-1)!.text)![1]!);
    const body = (await app.inject({ method: "POST", url: "/api/auth/verify", payload: { token } })).json();
    return { authorization: `Bearer ${body.token}` };
  }

  it("takes a name request from an owner, and lets staff approve it", async () => {
    const player = await session("Owner");
    const c = await db.character.create({
      data: { fighterId: "f1", name: "f1 #1", rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: player.me.id, serial: 1, acquiredAt: new Date() },
    });
    const ask = (name: string) => app.inject({ method: "POST", url: `/api/characters/${c.id}/name`, headers: player.auth, payload: { name } });
    const first = await ask("Iron Lotus");
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ request: { name: "Iron Lotus", status: "PENDING" }, replayed: false });
    expect((await ask("Iron Lotus")).statusCode).toBe(200);
    expect((await ask("Iron #2")).json()).toMatchObject({ error: "NOT_ELIGIBLE" });
    const mine = (await app.inject({ method: "GET", url: "/api/me/characters", headers: player.auth })).json();
    expect(mine[0]).toMatchObject({ name: "f1 #1", automaticName: "f1 #1", nameRequest: { name: "Iron Lotus", status: "PENDING" } });

    // Players (and signed-out visitors) can't use staff routes.
    expect((await app.inject({ method: "GET", url: "/api/staff/queue", headers: player.auth })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/staff/queue" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/api/staff/reviews/${first.json().request.id}/approve`, headers: player.auth })).statusCode).toBe(403);
    expect(player.me).toMatchObject({ role: "PLAYER", permissions: [] });

    // The admin (set from the command line) appoints a moderator by email.
    const adminAuth = await signIn("boss@example.com");
    await setRole(db, { actorId: null, target: { email: "boss@example.com" }, role: "ADMIN" });
    expect((await app.inject({ method: "GET", url: "/api/me", headers: adminAuth })).json()).toMatchObject({ role: "ADMIN", permissions: expect.arrayContaining(["manage_moderators"]) });
    const modAuth = await signIn("mod@example.com");
    const appoint = await app.inject({ method: "PUT", url: "/api/staff/members", headers: adminAuth, payload: { email: "mod@example.com", role: "MODERATOR" } });
    expect(appoint.json()).toMatchObject({ from: "PLAYER", to: "MODERATOR", changed: true });
    expect((await app.inject({ method: "PUT", url: "/api/staff/members", headers: adminAuth, payload: { email: "mod@example.com", role: "ADMIN" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/staff/members", headers: modAuth, payload: { email: "boss@example.com", role: "PLAYER" } })).statusCode).toBe(403);
    const members = (await app.inject({ method: "GET", url: "/api/staff/members", headers: modAuth })).json();
    expect(members.map((m: { role: string; email: string | null }) => [m.role, m.email])).toEqual([["MODERATOR", null], ["ADMIN", null]]);
    expect((await app.inject({ method: "GET", url: "/api/staff/members", headers: adminAuth })).json().map((m: { email: string }) => m.email)).toEqual(["mod@example.com", "boss@example.com"]);

    // The moderator works through the queue.
    const queue = (await app.inject({ method: "GET", url: "/api/staff/queue", headers: modAuth })).json();
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0]).toMatchObject({ proposedName: "Iron Lotus", submittedBy: { name: "Owner" }, character: { name: "f1 #1" } });
    const reject = await app.inject({ method: "POST", url: `/api/staff/reviews/${queue.pending[0].id}/reject`, headers: modAuth, payload: {} });
    expect(reject.json()).toMatchObject({ error: "NOT_ELIGIBLE", message: expect.stringMatching(/say why/) });
    const approve = await app.inject({ method: "POST", url: `/api/staff/reviews/${queue.pending[0].id}/approve`, headers: modAuth, payload: { note: "welcome" } });
    expect(approve.json()).toEqual({ id: queue.pending[0].id, status: "APPROVED" });
    expect((await app.inject({ method: "GET", url: `/api/characters/${c.id}` })).json()).toMatchObject({ name: "Iron Lotus", formerNames: ["f1 #1"] });

    // Search, resets and the log.
    const found = (await app.inject({ method: "GET", url: "/api/staff/search?q=owner", headers: modAuth })).json();
    expect(found.players).toMatchObject([{ id: player.me.id, name: "Owner" }]);
    expect((await app.inject({ method: "POST", url: `/api/staff/players/${player.me.id}/reset-name`, headers: modAuth, payload: { note: "rude" } })).statusCode).toBe(204);
    const reset = await app.inject({ method: "POST", url: `/api/staff/characters/${c.id}/reset-name`, headers: modAuth, payload: { note: "rude" } });
    expect(reset.json()).toEqual({ name: "f1 #1" });
    const log = (await app.inject({ method: "GET", url: "/api/staff/log", headers: modAuth })).json();
    expect(log.map((l: { kind: string }) => l.kind)).toEqual(["CHARACTER_NAME_RESET", "DISPLAY_NAME_RESET", "REVIEW_APPROVED", "ROLE_SET", "ROLE_SET"]);
    expect((await app.inject({ method: "GET", url: "/api/staff/log", headers: player.auth })).statusCode).toBe(403);
  });
});

describe("fighter submissions", () => {
  async function signIn(email: string) {
    await app.inject({ method: "POST", url: "/api/auth/email", payload: { email } });
    const token = decodeURIComponent(/\?login=([^\s]+)/.exec(mailer.sent.at(-1)!.text)![1]!);
    const body = (await app.inject({ method: "POST", url: "/api/auth/verify", payload: { token } })).json();
    return { authorization: `Bearer ${body.token}` };
  }
  const details = {
    community: "Pixel Monks",
    fighterName: "Iron Heron",
    archetype: "GRAPPLER",
    description: "A patient grappler.",
    rightsBasis: "ORIGINAL",
    rightsDetails: "Drawn by our member Sam in 2026; the community owns it.",
    rightsLink: null,
  };

  it("takes a submission with PNG uploads from staff while closed, and lets staff review it", async () => {
    const player = await signIn("player@example.com");
    const rules = (await app.inject({ method: "GET", url: "/api/submissions/rules", headers: player })).json();
    expect(rules).toMatchObject({ open: false, canSubmit: false, maxFiles: 24, archetypes: expect.arrayContaining(["GRAPPLER"]) });
    expect((await app.inject({ method: "POST", url: "/api/submissions", headers: player, payload: details })).statusCode).toBe(403);

    const adminAuth = await signIn("boss@example.com");
    await setRole(db, { actorId: null, target: { email: "boss@example.com" }, role: "ADMIN" });
    const modAuth = await signIn("mod@example.com");
    await setRole(db, { actorId: null, target: { email: "mod@example.com" }, role: "MODERATOR" });
    expect((await app.inject({ method: "GET", url: "/api/submissions/rules", headers: adminAuth })).json().canSubmit).toBe(true);
    const created = await app.inject({ method: "POST", url: "/api/submissions", headers: adminAuth, payload: details });
    expect(created.statusCode).toBe(201);
    const sub = created.json();
    expect(sub).toMatchObject({ status: "DRAFT", editable: true, missing: expect.arrayContaining(["a portrait"]) });
    expect((await app.inject({ method: "POST", url: "/api/submissions", headers: adminAuth, payload: { ...details, extra: 1 } })).statusCode).toBe(400);

    const upload = (role: string, body: Buffer, contentType = "image/png") =>
      app.inject({ method: "PUT", url: `/api/submissions/${sub.id}/files?role=${role}&label=${encodeURIComponent(`${role} frames`)}`, headers: { ...adminAuth, "content-type": contentType }, payload: body });
    const sprites = await upload("SPRITES", png(80, 60, 1));
    expect(sprites.statusCode).toBe(201);
    expect(sprites.json()).toMatchObject({ role: "SPRITES", label: "SPRITES frames", width: 80, height: 60 });
    for (const [role, shade] of [["PORTRAIT", 2], ["INTRO", 3], ["WIN_POSE", 4]] as const) expect((await upload(role, png(80, 60, shade))).statusCode).toBe(201);
    expect((await upload("SPRITES", Buffer.from("<svg/>"), "image/svg+xml")).statusCode).toBe(415);
    expect((await upload("SPRITES", Buffer.from("not a png but claims to be one.."))).json()).toMatchObject({ error: "NOT_ELIGIBLE", message: "only PNG images are accepted" });
    expect((await upload("SPRITES", Buffer.alloc(config.submissions.maxFileBytes + 2048))).statusCode).toBe(413);
    expect((await upload("HAT", png(8, 8, 5))).statusCode).toBe(400);

    // The image comes back only to the submitter and staff, as a plain PNG.
    const img = await app.inject({ method: "GET", url: `/api/submissions/${sub.id}/files/${sprites.json().id}`, headers: modAuth });
    expect(img.statusCode).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["x-content-type-options"]).toBe("nosniff");
    expect(img.rawPayload).toEqual(png(80, 60, 1));
    expect((await app.inject({ method: "GET", url: `/api/submissions/${sub.id}/files/${sprites.json().id}`, headers: player })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/submissions/${sub.id}`, headers: player })).statusCode).toBe(404);

    const sent = await app.inject({ method: "POST", url: `/api/submissions/${sub.id}/submit`, headers: adminAuth, payload: { confirmRights: true } });
    expect(sent.json()).toMatchObject({ status: "SUBMITTED", missing: [] });
    const queue = (await app.inject({ method: "GET", url: "/api/staff/queue", headers: modAuth })).json();
    expect(queue.pending[0]).toMatchObject({ kind: "FIGHTER_SUBMISSION", submission: { id: sub.id, fighterName: "Iron Heron" } });
    const back = await app.inject({ method: "POST", url: `/api/staff/reviews/${queue.pending[0].id}/request-changes`, headers: modAuth, payload: { note: "Add a palette." } });
    expect(back.json()).toMatchObject({ status: "CHANGES_REQUESTED" });
    const mine = (await app.inject({ method: "GET", url: "/api/me/submissions", headers: adminAuth })).json();
    expect(mine[0]).toMatchObject({ status: "CHANGES_REQUESTED", lastReview: { note: "Add a palette." } });
    expect((await app.inject({ method: "DELETE", url: `/api/submissions/${sub.id}/files/${sprites.json().id}`, headers: adminAuth })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/api/submissions/${sub.id}/withdraw`, headers: adminAuth })).json()).toMatchObject({ status: "WITHDRAWN" });
  });
});

describe("live stream", () => {
  it("sends hello, then bus events as they happen", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const received = await new Promise<string>((resolve, reject) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/stream" }, (res) => {
        expect(res.headers["content-type"]).toContain("text/event-stream");
        let buf = "";
        res.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
          if (buf.includes("event: hello") && !buf.includes("fight_state")) {
            bus.publish({ type: "fight_state", fightId: "x", number: 7, state: "LOCKED", version: 2 });
          }
          if (buf.includes("event: fight_state") && buf.includes("keep-alive")) {
            req.destroy();
            resolve(buf);
          }
        });
      });
      req.on("error", (e) => (e.message.includes("socket hang up") ? undefined : reject(e)));
    });
    expect(received).toContain('"state":"LOCKED"');
    expect(received).toContain(": keep-alive");
  });

  it("shuts down promptly even with a stream open", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    await new Promise<void>((resolve) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/stream" }, (res) => res.once("data", () => resolve()));
      req.on("error", () => {});
    });
    const started = Date.now();
    await app.close();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("serves the dev page and the stream overlay", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Greed Island");
    const overlay = await app.inject({ method: "GET", url: "/overlay.html" });
    expect(overlay.statusCode).toBe(200);
    expect(overlay.body).toContain("overlay.js");
    for (const file of ["/overlay.js", "/overlay.css", "/watch.html", "/watch.js", "/watch.css", "/staff.html", "/staff.js", "/submit.html", "/submit.js"]) expect((await app.inject({ method: "GET", url: file })).statusCode).toBe(200);
    // The watch page embeds Twitch only when a channel is configured.
    expect((await app.inject({ method: "GET", url: "/api/site" })).json()).toEqual({ twitchChannel: null });
    const withTwitch = await buildServer({ db, config, bus, mailer, twitchChannel: "greed_island" });
    try {
      expect((await withTwitch.inject({ method: "GET", url: "/api/site" })).json()).toEqual({ twitchChannel: "greed_island" });
    } finally {
      await withTwitch.close();
    }
    expect(loadTwitchChannel({ GI_TWITCH_CHANNEL: " Greed_Island " })).toBe("greed_island");
    expect(loadTwitchChannel({})).toBeNull();
    expect(() => loadTwitchChannel({ GI_TWITCH_CHANNEL: "no spaces allowed" })).toThrow(/isn't a Twitch channel name/);
    // Fields the overlay reads: round markers need roundsToWin.
    const f = await openFight();
    const view = (await app.inject({ method: "GET", url: `/api/fights/${f.id}` })).json();
    expect(view).toMatchObject({ roundsToWin: 2, currency: "Salt", tournament: null, rounds: [] });
    expect(view.sides[1].cosmetics.nameplate).toMatchObject({ background: expect.any(String), border: expect.any(String), text: expect.any(String) });
  });
});
