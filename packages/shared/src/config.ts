import { DEFAULT_EXHIBITIONS, type ExhibitionConfig } from "./exhibitions.ts";
import { DEFAULT_RATINGS, type RatingsConfig } from "./glicko2.ts";
import { parseSalt, type Salt } from "./money.ts";
import { DEFAULT_ODDS, validateOdds, type OddsConfig } from "./odds.ts";
import { DEFAULT_SEASONS, type SeasonConfig } from "./seasons.ts";
import { DEFAULT_SHOP, type ShopConfig } from "./shop.ts";
import { DEFAULT_STAFF, type StaffConfig } from "./staff.ts";
import { DEFAULT_SUBMISSIONS, type SubmissionConfig } from "./submissions.ts";
import { DEFAULT_VOTING, type VotingConfig } from "./voting.ts";
import { DEFAULT_UPGRADES, type UpgradeConfig } from "./upgrades.ts";
import { DEFAULT_TIERS, validateTiers, type TierConfig } from "./tiers.ts";
import { DEFAULT_TOURNAMENTS, type TournamentConfig } from "./tournaments.ts";

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
  /** Open question (DESIGN §15): paid to the owner for each win on stream (not tournaments). 0 turns it off. */
  ownerReward: Salt;
}

export interface Config {
  economy: EconomyConfig;
  ratings: RatingsConfig;
  tiers: TierConfig;
  odds: OddsConfig;
  shop: ShopConfig;
  upgrades: UpgradeConfig;
  exhibitions: ExhibitionConfig;
  tournaments: TournamentConfig;
  staff: StaffConfig;
  seasons: SeasonConfig;
  submissions: SubmissionConfig;
  voting: VotingConfig;
}

export const DEFAULT_ECONOMY: Readonly<EconomyConfig> = Object.freeze({
  startingBalance: 400n,
  dailyGrant: 100n,
  bailoutFloor: 100n,
  minBet: 1n,
  maxPayout: 50_000n,
  ownerReward: 25n,
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

export function validateShop(s: ShopConfig): ShopConfig {
  if (!(s.rotationMs > 0)) throw new ConfigError("shop rotation must be positive");
  for (const [name, v] of [["slots", s.slots], ["firstEditionSupply", s.firstEditionSupply], ["maxOwnedPerUser", s.maxOwnedPerUser]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ConfigError(`${name} must be a whole number >= 0`);
  }
  if (s.basePrice < 1n) throw new ConfigError("shop base price must be >= 1");
  if (!(s.startRating > 0)) throw new ConfigError("owned start rating must be positive");
  return s;
}

export function validateUpgrades(u: UpgradeConfig): UpgradeConfig {
  if (u.costGrowthBp < 10_000n) throw new ConfigError("upgrade cost growth must be >= 10000 bp (costs can't shrink)");
  if (u.sidegradeCost < 0n) throw new ConfigError("sidegrade cost must be >= 0");
  if (!(u.deviationWiden >= 0)) throw new ConfigError("upgrade deviation widening must be >= 0");
  return u;
}

export function validateEconomy(e: EconomyConfig): EconomyConfig {
  if (e.startingBalance < 0n) throw new ConfigError("startingBalance must be >= 0");
  if (e.dailyGrant < 0n) throw new ConfigError("dailyGrant must be >= 0");
  if (e.bailoutFloor < 0n) throw new ConfigError("bailoutFloor must be >= 0");
  if (e.minBet < 1n) throw new ConfigError("minBet must be >= 1");
  if (e.maxPayout < e.minBet) throw new ConfigError("maxPayout must be >= minBet");
  if (e.ownerReward < 0n) throw new ConfigError("ownerReward must be >= 0");
  return e;
}

export function validateTournaments(t: TournamentConfig): TournamentConfig {
  if (t.startingBalance < 1n) throw new ConfigError("tournament balance must be >= 1");
  if (!Number.isInteger(t.podium) || t.podium < 0 || t.podium > 3) throw new ConfigError("tournament podium must be 0-3");
  return t;
}

export function validateExhibitions(x: ExhibitionConfig): ExhibitionConfig {
  if (!(x.challengeTtlMs > 0)) throw new ConfigError("challenge expiry must be positive");
  for (const [name, v] of [["maxOpenPerUser", x.maxOpenPerUser], ["showcasePool", x.showcasePool]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ConfigError(`${name} must be a whole number >= 0`);
  }
  return x;
}

export function validateStaff(s: StaffConfig): StaffConfig {
  if (!(s.renameCooldownMs >= 0)) throw new ConfigError("rename cooldown must be >= 0");
  return s;
}

function booleanFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  throw new ConfigError(`${name}: expected true or false, got "${env[name]}"`);
}

export function validateSubmissions(s: SubmissionConfig): SubmissionConfig {
  if (!(s.maxFileBytes >= 1024)) throw new ConfigError("the largest submission image must be at least 1 KB");
  for (const [name, v] of [["maxFiles", s.maxFiles], ["maxImageSide", s.maxImageSide]] as const) {
    if (!Number.isInteger(v) || v < 1) throw new ConfigError(`${name} must be a whole number >= 1`);
  }
  return s;
}

/** A voting window longer than the season just means voting runs the whole season (votingOpensAt). */
export function validateVoting(v: VotingConfig): VotingConfig {
  if (!(v.windowMs > 0)) throw new ConfigError("voting must last more than 0 days");
  if (!(v.minAccountAgeMs >= 0)) throw new ConfigError("the voter account age must be >= 0");
  for (const [name, val, min] of [["votesPerVoter", v.votesPerVoter, 1], ["minBets", v.minBets, 0], ["electedPerSeason", v.electedPerSeason, 1]] as const) {
    if (!Number.isInteger(val) || val < min) throw new ConfigError(`${name} must be a whole number >= ${min}`);
  }
  return v;
}

export function validateSeasons(s: SeasonConfig): SeasonConfig {
  if (!(s.lengthMs >= 3_600_000)) throw new ConfigError("a season must last at least an hour");
  for (const [name, v] of [["minFights", s.minFights], ["minBets", s.minBets], ["standingsSize", s.standingsSize]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ConfigError(`${name} must be a whole number >= 0`);
  }
  return s;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const d = DEFAULT_ECONOMY;
  const DAY = 86_400_000;
  const seasons = validateSeasons({
    ...DEFAULT_SEASONS,
    lengthMs: numberFromEnv(env, "GI_SEASON_WEEKS", DEFAULT_SEASONS.lengthMs / (7 * DAY)) * 7 * DAY,
    minFights: numberFromEnv(env, "GI_SEASON_MIN_FIGHTS", DEFAULT_SEASONS.minFights),
    minBets: numberFromEnv(env, "GI_SEASON_MIN_BETS", DEFAULT_SEASONS.minBets),
  });
  return {
    economy: validateEconomy({
      startingBalance: saltFromEnv(env, "GI_STARTING_BALANCE", d.startingBalance),
      dailyGrant: saltFromEnv(env, "GI_DAILY_GRANT", d.dailyGrant),
      bailoutFloor: saltFromEnv(env, "GI_BAILOUT_FLOOR", d.bailoutFloor),
      minBet: saltFromEnv(env, "GI_MIN_BET", d.minBet),
      maxPayout: saltFromEnv(env, "GI_MAX_PAYOUT", d.maxPayout),
      ownerReward: saltFromEnv(env, "GI_OWNER_REWARD", d.ownerReward),
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
    shop: validateShop({
      ...DEFAULT_SHOP,
      rotationMs: numberFromEnv(env, "GI_SHOP_ROTATION_HOURS", DEFAULT_SHOP.rotationMs / 3_600_000) * 3_600_000,
      slots: numberFromEnv(env, "GI_SHOP_SLOTS", DEFAULT_SHOP.slots),
      basePrice: saltFromEnv(env, "GI_SHOP_BASE_PRICE", DEFAULT_SHOP.basePrice),
      firstEditionSupply: numberFromEnv(env, "GI_FIRST_EDITION_SUPPLY", DEFAULT_SHOP.firstEditionSupply),
      startRating: numberFromEnv(env, "GI_OWNED_START_RATING", DEFAULT_SHOP.startRating),
      maxOwnedPerUser: numberFromEnv(env, "GI_MAX_OWNED", DEFAULT_SHOP.maxOwnedPerUser),
    }),
    upgrades: validateUpgrades({
      ...DEFAULT_UPGRADES,
      costGrowthBp: saltFromEnv(env, "GI_UPGRADE_COST_GROWTH_BP", DEFAULT_UPGRADES.costGrowthBp),
      sidegradeCost: saltFromEnv(env, "GI_SIDEGRADE_COST", DEFAULT_UPGRADES.sidegradeCost),
      deviationWiden: numberFromEnv(env, "GI_UPGRADE_RD_WIDEN", DEFAULT_UPGRADES.deviationWiden),
    }),
    exhibitions: validateExhibitions({
      challengeTtlMs: numberFromEnv(env, "GI_CHALLENGE_TTL_HOURS", DEFAULT_EXHIBITIONS.challengeTtlMs / 3_600_000) * 3_600_000,
      maxOpenPerUser: numberFromEnv(env, "GI_MAX_OPEN_CHALLENGES", DEFAULT_EXHIBITIONS.maxOpenPerUser),
      showcasePool: numberFromEnv(env, "GI_SHOWCASE_POOL", DEFAULT_EXHIBITIONS.showcasePool),
    }),
    tournaments: validateTournaments({
      startingBalance: saltFromEnv(env, "GI_TOURNAMENT_BALANCE", DEFAULT_TOURNAMENTS.startingBalance),
      podium: numberFromEnv(env, "GI_TOURNAMENT_PODIUM", DEFAULT_TOURNAMENTS.podium),
    }),
    seasons,
    voting: validateVoting(
      {
        windowMs: numberFromEnv(env, "GI_VOTING_DAYS", DEFAULT_VOTING.windowMs / DAY) * DAY,
        votesPerVoter: numberFromEnv(env, "GI_VOTES_PER_VOTER", DEFAULT_VOTING.votesPerVoter),
        minAccountAgeMs: numberFromEnv(env, "GI_VOTER_MIN_AGE_DAYS", DEFAULT_VOTING.minAccountAgeMs / DAY) * DAY,
        minBets: numberFromEnv(env, "GI_VOTER_MIN_BETS", DEFAULT_VOTING.minBets),
        electedPerSeason: numberFromEnv(env, "GI_ELECTED_PER_SEASON", DEFAULT_VOTING.electedPerSeason),
      },
    ),
    submissions: validateSubmissions({
      ...DEFAULT_SUBMISSIONS,
      open: booleanFromEnv(env, "GI_SUBMISSIONS_OPEN", DEFAULT_SUBMISSIONS.open),
      maxFileBytes: Math.round(numberFromEnv(env, "GI_SUBMISSION_MAX_FILE_MB", DEFAULT_SUBMISSIONS.maxFileBytes / (1024 * 1024)) * 1024 * 1024),
      maxFiles: numberFromEnv(env, "GI_SUBMISSION_MAX_FILES", DEFAULT_SUBMISSIONS.maxFiles),
    }),
    staff: validateStaff({
      renameCooldownMs: numberFromEnv(env, "GI_RENAME_COOLDOWN_DAYS", DEFAULT_STAFF.renameCooldownMs / 86_400_000) * 86_400_000,
    }),
  };
}
