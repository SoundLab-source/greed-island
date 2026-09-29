import { describe, expect, it } from "vitest";
import { outcomeFromDump, parseLuaDump } from "./log.ts";

// Format per main.f_printTable (external/script/main.lua:113). Replace with a
// real fixture once a run has been captured (docs/ikemen-notes.md §7).
const sample = `table: 0x14000abc {
  ["winSide"] => 1
  ["draws"] => 0
  ["wins"] => table: 0x14000def {
              [1] => 1
              [2] => 2
              }
  ["rounds"] => table: 0x14000aaa {
                [1] => table: 0x14000bbb {
                       ["index"] => 1
                       ["timer"] => 3120
                       }
                }
  ["matchTime"] => 9001
}
`;

describe("parseLuaDump", () => {
  it("parses nested tables and scalars", () => {
    const d = parseLuaDump(sample);
    expect(d["winSide"]).toBe(1);
    expect(d["wins"]).toEqual({ "1": 1, "2": 2 });
    expect(d["rounds"]).toEqual({ "1": { index: 1, timer: 3120 } });
    expect(d["matchTime"]).toBe(9001);
  });
});

describe("outcomeFromDump", () => {
  it("takes the winner from the win tally, cross-checked with winSide (0-based)", () => {
    expect(outcomeFromDump(parseLuaDump(sample), 2)).toMatchObject({ kind: "finished", winnerSide: 2 });
  });

  it("flags a disagreement", () => {
    const bad = sample.replace('["winSide"] => 1', '["winSide"] => 0');
    expect(outcomeFromDump(parseLuaDump(bad), 2)).toMatchObject({ kind: "engine_crash" });
  });

  it("reports a draw as winner 0", () => {
    const draw = sample.replace('["winSide"] => 1', '["winSide"] => -1').replace("[1] => 1", "[1] => 2");
    expect(outcomeFromDump(parseLuaDump(draw), 2)).toMatchObject({ kind: "finished", winnerSide: 0 });
  });

  it("returns null when the fields are missing", () => {
    expect(outcomeFromDump(parseLuaDump("table: 0x1 {\n}\n"), 2)).toBeNull();
  });
});
