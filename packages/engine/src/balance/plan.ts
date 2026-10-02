/**
 * Balance checks (docs/PHASE3.md step 4): which fights to run. Pure.
 */

/** One fight of a balance check, by fighter id. */
export interface PlannedFight {
  index: number;
  p1: string;
  p2: string;
  stageId: string;
}

export interface RoundRobinOptions {
  /** Only pairings that include this fighter (for tuning one fighter at a time). */
  only?: string;
}

/**
 * Each fighter against itself, `fightsEach` times, rotating stages: with the
 * same fighter on both sides, only the side can decide who wins, so the
 * player 1 side should win about half.
 */
export function mirrors(ids: readonly string[], fightsEach: number, stageIds: readonly string[]): PlannedFight[] {
  if (ids.length < 1) throw new Error("a side check needs at least one fighter");
  if (!Number.isInteger(fightsEach) || fightsEach < 1) throw new Error(`fights per fighter must be a whole number, 1 or more (got ${fightsEach})`);
  if (stageIds.length < 1) throw new Error("a side check needs at least one stage");
  const fights: PlannedFight[] = [];
  for (let pass = 0; pass < fightsEach; pass++) {
    for (const [n, id] of ids.entries()) fights.push({ index: fights.length, p1: id, p2: id, stageId: stageIds[(pass + n) % stageIds.length]! });
  }
  return fights;
}

/**
 * Every pair of fighters meets `fightsPerPair` times. Each pair swaps sides
 * every fight and plays both sides on a stage before moving to the next one,
 * so neither the side nor the stage favours anyone. Fights are ordered pass by
 * pass (every pair once, then every pair again), so a check that is stopped
 * early has still treated all pairs alike.
 */
export function roundRobin(ids: readonly string[], fightsPerPair: number, stageIds: readonly string[], options: RoundRobinOptions = {}): PlannedFight[] {
  if (new Set(ids).size !== ids.length) throw new Error("fighter ids must be different");
  if (ids.length < 2) throw new Error("a balance check needs at least two fighters");
  if (!Number.isInteger(fightsPerPair) || fightsPerPair < 1) throw new Error(`fights per pairing must be a whole number, 1 or more (got ${fightsPerPair})`);
  if (stageIds.length < 1) throw new Error("a balance check needs at least one stage");
  if (options.only !== undefined && !ids.includes(options.only)) throw new Error(`"${options.only}" is not one of the fighters`);

  const pairs: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (options.only === undefined || ids[i] === options.only || ids[j] === options.only) pairs.push([ids[i]!, ids[j]!]);
    }
  }
  const fights: PlannedFight[] = [];
  for (let pass = 0; pass < fightsPerPair; pass++) {
    for (const [n, [a, b]] of pairs.entries()) {
      const swap = pass % 2 === 1;
      const stageId = stageIds[(Math.floor(pass / 2) + n) % stageIds.length]!;
      fights.push({ index: fights.length, p1: swap ? b : a, p2: swap ? a : b, stageId });
    }
  }
  return fights;
}
