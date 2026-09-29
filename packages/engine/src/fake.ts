/**
 * Fake engine: no IKEMEN, scripted events. Used by tests and `pnpm demo`.
 * Deterministic for a given seed and fight id.
 */
import { expectedScore, initialRating, type EngineEvent, type EngineOutcome, type Side, type WinnerSide } from "@greed-island/shared";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { OutcomeTracker } from "./outcome.ts";
import type { EventSource, FightSpec, RunOptions } from "./types.ts";

export type FakeEnding = "normal" | "crash" | "hang" | "bad_events";

export interface FakeScript {
  rounds: { winnerSide: WinnerSide; reason: "ko" | "time" }[];
  ending: FakeEnding;
}

export interface FakeOptions {
  seed?: string;
  /** Delay between events, to make the demo watchable. 0 in tests. */
  eventDelayMs?: number;
  /** A "hang" ends as engine_timeout after this long. */
  timeoutMs?: number;
  /** Chance of a drawn round, a crash, or a hang, in [0, 1]. */
  drawRoundRate?: number;
  crashRate?: number;
  hangRate?: number;
  /** Override the generated script (e.g. to force a void in the demo). */
  script?: (spec: FightSpec) => FakeScript | undefined;
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function seededRandom(seed: string): () => number {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a plausible best-of-N: each round won with the Glicko-2 expected score. */
export function generateScript(spec: FightSpec, options: FakeOptions): FakeScript {
  const random = seededRandom(`${options.seed ?? "fake"}:${spec.fightId}`);
  const roll = random();
  if (roll < (options.crashRate ?? 0)) return { rounds: [{ winnerSide: 1, reason: "ko" }], ending: "crash" };
  if (roll < (options.crashRate ?? 0) + (options.hangRate ?? 0)) return { rounds: [], ending: "hang" };

  const p1 = expectedScore(spec.sides[1].rating ?? initialRating(), spec.sides[2].rating ?? initialRating());
  const wins: Record<Side, number> = { 1: 0, 2: 0 };
  const rounds: FakeScript["rounds"] = [];
  let draws = 0;
  // Mirror the engine: at most one drawn round counts for nobody; cap the length.
  while (wins[1] < spec.roundsToWin && wins[2] < spec.roundsToWin && rounds.length < 9) {
    if (draws === 0 && random() < (options.drawRoundRate ?? 0)) {
      draws++;
      rounds.push({ winnerSide: 0, reason: "time" });
      continue;
    }
    const winner: Side = random() < p1 ? 1 : 2;
    wins[winner]++;
    rounds.push({ winnerSide: winner, reason: random() < 0.85 ? "ko" : "time" });
  }
  return { rounds, ending: "normal" };
}

export function createFakeSource(options: FakeOptions = {}): EventSource {
  return {
    mode: "fake",
    async run(spec: FightSpec, run: RunOptions = {}): Promise<EngineOutcome> {
      const script = options.script?.(spec) ?? generateScript(spec, options);
      const tracker = new OutcomeTracker(spec.roundsToWin);
      const delay = options.eventDelayMs ?? 0;
      const emit = async (event: EngineEvent) => {
        if (delay > 0) await sleep(delay, undefined, { signal: run.signal });
        tracker.push(event);
        run.onEvent?.(event);
      };

      try {
        await emit({ type: "match_start", p1: spec.sides[1].fighterId, p2: spec.sides[2].fighterId });
        if (script.ending === "hang") {
          await sleep(options.timeoutMs ?? 0, undefined, { signal: run.signal });
          return { kind: "engine_timeout", detail: "fake engine hung" };
        }
        const wins: [number, number] = [0, 0];
        for (const [i, round] of script.rounds.entries()) {
          await emit({ type: "round_start", round: i + 1 });
          await emit({ type: "round_end", round: i + 1, winnerSide: round.winnerSide, reason: round.reason });
          if (round.winnerSide === 1) wins[0]++;
          if (round.winnerSide === 2) wins[1]++;
          if (script.ending === "crash") return tracker.outcome("fake engine crashed");
        }
        const winnerSide: WinnerSide = wins[0] >= spec.roundsToWin ? 1 : wins[1] >= spec.roundsToWin ? 2 : 0;
        if (script.ending === "bad_events") {
          await emit({ type: "match_end", winnerSide: winnerSide === 1 ? 2 : 1, wins });
        } else {
          await emit({ type: "match_end", winnerSide, wins });
        }
        return tracker.outcome("fake engine exited");
      } catch (err) {
        if (run.signal?.aborted) return { kind: "engine_crash", detail: "aborted" };
        throw err;
      }
    },
  };
}
