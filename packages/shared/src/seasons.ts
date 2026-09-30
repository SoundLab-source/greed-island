/**
 * Seasons (DESIGN §8-9, docs/PHASE3.md step 2). Pure rules. A season lasts 8
 * weeks; at its end the highest-rated character (with enough fights that
 * season) earns Season Champion and the player who won the most Salt (with
 * enough bets) earns Season Top Bettor. The player leaderboard counts Salt won
 * this season, so it starts over each season; balances, characters, ratings,
 * records and titles never reset. Defaults answer DESIGN §15.
 */
import type { Salt } from "./money.ts";

export interface SeasonConfig {
  /** How long a season lasts. */
  lengthMs: number;
  /** Settled fights a character needs in the season to be champion. */
  minFights: number;
  /** Settled bets a player needs in the season to be top bettor. */
  minBets: number;
  /** Players and characters kept in each season's final standings. */
  standingsSize: number;
}

export const DEFAULT_SEASONS: Readonly<SeasonConfig> = Object.freeze({
  lengthMs: 8 * 7 * 86_400_000,
  minFights: 10,
  minBets: 10,
  standingsSize: 20,
});

/**
 * When the next season runs. It starts where the last one ended, so seasons
 * follow each other with no gap; if the server was off for longer than a
 * whole season, the next one starts now instead of a string of empty seasons.
 */
export function nextSeasonWindow(previousEndsAt: Date | null, now: Date, cfg: SeasonConfig): { startsAt: Date; endsAt: Date } {
  let start = previousEndsAt ?? now;
  if (start.getTime() + cfg.lengthMs <= now.getTime()) start = now;
  return { startsAt: start, endsAt: new Date(start.getTime() + cfg.lengthMs) };
}

export interface PlayerSeasonStat {
  userId: string;
  /** Winnings minus stakes on settled Salt bets this season (can be negative). T-Salt doesn't count. */
  saltWon: Salt;
  /** Settled (won or lost) Salt bets this season. */
  bets: number;
}

export interface CharacterSeasonStat {
  characterId: string;
  /** Rating now (at season end: the final rating). */
  rating: number;
  /** Settled fights this season. */
  wins: number;
  losses: number;
}

/** Most Salt won first; then more bets; then by id, so the order is stable. */
export function rankPlayers<T extends PlayerSeasonStat>(stats: readonly T[]): (T & { rank: number })[] {
  return [...stats]
    .sort((a, b) => (a.saltWon === b.saltWon ? b.bets - a.bets || (a.userId < b.userId ? -1 : 1) : a.saltWon > b.saltWon ? -1 : 1))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Highest rating first; then more wins this season; then by id. */
export function rankCharacters<T extends CharacterSeasonStat>(stats: readonly T[]): (T & { rank: number })[] {
  return [...stats]
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || (a.characterId < b.characterId ? -1 : 1))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** The best-ranked player with enough bets who came out ahead, if any. */
export function topBettor<T extends PlayerSeasonStat>(ranked: readonly T[], cfg: SeasonConfig): T | null {
  return ranked.find((p) => p.bets >= cfg.minBets && p.saltWon > 0n) ?? null;
}

/** The best-ranked character with enough fights this season, if any. */
export function seasonChampion<T extends CharacterSeasonStat>(ranked: readonly T[], cfg: SeasonConfig): T | null {
  return ranked.find((c) => c.wins + c.losses >= cfg.minFights) ?? null;
}
