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
  /**
   * Placement fights: a character's tier holds until it has finished this many fights. A new character's rating moves
   * hundreds of points on its first result (its deviation starts high), so without this one lucky win took a new
   * fighter from B to A, with an "A-Tier" title, and one loss dropped it to P. 0 turns placement off.
   */
  placementFights: number;
}

/** Open question (DESIGN §7 gives no numbers): defaults around the 1500 start. */
export const DEFAULT_TIERS: Readonly<TierConfig> = Object.freeze({
  thresholds: Object.freeze({ B: 1450, A: 1600, S: 1750 }),
  hysteresis: 25,
  placementFights: 5,
});

const rank = (t: BandTier) => BAND_TIERS.indexOf(t);

export function validateTiers(cfg: TierConfig): TierConfig {
  const { B, A, S } = cfg.thresholds;
  if (!(B < A && A < S)) throw new Error(`tier thresholds must increase: B ${B} < A ${A} < S ${S}`);
  if (cfg.hysteresis < 0) throw new Error("tier hysteresis must be >= 0");
  if (!Number.isInteger(cfg.placementFights) || cfg.placementFights < 0) throw new Error("tier placement fights must be a whole number >= 0");
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

/** Still in its placement fights, given the fights it has finished (this one included). */
export function inPlacement(fightsPlayed: number, cfg: Pick<TierConfig, "placementFights"> = DEFAULT_TIERS): boolean {
  return fightsPlayed < cfg.placementFights;
}

/**
 * Tier after a rating change. Promotion is immediate; demotion waits for the buffer. With `fightsPlayed` (its finished
 * fights, this one included), the tier holds during placement and is decided by its rating when placement ends.
 */
export function nextTier(current: Tier, rating: number, cfg: TierConfig = DEFAULT_TIERS, fightsPlayed?: number): Tier {
  if (current === "X") return "X";
  if (fightsPlayed !== undefined && inPlacement(fightsPlayed, cfg)) return current;
  const promoted = tierForRating(rating, cfg);
  if (rank(promoted) > rank(current)) return promoted;
  const demoted = tierForRating(rating + cfg.hysteresis, cfg);
  if (rank(demoted) < rank(current)) return demoted;
  return current;
}

export function isTier(value: unknown): value is Tier {
  return value === "X" || BAND_TIERS.includes(value as BandTier);
}
