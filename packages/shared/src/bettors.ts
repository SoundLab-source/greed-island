/**
 * Bettors as players who get good at reading fights (docs/ENGAGEMENT.md §2, step 3): what counts as a call, a bettor's
 * own numbers, the "best calls" boards and the bettor titles earned by playing (Called It, Iron Read, Loyal,
 * Contrarian). Pure rules; the database gathers the bets (orchestrator bettor-stats.ts, db bettor-titles.ts).
 *
 * A call is a settled bet (won or lost) of at least `minCallStake`, in Salt or T-Salt: a right call is a right call in
 * a tournament too. Bets smaller than that still pay out as usual, but don't count for the boards, the titles or the
 * win rate, so betting 1 Salt on everything can't climb them. Money numbers (profit, biggest payout) count Salt only:
 * T-Salt stays in its tournament.
 */
import type { Archetype } from "./character.ts";
import type { Salt } from "./money.ts";

export interface BettorConfig {
  /** The smallest stake that counts as a call. */
  minCallStake: Salt;
  /** An upset: a side that won at this win chance or lower (basis points). The stream's UPSET! headline uses 30%. */
  upsetChanceBp: number;
  /** Called It: won on a side given this chance or less. */
  calledItChanceBp: number;
  /** Iron Read: this many right calls in a row. */
  ironReadStreak: number;
  /** Loyal: this many calls on the same fighter. */
  loyalCalls: number;
  /** Contrarian: this many calls won against the crowd. */
  contrarianWins: number;
  /** The best-win-rate board: calls needed this season to be on it. */
  winRateMinCalls: number;
  /** The upsets board counts this far back. */
  upsetsWindowMs: number;
  /** Players shown on each board. */
  boardSize: number;
}

export const DEFAULT_BETTORS: Readonly<BettorConfig> = Object.freeze({
  minCallStake: 10n,
  upsetChanceBp: 3000,
  calledItChanceBp: 2000,
  ironReadStreak: 10,
  loyalCalls: 50,
  contrarianWins: 20,
  winRateMinCalls: 50,
  upsetsWindowMs: 7 * 86_400_000,
  boardSize: 10,
});

export function validateBettors(c: BettorConfig): BettorConfig {
  if (c.minCallStake < 1n) throw new Error("the smallest call stake must be at least 1");
  for (const [k, v] of [["upsetChanceBp", c.upsetChanceBp], ["calledItChanceBp", c.calledItChanceBp]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 5000) throw new Error(`${k} must be a chance from 1 to 5000 basis points (an underdog)`);
  }
  for (const [k, v] of [["ironReadStreak", c.ironReadStreak], ["loyalCalls", c.loyalCalls], ["contrarianWins", c.contrarianWins], ["winRateMinCalls", c.winRateMinCalls], ["boardSize", c.boardSize]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`${k} must be a whole number of at least 1`);
  }
  if (!(c.upsetsWindowMs > 0)) throw new Error("the upsets board needs a window");
  return c;
}

/** The bettor titles (player titles earned by playing, once each). */
export const BETTOR_TITLE_CODES = ["CALLED_IT", "IRON_READ", "LOYAL", "CONTRARIAN"] as const;
export type BettorTitleCode = (typeof BETTOR_TITLE_CODES)[number];

/** A side "against the crowd": less of the players' Salt was on it than on the other side when betting closed. */
export function againstCrowd(pool: { own: Salt; other: Salt }): boolean {
  return pool.own < pool.other;
}

/**
 * The crowd reveal (docs/ENGAGEMENT.md §2), once betting has closed: each side's share of the players' Salt, in whole
 * percent (adding up to 100), and the side against the crowd, if either was. Null when no player bet.
 */
export function crowdSplit(pool: { 1: Salt; 2: Salt }): { pct: { 1: number; 2: number }; against: 1 | 2 | null } | null {
  const total = pool[1] + pool[2];
  if (total <= 0n) return null;
  const pct1 = Number((pool[1] * 200n + total) / (total * 2n));
  const against = againstCrowd({ own: pool[1], other: pool[2] }) ? 1 : againstCrowd({ own: pool[2], other: pool[1] }) ? 2 : null;
  return { pct: { 1: pct1, 2: 100 - pct1 }, against };
}

export interface CallFacts {
  won: boolean;
  /** The side's locked win chance, in basis points. */
  chanceBp: number;
  /** Right calls in a row, this one included (0 after a wrong one). */
  streak: number;
  /** Calls on this fighter, this one included. */
  callsOnFighter: number;
  /** Calls won against the crowd, this one included. */
  contrarianWins: number;
}

/** The bettor titles one call earns: the ones whose bar it reaches and the player doesn't hold yet. */
export function bettorTitlesEarned(f: CallFacts, held: ReadonlySet<string>, cfg: BettorConfig): BettorTitleCode[] {
  const earned: BettorTitleCode[] = [];
  const add = (code: BettorTitleCode, yes: boolean) => yes && !held.has(code) && earned.push(code);
  add("CALLED_IT", f.won && f.chanceBp <= cfg.calledItChanceBp);
  add("IRON_READ", f.streak >= cfg.ironReadStreak);
  add("LOYAL", f.callsOnFighter >= cfg.loyalCalls);
  add("CONTRARIAN", f.contrarianWins >= cfg.contrarianWins);
  return earned;
}

/** The longest run of `true` in a row. */
export function longestRun(results: readonly boolean[]): number {
  let best = 0, run = 0;
  for (const r of results) {
    run = r ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** The run of `true` at the end. */
export function currentRun(results: readonly boolean[]): number {
  let n = 0;
  while (n < results.length && results[results.length - 1 - n]) n++;
  return n;
}

/** One settled bet, as the bettor's numbers need it (oldest first in a list). */
export interface SettledBet {
  fightNumber: number;
  currency: "SALT" | "TSALT";
  won: boolean;
  stake: Salt;
  /** What came back: the payout when won, 0 when lost. */
  returned: Salt;
  chanceBp: number;
  multiplierBp: number;
  fighterId: string;
  fighterName: string;
  archetype: Archetype;
  againstCrowd: boolean;
}

export interface BettorStats {
  calls: number;
  rightCalls: number;
  /** Right calls as a percentage (one decimal), or null before the first call. */
  winRate: number | null;
  streak: { current: number; best: number };
  upsetsCalled: number;
  /** The longest shot called right. */
  bestUpset: { fightNumber: number; fighterName: string; chancePct: number; multiplierBp: number } | null;
  /** Salt won minus Salt staked, on every settled Salt bet. */
  saltProfit: Salt;
  biggestPayout: { fightNumber: number; fighterName: string; amount: Salt } | null;
  /** The fighter called most often, with how those calls went. */
  favourite: { fighterId: string; fighterName: string; calls: number; rightCalls: number } | null;
  byStyle: { archetype: Archetype; calls: number; rightCalls: number; saltProfit: Salt }[];
  /** How close each bettor title is (the bar, and the best so far). */
  progress: Record<BettorTitleCode, { have: number; need: number }>;
}

const pct1 = (n: number, of: number) => (of === 0 ? null : Math.round((1000 * n) / of) / 10);

/** A bettor's numbers from their settled bets (oldest first). */
export function bettorStats(bets: readonly SettledBet[], cfg: BettorConfig): BettorStats {
  const calls = bets.filter((b) => b.stake >= cfg.minCallStake);
  const right = calls.filter((b) => b.won);
  const results = calls.map((b) => b.won);
  const upsets = right.filter((b) => b.chanceBp <= cfg.upsetChanceBp);
  const best = [...right].sort((a, b) => a.chanceBp - b.chanceBp || b.fightNumber - a.fightNumber)[0];
  const salt = bets.filter((b) => b.currency === "SALT");
  const profit = (list: readonly SettledBet[]) => list.reduce((n, b) => n + (b.currency === "SALT" ? b.returned - b.stake : 0n), 0n);
  const payout = salt.filter((b) => b.won).sort((a, b) => (a.returned === b.returned ? b.fightNumber - a.fightNumber : a.returned > b.returned ? -1 : 1))[0];
  const perFighter = new Map<string, { fighterId: string; fighterName: string; calls: number; rightCalls: number; last: number }>();
  for (const b of calls) {
    const f = perFighter.get(b.fighterId) ?? { fighterId: b.fighterId, fighterName: b.fighterName, calls: 0, rightCalls: 0, last: 0 };
    f.calls++;
    if (b.won) f.rightCalls++;
    f.last = b.fightNumber;
    perFighter.set(b.fighterId, f);
  }
  const fav = [...perFighter.values()].sort((a, b) => b.calls - a.calls || b.last - a.last)[0];
  const styles = new Map<Archetype, SettledBet[]>();
  for (const b of bets) styles.set(b.archetype, [...(styles.get(b.archetype) ?? []), b]);
  return {
    calls: calls.length,
    rightCalls: right.length,
    winRate: pct1(right.length, calls.length),
    streak: { current: currentRun(results), best: longestRun(results) },
    upsetsCalled: upsets.length,
    bestUpset: best && best.chanceBp <= cfg.upsetChanceBp ? { fightNumber: best.fightNumber, fighterName: best.fighterName, chancePct: Math.round(best.chanceBp / 100), multiplierBp: best.multiplierBp } : null,
    saltProfit: profit(salt),
    biggestPayout: payout ? { fightNumber: payout.fightNumber, fighterName: payout.fighterName, amount: payout.returned } : null,
    favourite: fav ? { fighterId: fav.fighterId, fighterName: fav.fighterName, calls: fav.calls, rightCalls: fav.rightCalls } : null,
    byStyle: [...styles.entries()]
      .map(([archetype, list]) => {
        const c = list.filter((b) => b.stake >= cfg.minCallStake);
        return { archetype, calls: c.length, rightCalls: c.filter((b) => b.won).length, saltProfit: profit(list) };
      })
      .sort((a, b) => b.calls - a.calls || (a.archetype < b.archetype ? -1 : 1)),
    progress: {
      CALLED_IT: { have: right.some((b) => b.chanceBp <= cfg.calledItChanceBp) ? 1 : 0, need: 1 },
      IRON_READ: { have: Math.min(longestRun(results), cfg.ironReadStreak), need: cfg.ironReadStreak },
      LOYAL: { have: Math.min(fav?.calls ?? 0, cfg.loyalCalls), need: cfg.loyalCalls },
      CONTRARIAN: { have: Math.min(right.filter((b) => b.againstCrowd).length, cfg.contrarianWins), need: cfg.contrarianWins },
    },
  };
}

/** Rank a board: best first by `better`; ties share a rank (1, 1, 3) and are listed in a stable order by `key`. */
export function rankBoard<T>(rows: readonly T[], better: (a: T, b: T) => number, key: (r: T) => string): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => better(a, b) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const ranked: (T & { rank: number })[] = [];
  sorted.forEach((r, i) => ranked.push({ ...r, rank: i > 0 && better(sorted[i - 1]!, r) === 0 ? ranked[i - 1]!.rank : i + 1 }));
  return ranked;
}
