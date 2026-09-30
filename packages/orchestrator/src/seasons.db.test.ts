import { createCharacter, createUser, getBalance } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { leaderboard, mySeason, seasonView } from "./api/season-views.ts";
import { characterTitles, meView } from "./api/views.ts";
import { placeFightBet } from "./betting.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";

const db = useTestDb();
const WEEK = 7 * 86_400_000;
const T0 = new Date("2026-10-01T00:00:00Z");
const config: Config = { ...loadConfig({}), economy: testEconomy, seasons: { ...loadConfig({}).seasons, minFights: 2, minBets: 2 } };
const orch: OrchestratorConfig = {
  ...DEFAULT_ORCHESTRATOR,
  bettingWindowMs: 0,
  interFightDelayMs: 0,
  idleRetryMs: 10,
  cycle: { matchmakingFights: 100, tournamentSize: 0, exhibitionFights: 0 },
};
const rng = (): Rng => {
  const r = seededRandom("seasons");
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let clock: Date;
let events: BusEvent[];
let alice: string;
let bob: string;

function deps(cfg: Config = config): FightDeps {
  const bus = new FightBus();
  bus.subscribe((e) => events.push(e));
  return { db, config: cfg, orch, bus, now: () => clock };
}

beforeEach(async () => {
  clock = T0;
  events = [];
  for (const [id, rating] of [["h1", 1900], ["h2", 1700], ["h3", 1500], ["h4", 1300]] as const) {
    await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `House ${id}`, startRating: rating }, ratingSettings));
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  alice = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
  bob = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
  await db.user.update({ where: { id: alice }, data: { displayName: "Alice" } });
});

/** Book a fight, alice bets on side 1 and bob on side 2, side 1 wins. */
async function playFight(d: FightDeps, opts: { settleAt?: Date } = {}) {
  const f = (await bookFight(d, rng(), "fake"))!;
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  await placeFightBet(db, d.config, { userId: alice, fightId: f.id, side: 1, stake: 20n, idempotencyKey: randomUUID() });
  await placeFightBet(db, d.config, { userId: bob, fightId: f.id, side: 2, stake: 20n, idempotencyKey: randomUUID() });
  await applyTransition(d, f.id, { type: "LOCK" });
  await applyTransition(d, f.id, { type: "ENGINE_STARTED" });
  if (opts.settleAt) clock = opts.settleAt;
  await applyTransition(d, f.id, { type: "MATCH_END", winnerSide: 1 });
  await applyTransition(d, f.id, { type: "SETTLED_OK" });
  return f;
}

/** Characters with at least `min` settled fights in [from, to), highest rating first. */
async function expectedChampion(from: Date, to: Date, min: number) {
  const fights = await db.fight.findMany({ where: { state: "SETTLED", closedAt: { gte: from, lt: to } } });
  const count = new Map<string, number>();
  for (const f of fights) for (const id of [f.side1CharacterId, f.side2CharacterId]) count.set(id, (count.get(id) ?? 0) + 1);
  const eligible = [...count].filter(([, n]) => n >= min).map(([id]) => id);
  return db.character.findFirst({ where: { id: { in: eligible } }, orderBy: { rating: "desc" } });
}

describe("seasons", () => {
  it("runs a season, then crowns its champion and top bettor and starts the leaderboard over", async () => {
    const d = deps();
    await playFight(d);
    const started = events.find((e) => e.type === "season");
    expect(started).toMatchObject({ type: "season", number: 1, status: "STARTED", startsAt: T0.toISOString(), endsAt: new Date(T0.getTime() + 8 * WEEK).toISOString() });
    for (let i = 0; i < 3; i++) {
      clock = new Date(clock.getTime() + 60_000);
      await playFight(d);
    }

    // Mid-season: live standings, and who'd win if it ended now.
    const live = (await seasonView(db, config, null, alice))!;
    expect(live).toMatchObject({ number: 1, status: "RUNNING", rules: { minFights: 2, minBets: 2 } });
    expect(live.players.map((p) => [p.rank, p.name, p.bets])).toEqual([[1, "Alice", 4], [2, expect.stringMatching(/^Anon-/), 4]]);
    expect(live.players[1]!.saltWon).toBe("-80");
    expect(live.leaders).toMatchObject({ topBettor: { name: "Alice" } });
    expect(live.me).toMatchObject({ rank: 1, bets: 4 });
    expect(await leaderboard(db, config)).toHaveLength(2);
    expect(await mySeason(db, config, bob)).toMatchObject({ number: 1, rank: 2, saltWon: "-80", bets: 4 });
    const aliceWon = BigInt(live.players[0]!.saltWon);
    expect(aliceWon).toBeGreaterThan(0n);

    // The season ends; the next booking closes it.
    const balances = [await getBalance(db, alice), await getBalance(db, bob)];
    const champ = (await expectedChampion(T0, new Date(T0.getTime() + 8 * WEEK), 2))!;
    events = [];
    clock = new Date(T0.getTime() + 8 * WEEK + 3_600_000);
    await bookFight(d, rng(), "fake");
    expect(events.filter((e) => e.type === "season" || e.type === "title_earned")).toEqual([
      { type: "season", seasonId: expect.any(String), number: 1, status: "ENDED", champion: { characterId: champ.id, name: champ.name }, topBettor: { name: "Alice", saltWon: aliceWon } },
      { type: "title_earned", fightId: null, number: null, characterId: champ.id, name: champ.name, code: "SEASON_CHAMPION", label: "Season Champion" },
      { type: "season", seasonId: expect.any(String), number: 2, status: "STARTED", startsAt: new Date(T0.getTime() + 8 * WEEK).toISOString(), endsAt: new Date(T0.getTime() + 16 * WEEK).toISOString() },
    ]);

    // Titles with provenance, final standings kept, balances untouched, leaderboard empty again.
    expect((await characterTitles(db, champ.id)).filter((t) => t.code === "SEASON_CHAMPION")).toMatchObject([{ label: "Season 1 Champion", seasonNumber: 1, earnedBy: { kind: "house" } }]);
    expect((await meView(db, config, alice)).titles).toMatchObject([{ code: "SEASON_TOP_BETTOR", label: "Season Top Bettor", seasonNumber: 1, tournamentNumber: null, balance: aliceWon.toString() }]);
    const final = (await seasonView(db, config, 1, alice))!;
    expect(final).toMatchObject({ status: "ENDED", champion: { name: champ.name }, topBettor: { name: "Alice" }, me: { rank: 1 } });
    expect(final.players).toEqual(live.players.map((p) => ({ rank: p.rank, name: p.name, saltWon: p.saltWon, bets: p.bets })));
    // Characters by final rating; the champion is the best one with enough fights (not always first).
    expect(final.characters.map((c) => c.rank)).toEqual(final.characters.map((_, i) => i + 1));
    expect(final.characters.map((c) => c.rating)).toEqual([...final.characters.map((c) => c.rating)].sort((a, b) => b - a));
    expect(final.characters.find((c) => c.characterId === champ.id)).toBeDefined();
    expect([await getBalance(db, alice), await getBalance(db, bob)]).toEqual(balances);
    expect(await leaderboard(db, config)).toEqual([]);
    expect(await mySeason(db, config, alice)).toMatchObject({ number: 2, rank: null, saltWon: "0", bets: 0 });
  });

  it("counts a fight in the season its result came in", async () => {
    const d = deps();
    await playFight(d);
    const end = new Date(T0.getTime() + 8 * WEEK);
    // Booked and bet on in season 1, decided just after it ended.
    await playFight(d, { settleAt: new Date(end.getTime() + 1000) });
    await bookFight(d, rng(), "fake");
    expect((await seasonView(db, config, 1))!.players.map((p) => p.bets)).toEqual([1, 1]);
    expect((await seasonView(db, config, null))!.players.map((p) => p.bets)).toEqual([1, 1]);
  });

  it("ends with no titles when nobody qualifies, and starts fresh after a long break", async () => {
    const strict: Config = { ...config, seasons: { ...config.seasons, minFights: 1000, minBets: 1000 } };
    const d = deps(strict);
    await playFight(d);
    events = [];
    clock = new Date(T0.getTime() + 30 * WEEK);
    await bookFight(d, rng(), "fake");
    expect(events.filter((e) => e.type === "season")).toMatchObject([
      { status: "ENDED", number: 1, champion: null, topBettor: null },
      { status: "STARTED", number: 2, startsAt: clock.toISOString() },
    ]);
    expect(await db.characterTitle.count({ where: { code: "SEASON_CHAMPION" } })).toBe(0);
    expect(await db.playerTitle.count()).toBe(0);
    expect(await db.seasonStanding.count({ where: { kind: "PLAYER" } })).toBe(2);
  });
});

describe("season guards", () => {
  it("keeps seasons in order, one running, and ended seasons and standings fixed", async () => {
    const d = deps();
    await playFight(d);
    const s1 = await db.season.findFirstOrThrow();
    await expect(db.season.create({ data: { startsAt: new Date(T0.getTime() + WEEK), endsAt: new Date(T0.getTime() + 2 * WEEK) } })).rejects.toThrow(/can't start before/);
    await expect(db.season.update({ where: { id: s1.id }, data: { endsAt: new Date(T0.getTime() + WEEK) } })).rejects.toThrow(/dates are fixed/);
    await expect(db.season.delete({ where: { id: s1.id } })).rejects.toThrow(/kept/);
    await expect(db.season.update({ where: { id: s1.id }, data: { championCharacterId: (await db.character.findFirstOrThrow()).id } })).rejects.toThrow(/season_shape/);
    clock = new Date(T0.getTime() + 9 * WEEK);
    await bookFight(d, rng(), "fake");
    await expect(db.season.update({ where: { id: s1.id }, data: { championCharacterId: null } })).rejects.toThrow(/ended season can't change/);
    await expect(db.season.create({ data: { startsAt: new Date(T0.getTime() + 20 * WEEK), endsAt: new Date(T0.getTime() + 21 * WEEK) } })).rejects.toThrow(/season_one_running|Unique constraint/);
    const standing = await db.seasonStanding.findFirstOrThrow();
    await expect(db.seasonStanding.update({ where: { seasonId_kind_rank: { seasonId: standing.seasonId, kind: standing.kind, rank: standing.rank } }, data: { rank: 99 } })).rejects.toThrow(/append-only/);
  });

  it("ties season titles to their season", async () => {
    const d = deps();
    await playFight(d);
    const s1 = await db.season.findFirstOrThrow();
    const c = await db.character.findFirstOrThrow();
    await expect(db.characterTitle.create({ data: { characterId: c.id, code: "SEASON_CHAMPION", ownerKind: "HOUSE" } })).rejects.toThrow(/character_title_season/);
    await expect(db.playerTitle.create({ data: { userId: alice, code: "SEASON_TOP_BETTOR", balance: "5" } })).rejects.toThrow(/player_title_source/);
    await expect(db.playerTitle.create({ data: { userId: alice, code: "BETTOR_1ST", seasonId: s1.id, balance: "5" } })).rejects.toThrow(/player_title_source/);
    // Season Champion can be earned again in another season, but only once per season.
    await db.characterTitle.create({ data: { characterId: c.id, code: "SEASON_CHAMPION", seasonId: s1.id, ownerKind: "HOUSE" } });
    await expect(db.characterTitle.create({ data: { characterId: c.id, code: "SEASON_CHAMPION", seasonId: s1.id, ownerKind: "HOUSE" } })).rejects.toThrow(/character_title_one_season_champion|Unique constraint/);
  });
});
