import type { CharacterStats, EngineEvent, EngineOutcome, Rating, Side } from "@greed-island/shared";

export type EngineMode = "live" | "sim" | "fake";

/** One side of a fight, as the runner launches it. */
export interface FighterSpec {
  characterId: string;
  fighterId: string;
  /** Character .def, relative to IKEMEN_DIR. */
  defPath: string;
  palette: number;
  stats: CharacterStats;
  /** The character's name on stream; the game's health bar shows it too when it isn't the fighter's own. */
  displayName?: string;
  /** Pre-fight rating; used only by the fake engine to pick plausible winners. */
  rating?: Rating;
}

export interface FightSpec {
  fightId: string;
  sides: Record<Side, FighterSpec>;
  stage: { id: string; defPath: string };
  /** Round wins needed (best of 3 = 2). */
  roundsToWin: number;
}

export interface RunOptions {
  onEvent?: (event: EngineEvent) => void;
  signal?: AbortSignal;
}

export interface EventSource {
  readonly mode: EngineMode;
  /** Run one fight. Never rejects for engine problems: those are outcomes. */
  run(spec: FightSpec, options?: RunOptions): Promise<EngineOutcome>;
}
