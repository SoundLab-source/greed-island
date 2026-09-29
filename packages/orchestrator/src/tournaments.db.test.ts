import { auditLedger, createCharacter, createUser, getBalance, openStakes, tournamentBalance } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { leaderboard, meView, tournamentView } from "./api/views.ts";
import { placeFightBet } from "./betting.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
// Tournaments first: cycle 1 is an S-tier tournament of up to 8, then 2 exhibitions.
const orch: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, cycle: { matchmakingFights: 0, tournamentSize: 8, exhibitionFights: 2 } };

let events: BusEvent[];
let d: FightDeps;
let seq = 0;
let alice: string;
let bob: string;
let carol: string;
let owned: string;
const house: string[] = [];

const rng = (): Rng => {
  const r = seededRandom(`t${seq++}`);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

beforeEach(async () => {
  events = [];
  house.length = 0;
  const bus = new FightBus();
  bus.subscribe((e) => events.push(e));
  d = { db, config, orch, bus, now: () => new Date() };
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  [alice, bob, carol] = [
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
    (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id,
  ];
  await db.user.update({ where: { id: bob }, data: { displayName: "Bob" } });
  // 9 house characters in S, 2 in A, and alice's owned S-tier character.
  for (const [i, rating] of [1900, 1890, 1880, 1870, 1860, 1850, 1840, 1830, 1820, 1700, 1650].entries()) {
    const id = `h${i}`;
    await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    house.push((await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `House ${i}`, startRating: rating }, ratingSettings))).id);
  }
  await db.fighter.create({ data: { id: "mine", displayName: "mine", archetype: "ALL_ROUNDER", defPath: "chars/mine/mine.def", licenseNote: "test" } });
  owned = (
    await db.character.create({
      data: { fighterId: "mine", name: "Alice's pick", rating: 1760, deviation: 100, volatility: 0.06, tier: "S", ownerKind: "USER", ownerUserId: alice, serial: 1, acquiredAt: new Date() },
    })
  ).id;
});

/** Book the next fight, take the bets, and play it to a win or a crash. */
async function play(result: 1 | 2 | "crash", bets: [string, 1 | 2, bigint][] = []) {
  const f = (await bookFight(d, rng(), "fake"))!;
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  for (const [userId, side, stake] of bets) await placeFightBet(db, config, { userId, fightId: f.id, side, stake, idempotencyKey: randomUUID() });
  await applyTransition(d, f.id, { type: "LOCK" });
  await applyTransition(d, f.id, { type: "ENGINE_STARTED" });
  if (result === "crash") {
    await applyTransition(d, f.id, { type: "ENGINE_CRASH", detail: "test" });
    await applyTransition(d, f.id, { type: "VOIDED_OK" });
  } else {
    await applyTransition(d, f.id, { type: "MATCH_END", winnerSide: result });
    await applyTransition(d, f.id, { type: "SETTLED_OK" });
  }
  return f;
}

describe("a tournament", () => {
  it("plays a seeded 8-character bracket in T-Salt, crowns a champion and a podium, then moves on", async () => {
    const mainBefore = await Promise.all([alice, bob, carol].map((u) => getBalance(db, u)));
    const fights = [];
    for (let i = 0; i < 7; i++) {
      // Bob always backs red; Carol bets once on blue and loses.
      fights.push(await play(1, i === 0 ? [[bob, 1, 100n], [carol, 2, 50n]] : [[bob, 1, 100n]]));
    }
    expect(fights.every((f) => f.segment === "TOURNAMENT" && f.pairKind === "TOURNAMENT" && f.tournamentMatchId)).toBe(true);

    const t = await db.tournament.findUniqueOrThrow({ where: { cycle: 1 }, include: { entries: { orderBy: { seed: "asc" } } } });
    expect(t).toMatchObject({ tier: "S", size: 8, status: "FINISHED" });
    // Alice's owned character has a seat though 8 house characters are stronger; A-tier fillers aren't needed.
    expect(t.entries.map((e) => e.characterId)).toContain(owned);
    expect(t.entries.map((e) => e.characterId)).not.toContain(house[9]);
    expect(t.entries[0]!.characterId).toBe(house[0]);

    const final = await db.fight.findFirstOrThrow({ where: { id: fights[6]!.id } });
    expect(t.championCharacterId).toBe(final.winnerCharacterId);
    const champion = await db.characterTitle.findFirstOrThrow({ where: { code: "TOURNAMENT_CHAMPION" } });
    expect(champion).toMatchObject({ characterId: t.championCharacterId, tournamentId: t.id, fightId: final.id });

    // T-Salt: Bob won every bet, Carol lost hers. Main balances never moved.
    expect(await tournamentBalance(db, bob, t.id)).toBeGreaterThan(1_000n);
    expect(await tournamentBalance(db, carol, t.id)).toBe(950n);
    expect(await tournamentBalance(db, alice, t.id)).toBeNull();
    expect(await Promise.all([alice, bob, carol].map((u) => getBalance(db, u)))).toEqual(mainBefore);
    expect(await db.playerTitle.findMany({ select: { userId: true, code: true } })).toEqual([{ userId: bob, code: "BETTOR_1ST" }]);
    // No owner rewards in tournaments.
    expect(await db.ledgerTxn.count({ where: { kind: "OWNER_REWARD" } })).toBe(0);

    const finished = events.find((e) => e.type === "tournament" && e.status === "FINISHED");
    expect(finished).toMatchObject({ number: t.number, tier: "S", champion: { characterId: t.championCharacterId }, podium: [{ name: "Bob", label: "Top Bettor" }] });
    expect(events.find((e) => e.type === "tournament" && e.status === "STARTED")).toMatchObject({ size: 8 });

    // The cycle moves on to exhibitions.
    expect((await bookFight(d, rng(), "fake"))!.segment).toBe("EXHIBITION");

    const audit = await auditLedger(db);
    expect(audit.ok).toBe(true);
    expect(audit.stats.tsalt).toMatchObject({ tournaments: 1, issued: 2_000n, escrow: 0n });
    expect(audit.stats.issued).toBe(3n * testEconomy.startingBalance);

    const view = (await tournamentView(db, t.id, bob))!;
    expect(view.rounds.map((r) => [r.name, r.matches.length])).toEqual([["quarter-final", 4], ["semi-final", 2], ["final", 1]]);
    expect(view.standings[0]).toMatchObject({ rank: 1, name: "Bob" });
    expect(view.podium).toEqual([{ code: "BETTOR_1ST", label: "Top Bettor", name: "Bob", balance: view.myBalance }]);
    expect((await meView(db, config, bob)).titles).toMatchObject([{ code: "BETTOR_1ST", tournamentNumber: t.number }]);
  });

  it("replays a voided fight, refunding T-Salt, and gives a walkover when a character is disabled", async () => {
    const f1 = await play("crash", [[bob, 1, 200n]]);
    const t = await db.tournament.findUniqueOrThrow({ where: { cycle: 1 } });
    expect(await tournamentBalance(db, bob, t.id)).toBe(1_000n);
    const f2 = await play(2);
    expect(f2.tournamentMatchId).toBe(f1.tournamentMatchId);

    // Disable a character waiting in round 1: its match is decided without a fight.
    const waiting = await db.tournamentMatch.findFirstOrThrow({ where: { tournamentId: t.id, round: 1, winnerCharacterId: null }, orderBy: { slot: "desc" } });
    await db.character.update({ where: { id: waiting.side1CharacterId! }, data: { enabled: false } });
    for (let i = 0; i < 6; i++) await play(1);
    const decided = await db.tournamentMatch.findUniqueOrThrow({ where: { id: waiting.id }, include: { fights: true } });
    expect(decided).toMatchObject({ walkover: true, winnerCharacterId: waiting.side2CharacterId });
    expect(decided.fights).toHaveLength(0);
    // 6 fights + 1 walkover finish the other 6 matches.
    expect((await db.tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("FINISHED");
    expect((await auditLedger(db)).ok).toBe(true);
  });

  it("is skipped when it can't be filled", async () => {
    await db.character.updateMany({ where: { id: { not: house[0] } }, data: { enabled: false } });
    expect(await bookFight(d, rng(), "fake")).toBeNull();
    expect(await db.tournament.findUniqueOrThrow({ where: { cycle: 1 } })).toMatchObject({ status: "CANCELLED", size: 0 });
    expect(events).toMatchObject([{ type: "tournament", status: "CANCELLED" }]);
    await db.character.updateMany({ data: { enabled: true } });
    expect((await bookFight(d, rng(), "fake"))!.segment).toBe("EXHIBITION");
  });
});

describe("T-Salt", () => {
  it("never mixes with Salt: open stakes, the leaderboard and the database all keep them apart", async () => {
    const f = (await bookFight(d, rng(), "fake"))!;
    await applyTransition(d, f.id, { type: "OPEN_BETTING" });
    const bet = await placeFightBet(db, config, { userId: bob, fightId: f.id, side: 1, stake: 300n, idempotencyKey: randomUUID() });
    expect(bet.balance).toBe(700n); // T-Salt left
    expect(await openStakes(db, bob)).toBe(0n);
    expect(await getBalance(db, bob)).toBe(testEconomy.startingBalance);
    expect((await meView(db, config, bob)).tournament).toMatchObject({ balance: "700", joined: true });
    expect((await meView(db, config, carol)).tournament).toMatchObject({ balance: "1000", joined: false });
    expect((await leaderboard(db)).map((r) => r.balance)).toEqual(["400", "400", "400"]);
    // More than the T-Salt balance is refused.
    await expect(placeFightBet(db, config, { userId: bob, fightId: f.id, side: 1, stake: 1_001n, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    // A transaction touching both books is rejected at commit, even when each
    // currency on its own sums to zero (Salt to the house, T-Salt from its house).
    const t = await db.tournament.findUniqueOrThrow({ where: { cycle: 1 } });
    const key = (k: string) => db.account.findUniqueOrThrow({ where: { key: k } });
    const [main, mainHouse, tsalt, tHouse] = [
      await key(`user:${bob}:SALT`),
      await db.account.upsert({ where: { key: "house:SALT" }, create: { key: "house:SALT", kind: "HOUSE" }, update: {} }),
      await key(`user:${bob}:TSALT:${t.id}`),
      await key(`issuance:TSALT:${t.id}`),
    ];
    await expect(
      db.$transaction(async (tx) => {
        const txn = await tx.ledgerTxn.create({ data: { idempotencyKey: "cross-books", requestHash: "x", kind: "GRANT_DAILY", userId: bob } });
        await tx.ledgerEntry.createMany({
          data: [
            { txnId: txn.id, accountId: main.id, amount: "-100" },
            { txnId: txn.id, accountId: mainHouse.id, amount: "100" },
            { txnId: txn.id, accountId: tHouse.id, amount: "-100" },
            { txnId: txn.id, accountId: tsalt.id, amount: "100" },
          ],
        });
      }),
    ).rejects.toThrow(/Salt and T-Salt never move between each other/);
    expect((await auditLedger(db)).ok).toBe(true);
  });
});
