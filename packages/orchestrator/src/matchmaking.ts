/**
 * Matchmaking (DESIGN §5): two enabled characters from the same tier, paired
 * so most fights are close, with occasional deliberate upset bouts. No mirror
 * matches (same fighter design) and no immediate rematches.
 */
import { clampChance, DEFAULT_ODDS, modelChanceBp, type Rating, type Side, type Tier } from "@greed-island/shared";
import { randomInt } from "node:crypto";

export interface Candidate {
  characterId: string;
  fighterId: string;
  tier: Tier;
  rating: Rating;
}

export interface MatchmakingConfig {
  /** Close-fight band for side 1's model chance, in bp (default 40–60%). */
  targetMinBp: bigint;
  targetMaxBp: bigint;
  /** Share of fights booked as deliberate upset bouts, 0–1. */
  upsetRate: number;
  /** A pair can't meet again within this many fights. */
  rematchCooldown: number;
  /**
   * When no tier has a valid pair (e.g. a tiny house roster spread across
   * tiers), allow the closest-rated pair across tiers rather than stalling.
   */
  crossTierFallback: boolean;
}

export const DEFAULT_MATCHMAKING: Readonly<MatchmakingConfig> = Object.freeze({
  targetMinBp: 4_000n,
  targetMaxBp: 6_000n,
  upsetRate: 0.1,
  rematchCooldown: 3,
  crossTierFallback: true,
});

/** Random source: `int(n)` returns 0..n-1, `chance()` returns [0, 1). */
export interface Rng {
  int(n: number): number;
  chance(): number;
}

/** Production randomness from node:crypto. */
export const cryptoRng: Rng = {
  int: (n) => randomInt(n),
  chance: () => randomInt(1_000_000) / 1_000_000,
};

export type PairKind = "CLOSE" | "UPSET" | "NEAREST" | "CROSS_TIER";

export interface Pairing {
  sides: Record<Side, Candidate>;
  /** Side 1's model chance (clamped), in bp. */
  chanceSide1Bp: bigint;
  kind: PairKind;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Pair {
  a: Candidate;
  b: Candidate;
  chanceA: bigint;
}

/**
 * Choose the next fight. `recent` lists the most recent fights first, as
 * character-id pairs. Returns null if no valid pair exists.
 */
export function pickMatch(
  candidates: readonly Candidate[],
  recent: readonly [string, string][],
  rng: Rng,
  cfg: MatchmakingConfig = DEFAULT_MATCHMAKING,
): Pairing | null {
  const blocked = new Set(recent.slice(0, cfg.rematchCooldown).map(([a, b]) => pairKey(a, b)));
  const valid = (a: Candidate, b: Candidate) => a.characterId !== b.characterId && a.fighterId !== b.fighterId && !blocked.has(pairKey(a.characterId, b.characterId));
  const makePair = (a: Candidate, b: Candidate): Pair => ({ a, b, chanceA: clampChance(modelChanceBp(a.rating, b.rating), DEFAULT_ODDS)[0] });

  const sameTier: Pair[] = [];
  const crossTier: Pair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (!valid(a, b)) continue;
      (a.tier === b.tier ? sameTier : crossTier).push(makePair(a, b));
    }
  }

  const distance = (p: Pair) => (p.chanceA > 5_000n ? p.chanceA - 5_000n : 5_000n - p.chanceA);
  const inBand = (p: Pair) => p.chanceA >= cfg.targetMinBp && p.chanceA <= cfg.targetMaxBp;
  const choose = (pairs: Pair[]) => pairs[rng.int(pairs.length)]!;

  let chosen: Pair;
  let kind: PairKind;
  if (sameTier.length > 0) {
    const close = sameTier.filter(inBand);
    const lopsided = sameTier.filter((p) => !inBand(p));
    if (lopsided.length > 0 && rng.chance() < cfg.upsetRate) {
      // Upset bout: the most lopsided pairings available in a tier.
      const widest = lopsided.reduce((m, p) => (distance(p) > m ? distance(p) : m), 0n);
      chosen = choose(lopsided.filter((p) => distance(p) === widest));
      kind = "UPSET";
    } else if (close.length > 0) {
      chosen = choose(close);
      kind = "CLOSE";
    } else {
      const nearest = sameTier.reduce((m, p) => (distance(p) < m ? distance(p) : m), 10_000n);
      chosen = choose(sameTier.filter((p) => distance(p) === nearest));
      kind = "NEAREST";
    }
  } else if (cfg.crossTierFallback && crossTier.length > 0) {
    const nearest = crossTier.reduce((m, p) => (distance(p) < m ? distance(p) : m), 10_000n);
    chosen = choose(crossTier.filter((p) => distance(p) === nearest));
    kind = "CROSS_TIER";
  } else {
    return null;
  }

  // Random corner assignment, so the favourite isn't always red.
  const flip = rng.int(2) === 1;
  const [s1, s2] = flip ? [chosen.b, chosen.a] : [chosen.a, chosen.b];
  const chanceSide1Bp = flip ? 10_000n - chosen.chanceA : chosen.chanceA;
  return { sides: { 1: s1, 2: s2 }, chanceSide1Bp, kind };
}

/** Uniformly random stage. */
export function pickStage<T>(stages: readonly T[], rng: Rng): T | null {
  return stages.length === 0 ? null : stages[rng.int(stages.length)]!;
}
