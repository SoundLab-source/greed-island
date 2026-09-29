import type { EngineEvent } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { OutcomeTracker } from "./outcome.ts";

const start: EngineEvent = { type: "match_start" };
const round = (n: number, w: 0 | 1 | 2): EngineEvent[] => [
  { type: "round_start", round: n },
  { type: "round_end", round: n, winnerSide: w, reason: "ko" },
];
function feed(events: EngineEvent[]) {
  const t = new OutcomeTracker(2);
  for (const e of events) t.push(e);
  return t.outcome("exited");
}

describe("OutcomeTracker", () => {
  it("accepts a clean 2-1 match", () => {
    const o = feed([start, ...round(1, 1), ...round(2, 2), ...round(3, 1), { type: "match_end", winnerSide: 1, wins: [2, 1] }]);
    expect(o).toMatchObject({ kind: "finished", winnerSide: 1 });
    if (o.kind === "finished") expect(o.rounds).toHaveLength(3);
  });

  it("accepts a match-level draw as finished with winner 0 (the orchestrator voids it)", () => {
    const o = feed([start, ...round(1, 1), ...round(2, 2), ...round(3, 0), { type: "match_end", winnerSide: 0, wins: [1, 1] }]);
    expect(o).toMatchObject({ kind: "finished", winnerSide: 0 });
  });

  it("treats a missing match_end as a crash", () => {
    expect(feed([start, ...round(1, 1)])).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/no match_end/) });
  });

  it("rejects a winner that contradicts the rounds", () => {
    const o = feed([start, ...round(1, 1), ...round(2, 1), { type: "match_end", winnerSide: 2 }]);
    expect(o).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/round results say 1/) });
  });

  it("rejects an engine win count that differs from the events", () => {
    const o = feed([start, ...round(1, 1), ...round(2, 1), { type: "match_end", winnerSide: 1, wins: [2, 1] }]);
    expect(o).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/counted wins 2-1/) });
  });

  it.each([
    ["round before start", [...round(1, 1)]],
    ["duplicate start", [start, start]],
    ["rounds out of order", [start, ...round(2, 1), ...round(1, 1)]],
    ["end for the wrong round", [start, { type: "round_start", round: 1 }, { type: "round_end", round: 2, winnerSide: 1, reason: "ko" }]],
    ["event after match_end", [start, ...round(1, 1), ...round(2, 1), { type: "match_end", winnerSide: 1 }, ...round(3, 1)]],
  ] as [string, EngineEvent[]][])("rejects %s", (_label, events) => {
    expect(feed(events).kind).toBe("engine_crash");
  });

  it("stays invalid once invalidated", () => {
    const t = new OutcomeTracker(2);
    t.push(start);
    t.invalidate("garbage line");
    expect(t.outcome("x")).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/garbage line/) });
  });
});
