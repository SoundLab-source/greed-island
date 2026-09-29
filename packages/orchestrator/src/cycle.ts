/**
 * The stream's repeating cycle (DESIGN §5): matchmaking fights, then a
 * tournament, then exhibitions. Phase 1 only implements matchmaking; the
 * tournament and exhibition segments fall back to matchmaking bookings but
 * keep their place in the cycle, so the real modes can slot in later.
 */
export const SEGMENTS = ["MATCHMAKING", "TOURNAMENT", "EXHIBITION"] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface CycleConfig {
  matchmakingFights: number;
  /** Single elimination: a bracket of N characters is N − 1 fights. */
  tournamentSize: number;
  exhibitionFights: number;
}

export const DEFAULT_CYCLE: Readonly<CycleConfig> = Object.freeze({
  matchmakingFights: 100,
  tournamentSize: 16,
  exhibitionFights: 25,
});

export interface CyclePosition {
  cycle: number;
  segment: Segment;
  /** 0-based index of the fight within its segment. */
  index: number;
}

export function segmentLength(segment: Segment, cfg: CycleConfig): number {
  switch (segment) {
    case "MATCHMAKING":
      return cfg.matchmakingFights;
    case "TOURNAMENT":
      return Math.max(0, cfg.tournamentSize - 1);
    case "EXHIBITION":
      return cfg.exhibitionFights;
  }
}

/** Position of the next fight, given the last booked one (or none). Skips empty segments. */
export function nextPosition(last: CyclePosition | null, cfg: CycleConfig): CyclePosition {
  if (SEGMENTS.every((s) => segmentLength(s, cfg) === 0)) throw new Error("cycle has no fights");
  let pos: CyclePosition = last ? { ...last, index: last.index + 1 } : { cycle: 1, segment: SEGMENTS[0], index: 0 };
  while (pos.index >= segmentLength(pos.segment, cfg)) {
    const i = SEGMENTS.indexOf(pos.segment);
    pos = i === SEGMENTS.length - 1 ? { cycle: pos.cycle + 1, segment: SEGMENTS[0], index: 0 } : { cycle: pos.cycle, segment: SEGMENTS[i + 1]!, index: 0 };
  }
  return pos;
}

/** Which booking mode actually runs a segment. Tournament and exhibition are phase-2 stubs. */
export function bookingModeFor(_segment: Segment): "MATCHMAKING" {
  return "MATCHMAKING";
}
