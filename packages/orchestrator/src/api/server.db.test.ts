import { createCharacter } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { createFakeSource, seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import type { FastifyInstance } from "fastify";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FightBus } from "../bus.ts";
import { DEFAULT_ORCHESTRATOR } from "../config.ts";
import { applyTransition, bookFight, type FightDeps } from "../fights.ts";
import type { Rng } from "../matchmaking.ts";
import { Orchestrator } from "../orchestrator.ts";
import { ConsoleMailer } from "../mail.ts";
import { buildServer } from "./server.ts";

const db = useTestDb();
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
  app = await buildServer({ db, config, bus, heartbeatMs: 50, mailer, publicUrl: "https://gi.test/" });
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
    const current = (await app.inject({ method: "GET", url: "/api/fights/current" })).json();
    expect(current.headToHead.fights).toBe(3);
    expect(current.result).not.toBeNull();
    const board = (await app.inject({ method: "GET", url: "/api/leaderboard" })).json();
    expect(Array.isArray(board)).toBe(true);
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

  it("serves the dev page", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Greed Island");
  });
});
