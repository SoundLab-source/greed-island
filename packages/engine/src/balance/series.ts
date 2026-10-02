/**
 * Balance checks: run a list of fights, a few at a time, and collect what
 * happened in each. How one fight is run is the caller's business (real sim
 * fights in `pnpm templates:balance`, a stub in tests).
 */
import type { EngineOutcome } from "@greed-island/shared";
import type { MatchDetail } from "../ikemen/log.ts";
import type { PlannedFight } from "./plan.ts";

export interface FightResult {
  fight: PlannedFight;
  outcome: EngineOutcome;
  /** Round times and remaining life from the engine's log; null when it couldn't be read. */
  detail: MatchDetail | null;
}

export interface SeriesOptions {
  /** How many fights run at the same time. */
  parallel: number;
  onResult?: (result: FightResult, done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Results come back in plan order; fights not started before an abort are left out. */
export async function runSeries(plan: readonly PlannedFight[], runOne: (fight: PlannedFight) => Promise<Omit<FightResult, "fight">>, options: SeriesOptions): Promise<FightResult[]> {
  if (!Number.isInteger(options.parallel) || options.parallel < 1) throw new Error(`parallel must be a whole number, 1 or more (got ${options.parallel})`);
  const results: (FightResult | undefined)[] = new Array(plan.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      if (options.signal?.aborted) return;
      const i = next++;
      const fight = plan[i];
      if (!fight) return;
      const result = { fight, ...(await runOne(fight)) };
      results[i] = result;
      options.onResult?.(result, ++done, plan.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.parallel, plan.length) }, worker));
  return results.filter((r): r is FightResult => r !== undefined);
}
