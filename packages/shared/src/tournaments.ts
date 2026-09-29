/**
 * Tournaments (DESIGN §5, docs/PHASE2.md step 6). Pure rules: which tier a
 * cycle's tournament uses, who gets a seat, how the bracket is seeded and
 * advances, and who tops the T-Salt podium. Defaults answer DESIGN §15.
 */
import type { Salt } from "./money.ts";
import type { BandTier, Tier, TierConfig } from "./tiers.ts";

export interface TournamentConfig {
  /** T-Salt every player gets for each tournament. It never moves to the main balance. */
  startingBalance: Salt;
  /** How many top T-Salt balances earn a title. */
  podium: number;
}

export const DEFAULT_TOURNAMENTS: Readonly<TournamentConfig> = Object.freeze({
  startingBalance: 1_000n,
  podium: 3,
});

/** The tier rotates each cycle, strongest first. */
export const TOURNAMENT_TIERS: readonly BandTier[] = ["S", "A", "B", "P"];

export function tournamentTier(cycle: number): BandTier {
  return TOURNAMENT_TIERS[(((cycle - 1) % TOURNAMENT_TIERS.length) + TOURNAMENT_TIERS.length) % TOURNAMENT_TIERS.length]!;
}

export interface SeatCandidate {
  characterId: string;
  tier: Tier;
  rating: number;
  owned: boolean;
}

/** How far a rating is outside a tier's band (0 inside it). */
export function distanceToBand(rating: number, tier: BandTier, cfg: TierConfig): number {
  const { B, A, S } = cfg.thresholds;
  const [lo, hi] = { P: [-Infinity, B], B: [B, A], A: [A, S], S: [S, Infinity] }[tier];
  return rating < lo! ? lo! - rating : rating >= hi! ? rating - hi! : 0;
}

/** Largest power of two <= n (0 for n < 1). */
export function bracketSize(n: number): number {
  if (n < 1) return 0;
  let size = 1;
  while (size * 2 <= n) size *= 2;
  return size;
}

/**
 * Seats for a tournament, best seed first. Players' characters in the tier
 * come first, then house characters in the tier, then house characters from
 * other tiers closest to the band fill any empty seats. X-tier characters
 * never play. The bracket is the largest power of two that fills, up to
 * `maxSize`; fewer than 2 seats means no tournament.
 */
export function pickSeats(candidates: readonly SeatCandidate[], tier: BandTier, maxSize: number, cfg: TierConfig): SeatCandidate[] {
  const byRating = (a: SeatCandidate, b: SeatCandidate) => b.rating - a.rating || (a.characterId < b.characterId ? -1 : 1);
  const eligible = candidates.filter((c) => c.tier !== "X");
  const inTier = eligible.filter((c) => c.tier === tier);
  const fillers = eligible
    .filter((c) => c.tier !== tier && !c.owned)
    .sort((a, b) => distanceToBand(a.rating, tier, cfg) - distanceToBand(b.rating, tier, cfg) || byRating(a, b));
  const ordered = [...inTier.filter((c) => c.owned).sort(byRating), ...inTier.filter((c) => !c.owned).sort(byRating), ...fillers];
  const size = Math.min(bracketSize(maxSize), bracketSize(ordered.length));
  return size < 2 ? [] : ordered.slice(0, size).sort(byRating);
}

/** Standard bracket order of seeds (1 v 16, 8 v 9, ...), so top seeds meet as late as possible. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** First-round pairs of seeds, one per slot. */
export function firstRound(size: number): [number, number][] {
  const order = seedOrder(size);
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
  return pairs;
}

export function roundsFor(size: number): number {
  return Math.round(Math.log2(size));
}

/** Where a match's winner goes next: null after the final. */
export function nextSlot(round: number, slot: number, size: number): { round: number; slot: number; side: 1 | 2 } | null {
  if (round >= roundsFor(size)) return null;
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 1 : 2 };
}

export function roundName(round: number, size: number): string {
  const left = roundsFor(size) - round;
  if (left === 0) return "final";
  if (left === 1) return "semi-final";
  if (left === 2) return "quarter-final";
  return `round of ${2 ** (left + 1)}`;
}

export interface PodiumEntry {
  userId: string;
  balance: Salt;
  /** When they joined the tournament (first T-Salt grant); earlier wins a tie. */
  joinedAt: Date;
}

/** The top T-Salt balances that finished above the starting balance, best first. */
export function bettorPodium(entries: readonly PodiumEntry[], cfg: TournamentConfig): PodiumEntry[] {
  return entries
    .filter((e) => e.balance > cfg.startingBalance)
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : a.joinedAt.getTime() - b.joinedAt.getTime()))
    .slice(0, cfg.podium);
}
