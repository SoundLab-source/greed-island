import { describe, expect, it } from "vitest";
import { standSprite } from "./card.ts";

describe("MUGEN character pictures", () => {
  it("finds the first frame of the standing animation", () => {
    const air = ["; comment", "[Begin Action 10]", "10,0, 0,0, 5", "", "[Begin Action 0] ; stand", "Clsn2Default: 1", " Clsn2[0] = -10,0, 10,-80", "0,3, 0,0, 6 ; first", "0,4, 0,0, 6", "[Begin Action 20]", "20,0, 0,0, 4"].join("\r\n");
    expect(standSprite(air)).toEqual([0, 3]);
    expect(standSprite("[begin action 0]\n-1,0, 0,0, -1")).toEqual([-1, 0]);
    expect(standSprite("[Begin Action 5]\n1,1,0,0,1")).toBeUndefined();
  });
});
