/**
 * Balance checks: turn fight results into win rates per fighter and per
 * matchup, with a verdict against the targets. Pure.
 */
import type { FightResult } from "./series.ts";

export interface Tally {
  fights: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * "ok": inside the target band. "too strong/weak": outside it, and the likely
 * range excludes 50%. "leaning": outside it, but more fights are needed to be sure.
 */
export type Verdict = "ok" | "too strong" | "too weak" | "leaning strong" | "leaning weak";

export interface FighterLine extends Tally {
  id: string;
  /** Wins plus half the draws, over fights (0–1). */
  winRate: number;
  /** The range the true win rate is likely in (95%, Wilson). */
  low: number;
  high: number;
  verdict: Verdict;
  roundsWon: number;
  roundsLost: number;
  /** Average life left in the rounds it won (0–1): how comfortably it wins. Null without round detail. */
  lifeLeftInWins: number | null;
}

export interface BalanceTargets {
  /** A fighter is fine when its overall win rate is within this of 50% (0.05 = 45–55%). */
  overallBand: number;
  /** A matchup is called lopsided when it's further than this from 50% (0.15 = outside 35–65%). */
  matchupBand: number;
}

export const DEFAULT_TARGETS: BalanceTargets = { overallBand: 0.05, matchupBand: 0.15 };

export interface Lopsided {
  winner: string;
  loser: string;
  winRate: number;
  fights: number;
}

export interface BalanceSummary {
  /** Fights that finished (a winner or a draw). */
  fights: number;
  /** Fights the engine crashed or timed out in; they count for nobody. */
  failed: FightResult[];
  /** Strongest first. */
  fighters: FighterLine[];
  /** matchups[a][b]: a's record against b. */
  matchups: Record<string, Record<string, Tally>>;
  lopsided: Lopsided[];
  /** Player 1's record over all fights: near 50% means the side doesn't matter. */
  p1: Tally;
  rounds: number;
  roundsByTime: number;
  /** Average fighting time per fight in game ticks (60 a second); null without round detail. */
  avgTicks: number | null;
  /** Strongest win rate minus weakest (0–1). */
  spread: number;
  /** Every fighter's verdict is "ok". */
  balanced: boolean;
  targets: BalanceTargets;
}

export interface SideLine extends Tally {
  id: string;
  /** The player 1 side's win rate (draws count half) and its likely range. */
  winRate: number;
  low: number;
  high: number;
}

export interface SideSummary {
  /** One line per fighter, from the player 1 side's view. */
  fighters: SideLine[];
  overall: SideLine;
  failed: FightResult[];
  /** The likely range of the overall player 1 win rate includes 50%. */
  fair: boolean;
}

const emptyTally = (): Tally => ({ fights: 0, wins: 0, losses: 0, draws: 0 });

/** Mirror fights (plan.ts `mirrors`): how often the player 1 side wins, per fighter and overall. */
export function summarizeSides(results: readonly FightResult[], ids: readonly string[]): SideSummary {
  const tallies = new Map(ids.map((id) => [id, emptyTally()]));
  const all = emptyTally();
  const failed: FightResult[] = [];
  for (const r of results) {
    if (r.outcome.kind !== "finished") {
      failed.push(r);
      continue;
    }
    const key = r.outcome.winnerSide === 0 ? "draws" : r.outcome.winnerSide === 1 ? "wins" : "losses";
    for (const t of [tallies.get(r.fight.p1), all]) {
      if (!t) continue;
      t.fights++;
      t[key]++;
    }
  }
  const line = (id: string, t: Tally): SideLine => {
    const rate = winRate(t);
    return { id, ...t, winRate: rate, ...wilson(rate, t.fights) };
  };
  const overall = line("all", all);
  return { fighters: ids.map((id) => line(id, tallies.get(id)!)), overall, failed, fair: overall.low <= 0.5 && overall.high >= 0.5 };
}

export function winRate(t: Tally): number {
  return t.fights === 0 ? 0.5 : (t.wins + t.draws / 2) / t.fights;
}

/** Wilson score interval for a share `p` seen over `n` trials. */
export function wilson(p: number, n: number, z = 1.96): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

export function verdict(rate: number, low: number, high: number, band: number): Verdict {
  // A hair of tolerance, so 55.0% counts as inside a 45–55% band.
  if (Math.abs(rate - 0.5) <= band + 1e-9) return "ok";
  if (rate > 0.5) return low > 0.5 ? "too strong" : "leaning strong";
  return high < 0.5 ? "too weak" : "leaning weak";
}

export function summarize(results: readonly FightResult[], ids: readonly string[], targets: BalanceTargets = DEFAULT_TARGETS): BalanceSummary {
  const totals = new Map(ids.map((id) => [id, { ...emptyTally(), roundsWon: 0, roundsLost: 0, lifeSum: 0, lifeRounds: 0 }]));
  const matchups: Record<string, Record<string, Tally>> = {};
  for (const a of ids) {
    matchups[a] = {};
    for (const b of ids) if (a !== b) matchups[a]![b] = emptyTally();
  }
  const p1 = emptyTally();
  const failed: FightResult[] = [];
  let fights = 0;
  let rounds = 0;
  let roundsByTime = 0;
  let ticks = 0;
  let timed = 0;

  for (const r of results) {
    if (r.outcome.kind !== "finished") {
      failed.push(r);
      continue;
    }
    const sideIds = { 1: r.fight.p1, 2: r.fight.p2 } as const;
    const w = r.outcome.winnerSide;
    fights++;
    for (const side of [1, 2] as const) {
      const me = sideIds[side];
      const other = sideIds[side === 1 ? 2 : 1];
      const key = w === 0 ? "draws" : w === side ? "wins" : "losses";
      for (const t of [totals.get(me), matchups[me]?.[other], side === 1 ? p1 : undefined]) {
        if (!t) continue;
        t.fights++;
        t[key]++;
      }
    }
    for (const round of r.outcome.rounds) {
      rounds++;
      if (round.reason === "time") roundsByTime++;
      for (const side of [1, 2] as const) {
        const t = totals.get(sideIds[side]);
        if (!t || round.winnerSide === 0) continue;
        if (round.winnerSide === side) t.roundsWon++;
        else t.roundsLost++;
      }
    }
    if (r.detail) {
      ticks += r.detail.ticks;
      timed++;
      for (const round of r.detail.rounds) {
        if (round.winnerSide === 0) continue;
        const t = totals.get(sideIds[round.winnerSide]);
        if (!t) continue;
        t.lifeSum += round.lifeLeft[round.winnerSide];
        t.lifeRounds++;
      }
    }
  }

  const fighters: FighterLine[] = ids.map((id) => {
    const { roundsWon, roundsLost, lifeSum, lifeRounds, ...tally } = totals.get(id)!;
    const rate = winRate(tally);
    const { low, high } = wilson(rate, tally.fights);
    return { id, ...tally, winRate: rate, low, high, verdict: tally.fights === 0 ? "ok" : verdict(rate, low, high, targets.overallBand), roundsWon, roundsLost, lifeLeftInWins: lifeRounds ? lifeSum / lifeRounds : null };
  });
  fighters.sort((a, b) => b.winRate - a.winRate || ids.indexOf(a.id) - ids.indexOf(b.id));

  const lopsided: Lopsided[] = [];
  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      const t = matchups[a]![b]!;
      if (t.fights === 0) continue;
      const rate = winRate(t);
      if (Math.abs(rate - 0.5) <= targets.matchupBand + 1e-9) continue;
      lopsided.push(rate > 0.5 ? { winner: a, loser: b, winRate: rate, fights: t.fights } : { winner: b, loser: a, winRate: 1 - rate, fights: t.fights });
    }
  }
  lopsided.sort((x, y) => y.winRate - x.winRate);

  const played = fighters.filter((f) => f.fights > 0);
  return {
    fights,
    failed,
    fighters,
    matchups,
    lopsided,
    p1,
    rounds,
    roundsByTime,
    avgTicks: timed ? ticks / timed : null,
    spread: played.length ? played[0]!.winRate - played[played.length - 1]!.winRate : 0,
    balanced: played.length > 0 && played.every((f) => f.verdict === "ok"),
    targets,
  };
}
