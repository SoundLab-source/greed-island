import { auditLedger, createUser, getBalance } from "@greed-island/db";
import { economy as testEconomy, testDatabaseUrl, useTestDb } from "@greed-island/db/test";
import { createFakeSource, seededRandom, type FakeScript } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { placeFightBet } from "./betting.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, bookFight, IllegalTransitionError, StaleFightError, type FightDeps } from "./fights.ts";
import { acquireOrchestratorLock, OrchestratorAlreadyRunningError } from "./lock.ts";
import type { Rng } from "./matchmaking.ts";
import { Orchestrator } from "./orchestrator.ts";
import { reconcile } from "./reconcile.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10, matchmaking: { ...DEFAULT_ORCHESTRATOR.matchmaking, upsetRate: 0 } };

function rng(seed = "orch"): Rng {
  const r = seededRandom(seed);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
}

let bus: FightBus;
let events: BusEvent[];
let deps: FightDeps;

beforeEach(async () => {
  bus = new FightBus();
  events = [];
  bus.subscribe((e) => events.push(e));
  deps = { db, config, orch, bus, now: () => new Date() };
  for (const id of ["f1", "f2", "f3", "f4"]) {
    await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.character.create({ data: { rosterKey: id, fighterId: id, name: `Char ${id}`, rating: 1500, deviation: 350, volatility: 0.06, tier: "B" } });
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
});

const script = (s: FakeScript) => createFakeSource({ timeoutMs: 1, script: () => s });
const win = (side: 1 | 2): FakeScript => ({ rounds: [{ winnerSide: side, reason: "ko" }, { winnerSide: side, reason: "ko" }], ending: "normal" });

async function openFight() {
  const fight = (await bookFight(deps, rng(), "fake"))!;
  await applyTransition(deps, fight.id, { type: "OPEN_BETTING" });
  return fight;
}

describe("applyTransition", () => {
  it("books, then freezes both loadouts and the betting window when betting opens", async () => {
    const fight = (await bookFight(deps, rng(), "fake"))!;
    expect(fight).toMatchObject({ state: "BOOKED", version: 0, cycle: 1, segment: "MATCHMAKING", segmentIndex: 0 });
    const { fight: open } = await applyTransition({ ...deps, orch: { ...orch, bettingWindowMs: 60_000 } }, fight.id, { type: "OPEN_BETTING" });
    expect(open.version).toBe(1);
    expect(open.bettingClosesAt!.getTime() - open.bettingOpensAt!.getTime()).toBe(60_000);
    const loadouts = await db.fightLoadout.findMany({ where: { fightId: fight.id } });
    expect(loadouts.map((l) => l.side).sort()).toEqual([1, 2]);
    expect(await db.fightTransition.count({ where: { fightId: fight.id } })).toBe(2);
    expect(events.map((e) => e.type)).toEqual(["fight_state", "fight_state", "odds_live"]);
  });

  it("rejects illegal events and stale versions", async () => {
    const fight = (await bookFight(deps, rng(), "fake"))!;
    await expect(applyTransition(deps, fight.id, { type: "LOCK" })).rejects.toThrow(IllegalTransitionError);
    await expect(applyTransition(deps, fight.id, { type: "OPEN_BETTING" }, 5)).rejects.toThrow(StaleFightError);
    await applyTransition(deps, fight.id, { type: "OPEN_BETTING" }, 0);
  });

  it("keeps loadouts frozen", async () => {
    const fight = await openFight();
    await expect(db.$executeRaw`UPDATE "fight_loadout" SET "rating" = 9999 WHERE "fight_id" = ${fight.id}::uuid`).rejects.toThrow(/frozen/);
  });
});

describe("betting on a fight", () => {
  it("only accepts bets while betting is open", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    const fight = (await bookFight(deps, rng(), "fake"))!;
    const bet = (key: string) => placeFightBet(db, config, { userId: user.id, fightId: fight.id, side: 1, stake: 10n, idempotencyKey: key });
    await expect(bet("early")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await applyTransition(deps, fight.id, { type: "OPEN_BETTING" });
    await bet("ok");
    await applyTransition(deps, fight.id, { type: "LOCK" });
    await expect(bet("late")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(await getBalance(db, user.id)).toBe(390n);
  });

  it("caps owners betting on a fight with their own character", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    const fight = await openFight();
    await db.character.update({ where: { id: fight.side1CharacterId }, data: { ownerKind: "USER", ownerUserId: user.id, serial: 1, acquiredAt: new Date() } });
    const bet = (stake: bigint, key: string) => placeFightBet(db, config, { userId: user.id, fightId: fight.id, side: 2, stake, idempotencyKey: key });
    await expect(bet(config.odds.ownerBetCap + 1n, "a")).rejects.toMatchObject({ code: "ABOVE_OWNER_CAP" });
    await bet(config.odds.ownerBetCap, "b");
  });

  it("never accepts a bet after the odds lock: pools equal the stakes on record", async () => {
    const users: string[] = [];
    for (let i = 0; i < 12; i++) users.push((await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id);
    const fight = await openFight();
    const bets = users.map((userId, i) =>
      placeFightBet(db, config, { userId, fightId: fight.id, side: i % 2 === 0 ? 1 : 2, stake: BigInt(10 + i), idempotencyKey: "k" }),
    );
    const lock = applyTransition(deps, fight.id, { type: "LOCK" });
    await Promise.allSettled([...bets, lock]);
    const odds = await db.fightOdds.findUniqueOrThrow({ where: { fightId: fight.id } });
    const stakes = await db.bet.findMany({ where: { fightId: fight.id } });
    const sum = (side: number) => stakes.filter((b) => b.side === side).reduce((s, b) => s + BigInt(b.stake.toFixed(0)), 0n);
    expect(BigInt(odds.pool1.toFixed(0))).toBe(sum(1));
    expect(BigInt(odds.pool2.toFixed(0))).toBe(sum(2));
    expect(odds.bettors).toBe(stakes.length);
  });
});

describe("Orchestrator with the fake engine", () => {
  it("runs a fight end to end: bets settle at locked odds, ratings and records update", async () => {
    const bettors: string[] = [];
    for (let i = 0; i < 3; i++) bettors.push((await createUser(db, { kind: "ANONYMOUS" }, config.economy)).user.id);
    bus.subscribe(async (e) => {
      if (e.type === "fight_state" && e.state === "BETTING_OPEN") {
        await Promise.all(bettors.map((userId, i) => placeFightBet(db, config, { userId, fightId: e.fightId, side: i === 2 ? 2 : 1, stake: 100n, idempotencyKey: `bet-${e.fightId}` })));
      }
    });
    // Betting happens during the (short) window, so give the listener time.
    const o = new Orchestrator({ ...deps, orch: { ...orch, bettingWindowMs: 300 }, source: script(win(1)), rng: rng() });
    const summary = await o.runOneFight();
    expect(summary).toMatchObject({ result: "SETTLED", winnerSide: 1 });

    const fight = await db.fight.findUniqueOrThrow({ where: { id: summary!.fightId }, include: { odds: true, loadouts: true, rounds: true } });
    expect(fight.state).toBe("SETTLED");
    expect(fight.winnerCharacterId).toBe(fight.side1CharacterId);
    expect(fight.rounds).toHaveLength(2);
    const payout = (100n * BigInt(fight.odds!.multiplierBp1)) / 10_000n;
    expect(await getBalance(db, bettors[0]!)).toBe(300n + payout);
    expect(await getBalance(db, bettors[2]!)).toBe(300n);
    const winner = await db.character.findUniqueOrThrow({ where: { id: fight.side1CharacterId } });
    expect(winner.wins).toBe(1);
    expect(winner.rating).toBeGreaterThan(1500);
    expect(fight.loadouts.every((l) => l.ratingAfter !== null)).toBe(true);
    expect((await auditLedger(db)).ok).toBe(true);
    const states = events.filter((e) => e.type === "fight_state").map((e) => (e as { state: string }).state);
    expect(states).toEqual(["BOOKED", "BETTING_OPEN", "LOCKED", "IN_PROGRESS", "SETTLING", "SETTLED"]);
  });

  it.each([
    ["draw", { rounds: [{ winnerSide: 1, reason: "ko" }, { winnerSide: 2, reason: "ko" }, { winnerSide: 0, reason: "time" }], ending: "normal" } as FakeScript, "DRAW"],
    ["crash", { rounds: [{ winnerSide: 1, reason: "ko" }], ending: "crash" } as FakeScript, "ENGINE_CRASH"],
    ["hang", { rounds: [], ending: "hang" } as FakeScript, "ENGINE_TIMEOUT"],
  ])("voids and refunds on a %s, without touching ratings", async (_label, s, reason) => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    bus.subscribe(async (e) => {
      if (e.type === "fight_state" && e.state === "BETTING_OPEN") {
        await placeFightBet(db, config, { userId: user.id, fightId: e.fightId, side: 1, stake: 250n, idempotencyKey: "x" });
      }
    });
    const o = new Orchestrator({ ...deps, orch: { ...orch, bettingWindowMs: 200 }, source: script(s), rng: rng() });
    const summary = await o.runOneFight();
    expect(summary).toMatchObject({ result: "VOIDED", voidReason: reason });
    expect(await getBalance(db, user.id)).toBe(400n);
    const chars = await db.character.findMany();
    expect(chars.every((c) => c.rating === 1500 && c.wins === 0 && c.losses === 0)).toBe(true);
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("voids a fight interrupted by stop() and refunds its bets", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    const o = new Orchestrator({ ...deps, orch: { ...orch, bettingWindowMs: 5_000 }, source: script(win(1)), rng: rng() });
    bus.subscribe(async (e) => {
      if (e.type === "fight_state" && e.state === "BETTING_OPEN") {
        await placeFightBet(db, config, { userId: user.id, fightId: e.fightId, side: 1, stake: 50n, idempotencyKey: "x" });
        o.stop();
      }
    });
    expect(await o.runOneFight()).toMatchObject({ result: "VOIDED", voidReason: "ADMIN" });
    expect(await getBalance(db, user.id)).toBe(400n);
  });

  it("records a stop during the fight as a deliberate stop (ADMIN), not a crash", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    // An engine that runs until it's told to stop, like a real one.
    const untilStopped = {
      mode: "fake" as const,
      run: (_spec: unknown, run: { signal?: AbortSignal } = {}) =>
        new Promise<{ kind: "engine_crash"; detail: string }>((resolve) => {
          const done = () => resolve({ kind: "engine_crash", detail: "aborted" });
          if (run.signal?.aborted) done();
          else run.signal?.addEventListener("abort", done);
        }),
    };
    const o = new Orchestrator({ ...deps, orch: { ...orch, bettingWindowMs: 50 }, source: untilStopped, rng: rng() });
    bus.subscribe(async (e) => {
      if (e.type === "fight_state" && e.state === "BETTING_OPEN") await placeFightBet(db, config, { userId: user.id, fightId: e.fightId, side: 2, stake: 30n, idempotencyKey: "y-0000001" });
      if (e.type === "fight_state" && e.state === "IN_PROGRESS") o.stop();
    });
    expect(await o.runOneFight()).toMatchObject({ result: "VOIDED", voidReason: "ADMIN" });
    expect(await getBalance(db, user.id)).toBe(400n);
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("refuses sim mode", () => {
    expect(() => new Orchestrator({ ...deps, source: { mode: "sim", run: async () => ({ kind: "engine_crash", detail: "" }) } })).toThrow(/sim/);
  });

  it("runs many fights: no immediate rematches, the cycle advances, the ledger stays sound", async () => {
    const o = new Orchestrator({ ...deps, source: createFakeSource({ seed: "many" }), rng: rng("many") });
    const summaries = await o.run(12);
    expect(summaries).toHaveLength(12);
    const fights = await db.fight.findMany({ orderBy: { number: "asc" } });
    expect(fights.map((f) => f.segmentIndex)).toEqual([...Array(12).keys()]);
    for (let i = 1; i < fights.length; i++) {
      const a = [fights[i - 1]!.side1CharacterId, fights[i - 1]!.side2CharacterId].sort().join();
      const b = [fights[i]!.side1CharacterId, fights[i]!.side2CharacterId].sort().join();
      expect(b).not.toBe(a);
    }
    const chars = await db.character.findMany();
    expect(chars.reduce((n, c) => n + c.wins, 0)).toBe(summaries.filter((s) => s.result === "SETTLED").length);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});

describe("Orchestrator.run when nothing can be booked", () => {
  it("waits between retries instead of spinning", async () => {
    await db.stage.deleteMany(); // no stage: nothing is bookable
    let retries = 0;
    const o = new Orchestrator({ ...deps, orch: { ...orch, idleRetryMs: 100 }, source: createFakeSource(), rng: rng(), log: () => retries++ });
    const running = o.run(1);
    await new Promise((r) => setTimeout(r, 350));
    o.stop();
    expect(await running).toEqual([]);
    expect(await db.fight.count()).toBe(0);
    // About one attempt per 100 ms, not thousands.
    expect(retries).toBeGreaterThanOrEqual(2);
    expect(retries).toBeLessThanOrEqual(5);
  });
});

describe("reconcile", () => {
  it("finishes or voids every fight left mid-way", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    const r = rng("rec");
    const make = async (upTo: string[]) => {
      const f = (await bookFight(deps, r, "fake"))!;
      for (const step of upTo) {
        if (step === "BET") await placeFightBet(db, config, { userId: user.id, fightId: f.id, side: 1, stake: 20n, idempotencyKey: f.id });
        else await applyTransition(deps, f.id, (step === "MATCH_END" ? { type: "MATCH_END", winnerSide: 1 } : { type: step }) as never);
      }
      return f.id;
    };
    const booked = await make([]);
    const open = await make(["OPEN_BETTING", "BET"]);
    const inProgress = await make(["OPEN_BETTING", "BET", "LOCK", "ENGINE_STARTED"]);
    const settling = await make(["OPEN_BETTING", "BET", "LOCK", "ENGINE_STARTED", "MATCH_END"]);

    const actions = await reconcile(deps);
    expect(actions.map((a) => a.to)).toEqual(["VOIDED", "VOIDED", "VOIDED", "SETTLED"]);
    const state = async (id: string) => (await db.fight.findUniqueOrThrow({ where: { id } })).state;
    expect([await state(booked), await state(open), await state(inProgress), await state(settling)]).toEqual(["VOIDED", "VOIDED", "VOIDED", "SETTLED"]);
    // 3 bets of 20: two refunded, one settled as a side-1 win.
    const settledFight = await db.fight.findUniqueOrThrow({ where: { id: settling }, include: { odds: true } });
    expect(await getBalance(db, user.id)).toBe(400n - 20n + (20n * BigInt(settledFight.odds!.multiplierBp1)) / 10_000n);
    expect((await auditLedger(db)).ok).toBe(true);
    expect(await reconcile(deps)).toEqual([]);
  });
});

describe("single orchestrator lock", () => {
  it("allows only one holder at a time", async () => {
    const url = testDatabaseUrl();
    const first = await acquireOrchestratorLock(url);
    await expect(acquireOrchestratorLock(url)).rejects.toThrow(OrchestratorAlreadyRunningError);
    await first.release();
    const second = await acquireOrchestratorLock(url);
    await second.release();
  });
});
