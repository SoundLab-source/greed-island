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
  /** Player-owned: preferred over house characters, which fill the gaps (DESIGN §5). */
  owned?: boolean;
}

export interface MatchmakingConfig {
  /** Close-fight band for side 1's model chance, in bp (default 40–60%). */
  targetMinBp: bigint;
  targetMaxBp: bigint;
  /** Share of fights booked as deliberate upset bouts, 0–1. */
  upsetRate: number;
  /**
   * Prefer pairs that haven't met within this many fights. The immediately
   * previous pairing is never repeated (when this is >= 1); older ones inside
   * the window are only used if a tier has no fresher pair, which keeps small
   * rosters in same-tier, close fights instead of lopsided cross-tier ones.
   */
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

/** Extra pick weight per owned character in a pair (a pair of two house characters weighs 1). */
export const OWNED_WEIGHT = 2;

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
  const immediate = cfg.rematchCooldown >= 1 && recent[0] ? pairKey(recent[0][0], recent[0][1]) : null;
  const cooling = new Set(recent.slice(0, cfg.rematchCooldown).map(([a, b]) => pairKey(a, b)));
  const makePair = (a: Candidate, b: Candidate): Pair => ({ a, b, chanceA: clampChance(modelChanceBp(a.rating, b.rating), DEFAULT_ODDS)[0] });

  const fresh = { same: [] as Pair[], cross: [] as Pair[] };
  const cooled = { same: [] as Pair[], cross: [] as Pair[] };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (a.characterId === b.characterId || a.fighterId === b.fighterId) continue; // no mirror matches
      const key = pairKey(a.characterId, b.characterId);
      if (key === immediate) continue; // never an immediate rematch
      const bucket = cooling.has(key) ? cooled : fresh;
      (a.tier === b.tier ? bucket.same : bucket.cross).push(makePair(a, b));
    }
  }
  const sameTier = fresh.same.length > 0 ? fresh.same : cooled.same;
  const crossTier = fresh.cross.length > 0 ? fresh.cross : cooled.cross;

  const distance = (p: Pair) => (p.chanceA > 5_000n ? p.chanceA - 5_000n : 5_000n - p.chanceA);
  const inBand = (p: Pair) => p.chanceA >= cfg.targetMinBp && p.chanceA <= cfg.targetMaxBp;
  // Weighted pick: each owned character in a pair makes it more likely, so
  // owned characters fight often without appearing in every single fight.
  const weight = (p: Pair) => 1 + OWNED_WEIGHT * (Number(Boolean(p.a.owned)) + Number(Boolean(p.b.owned)));
  const choose = (pairs: Pair[]) => {
    const total = pairs.reduce((n, p) => n + weight(p), 0);
    let r = rng.int(total);
    for (const p of pairs) {
      r -= weight(p);
      if (r < 0) return p;
    }
    return pairs[pairs.length - 1]!;
  };

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
