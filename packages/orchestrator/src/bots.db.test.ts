import { createCharacter, createUser, getBalance, grantTournamentSalt, tournamentBalances } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { leaderboard } from "./api/season-views.ts";
import { fightView } from "./api/views.ts";
import { announceBet, placeFightBet } from "./betting.ts";
import { BOTS, BotPlayers } from "./bots.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
// Two characters, so the same pair fights again and again.
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, matchmaking: { ...DEFAULT_ORCHESTRATOR.matchmaking, rematchCooldown: 0 } };
const rng = (): Rng => {
  const r = seededRandom("bots");
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let bus: FightBus;
let events: BusEvent[];
let deps: FightDeps;
let queued: (() => void)[];

/** Bot players whose bets wait in `queued` until the test runs them. */
function botPlayers(count = 12, cfg = config) {
  return new BotPlayers({
    db,
    config: cfg,
    bus,
    count,
    random: seededRandom("bot-players"),
    schedule: (_ms, fn) => {
      queued.push(fn);
      return () => {};
    },
  });
}

async function runQueued() {
  const fns = queued.splice(0);
  for (const fn of fns) fn();
  // Each bet is a few awaited queries.
  for (let i = 0; i < 100 && (await db.bet.count()) === 0; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 300));
}

beforeEach(async () => {
  bus = new FightBus();
  events = [];
  queued = [];
  bus.subscribe((e) => events.push(e));
  deps = { db, config, orch, bus, now: () => new Date() };
  for (const id of ["f1", "f2"]) {
    await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `Char ${id}` }, ratingSettings));
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage One", defPath: "stages/s1.def", licenseNote: "test" } });
});

describe("bot players", () => {
  it("get accounts once, with the starting balance", async () => {
    await botPlayers().ensure();
    await botPlayers().ensure();
    const bots = await db.user.findMany({ where: { kind: "BOT" }, orderBy: { createdAt: "asc" } });
    expect(bots.map((b) => b.displayName)).toEqual(BOTS.slice(0, 12).map((b) => b.name));
    for (const b of bots) expect(await getBalance(db, b.id)).toBe(testEconomy.startingBalance);
  });

  it("bet through the window like players, shown by name and stake, with sides hidden until betting closes", async () => {
    const bots = botPlayers();
    await bots.ensure();
    const f = (await bookFight(deps, rng(), "fake"))!;
    await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
    expect(await bots.onBettingOpen(f.id, new Date(Date.now() + 60_000))).toBeGreaterThan(3);
    // A player bets too.
    const pat = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user;
    await db.user.update({ where: { id: pat.id }, data: { displayName: "Pat" } });
    const mine = await placeFightBet(db, config, { userId: pat.id, fightId: f.id, side: 2, stake: 30n, idempotencyKey: randomUUID() });
    await announceBet(db, config, bus, mine.bet);
    await runQueued();

    const announced = events.filter((e) => e.type === "bet");
    expect(announced.length).toBeGreaterThan(3);
    expect(announced.every((e) => e.type === "bet" && e.side === null)).toBe(true);
    expect(announced.filter((e) => e.type === "bet" && e.bot).length).toBe(announced.length - 1);
    expect(announced.find((e) => e.type === "bet" && !e.bot)).toMatchObject({ name: "Pat", stake: 30n });

    // While betting is open: everyone's name and stake, only your own side.
    const open = (await fightView(db, config, f.id, pat.id))!;
    expect(open.betsRevealed).toBe(false);
    expect(open.bets.length).toBe(await db.bet.count({ where: { fightId: f.id } }));
    expect(open.bets.filter((b) => b.side !== null)).toEqual([expect.objectContaining({ name: "Pat", mine: true, side: 2, bot: false })]);
    expect(open.bets.filter((b) => b.bot).every((b) => BOTS.some((x) => x.name === b.name))).toBe(true);

    // Betting closes: the sides show, the pools count everyone, the stored crowd numbers only players.
    await applyTransition(deps, f.id, { type: "LOCK" });
    const locked = (await fightView(db, config, f.id))!;
    expect(locked.betsRevealed).toBe(true);
    expect(locked.bets.every((b) => b.side === 1 || b.side === 2)).toBe(true);
    const odds = locked.odds as { pool: Record<1 | 2, string>; bettors: number };
    const stakes = await db.bet.findMany({ where: { fightId: f.id } });
    expect(BigInt(odds.pool[1]) + BigInt(odds.pool[2])).toBe(stakes.reduce((n, b) => n + BigInt(b.stake.toFixed(0)), 0n));
    expect(odds.bettors).toBe(stakes.length);
    expect(await db.fightOdds.findUniqueOrThrow({ where: { fightId: f.id } })).toMatchObject({ bettors: 1, crowdChanceBp2: 10_000 });

    // Bets that come in late are turned away like anyone's.
    expect(await bots.onBettingOpen(f.id, new Date(Date.now() + 60_000))).toBeGreaterThanOrEqual(0);
    await runQueued();
    expect(await db.bet.count({ where: { fightId: f.id } })).toBe(stakes.length);
  });

  it("show sides live when the server says so", async () => {
    const live: Config = { ...config, bets: { ...config.bets, sidesLive: true } };
    const bots = botPlayers(12, live);
    await bots.ensure();
    const f = (await bookFight(deps, rng(), "fake"))!;
    await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
    await bots.onBettingOpen(f.id, new Date(Date.now() + 60_000));
    await runQueued();
    expect(events.filter((e) => e.type === "bet").every((e) => e.type === "bet" && (e.side === 1 || e.side === 2))).toBe(true);
    expect((await fightView(db, live, f.id))!.bets.every((b) => b.side !== null)).toBe(true);
  });

  it("aren't on the leaderboard or a tournament's podium", async () => {
    const bots = botPlayers(40);
    await bots.ensure();
    const pat = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
    // Play fights until both a bot and the player have settled bets.
    for (let i = 0; i < 4; i++) {
      const f = (await bookFight(deps, rng(), "fake"))!;
      await applyTransition(deps, f.id, { type: "OPEN_BETTING" });
      await bots.onBettingOpen(f.id, new Date(Date.now() + 60_000));
      await runQueued();
      await placeFightBet(db, config, { userId: pat, fightId: f.id, side: 1, stake: 10n, idempotencyKey: randomUUID() });
      await applyTransition(deps, f.id, { type: "LOCK" });
      await applyTransition(deps, f.id, { type: "ENGINE_STARTED" });
      await applyTransition(deps, f.id, { type: "MATCH_END", winnerSide: 1 });
      await applyTransition(deps, f.id, { type: "SETTLED_OK" });
    }
    expect(await db.bet.count({ where: { user: { kind: "BOT" }, status: { in: ["WON", "LOST"] } } })).toBeGreaterThan(0);
    expect((await leaderboard(db, config)).map((p) => p.name)).toEqual([expect.stringMatching(/^Anon-/)]);

    const t = await db.tournament.create({ data: { cycle: 99, tier: "S", size: 8 } });
    const bot = (await db.user.findFirstOrThrow({ where: { kind: "BOT" } })).id;
    await grantTournamentSalt(db, bot, t.id, config.tournaments);
    await grantTournamentSalt(db, pat, t.id, config.tournaments);
    expect((await tournamentBalances(db, t.id)).map((b) => b.userId)).toEqual([pat]);
  });
});
