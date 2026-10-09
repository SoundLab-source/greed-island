/**
 * Daily goals (docs/ENGAGEMENT.md §5; the rules are shared goals.ts): each player's three goals for the UTC day are
 * made the first time they're needed, counted from the day's calls and paid from issuance the moment they're done,
 * inside the settlement transaction of the fight that finished them (`awardGoals`). One unfinished goal a day can be
 * swapped (`swapGoal`); a swap that lands on a goal already done pays at once.
 */
import {
  asGoalCode,
  goalDay,
  goalProgress,
  goalReward,
  LedgerRuleError,
  pickGoals,
  planGrant,
  swapGoal as nextGoal,
  type Archetype,
  type GoalCall,
  type GoalCode,
  type GoalConfig,
  type GoalPool,
  type GoalWorld,
  type Salt,
  GOALS,
} from "@greed-island/shared";
import type { Db, Tx } from "./client.ts";
import { fromSalt, requestHash, toSalt } from "./convert.ts";
import { lockUserAccount, postTransaction, withRetry } from "./ledger.ts";

export interface GoalSettings {
  goals: GoalConfig;
  /** The smallest stake that counts as a call (bettors.ts). */
  minCallStake: Salt;
}

/** What's running today, for picking goals nobody would be stuck on. */
export async function goalWorld(db: Db | Tx, rivalryRate: number): Promise<GoalWorld> {
  const community = await db.fighter.count({ where: { source: "COMMUNITY", enabled: true } });
  return { communityFighters: community > 0, rivalries: rivalryRate > 0 };
}

interface GoalRow {
  slot: number;
  code: string;
  swapped: boolean;
  reward: string | null;
  done_at: Date | null;
}

/** The player's goals for the day, made if they don't exist yet; with `lock`, locked until the transaction ends. */
async function ensureGoals(tx: Tx, userId: string, day: string, world: GoalWorld, lock = false): Promise<GoalRow[]> {
  if (!lock) {
    const made = await tx.$queryRaw<GoalRow[]>`
      SELECT "slot", "code", "swapped", "reward"::text AS reward, "done_at" FROM "player_goal"
      WHERE "user_id" = ${userId}::uuid AND "day" = ${day} ORDER BY "slot"`;
    if (made.length === 3) return made;
  }
  const codes = pickGoals(userId, day, world);
  for (const [slot, code] of codes.entries()) {
    await tx.$executeRaw`
      INSERT INTO "player_goal" ("user_id", "day", "slot", "code") VALUES (${userId}::uuid, ${day}, ${slot}, ${code})
      ON CONFLICT DO NOTHING`;
  }
  return lock
    ? tx.$queryRaw<GoalRow[]>`
        SELECT "slot", "code", "swapped", "reward"::text AS reward, "done_at" FROM "player_goal"
        WHERE "user_id" = ${userId}::uuid AND "day" = ${day} ORDER BY "slot" FOR UPDATE`
    : tx.$queryRaw<GoalRow[]>`
        SELECT "slot", "code", "swapped", "reward"::text AS reward, "done_at" FROM "player_goal"
        WHERE "user_id" = ${userId}::uuid AND "day" = ${day} ORDER BY "slot"`;
}

/** The player's calls settled on the day (and on `fightId`, the fight settling now), oldest first. */
async function dayCalls(tx: Db | Tx, userId: string, now: Date, minCallStake: Salt, fightId: string | null): Promise<GoalCall[]> {
  const { start, resetsAt } = goalDay(now);
  const rows = await tx.$queryRaw<{ won: boolean; chance_bp: number; against: boolean; segment: GoalCall["segment"]; rivalry: boolean; community: boolean; archetype: Archetype }[]>`
    SELECT (b."status" = 'WON') AS won,
           CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END AS chance_bp,
           CASE WHEN b."side" = 1 THEN o."pool1" < o."pool2" ELSE o."pool2" < o."pool1" END AS against,
           f."segment"::text AS segment, (f."pair_kind" = 'RIVALRY') AS rivalry,
           (fi."source" = 'COMMUNITY') AS community, fi."archetype"::text AS archetype
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id"
    JOIN "fight_odds" o ON o."fight_id" = b."fight_id"
    JOIN "fight_loadout" l ON l."fight_id" = b."fight_id" AND l."side" = b."side"
    JOIN "fighter" fi ON fi."id" = l."fighter_id"
    WHERE b."user_id" = ${userId}::uuid AND b."status" IN ('WON', 'LOST') AND b."stake" >= ${fromSalt(minCallStake)}::numeric
      AND ((f."closed_at" >= ${start} AND f."closed_at" < ${resetsAt}) OR f."id" = ${fightId}::uuid)
    ORDER BY f."number"`;
  return rows.map((r) => ({ won: r.won, chanceBp: r.chance_bp, againstCrowd: r.against, segment: r.segment, rivalry: r.rivalry, community: r.community, archetype: r.archetype }));
}

export interface PaidGoal {
  userId: string;
  slot: number;
  code: GoalCode;
  label: string;
  amount: Salt;
}

/** Pay the player's goals for the day that are done and not yet paid. The caller holds the transaction. */
async function payDoneGoals(tx: Tx, userId: string, now: Date, cfg: GoalSettings, world: GoalWorld, fightId: string | null): Promise<PaidGoal[]> {
  const { day } = goalDay(now);
  const rows = await ensureGoals(tx, userId, day, world, true);
  const open = rows.filter((r) => !r.done_at);
  if (!open.length) return [];
  const calls = await dayCalls(tx, userId, now, cfg.minCallStake, fightId);
  const paid: PaidGoal[] = [];
  for (const r of open) {
    const code = asGoalCode(r.code);
    if (!code || !goalProgress(code, calls).done) continue;
    const amount = goalReward(code, cfg.goals);
    await postTransaction(tx, {
      idempotencyKey: `goal:${userId}:${day}:${r.slot}`,
      requestHash: requestHash({ op: "goal", userId, day, slot: r.slot, code, amount: amount.toString() }),
      kind: "GOAL_REWARD",
      userId,
      postings: planGrant(userId, amount),
    });
    await tx.playerGoal.update({ where: { userId_day_slot: { userId, day, slot: r.slot } }, data: { doneAt: now, reward: fromSalt(amount), fightId } });
    paid.push({ userId, slot: r.slot, code, label: GOALS[code].label, amount });
  }
  return paid;
}

/**
 * Pay the goals a settled fight finished, for every player (not bots) whose bet on it counts as a call. Call after
 * the fight's bets are settled, in the same transaction.
 */
export async function awardGoals(tx: Tx, input: { fightId: string; now: Date; cfg: GoalSettings; world: GoalWorld }): Promise<PaidGoal[]> {
  const bettors = await tx.bet.findMany({
    where: { fightId: input.fightId, status: { in: ["WON", "LOST"] }, stake: { gte: fromSalt(input.cfg.minCallStake) }, user: { kind: { not: "BOT" } } },
    orderBy: { userId: "asc" },
    select: { userId: true },
  });
  const paid: PaidGoal[] = [];
  for (const b of bettors) paid.push(...(await payDoneGoals(tx, b.userId, input.now, input.cfg, input.world, input.fightId)));
  return paid;
}

export interface GoalView {
  slot: number;
  pool: GoalPool;
  code: GoalCode;
  label: string;
  have: number;
  need: number;
  done: boolean;
  /** What it pays (or paid). */
  reward: Salt;
  doneAt: Date | null;
  swapped: boolean;
}

export interface GoalsView {
  day: string;
  resetsAt: Date;
  goals: GoalView[];
  /** The day's swap hasn't been used and an unfinished goal is left to swap. */
  canSwap: boolean;
}

function viewOf(rows: readonly GoalRow[], calls: readonly GoalCall[], cfg: GoalSettings): GoalView[] {
  return rows.flatMap((r) => {
    const code = asGoalCode(r.code);
    if (!code) return [];
    const p = goalProgress(code, calls);
    const done = Boolean(r.done_at);
    return [{
      slot: r.slot,
      pool: GOALS[code].pool,
      code,
      label: GOALS[code].label,
      // A paid goal shows full even if the rules counting it changed since.
      have: done ? p.need : p.have,
      need: p.need,
      done,
      reward: r.reward ? toSalt(r.reward) : goalReward(code, cfg.goals),
      doneAt: r.done_at,
      swapped: r.swapped,
    }];
  });
}

/** A player's goals for the day, with how far along each is. */
export async function goalsView(db: Db, userId: string, cfg: GoalSettings, world: GoalWorld, now = new Date()): Promise<GoalsView> {
  const { day, resetsAt } = goalDay(now);
  const rows = await withRetry(db, (tx) => ensureGoals(tx, userId, day, world));
  const goals = viewOf(rows, await dayCalls(db, userId, now, cfg.minCallStake, null), cfg);
  return { day, resetsAt, goals, canSwap: !rows.some((r) => r.swapped) && goals.some((g) => !g.done) };
}

/**
 * Swap one of today's unfinished goals for another from its pool (once a day). Throws LedgerRuleError NOT_ELIGIBLE
 * when the swap is used, the goal is done or its pool has nothing else to give. Pays at once if the new goal is done.
 */
export async function swapGoal(db: Db, userId: string, slot: number, cfg: GoalSettings, world: GoalWorld, now = new Date()): Promise<{ view: GoalsView; paid: PaidGoal[] }> {
  const { day } = goalDay(now);
  const paid = await withRetry(db, async (tx) => {
    // The account first, then the goal rows: the order settlement takes them in.
    await lockUserAccount(tx, userId);
    const rows = await ensureGoals(tx, userId, day, world, true);
    const row = rows.find((r) => r.slot === slot);
    if (!row) throw new LedgerRuleError("NOT_ELIGIBLE", "no such goal today");
    if (rows.some((r) => r.swapped)) throw new LedgerRuleError("NOT_ELIGIBLE", "you've already swapped a goal today");
    if (row.done_at) throw new LedgerRuleError("NOT_ELIGIBLE", "that goal is already done");
    const current = asGoalCode(row.code);
    const today = rows.map((r) => asGoalCode(r.code)).filter((c): c is GoalCode => c !== null);
    const next = current ? nextGoal(current, today, world) : null;
    if (!next) throw new LedgerRuleError("NOT_ELIGIBLE", "there's no other goal to swap it for today");
    await tx.playerGoal.update({ where: { userId_day_slot: { userId, day, slot } }, data: { code: next, swapped: true } });
    return payDoneGoals(tx, userId, now, cfg, world, null);
  });
  return { view: await goalsView(db, userId, cfg, world, now), paid };
}
