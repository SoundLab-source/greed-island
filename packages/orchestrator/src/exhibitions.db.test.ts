import { auditLedger, createCharacter, createUser, getBalance, postTransaction } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FightBus, type BusEvent } from "./bus.ts";
import { answerChallenge, expireChallenges, sendChallenge } from "./challenges.ts";
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const base: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10 };
const exhibitionsOnly = { ...base, cycle: { matchmakingFights: 0, tournamentSize: 0, exhibitionFights: 10 } };
const rng = (seed = "ex"): Rng => {
  const r = seededRandom(seed);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let events: BusEvent[];
let alice: string;
let bob: string;
let carol: string;
/** Owned characters: alice has a1, a2; bob has b1; carol has c1. */
const ch: Record<string, string> = {};
const house: Record<string, string> = {};

function deps(orch: OrchestratorConfig = exhibitionsOnly, cfg: Config = config): FightDeps {
  const bus = new FightBus();
  bus.subscribe((e) => events.push(e));
  return { db, config: cfg, orch, bus, now: () => new Date() };
}

async function fighter(id: string) {
  await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
}

async function owned(key: string, fighterId: string, userId: string, rating = 1400) {
  const c = await db.character.create({
    data: { fighterId, name: key, rating, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: userId, serial: 1, acquiredAt: new Date() },
  });
  ch[key] = c.id;
}

beforeEach(async () => {
  events = [];
  for (const id of ["fa", "fb", "fc", "fd", "h1", "h2", "h3", "h4"]) await fighter(id);
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  [alice, bob, carol] = [
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
  ];
  await owned("a1", "fa", alice);
  await owned("a2", "fd", alice);
  await owned("b1", "fb", bob);
  await owned("c1", "fc", carol);
  for (const [id, rating] of [["h1", 1900], ["h2", 1800], ["h3", 1500], ["h4", 1300]] as const) {
    house[id] = (await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `House ${id}`, startRating: rating }, ratingSettings))).id;
  }
});

const send = (userId: string, mine: string, theirs: string, now?: Date) => sendChallenge(db, config, { userId, challengerCharacterId: ch[mine]!, challengedCharacterId: ch[theirs]! }, now);
const answer = (userId: string, challengeId: string, action: "ACCEPT" | "DECLINE" | "CANCEL", now?: Date) => answerChallenge(db, { userId, challengeId, action }, now);

/** Play an open-for-betting fight to settlement with the given winner. */
async function finish(d: FightDeps, fightId: string, winnerSide: 1 | 2) {
  await applyTransition(d, fightId, { type: "OPEN_BETTING" });
  await applyTransition(d, fightId, { type: "LOCK" });
  await applyTransition(d, fightId, { type: "ENGINE_STARTED" });
  await applyTransition(d, fightId, { type: "MATCH_END", winnerSide });
  await applyTransition(d, fightId, { type: "SETTLED_OK" });
}

describe("challenges", () => {
  it("are sent, accepted, declined and cancelled by the right players", async () => {
    const { challenge, replayed } = await send(alice, "a1", "b1");
    expect(challenge).toMatchObject({ status: "PENDING", challengerUserId: alice, challengedUserId: bob });
    expect(replayed).toBe(false);
    // Sending it again returns the same challenge.
    expect(await send(alice, "a1", "b1")).toMatchObject({ challenge: { id: challenge.id }, replayed: true });
    // Only bob answers; carol can't even see it.
    await expect(answer(alice, challenge.id, "ACCEPT")).rejects.toThrow(/challenged owner/);
    await expect(answer(carol, challenge.id, "ACCEPT")).rejects.toThrow(/no such challenge/);
    expect(await answer(bob, challenge.id, "ACCEPT")).toMatchObject({ status: "ACCEPTED", acceptedAt: expect.any(Date) });
    await expect(answer(bob, challenge.id, "DECLINE")).rejects.toThrow(/accepted/);
    expect(await answer(alice, challenge.id, "CANCEL")).toMatchObject({ status: "CANCELLED", closedAt: expect.any(Date) });

    const second = (await send(alice, "a1", "c1")).challenge;
    expect(await answer(carol, second.id, "DECLINE")).toMatchObject({ status: "DECLINED" });
  });

  it("refuses bad challenges and keeps one open challenge per pair", async () => {
    const sendIds = (userId: string, a: string, b: string) => sendChallenge(db, config, { userId, challengerCharacterId: a, challengedCharacterId: b });
    await expect(sendIds(alice, ch["b1"]!, ch["c1"]!)).rejects.toThrow(/you own/);
    await expect(send(alice, "a1", "a2")).rejects.toThrow(/your own/);
    await expect(sendIds(alice, ch["a1"]!, house["h1"]!)).rejects.toThrow(/house/);
    await db.character.update({ where: { id: ch["c1"]! }, data: { enabled: false } });
    await expect(send(alice, "a1", "c1")).rejects.toThrow(/active/);
    await send(alice, "a1", "b1");
    // Bob can't open a second one the other way round.
    await expect(send(bob, "b1", "a1")).rejects.toThrow(/already have an open challenge/);
    // Limit on open challenges per player.
    const tight = { ...config, exhibitions: { ...config.exhibitions, maxOpenPerUser: 1 } };
    await expect(sendChallenge(db, tight, { userId: alice, challengerCharacterId: ch["a2"]!, challengedCharacterId: ch["b1"]! })).rejects.toThrow(/1 open challenges/);
  });

  it("expire when not answered in time", async () => {
    const t0 = new Date("2026-10-01T12:00:00Z");
    const { challenge } = await send(alice, "a1", "b1", t0);
    const late = new Date(t0.getTime() + config.exhibitions.challengeTtlMs + 1);
    await expect(answer(bob, challenge.id, "ACCEPT", late)).rejects.toThrow(/expired/);
    expect((await db.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("EXPIRED");
    // Once expired, the pair can be challenged again.
    const again = await send(alice, "a1", "b1", late);
    expect(again.replayed).toBe(false);
    expect(await expireChallenges(db, new Date(late.getTime() + config.exhibitions.challengeTtlMs + 1))).toBe(1);
  });

  it("are guarded by the database: status only moves forward, rows are kept", async () => {
    const { challenge } = await send(alice, "a1", "b1");
    await answer(bob, challenge.id, "DECLINE");
    await expect(db.$executeRaw`UPDATE "challenge" SET "status" = 'PENDING', "closed_at" = NULL WHERE "id" = ${challenge.id}::uuid`).rejects.toThrow(/can't go from DECLINED to PENDING/);
    await expect(db.$executeRaw`DELETE FROM "challenge"`).rejects.toThrow(/kept/);
    await expect(db.$executeRaw`UPDATE "challenge" SET "challenged_user_id" = ${carol}::uuid`).rejects.toThrow(/fixed/);
  });
});

describe("exhibition booking", () => {
  it("books accepted challenges oldest first, then house showcases", async () => {
    const d = deps();
    const t = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, m));
    const first = (await send(alice, "a1", "b1", t(0))).challenge;
    const second = (await send(carol, "c1", "a2", t(1))).challenge;
    // Accepted in the opposite order: the queue goes by acceptance.
    await answer(alice, second.id, "ACCEPT", t(2));
    await answer(bob, first.id, "ACCEPT", t(3));

    const f1 = (await bookFight(d, rng(), "fake"))!;
    expect(f1).toMatchObject({ segment: "EXHIBITION", pairKind: "CHALLENGE" });
    expect([f1.side1CharacterId, f1.side2CharacterId].sort()).toEqual([ch["c1"], ch["a2"]].sort());
    expect(await db.challenge.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "BOOKED", fightId: f1.id });
    await finish(d, f1.id, 1);

    const f2 = (await bookFight(d, rng("2"), "fake"))!;
    expect(f2.pairKind).toBe("CHALLENGE");
    expect([f2.side1CharacterId, f2.side2CharacterId].sort()).toEqual([ch["a1"], ch["b1"]].sort());
    await finish(d, f2.id, 2);

    // Queue empty: a showcase between house characters.
    const f3 = (await bookFight(d, rng("3"), "fake"))!;
    expect(f3.pairKind).toBe("SHOWCASE");
    expect(Object.values(house)).toEqual(expect.arrayContaining([f3.side1CharacterId, f3.side2CharacterId]));
    const transition = await db.fightTransition.findFirstOrThrow({ where: { fightId: f1.id, event: "BOOK" } });
    expect(transition.payload).toMatchObject({ mode: "EXHIBITION", pairKind: "CHALLENGE", challengeId: second.id });
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("leaves challenges alone outside the exhibition segment, and skips inactive characters", async () => {
    const { challenge } = await send(alice, "a1", "b1");
    await answer(bob, challenge.id, "ACCEPT");
    const mm = (await bookFight(deps({ ...base, cycle: { matchmakingFights: 10, tournamentSize: 0, exhibitionFights: 0 } }), rng(), "fake"))!;
    expect(mm.segment).toBe("MATCHMAKING");
    expect((await db.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("ACCEPTED");
    await applyTransition(deps(), mm.id, { type: "VOID", reason: "ADMIN" });
    await applyTransition(deps(), mm.id, { type: "VOIDED_OK" });

    await db.character.update({ where: { id: ch["b1"]! }, data: { enabled: false } });
    const ex = (await bookFight(deps(), rng(), "fake"))!;
    expect(ex.pairKind).toBe("SHOWCASE");
    expect((await db.challenge.findUniqueOrThrow({ where: { id: challenge.id } })).status).toBe("ACCEPTED");
  });
});

describe("owner rewards", () => {
  /** Book one fight in the given cycle, with the owned character a1 against house h3, and play it. */
  async function fightA1(winner: "a1" | "house", orch: OrchestratorConfig, cfg: Config = config) {
    // Only a1 and h3 are active, so matchmaking must pair them.
    await db.character.updateMany({ where: { id: { notIn: [ch["a1"]!, house["h3"]!] } }, data: { enabled: false } });
    const d = deps(orch, cfg);
    const f = (await bookFight(d, rng(), "fake"))!;
    const a1Side = f.side1CharacterId === ch["a1"] ? 1 : 2;
    await finish(d, f.id, winner === "a1" ? a1Side : ((3 - a1Side) as 1 | 2));
    return f;
  }
  // The same two characters every time, so allow rematches.
  const again = { ...base.matchmaking, rematchCooldown: 0 };
  const matchmaking = { ...base, matchmaking: again, cycle: { matchmakingFights: 10, tournamentSize: 0, exhibitionFights: 0 } };

  it("pays the owner 25 Salt from issuance when their character wins", async () => {
    const before = await getBalance(db, alice);
    const f = await fightA1("a1", matchmaking);
    expect(await getBalance(db, alice)).toBe(before + 25n);
    const txn = await db.ledgerTxn.findUniqueOrThrow({ where: { idempotencyKey: `owner-reward:${f.id}` } });
    expect(txn).toMatchObject({ kind: "OWNER_REWARD", userId: alice, fightId: f.id });
    expect(events.find((e) => e.type === "fight_result")).toMatchObject({ result: "SETTLED", ownerReward: 25n });
    const audit = await auditLedger(db);
    expect(audit.ok).toBe(true);
    expect(audit.stats.issued).toBe(3n * testEconomy.startingBalance + 25n);
  });

  it("pays nothing for a loss, a tournament fight, or when turned off", async () => {
    const before = await getBalance(db, alice);
    await fightA1("house", matchmaking);
    await fightA1("a1", { ...base, matchmaking: again, cycle: { matchmakingFights: 0, tournamentSize: 4, exhibitionFights: 0 } });
    await fightA1("a1", matchmaking, { ...config, economy: { ...config.economy, ownerReward: 0n } });
    expect(await getBalance(db, alice)).toBe(before);
    expect(await db.ledgerTxn.count({ where: { kind: "OWNER_REWARD" } })).toBe(0);
  });

  it("is caught by the audit if paid for the wrong fight", async () => {
    const f = await fightA1("house", matchmaking);
    // A reward on a fight the owned character lost, written around the settlement code.
    await db.$transaction(async (tx) => {
      await postTransaction(tx, {
        idempotencyKey: "owner-reward:bogus",
        requestHash: "x",
        kind: "OWNER_REWARD",
        userId: alice,
        fightId: f.id,
        postings: [
          { account: { kind: "ISSUANCE" }, amount: -25n },
          { account: { kind: "USER", userId: alice }, amount: 25n },
        ],
      });
    });
    const audit = await auditLedger(db);
    expect(audit.problems.map((p) => p.check)).toEqual(["owner-reward"]);
  });
});
