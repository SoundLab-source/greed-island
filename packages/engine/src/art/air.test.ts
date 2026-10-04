import { describe, expect, it } from "vitest";
import { readAirBoxes, writeAir } from "./air.ts";

describe("readAirBoxes", () => {
  it("reads back each frame's boxes as writeAir wrote them", () => {
    const text = writeAir([
      { action: 0, frames: [{ group: 0, number: 0, ticks: 5, clsn2: [[-10, -90, 12, 0]] }, { group: 0, number: 1, ticks: 5, clsn2: [[-11, -91, 13, 0], [-5, -40, 5, 0]] }], comment: "stand" },
      { action: 200, loopStart: 1, frames: [{ group: 200, number: 0, ticks: 2, clsn2: [[-10, -90, 12, 0]] }, { group: 200, number: 1, ticks: 3, y: -4, clsn2: [[-10, -90, 30, 0]], clsn1: [[20, -70, 55, -50]] }] },
    ], "header");
    const boxes = readAirBoxes(text);
    expect([...boxes.keys()]).toEqual([0, 200]);
    expect(boxes.get(0)).toEqual([
      { clsn1: [], clsn2: [[-10, -90, 12, 0]] },
      { clsn1: [], clsn2: [[-11, -91, 13, 0], [-5, -40, 5, 0]] },
    ]);
    expect(boxes.get(200)![1]).toEqual({ clsn1: [[20, -70, 55, -50]], clsn2: [[-10, -90, 30, 0]] });
  });
});
