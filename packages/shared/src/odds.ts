/**
 * Fixed odds (DESIGN §6). Chances and multipliers are integers in basis
 * points (1/10_000) so that locked odds, and every payout computed from them,
 * are exact. Only the Glicko-2 expected score itself is a float.
 */
import { expectedScore, type Rating } from "./glicko2.ts";
import { BP_SCALE, minSalt, type Salt } from "./money.ts";
import type { Side } from "./ledger-plan.ts";

export interface OddsConfig {
  /** House margin, e.g. 500 = 5%. */
  marginBp: bigint;
  /** Win chances are clamped to [minChanceBp, 10_000 − minChanceBp]; 500 = 5–95%. */
  minChanceBp: bigint;
  /** Floor for payout multipliers: a winning bet never returns less than its stake. */
  minMultiplierBp: bigint;
  /** Crowd chance counts at most this much Salt per account, so whales can't swing it. */
  crowdCapPerAccount: Salt;
  /** Blend constant K in w = pool / (pool + K). */
  crowdBlendK: Salt;
  /** Maximum crowd weight, in bp. 0 disables blending (phase 1). */
  crowdMaxWeightBp: bigint;
  /** Owners betting on their own character: max stake per fight. */
  ownerBetCap: Salt;
}

export const DEFAULT_ODDS: Readonly<OddsConfig> = Object.freeze({
  marginBp: 500n,
  minChanceBp: 500n,
  minMultiplierBp: 10_000n,
  crowdCapPerAccount: 1_000n,
  crowdBlendK: 10_000n,
  crowdMaxWeightBp: 0n,
  ownerBetCap: 100n,
});

export class OddsError extends Error {
  override name = "OddsError";
}

export function validateOdds(cfg: OddsConfig): OddsConfig {
  if (cfg.marginBp < 0n || cfg.marginBp >= BP_SCALE) throw new OddsError("marginBp must be in [0, 10000)");
  if (cfg.minChanceBp < 1n || cfg.minChanceBp >= 5_000n) throw new OddsError("minChanceBp must be in [1, 5000)");
  if (cfg.minMultiplierBp < BP_SCALE) throw new OddsError("minMultiplierBp must be >= 10000 (1.00x)");
  if (cfg.crowdCapPerAccount < 1n) throw new OddsError("crowdCapPerAccount must be >= 1");
  if (cfg.crowdBlendK < 1n) throw new OddsError("crowdBlendK must be >= 1");
  if (cfg.crowdMaxWeightBp < 0n || cfg.crowdMaxWeightBp > BP_SCALE) throw new OddsError("crowdMaxWeightBp must be in [0, 10000]");
  if (cfg.ownerBetCap < 0n) throw new OddsError("ownerBetCap must be >= 0");
  return cfg;
}

/** Clamp side 1's chance and derive side 2's so they always sum to 100%. */
export function clampChance(side1Bp: bigint, cfg: Pick<OddsConfig, "minChanceBp">): [bigint, bigint] {
  const lo = cfg.minChanceBp;
  const hi = BP_SCALE - cfg.minChanceBp;
  const p1 = side1Bp < lo ? lo : side1Bp > hi ? hi : side1Bp;
  return [p1, BP_SCALE - p1];
}

/** Model chance that side 1 wins, from Glicko-2 expected score, in bp (unclamped). */
export function modelChanceBp(side1: Rating, side2: Rating): bigint {
  const e = expectedScore(side1, side2);
  if (!Number.isFinite(e)) throw new OddsError(`expected score is not finite: ${e}`);
  return BigInt(Math.round(e * 10_000));
}

/**
 * Multiplier = (1 / p) × (1 − margin), computed exactly in integers:
 * 10_000 × (10_000 − marginBp) / pBp, rounded down, floored at minMultiplierBp.
 */
export function multiplierBp(chanceBp: bigint, cfg: Pick<OddsConfig, "marginBp" | "minMultiplierBp">): bigint {
  if (chanceBp <= 0n || chanceBp > BP_SCALE) throw new OddsError(`chance must be in (0, 10000] bp, got ${chanceBp}`);
  const m = (BP_SCALE * (BP_SCALE - cfg.marginBp)) / chanceBp;
  return m < cfg.minMultiplierBp ? cfg.minMultiplierBp : m;
}

/** One account's stake, for crowd statistics. */
export interface Stake {
  side: Side;
  amount: Salt;
}

export interface CrowdStats {
  /** Raw Salt per side. */
  pool: Record<Side, Salt>;
  /** Salt per side with each account capped. */
  cappedPool: Record<Side, Salt>;
  /** Share of capped Salt on side 1, in bp; null when nobody has bet. */
  chanceSide1Bp: bigint | null;
}

export function crowdStats(stakes: readonly Stake[], cfg: Pick<OddsConfig, "crowdCapPerAccount">): CrowdStats {
  const pool: Record<Side, Salt> = { 1: 0n, 2: 0n };
  const cappedPool: Record<Side, Salt> = { 1: 0n, 2: 0n };
  for (const s of stakes) {
    pool[s.side] += s.amount;
    cappedPool[s.side] += minSalt(s.amount, cfg.crowdCapPerAccount);
  }
  const total = cappedPool[1] + cappedPool[2];
  return { pool, cappedPool, chanceSide1Bp: total === 0n ? null : (cappedPool[1] * BP_SCALE) / total };
}

/** Crowd weight w = maxWeight × pool / (pool + K), in bp, from the capped pool. */
export function crowdWeightBp(cappedTotal: Salt, cfg: Pick<OddsConfig, "crowdBlendK" | "crowdMaxWeightBp">): bigint {
  if (cappedTotal <= 0n) return 0n;
  return (cfg.crowdMaxWeightBp * cappedTotal) / (cappedTotal + cfg.crowdBlendK);
}

export interface LockedOdds {
  modelChanceBp: [bigint, bigint];
  crowdChanceBp: [bigint, bigint] | null;
  blendWeightBp: bigint;
  /** Final chances used for payouts (after blending and clamping). */
  chanceBp: [bigint, bigint];
  multiplierBp: Record<Side, bigint>;
  pool: Record<Side, Salt>;
  cappedPool: Record<Side, Salt>;
}

/**
 * Odds at lock: model chance, optionally blended with the crowd, clamped,
 * then turned into per-side multipliers. Everything a fight needs to record.
 */
export function lockOdds(side1: Rating, side2: Rating, stakes: readonly Stake[], cfg: OddsConfig): LockedOdds {
  const model = clampChance(modelChanceBp(side1, side2), cfg);
  const crowd = crowdStats(stakes, cfg);
  const crowdChance: [bigint, bigint] | null = crowd.chanceSide1Bp === null ? null : [crowd.chanceSide1Bp, BP_SCALE - crowd.chanceSide1Bp];
  const w = crowdChance ? crowdWeightBp(crowd.cappedPool[1] + crowd.cappedPool[2], cfg) : 0n;
  const blended1 = crowdChance ? (w * crowdChance[0] + (BP_SCALE - w) * model[0]) / BP_SCALE : model[0];
  const chance = clampChance(blended1, cfg);
  return {
    modelChanceBp: model,
    crowdChanceBp: crowdChance,
    blendWeightBp: w,
    chanceBp: chance,
    multiplierBp: { 1: multiplierBp(chance[0], cfg), 2: multiplierBp(chance[1], cfg) },
    pool: crowd.pool,
    cappedPool: crowd.cappedPool,
  };
}

export interface LiveOdds {
  chanceBp: [bigint, bigint];
  multiplierBp: Record<Side, bigint>;
}

/**
 * Estimated odds while betting is open: model only. The crowd split is not
 * shown before lock, to avoid herding (DESIGN §6).
 */
export function liveOdds(side1: Rating, side2: Rating, cfg: OddsConfig): LiveOdds {
  const chance = clampChance(modelChanceBp(side1, side2), cfg);
  return { chanceBp: chance, multiplierBp: { 1: multiplierBp(chance[0], cfg), 2: multiplierBp(chance[1], cfg) } };
}

/** Format bp as a multiplier for display, e.g. 19_000n → "1.90x". */
export function formatMultiplier(bp: bigint): string {
  const whole = bp / BP_SCALE;
  const hundredths = (bp % BP_SCALE) / 100n;
  return `${whole}.${hundredths.toString().padStart(2, "0")}x`;
}
