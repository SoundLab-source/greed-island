/**
 * Match events emitted by an engine event source (one JSON object per line).
 * `winnerSide` is 1 or 2, or 0 for a draw. Sides, never names, decide bets.
 */
import { z } from "zod";

const side = z.union([z.literal(1), z.literal(2)]);
const winnerSide = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const MatchStartEvent = z.object({
  type: z.literal("match_start"),
  /** Display names as the engine reports them. Informational only. */
  p1: z.string().optional(),
  p2: z.string().optional(),
});

export const RoundStartEvent = z.object({
  type: z.literal("round_start"),
  round: z.number().int().min(1),
});

const perMille = z.number().int().min(0).max(1000);
export const RoundEndEvent = z.object({
  type: z.literal("round_end"),
  round: z.number().int().min(1),
  winnerSide,
  reason: z.enum(["ko", "time"]),
  /** Life left at the end of the round, and the lowest it fell, per side, per mille of full life (event mod v2). */
  life: z.tuple([perMille, perMille]).optional(),
  low: z.tuple([perMille, perMille]).optional(),
  /** The side that landed the first hit, 0 if nobody was hit. */
  firstHit: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  /** Fighting time of the round in game ticks (60 a second at normal speed). */
  ticks: z.number().int().min(0).optional(),
});

export const MatchEndEvent = z.object({
  type: z.literal("match_end"),
  winnerSide,
  /** Round wins per side as the engine counted them, for cross-checking. */
  wins: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
});

export const EngineEvent = z.discriminatedUnion("type", [MatchStartEvent, RoundStartEvent, RoundEndEvent, MatchEndEvent]);

export type MatchStartEvent = z.infer<typeof MatchStartEvent>;
export type RoundStartEvent = z.infer<typeof RoundStartEvent>;
export type RoundEndEvent = z.infer<typeof RoundEndEvent>;
export type MatchEndEvent = z.infer<typeof MatchEndEvent>;
export type EngineEvent = z.infer<typeof EngineEvent>;
export type WinnerSide = 0 | 1 | 2;
export const SideSchema = side;

/** Parse one NDJSON line. Returns null for blank lines; throws on bad JSON or shape. */
export function parseEngineEventLine(line: string): EngineEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return EngineEvent.parse(JSON.parse(trimmed));
}

/**
 * How an engine run ended, from the orchestrator's point of view.
 * Only `finished` with winnerSide 1 or 2 can settle bets; everything else voids.
 */
export type EngineOutcome =
  | { kind: "finished"; winnerSide: WinnerSide; rounds: RoundEndEvent[] }
  | { kind: "engine_crash"; detail: string }
  | { kind: "engine_timeout"; detail: string };
