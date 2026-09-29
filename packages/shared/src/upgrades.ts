/**
 * Stat upgrades and sidegrades (DESIGN §8, docs/PHASE2.md). Pure rules:
 * which level costs what, and what a character's stats are for a given set
 * of levels and sidegrade. Defaults answer DESIGN §15 open questions.
 */
import { BP_SCALE, type Salt } from "./money.ts";
import { DEFAULT_STATS, type CharacterStats } from "./character.ts";

export const UPGRADE_STATS = ["life", "attack", "defense", "power"] as const;
export type UpgradeStat = (typeof UPGRADE_STATS)[number];

export const SIDEGRADES = ["BRUISER", "GLASS_CANNON", "IRON_WALL"] as const;
export type Sidegrade = (typeof SIDEGRADES)[number];

export type Levels = Record<UpgradeStat, number>;

export const ZERO_LEVELS: Readonly<Levels> = Object.freeze({ life: 0, attack: 0, defense: 0, power: 0 });

/** Which CharacterStats field each upgradable stat drives. */
export const STAT_FIELD: Readonly<Record<UpgradeStat, keyof CharacterStats>> = Object.freeze({
  life: "lifePct",
  attack: "attackPct",
  defense: "defensePct",
  power: "startPower",
});

export interface UpgradeConfig {
  /** Gain from each level, first level first: early levels give most (diminishing returns). */
  increments: Readonly<Record<UpgradeStat, readonly number[]>>;
  /** Cost of the first level. */
  baseCost: Readonly<Record<UpgradeStat, Salt>>;
  /** Each level costs this much more than the one before, in bp (16_000 = ×1.6). */
  costGrowthBp: bigint;
  /** What each sidegrade adds (positive) or takes away (negative). */
  sidegrades: Readonly<Record<Sidegrade, Readonly<Partial<Record<UpgradeStat, number>>>>>;
  /** Cost to pick or switch a sidegrade (removing one is free). */
  sidegradeCost: Salt;
  /** Lowest a stat can go through a sidegrade penalty. */
  floors: Readonly<Record<UpgradeStat, number>>;
  /** Rating deviation added by every upgrade or sidegrade change (DESIGN §7). */
  deviationWiden: number;
  /** Deviation never grows past this (a brand-new character's). */
  maxDeviation: number;
}

export const DEFAULT_UPGRADES: Readonly<UpgradeConfig> = Object.freeze({
  increments: Object.freeze({
    life: [6, 5, 4, 3, 2],
    attack: [5, 4, 3, 2, 1],
    defense: [5, 4, 3, 2, 1],
    power: [300, 250, 200, 150, 100],
  }),
  baseCost: Object.freeze({ life: 150n, attack: 200n, defense: 200n, power: 120n }),
  costGrowthBp: 16_000n,
  sidegrades: Object.freeze({
    BRUISER: Object.freeze({ life: 10, power: -300 }),
    GLASS_CANNON: Object.freeze({ attack: 8, life: -8 }),
    IRON_WALL: Object.freeze({ defense: 8, attack: -5 }),
  }),
  sidegradeCost: 300n,
  floors: Object.freeze({ life: 80, attack: 85, defense: 85, power: 0 }),
  deviationWiden: 30,
  maxDeviation: 350,
});

export function maxLevel(stat: UpgradeStat, cfg: UpgradeConfig = DEFAULT_UPGRADES): number {
  return cfg.increments[stat].length;
}

/** Cost to go from `level` to `level + 1`: base × growth^level, rounded down. */
export function upgradeCost(stat: UpgradeStat, level: number, cfg: UpgradeConfig = DEFAULT_UPGRADES): Salt {
  if (!Number.isInteger(level) || level < 0 || level >= maxLevel(stat, cfg)) throw new RangeError(`${stat} has no level after ${level}`);
  let cost = cfg.baseCost[stat];
  for (let i = 0; i < level; i++) cost = (cost * cfg.costGrowthBp) / BP_SCALE;
  return cost;
}

/** Salt to take one stat from level 0 to max. */
export function totalCostToMax(stat: UpgradeStat, cfg: UpgradeConfig = DEFAULT_UPGRADES): Salt {
  let total = 0n;
  for (let l = 0; l < maxLevel(stat, cfg); l++) total += upgradeCost(stat, l, cfg);
  return total;
}

/** A character's stats from its levels and sidegrade. */
export function effectiveStats(levels: Levels, sidegrade: Sidegrade | null, cfg: UpgradeConfig = DEFAULT_UPGRADES): CharacterStats {
  const stats = { ...DEFAULT_STATS };
  for (const stat of UPGRADE_STATS) {
    const level = levels[stat];
    if (!Number.isInteger(level) || level < 0 || level > maxLevel(stat, cfg)) throw new RangeError(`${stat} level ${level} is out of range`);
    const gained = cfg.increments[stat].slice(0, level).reduce((a, b) => a + b, 0);
    const delta = sidegrade ? (cfg.sidegrades[sidegrade][stat] ?? 0) : 0;
    const field = STAT_FIELD[stat];
    stats[field] = Math.max(cfg.floors[stat], DEFAULT_STATS[field] + gained + delta);
  }
  return stats;
}

/** Deviation after an upgrade or sidegrade change: history is less predictive now. */
export function widenedDeviation(deviation: number, cfg: UpgradeConfig = DEFAULT_UPGRADES): number {
  return Math.min(cfg.maxDeviation, deviation + cfg.deviationWiden);
}

export function isSidegrade(value: unknown): value is Sidegrade {
  return SIDEGRADES.includes(value as Sidegrade);
}
