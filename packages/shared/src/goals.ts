/**
 * Daily goals (docs/ENGAGEMENT.md §5, agreed 2026-10-09): three small goals a day per player, one from each pool: an
 * easy one, a skill one and one that sends you somewhere new in the game. Each pays Salt the moment it's done. A new
 * set every UTC day (the same day as the daily grant); missing a day costs nothing, and one unfinished goal a day can
 * be swapped for another from its pool.
 *
 * Goals count calls (bettors.ts: a settled bet of at least `minCallStake`, Salt or T-Salt), never how much was
 * staked, so a goal is never a reason to bet big. A tournament bet counts for taking part (bet on 5 fights, bet on a
 * tournament fight) but its win doesn't count for the win goals, and doesn't break or extend a run of wins: T-Salt
 * winnings never turn into Salt. Pure rules; the database keeps each day's goals and pays them (db goals.ts).
 */
import type { Archetype } from "./character.ts";
import type { Salt } from "./money.ts";

export const GOAL_POOLS = ["easy", "skill", "explore"] as const;
export type GoalPool = (typeof GOAL_POOLS)[number];

/** One call settled today, as the goals need it (oldest first in a list). */
export interface GoalCall {
  won: boolean;
  /** The backed side's locked win chance, in basis points. */
  chanceBp: number;
  /** Less of the players' Salt was on the backed side than on the other when betting closed. */
  againstCrowd: boolean;
  segment: "MATCHMAKING" | "TOURNAMENT" | "EXHIBITION";
  rivalry: boolean;
  /** The backed fighter is a community fighter. */
  community: boolean;
  archetype: Archetype;
}

/** What's running, so nobody gets a goal they can't do (no community fighters yet, rivalries switched off). */
export interface GoalWorld {
  communityFighters: boolean;
  rivalries: boolean;
}

interface GoalRule {
  pool: GoalPool;
  label: string;
  need: number;
  /** How far along today's calls are (capped at `need` by goalProgress). */
  have: (calls: readonly GoalCall[]) => number;
  available?: (w: GoalWorld) => boolean;
}

/** Calls in Salt: the only ones whose wins count (a tournament's are in T-Salt). */
const salt = (calls: readonly GoalCall[]) => calls.filter((c) => c.segment !== "TOURNAMENT");
const wins = (calls: readonly GoalCall[]) => salt(calls).filter((c) => c.won);

function bestRun(calls: readonly GoalCall[]): number {
  let best = 0, run = 0;
  for (const c of salt(calls)) {
    run = c.won ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** The underdog: the side given less than an even chance. */
const UNDERDOG_BP = 5000;

export const GOALS = {
  BET_5: { pool: "easy", label: "Bet on 5 fights", need: 5, have: (c) => c.length },
  BET_8: { pool: "easy", label: "Bet on 8 fights", need: 8, have: (c) => c.length },
  WIN_2: { pool: "easy", label: "Win 2 bets", need: 2, have: (c) => wins(c).length },
  WIN_STREAK_3: { pool: "skill", label: "Win 3 bets in a row", need: 3, have: bestRun },
  UNDERDOG: { pool: "skill", label: "Win a bet on the underdog", need: 1, have: (c) => wins(c).filter((b) => b.chanceBp < UNDERDOG_BP).length },
  AGAINST_CROWD: { pool: "skill", label: "Win against the crowd", need: 1, have: (c) => wins(c).filter((b) => b.againstCrowd).length },
  WIN_4: { pool: "skill", label: "Win 4 bets", need: 4, have: (c) => wins(c).length },
  TOURNAMENT: { pool: "explore", label: "Bet on a tournament fight", need: 1, have: (c) => c.filter((b) => b.segment === "TOURNAMENT").length },
  EXHIBITION: { pool: "explore", label: "Bet on an exhibition", need: 1, have: (c) => c.filter((b) => b.segment === "EXHIBITION").length },
  RIVALRY: { pool: "explore", label: "Bet on a rivalry rematch", need: 1, have: (c) => c.filter((b) => b.rivalry).length, available: (w) => w.rivalries },
  COMMUNITY: { pool: "explore", label: "Back a community fighter", need: 1, have: (c) => c.filter((b) => b.community).length, available: (w) => w.communityFighters },
  STYLES: { pool: "explore", label: "Back 3 different fighting styles", need: 3, have: (c) => new Set(c.map((b) => b.archetype)).size },
} satisfies Record<string, GoalRule>;

export type GoalCode = keyof typeof GOALS;
export const GOAL_CODES = Object.keys(GOALS) as GoalCode[];

export interface GoalConfig {
  /** What an easy or explore goal pays; a skill goal pays half as much again (rounded down). */
  reward: Salt;
}

export const DEFAULT_GOALS: Readonly<GoalConfig> = Object.freeze({ reward: 100n });

export function validateGoals(c: GoalConfig): GoalConfig {
  if (c.reward < 1n) throw new Error("a goal must pay at least 1 Salt");
  return c;
}

export function goalReward(code: GoalCode, cfg: GoalConfig): Salt {
  return GOALS[code].pool === "skill" ? (cfg.reward * 3n) / 2n : cfg.reward;
}

export function goalProgress(code: GoalCode, calls: readonly GoalCall[]): { have: number; need: number; done: boolean } {
  const rule: GoalRule = GOALS[code];
  const have = Math.min(rule.have(calls), rule.need);
  return { have, need: rule.need, done: have >= rule.need };
}

/** A goal code stored in the database, or null for one that's since been retired. */
export function asGoalCode(code: string): GoalCode | null {
  return Object.hasOwn(GOALS, code) ? (code as GoalCode) : null;
}

function poolCodes(pool: GoalPool, world: GoalWorld): GoalCode[] {
  return GOAL_CODES.filter((c) => {
    const rule: GoalRule = GOALS[c];
    return rule.pool === pool && (rule.available?.(world) ?? true);
  });
}

/** A small stable hash (FNV-1a), so a player's goals for a day are the same however often they're asked for. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** A player's three goals for a day, one per pool, in pool order. */
export function pickGoals(userId: string, day: string, world: GoalWorld): GoalCode[] {
  return GOAL_POOLS.map((pool) => {
    const codes = poolCodes(pool, world);
    return codes[hash(`${userId}:${day}:${pool}`) % codes.length]!;
  });
}

/** The goal a swap gives instead of `current`: the next one in its pool that the player doesn't already have today. */
export function swapGoal(current: GoalCode, today: readonly GoalCode[], world: GoalWorld): GoalCode | null {
  const codes = poolCodes(GOALS[current].pool, world);
  const at = codes.indexOf(current);
  for (let i = 1; i <= codes.length; i++) {
    const next = codes[(at + i) % codes.length]!;
    if (next !== current && !today.includes(next)) return next;
  }
  return null;
}

/** The UTC day a moment falls in ("2026-10-09"), and when the next one starts. */
export function goalDay(now: Date): { day: string; start: Date; resetsAt: Date } {
  const day = now.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  return { day, start, resetsAt: new Date(start.getTime() + 86_400_000) };
}
