import { DEFAULT_RATINGS, type RatingsConfig } from "./glicko2.ts";
import { parseSalt, type Salt } from "./money.ts";
import { DEFAULT_ODDS, validateOdds, type OddsConfig } from "./odds.ts";
import { DEFAULT_TIERS, validateTiers, type TierConfig } from "./tiers.ts";

/**
 * Economy settings. Values marked "open question" come from DESIGN.md §15 or
 * are unspecified there; they are defaults, not decisions.
 */
export interface EconomyConfig {
  /** DESIGN §6: new accounts start with 400 Salt. */
  startingBalance: Salt;
  /** Open question: daily grant size. */
  dailyGrant: Salt;
  /** Open question: bailout tops a broke user up to this balance. */
  bailoutFloor: Salt;
  /** DESIGN §6: minimum bet 1 Salt. */
  minBet: Salt;
  /** Open question: max payout per bet. Stakes above this are rejected. */
  maxPayout: Salt;
}

export interface Config {
  economy: EconomyConfig;
  ratings: RatingsConfig;
  tiers: TierConfig;
  odds: OddsConfig;
}

export const DEFAULT_ECONOMY: Readonly<EconomyConfig> = Object.freeze({
  startingBalance: 400n,
  dailyGrant: 100n,
  bailoutFloor: 100n,
  minBet: 1n,
  maxPayout: 50_000n,
});

export class ConfigError extends Error {
  override name = "ConfigError";
}

function saltFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: Salt): Salt {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  try {
    return parseSalt(raw);
  } catch (err) {
    throw new ConfigError(`${name}: ${(err as Error).message}`);
  }
}

function numberFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new ConfigError(`${name}: expected a number, got "${raw}"`);
  return n;
}

export function validateEconomy(e: EconomyConfig): EconomyConfig {
  if (e.startingBalance < 0n) throw new ConfigError("startingBalance must be >= 0");
  if (e.dailyGrant < 0n) throw new ConfigError("dailyGrant must be >= 0");
  if (e.bailoutFloor < 0n) throw new ConfigError("bailoutFloor must be >= 0");
  if (e.minBet < 1n) throw new ConfigError("minBet must be >= 1");
  if (e.maxPayout < e.minBet) throw new ConfigError("maxPayout must be >= minBet");
  return e;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const d = DEFAULT_ECONOMY;
  return {
    economy: validateEconomy({
      startingBalance: saltFromEnv(env, "GI_STARTING_BALANCE", d.startingBalance),
      dailyGrant: saltFromEnv(env, "GI_DAILY_GRANT", d.dailyGrant),
      bailoutFloor: saltFromEnv(env, "GI_BAILOUT_FLOOR", d.bailoutFloor),
      minBet: saltFromEnv(env, "GI_MIN_BET", d.minBet),
      maxPayout: saltFromEnv(env, "GI_MAX_PAYOUT", d.maxPayout),
    }),
    ratings: {
      ...DEFAULT_RATINGS,
      tau: numberFromEnv(env, "GI_GLICKO_TAU", DEFAULT_RATINGS.tau),
    },
    tiers: validateTiers({
      thresholds: {
        B: numberFromEnv(env, "GI_TIER_B", DEFAULT_TIERS.thresholds.B),
        A: numberFromEnv(env, "GI_TIER_A", DEFAULT_TIERS.thresholds.A),
        S: numberFromEnv(env, "GI_TIER_S", DEFAULT_TIERS.thresholds.S),
      },
      hysteresis: numberFromEnv(env, "GI_TIER_HYSTERESIS", DEFAULT_TIERS.hysteresis),
    }),
    odds: validateOdds({
      marginBp: saltFromEnv(env, "GI_MARGIN_BP", DEFAULT_ODDS.marginBp),
      minChanceBp: saltFromEnv(env, "GI_MIN_CHANCE_BP", DEFAULT_ODDS.minChanceBp),
      minMultiplierBp: saltFromEnv(env, "GI_MIN_MULTIPLIER_BP", DEFAULT_ODDS.minMultiplierBp),
      crowdCapPerAccount: saltFromEnv(env, "GI_CROWD_CAP_PER_ACCOUNT", DEFAULT_ODDS.crowdCapPerAccount),
      crowdBlendK: saltFromEnv(env, "GI_CROWD_BLEND_K", DEFAULT_ODDS.crowdBlendK),
      crowdMaxWeightBp: saltFromEnv(env, "GI_CROWD_MAX_WEIGHT_BP", DEFAULT_ODDS.crowdMaxWeightBp),
      ownerBetCap: saltFromEnv(env, "GI_OWNER_BET_CAP", DEFAULT_ODDS.ownerBetCap),
    }),
  };
}
