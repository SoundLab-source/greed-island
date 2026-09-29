/** Orchestrator settings from env (the rest lives in @greed-island/shared's loadConfig). */
import { DEFAULT_CYCLE, type CycleConfig } from "./cycle.ts";
import { DEFAULT_MATCHMAKING, type MatchmakingConfig } from "./matchmaking.ts";

export interface OrchestratorConfig {
  /** DESIGN §6: about 60 seconds. */
  bettingWindowMs: number;
  /** Pause after a fight closes before booking the next. */
  interFightDelayMs: number;
  /** Best of 3. */
  roundsToWin: number;
  matchmaking: MatchmakingConfig;
  cycle: CycleConfig;
}

export const DEFAULT_ORCHESTRATOR: Readonly<OrchestratorConfig> = Object.freeze({
  bettingWindowMs: 60_000,
  interFightDelayMs: 5_000,
  roundsToWin: 2,
  matchmaking: DEFAULT_MATCHMAKING,
  cycle: DEFAULT_CYCLE,
});

function num(env: NodeJS.ProcessEnv, name: string, fallback: number, min = 0): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a number >= ${min}, got "${raw}"`);
  return n;
}

export function loadOrchestratorConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  const d = DEFAULT_ORCHESTRATOR;
  const m = d.matchmaking;
  const targetMinBp = BigInt(num(env, "GI_MATCH_TARGET_MIN_BP", Number(m.targetMinBp), 1));
  const targetMaxBp = BigInt(num(env, "GI_MATCH_TARGET_MAX_BP", Number(m.targetMaxBp), 1));
  if (targetMinBp > targetMaxBp || targetMaxBp > 10_000n) throw new Error("GI_MATCH_TARGET_MIN_BP <= GI_MATCH_TARGET_MAX_BP <= 10000");
  const upsetRate = num(env, "GI_UPSET_RATE", m.upsetRate);
  if (upsetRate > 1) throw new Error("GI_UPSET_RATE must be in [0, 1]");
  return {
    bettingWindowMs: num(env, "GI_BETTING_WINDOW_MS", d.bettingWindowMs),
    interFightDelayMs: num(env, "GI_INTER_FIGHT_MS", d.interFightDelayMs),
    roundsToWin: num(env, "GI_ROUNDS_TO_WIN", d.roundsToWin, 1),
    matchmaking: {
      targetMinBp,
      targetMaxBp,
      upsetRate,
      rematchCooldown: num(env, "GI_REMATCH_COOLDOWN", m.rematchCooldown),
      crossTierFallback: (env["GI_CROSS_TIER_FALLBACK"] ?? "true") !== "false",
    },
    cycle: {
      matchmakingFights: num(env, "GI_CYCLE_MATCHMAKING", d.cycle.matchmakingFights),
      tournamentSize: num(env, "GI_CYCLE_TOURNAMENT_SIZE", d.cycle.tournamentSize),
      exhibitionFights: num(env, "GI_CYCLE_EXHIBITIONS", d.cycle.exhibitionFights),
    },
  };
}
