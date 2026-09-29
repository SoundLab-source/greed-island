/**
 * Fighters (designs) and characters (owned instances). Stats exist from day
 * one with neutral defaults; upgrades that change them arrive in phase 2.
 */
import type { Rating } from "./glicko2.ts";
import type { Tier } from "./tiers.ts";

export const ARCHETYPES = ["RUSHDOWN", "ZONER", "GRAPPLER", "ALL_ROUNDER", "HEAVY"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/**
 * Upgradable stats, relative to the fighter's own definition. Neutral values
 * mean "use the character exactly as authored", so nothing is passed to the
 * engine. Which stats actually reach the engine is decided by the engine
 * adapter (see docs/ikemen-notes.md §5).
 */
export interface CharacterStats {
  /** Max life as a percentage of the fighter's base life. */
  lifePct: number;
  /** Power at round start, in engine power units. */
  startPower: number;
  /** Attack as a percentage of base. UNVERIFIED engine mechanism. */
  attackPct: number;
  /** Defense as a percentage of base. UNVERIFIED engine mechanism. */
  defensePct: number;
}

export const DEFAULT_STATS: Readonly<CharacterStats> = Object.freeze({
  lifePct: 100,
  startPower: 0,
  attackPct: 100,
  defensePct: 100,
});

/** Everything about one side of a fight, frozen when betting opens. */
export interface LoadoutSnapshot extends Rating {
  characterId: string;
  fighterId: string;
  name: string;
  tier: Tier;
  stats: CharacterStats;
  wins: number;
  losses: number;
}
