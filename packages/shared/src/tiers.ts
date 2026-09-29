/**
 * Tiers are rating bands (DESIGN §7): P < B < A < S. X is manual only and
 * never assigned or removed by rating.
 */
export type BandTier = "P" | "B" | "A" | "S";
export type Tier = BandTier | "X";

export const BAND_TIERS: readonly BandTier[] = ["P", "B", "A", "S"];

export interface TierConfig {
  /** Minimum rating for each tier above P. Must be increasing. */
  thresholds: { B: number; A: number; S: number };
  /**
   * Demotion buffer: a character only drops a tier once its rating is this far
   * below the tier's threshold, so ratings near a boundary don't flip every fight.
   */
  hysteresis: number;
}

/** Open question (DESIGN §7 gives no numbers): defaults around the 1500 start. */
export const DEFAULT_TIERS: Readonly<TierConfig> = Object.freeze({
  thresholds: Object.freeze({ B: 1450, A: 1600, S: 1750 }),
  hysteresis: 25,
});

const rank = (t: BandTier) => BAND_TIERS.indexOf(t);

export function validateTiers(cfg: TierConfig): TierConfig {
  const { B, A, S } = cfg.thresholds;
  if (!(B < A && A < S)) throw new Error(`tier thresholds must increase: B ${B} < A ${A} < S ${S}`);
  if (cfg.hysteresis < 0) throw new Error("tier hysteresis must be >= 0");
  return cfg;
}

/** Plain banding, no hysteresis: used for new characters. */
export function tierForRating(rating: number, cfg: TierConfig = DEFAULT_TIERS): BandTier {
  const { B, A, S } = cfg.thresholds;
  if (rating >= S) return "S";
  if (rating >= A) return "A";
  if (rating >= B) return "B";
  return "P";
}

/** Tier after a rating change. Promotion is immediate; demotion waits for the buffer. */
export function nextTier(current: Tier, rating: number, cfg: TierConfig = DEFAULT_TIERS): Tier {
  if (current === "X") return "X";
  const promoted = tierForRating(rating, cfg);
  if (rank(promoted) > rank(current)) return promoted;
  const demoted = tierForRating(rating + cfg.hysteresis, cfg);
  if (rank(demoted) < rank(current)) return demoted;
  return current;
}

export function isTier(value: unknown): value is Tier {
  return value === "X" || BAND_TIERS.includes(value as BandTier);
}
