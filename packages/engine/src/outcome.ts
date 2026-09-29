/**
 * Turns a stream of engine events into an outcome, rejecting anything
 * inconsistent. A fight only counts as finished if the events tell one
 * coherent story; otherwise it's treated as a crash and voided.
 */
import type { EngineEvent, EngineOutcome, RoundEndEvent, WinnerSide } from "@greed-island/shared";

export class OutcomeTracker {
  private started = false;
  private openRound: number | null = null;
  private lastRound = 0;
  private readonly rounds: RoundEndEvent[] = [];
  private readonly wins: [number, number] = [0, 0];
  private end: { winnerSide: WinnerSide; wins?: [number, number] | undefined } | null = null;
  private problem: string | null = null;

  constructor(private readonly roundsToWin: number) {}

  get finished(): boolean {
    return this.end !== null || this.problem !== null;
  }

  /** Mark the stream invalid, e.g. for a line that isn't a valid event. */
  invalidate(why: string): void {
    this.problem ??= why;
  }

  /** Feed one event. Returns false once the stream has become invalid. */
  push(event: EngineEvent): boolean {
    if (this.problem) return false;
    const fail = (why: string) => {
      this.problem = `${why} (at ${JSON.stringify(event)})`;
      return false;
    };
    if (this.end) return fail("event after match_end");
    switch (event.type) {
      case "match_start":
        if (this.started) return fail("duplicate match_start");
        this.started = true;
        return true;
      case "round_start":
        if (!this.started) return fail("round_start before match_start");
        if (this.openRound !== null) return fail("round_start while a round is open");
        if (event.round <= this.lastRound) return fail("round numbers must increase");
        this.openRound = event.round;
        return true;
      case "round_end":
        if (this.openRound !== event.round) return fail("round_end for a round that isn't open");
        this.openRound = null;
        this.lastRound = event.round;
        this.rounds.push(event);
        if (event.winnerSide === 1) this.wins[0]++;
        if (event.winnerSide === 2) this.wins[1]++;
        return true;
      case "match_end":
        if (!this.started || this.openRound !== null) return fail("match_end in the wrong place");
        this.end = { winnerSide: event.winnerSide, wins: event.wins };
        return true;
    }
  }

  /** The side that reached the win count on our own tally, 0 if none or both. */
  private tallyWinner(): WinnerSide {
    const w1 = this.wins[0] >= this.roundsToWin;
    const w2 = this.wins[1] >= this.roundsToWin;
    if (w1 === w2) return 0;
    return w1 ? 1 : 2;
  }

  /** Final outcome once the engine has stopped. */
  outcome(exitDetail: string): EngineOutcome {
    if (this.problem) return { kind: "engine_crash", detail: `inconsistent events: ${this.problem}` };
    if (!this.end) return { kind: "engine_crash", detail: `no match_end (${exitDetail})` };
    const tally = this.tallyWinner();
    if (this.end.wins && (this.end.wins[0] !== this.wins[0] || this.end.wins[1] !== this.wins[1])) {
      return { kind: "engine_crash", detail: `engine counted wins ${this.end.wins.join("-")}, events show ${this.wins.join("-")}` };
    }
    if (this.end.winnerSide !== tally) {
      return { kind: "engine_crash", detail: `engine says winner ${this.end.winnerSide}, round results say ${tally}` };
    }
    return { kind: "finished", winnerSide: this.end.winnerSide, rounds: [...this.rounds] };
  }
}
