/** Engine settings from env. Timeouts are generous: a best-of-3 at 99 s rounds with intros runs ~6 min. */
import { REPO_ROOT } from "@greed-island/db";
import path from "node:path";
import type { EngineMode } from "./types.ts";

export interface EngineConfig {
  mode: EngineMode;
  ikemenDir: string | undefined;
  runsDir: string;
  /** engine_timeout for live fights. */
  timeoutMs: number;
  /** engine_timeout for sim (smoke) fights. */
  simTimeoutMs: number;
  aiLevel: number;
  simSpeed: number;
  /** Extra IKEMEN flags, space-separated in GI_IKEMEN_ARGS (e.g. "-windowed"). */
  extraArgs: string[];
  /** GI_GAME_TO_FRONT=true: bring each fight's window to the front (macOS; for streaming). */
  bringToFront: boolean;
}

function num(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return n;
}

export function loadEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const mode = (env["ENGINE_MODE"] ?? "fake") as EngineMode;
  if (!["live", "sim", "fake"].includes(mode)) throw new Error(`ENGINE_MODE must be live, sim or fake, got "${mode}"`);
  return {
    mode,
    ikemenDir: env["IKEMEN_DIR"] || undefined,
    runsDir: env["GI_RUNS_DIR"] || path.join(REPO_ROOT, "runs"),
    timeoutMs: num(env, "GI_ENGINE_TIMEOUT_MS", 10 * 60_000),
    simTimeoutMs: num(env, "GI_SIM_TIMEOUT_MS", 3 * 60_000),
    aiLevel: num(env, "GI_AI_LEVEL", 8),
    simSpeed: num(env, "GI_SIM_SPEED", 4),
    extraArgs: (env["GI_IKEMEN_ARGS"] ?? "-windowed").split(/\s+/).filter(Boolean),
    bringToFront: ["1", "true", "yes"].includes((env["GI_GAME_TO_FRONT"] ?? "").trim().toLowerCase()),
  };
}
