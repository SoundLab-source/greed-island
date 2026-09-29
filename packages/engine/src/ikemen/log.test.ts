import { parseEngineEventLine } from "@greed-island/shared";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { OutcomeTracker } from "../outcome.ts";
import { outcomeFromDump, parseLuaDump } from "./log.ts";

// Captured from a real IKEMEN GO v1.0.0 run (macOS arm64, sim mode):
// Kung Fu Man (P1) vs Kung Fu Man 720 (P2), P2 won 2-1.
const fixture = (name: string) => readFile(new URL(`./fixtures/v1.0.0-kfm-vs-kfm720/${name}`, import.meta.url), "utf8");

describe("real -log output", () => {
  it("parses the nested Lua dump (keys are Go field names)", async () => {
    const d = parseLuaDump(await fixture("match.log"));
    expect(d["WinSide"]).toBe(1);
    expect(d["LastRound"]).toBe(3);
    expect(d["Wins"]).toEqual({ "1": 1, "2": 2 });
    const rounds = d["Rounds"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(rounds)).toEqual(["1", "2", "3"]);
    const r1p1 = ((rounds["1"]!["Fighters"] as Record<string, Record<string, Record<string, unknown>>>)["1"]!)["1"]!;
    expect(r1p1).toMatchObject({ Name: "Kung Fu Man", AILevel: 8, Win: true, WinKO: true, LifeMax: 1000 });
  });

  it("yields P2 as the winner (WinSide is 0-based)", async () => {
    expect(outcomeFromDump(parseLuaDump(await fixture("match.log")), 2)).toMatchObject({ kind: "finished", winnerSide: 2 });
  });
});

describe("real event stream", () => {
  it("replays into the same result as the log", async () => {
    const tracker = new OutcomeTracker(2);
    for (const line of (await fixture("events.ndjson")).split("\n")) {
      const event = parseEngineEventLine(line);
      if (event) expect(tracker.push(event)).toBe(true);
    }
    expect(tracker.outcome("exit code 0")).toMatchObject({ kind: "finished", winnerSide: 2 });
  });
});

describe("outcomeFromDump edge cases", () => {
  const dump = (winSide: number, w1: number, w2: number) =>
    parseLuaDump(`table: 0x1 {\n  ["WinSide"] => ${winSide}\n  ["Wins"] => table: 0x2 {\n    [1] => ${w1}\n    [2] => ${w2}\n  }\n}\n`);

  it("flags a disagreement between WinSide and the tally", () => {
    expect(outcomeFromDump(dump(0, 1, 2), 2)).toMatchObject({ kind: "engine_crash" });
  });

  it("reports a draw as winner 0", () => {
    expect(outcomeFromDump(dump(-1, 2, 2), 2)).toMatchObject({ kind: "finished", winnerSide: 0 });
  });

  it("returns null when the fields are missing", () => {
    expect(outcomeFromDump(parseLuaDump("table: 0x1 {\n}\n"), 2)).toBeNull();
  });
});
