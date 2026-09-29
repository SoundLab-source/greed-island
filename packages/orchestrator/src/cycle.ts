/**
 * The stream's repeating cycle (DESIGN §5): matchmaking fights, then a
 * tournament, then exhibitions. A tournament lasts until its bracket is
 * decided (replayed voids included), so its segment has no fixed length.
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

/**
 * Position of the next fight, given the last booked one (or none). Skips
 * empty segments. With `tournamentDone`, a cycle's tournament segment lasts
 * until that returns true for the cycle (the bracket is decided or couldn't
 * be filled); without it, the segment has the fixed length size − 1.
 */
export function nextPosition(last: CyclePosition | null, cfg: CycleConfig, tournamentDone?: (cycle: number) => boolean): CyclePosition {
  if (SEGMENTS.every((s) => segmentLength(s, cfg) === 0)) throw new Error("cycle has no fights");
  const length = (segment: Segment, cycle: number) =>
    segment === "TOURNAMENT" && tournamentDone && cfg.tournamentSize >= 2 ? (tournamentDone(cycle) ? 0 : Infinity) : segmentLength(segment, cfg);
  let pos: CyclePosition = last ? { ...last, index: last.index + 1 } : { cycle: 1, segment: SEGMENTS[0], index: 0 };
  while (pos.index >= length(pos.segment, pos.cycle)) {
    const i = SEGMENTS.indexOf(pos.segment);
    pos = i === SEGMENTS.length - 1 ? { cycle: pos.cycle + 1, segment: SEGMENTS[0], index: 0 } : { cycle: pos.cycle, segment: SEGMENTS[i + 1]!, index: 0 };
  }
  return pos;
}

export type BookingMode = Segment;

/** Which booking mode runs a segment (each segment has its own). */
export function bookingModeFor(segment: Segment): BookingMode {
  return segment;
}
