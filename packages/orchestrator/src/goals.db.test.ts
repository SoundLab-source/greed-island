import { auditLedger, createUser, getBalance, goalsView, swapGoal } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { goalDay, loadConfig, LedgerRuleError, pickGoals, type Config, type GoalCode, type GoalWorld } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { placeFightBet } from "./betting.ts";
import { FightBus } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, type FightDeps } from "./fights.ts";
import { goalSettings, meView } from "./api/views.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: { ...testEconomy, startingBalance: 100_000n } };
const orch = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0 };
const world: GoalWorld = { communityFighters: false, rivalries: true };
const cfg = goalSettings(config);

let chars: Record<string, string>;
let key = 0;

beforeEach(async () => {
  chars = {};
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  for (const [id, rating, archetype] of [["champ", 2100, "HEAVY"], ["nobody", 1300, "ZONER"], ["even", 1300, "RUSHDOWN"]] as const) {
    await db.fighter.create({ data: { id, displayName: id.toUpperCase(), archetype, defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    chars[id] = (await db.character.create({ data: { rosterKey: id, fighterId: id, name: id, rating, deviation: 50, volatility: 0.06, tier: "B" } })).id;
  }
});

const deps = (): FightDeps => ({ db, config, orch, bus: new FightBus(), now: () => new Date() });
const player = async (kind: "ANONYMOUS" | "BOT" = "ANONYMOUS") => (await createUser(db, kind === "BOT" ? { kind, displayName: "Bot" } : { kind }, config.economy)).user.id;

/** One fight from booking to settlement, with these bets. */
async function fight(a: string, b: string, winner: 1 | 2, bets: [userId: string, side: 1 | 2, stake: bigint][], kind: { segment?: "MATCHMAKING" | "EXHIBITION"; pairKind?: "CROSS_TIER" | "RIVALRY" } = {}) {
  const d = deps();
  const n = await db.fight.count();
  const f = await db.fight.create({
    data: { engineMode: "fake", cycle: 1, segment: kind.segment ?? "MATCHMAKING", segmentIndex: n, pairKind: kind.pairKind ?? "CROSS_TIER", stageId: "s1", side1CharacterId: chars[a]!, side2CharacterId: chars[b]! },
  });
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  for (const [userId, side, stake] of bets) await placeFightBet(db, config, { userId, fightId: f.id, side, stake, idempotencyKey: `bet-${++key}` });
  await applyTransition(d, f.id, { type: "LOCK" });
  await applyTransition(d, f.id, { type: "ENGINE_STARTED" });
  await applyTransition(d, f.id, { type: "MATCH_END", winnerSide: winner });
  await applyTransition(d, f.id, { type: "SETTLED_OK" });
  return f.id;
}

/** Give the player today's goals (the ones the test needs), as a swap or the day's pick would. */
async function setGoals(userId: string, codes: [GoalCode, GoalCode, GoalCode]) {
  await goalsView(db, userId, cfg, world);
  const { day } = goalDay(new Date());
  for (const [slot, code] of codes.entries()) await db.playerGoal.update({ where: { userId_day_slot: { userId, day, slot } }, data: { code } });
}

const rewards = (userId: string) => db.ledgerTxn.count({ where: { userId, kind: "GOAL_REWARD" } });

describe("daily goals", () => {
  it("gives each player three goals for the day, one per pool, the same on every look", async () => {
    const ann = await player();
    const v = await goalsView(db, ann, cfg, world);
    expect(v.goals.map((g) => g.pool)).toEqual(["easy", "skill", "explore"]);
    expect(v.goals.map((g) => g.code)).toEqual(pickGoals(ann, v.day, world));
    expect(v.goals.every((g) => !g.done && g.have === 0)).toBe(true);
    expect(v.canSwap).toBe(true);
    expect((await goalsView(db, ann, cfg, world)).goals).toEqual(v.goals);
    expect(await db.playerGoal.count({ where: { userId: ann } })).toBe(3);
  });

  it("pays a goal the moment a fight finishes it, once", async () => {
    const ann = await player();
    await setGoals(ann, ["BET_5", "WIN_STREAK_3", "EXHIBITION"]);
    const start = await getBalance(db, ann);
    for (let i = 0; i < 4; i++) await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    let v = await goalsView(db, ann, cfg, world);
    expect(v.goals[0]).toMatchObject({ code: "BET_5", have: 4, need: 5, done: false });
    // Three wins in a row so far: the skill goal is done and paid half as much again.
    expect(v.goals[1]).toMatchObject({ code: "WIN_STREAK_3", done: true, reward: 150n });
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    v = await goalsView(db, ann, cfg, world);
    expect(v.goals[0]).toMatchObject({ done: true, reward: 100n });
    expect(v.goals[2]!.done).toBe(false);
    expect(await rewards(ann)).toBe(2);
    // Five bets of 10 at even odds, all won, plus 250 from goals.
    const bets = await db.bet.findMany({ where: { userId: ann } });
    const won = bets.reduce((n, b) => n + BigInt(b.returned!.toFixed(0)) - BigInt(b.stake.toFixed(0)), 0n);
    expect(await getBalance(db, ann)).toBe(start + won + 250n);
    // More fights pay nothing more.
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    expect(await rewards(ann)).toBe(2);
    expect((await auditLedger(db)).problems).toEqual([]);
  });

  it("counts explore goals by the fight: an exhibition, a rivalry", async () => {
    const ann = await player();
    await setGoals(ann, ["WIN_2", "AGAINST_CROWD", "RIVALRY"]);
    await fight("even", "nobody", 2, [[ann, 1, 10n]], { segment: "EXHIBITION" });
    expect((await goalsView(db, ann, cfg, world)).goals[2]!.done).toBe(false);
    await fight("even", "nobody", 2, [[ann, 1, 10n]], { segment: "EXHIBITION", pairKind: "RIVALRY" });
    const v = await goalsView(db, ann, cfg, world);
    expect(v.goals[2]).toMatchObject({ code: "RIVALRY", done: true });
    expect(v.goals[0]!.done).toBe(false);
  });

  it("leaves out bots and bets too small to be a call", async () => {
    const bot = await player("BOT");
    const ann = await player();
    await setGoals(ann, ["WIN_2", "WIN_STREAK_3", "STYLES"]);
    for (let i = 0; i < 3; i++) await fight("even", "nobody", 1, [[ann, 1, 9n], [bot, 1, 50n]]);
    expect((await goalsView(db, ann, cfg, world)).goals.every((g) => g.have === 0)).toBe(true);
    expect(await rewards(ann)).toBe(0);
    expect(await db.playerGoal.count({ where: { userId: bot } })).toBe(0);
    expect(await db.ledgerTxn.count({ where: { kind: "GOAL_REWARD" } })).toBe(0);
  });

  it("swaps one unfinished goal a day, and pays at once when the new one is already done", async () => {
    const ann = await player();
    await setGoals(ann, ["BET_8", "UNDERDOG", "STYLES"]);
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    // BET_8 → the next easy goal, WIN_2: already done.
    const r = await swapGoal(db, ann, 0, cfg, world);
    expect(r.paid.map((p) => [p.code, p.amount])).toEqual([["WIN_2", 100n]]);
    expect(r.view.goals[0]).toMatchObject({ code: "WIN_2", done: true, swapped: true });
    expect(r.view.canSwap).toBe(false);
    await expect(swapGoal(db, ann, 1, cfg, world)).rejects.toThrow(LedgerRuleError);
    expect((await auditLedger(db)).problems).toEqual([]);
  });

  it("won't swap a goal that's done", async () => {
    const ann = await player();
    await setGoals(ann, ["WIN_2", "WIN_4", "STYLES"]);
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    await fight("even", "nobody", 1, [[ann, 1, 10n]]);
    await expect(swapGoal(db, ann, 0, cfg, world)).rejects.toThrow("already done");
    expect((await swapGoal(db, ann, 1, cfg, world)).view.goals[1]!.swapped).toBe(true);
  });

  it("shows on the player's account, but not a bot's", async () => {
    const ann = await player();
    const me = await meView(db, config, ann);
    expect(me.goals!.goals).toHaveLength(3);
    expect(typeof me.goals!.goals[0]!.reward).toBe("string");
    expect((await meView(db, config, await player("BOT"))).goals).toBeNull();
  });
});
