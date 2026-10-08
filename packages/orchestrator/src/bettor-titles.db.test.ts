import { backfillBettorTitles, createUser } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { DEFAULT_BETTORS, loadConfig, type BettorConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { placeFightBet } from "./betting.ts";
import { callBoards, myBettorStats } from "./bettor-stats.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, type FightDeps } from "./fights.ts";
import { toJson } from "./api/server.ts";

const db = useTestDb();
const base: Config = { ...loadConfig({}), economy: { ...testEconomy, startingBalance: 100_000n } };
/** Low bars, so a few fights earn every title. */
const easy: BettorConfig = { ...DEFAULT_BETTORS, ironReadStreak: 3, loyalCalls: 4, contrarianWins: 2, winRateMinCalls: 3 };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0 };

let events: BusEvent[];
let chars: Record<string, string>;
let key = 0;

beforeEach(async () => {
  events = [];
  chars = {};
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  // A champion and a nobody: the nobody's chance is low.
  for (const [id, rating] of [["champ", 2100], ["nobody", 1300], ["even", 1300]] as const) {
    await db.fighter.create({ data: { id, displayName: id.toUpperCase(), archetype: id === "champ" ? "HEAVY" : "ZONER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    chars[id] = (await db.character.create({ data: { rosterKey: id, fighterId: id, name: id, rating, deviation: 50, volatility: 0.06, tier: "B" } })).id;
  }
});

const deps = (bettors: BettorConfig): FightDeps => {
  const bus = new FightBus();
  bus.subscribe((e) => events.push(e));
  return { db, config: { ...base, bettors }, orch, bus, now: () => new Date() };
};
const player = async (name: string, kind: "ANONYMOUS" | "BOT" = "ANONYMOUS") => {
  const u = (await createUser(db, kind === "BOT" ? { kind, displayName: name } : { kind }, base.economy)).user;
  if (kind !== "BOT") await db.user.update({ where: { id: u.id }, data: { displayName: name } });
  return u.id;
};

/** One fight from booking to settlement, with these bets. */
async function fight(d: FightDeps, a: string, b: string, winner: 1 | 2, bets: [userId: string, side: 1 | 2, stake: bigint][]) {
  const n = await db.fight.count();
  const f = await db.fight.create({
    data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: n, pairKind: "CROSS_TIER", stageId: "s1", side1CharacterId: chars[a]!, side2CharacterId: chars[b]! },
  });
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  for (const [userId, side, stake] of bets) await placeFightBet(db, d.config, { userId, fightId: f.id, side, stake, idempotencyKey: `bet-${++key}` });
  await applyTransition(d, f.id, { type: "LOCK" });
  await applyTransition(d, f.id, { type: "ENGINE_STARTED" });
  await applyTransition(d, f.id, { type: "MATCH_END", winnerSide: winner });
  await applyTransition(d, f.id, { type: "SETTLED_OK" });
  return (await db.fight.findUniqueOrThrow({ where: { id: f.id }, select: { id: true, number: true } }));
}

const titlesOf = async (userId: string) =>
  (await db.playerTitle.findMany({ where: { userId }, orderBy: { id: "asc" }, include: { fight: { select: { number: true } } } })).map((t) => [t.code, t.fight?.number ?? null]);

describe("bettor titles at settlement", () => {
  it("awards Called It for a long shot called right, once, with a notice", async () => {
    const d = deps(DEFAULT_BETTORS);
    const ann = await player("Ann");
    const odds = await fight(d, "champ", "nobody", 2, [[ann, 2, 20n]]);
    const locked = await db.fightOdds.findUniqueOrThrow({ where: { fightId: odds.id } });
    expect(locked.chanceBp2).toBeLessThanOrEqual(2000);
    expect(await titlesOf(ann)).toEqual([["CALLED_IT", odds.number]]);
    expect(events).toContainEqual({ type: "bettor_title", fightId: odds.id, number: odds.number, name: "Ann", code: "CALLED_IT", label: "Called It" });
    // What it paid is kept.
    const t = await db.playerTitle.findFirstOrThrow({ where: { userId: ann } });
    const bet = await db.bet.findFirstOrThrow({ where: { userId: ann } });
    expect(t.balance.toFixed(0)).toBe(bet.returned!.toFixed(0));
    await fight(d, "champ", "nobody", 2, [[ann, 2, 20n]]);
    expect(await titlesOf(ann)).toHaveLength(1);
  });

  it("leaves out bots and bets too small to be a call", async () => {
    const d = deps(DEFAULT_BETTORS);
    const bot = await player("Botty", "BOT");
    const tiny = await player("Tiny");
    await fight(d, "champ", "nobody", 2, [[bot, 2, 50n], [tiny, 2, 9n]]);
    expect(await titlesOf(bot)).toEqual([]);
    expect(await titlesOf(tiny)).toEqual([]);
  });

  it("awards Iron Read, Loyal and Contrarian at their bars", async () => {
    const d = deps(easy);
    const ann = await player("Ann");
    const crowd = await player("Crowd");
    // Ann backs "even" against the crowd twice and wins, then twice more with the crowd.
    const f1 = await fight(d, "even", "nobody", 1, [[ann, 1, 10n], [crowd, 2, 100n]]);
    expect(await titlesOf(ann)).toEqual([]);
    const f2 = await fight(d, "even", "nobody", 1, [[ann, 1, 10n], [crowd, 2, 100n]]);
    expect(await titlesOf(ann)).toEqual([["CONTRARIAN", f2.number]]);
    const f3 = await fight(d, "nobody", "even", 2, [[ann, 2, 10n]]);
    expect(await titlesOf(ann)).toEqual([["CONTRARIAN", f2.number], ["IRON_READ", f3.number]]);
    // A wrong call is still a call on "even": the fourth earns Loyal.
    const f4 = await fight(d, "even", "nobody", 2, [[ann, 1, 10n]]);
    expect(await titlesOf(ann)).toEqual([["CONTRARIAN", f2.number], ["IRON_READ", f3.number], ["LOYAL", f4.number]]);
    expect(f1.number).toBeLessThan(f2.number);
    // The crowd was wrong every time: nothing.
    expect(await titlesOf(crowd)).toEqual([]);
  });

  it("backfills titles for fights settled before they existed, once", async () => {
    const never: BettorConfig = { ...DEFAULT_BETTORS, calledItChanceBp: 1, ironReadStreak: 1000, loyalCalls: 1000, contrarianWins: 1000 };
    const d = deps(never);
    const ann = await player("Ann");
    const first = await fight(d, "champ", "nobody", 2, [[ann, 2, 20n]]);
    await fight(d, "even", "nobody", 1, [[ann, 1, 20n]]);
    const third = await fight(d, "even", "nobody", 1, [[ann, 1, 20n]]);
    expect(await titlesOf(ann)).toEqual([]);
    expect(await backfillBettorTitles(db, easy)).toBe(2);
    expect(await titlesOf(ann)).toEqual([["CALLED_IT", first.number], ["IRON_READ", third.number]]);
    expect(await backfillBettorTitles(db, easy)).toBe(0);
  });
});

describe("bettor numbers and the best-calls boards", () => {
  it("shows a player's numbers and ranks players on three boards", async () => {
    const d = deps(easy);
    const ann = await player("Ann");
    const ben = await player("Ben");
    const bot = await player("Botty", "BOT");
    // Ann: an upset, then two right calls (a run of 3); Ben: wrong, right, right, wrong, right.
    await fight(d, "champ", "nobody", 2, [[ann, 2, 20n], [ben, 1, 20n], [bot, 2, 500n]]);
    await fight(d, "even", "nobody", 1, [[ann, 1, 20n], [ben, 1, 20n], [bot, 1, 500n]]);
    await fight(d, "even", "nobody", 2, [[ann, 2, 20n], [ben, 2, 20n], [bot, 2, 500n]]);
    await fight(d, "even", "nobody", 2, [[ben, 1, 20n]]);
    await fight(d, "even", "nobody", 1, [[ben, 1, 20n]]);

    const s = await myBettorStats(db, d.config, ann);
    expect(s).toMatchObject({ calls: 3, rightCalls: 3, winRate: 100, streak: { current: 3, best: 3 }, upsetsCalled: 1, minCallStake: 10n });
    expect(s.bestUpset).toMatchObject({ fighterName: "NOBODY" });
    expect(s.favourite).toMatchObject({ fighterId: "nobody", calls: 2 });

    const boards = await callBoards(db, d.config, ann);
    expect(boards.upsets.rows.map((r) => [r.rank, r.name, r.value])).toEqual([[1, "Ann", 1]]);
    expect(boards.upsets.me).toMatchObject({ rank: 1, value: 1 });
    expect(boards.winRate.rows.map((r) => [r.name, r.value, r.detail])).toEqual([["Ann", 100, 3], ["Ben", 60, 5]]);
    expect(boards.streak.rows.map((r) => [r.name, r.value])).toEqual([["Ann", 3], ["Ben", 2]]);
    // Bots are never ranked.
    expect(toJson(boards)).not.toContain("Botty");
    // Before qualifying, a player sees their own win rate without a rank.
    const strict = await callBoards(db, { ...d.config, bettors: { ...easy, winRateMinCalls: 50 } }, ben);
    expect(strict.winRate.rows).toEqual([]);
    expect(strict.winRate.me).toEqual({ rank: 0, name: "", value: 60, detail: 5 });
  });
});
