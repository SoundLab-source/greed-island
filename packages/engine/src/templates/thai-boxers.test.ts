import { describe, expect, it } from "vitest";
import { CAMO_COBRA } from "./camo-cobra.ts";
import { checkSpec, cellList } from "./spec.ts";
import { FROST_OWL, KILLER_BEE, SPOTTED_HYENA, THAI_BOXERS } from "./thai-boxers.ts";

describe("the Muay Thai fighters", () => {
  it("are six more bodies on Camo Cobra's moves, each a complete fighter", () => {
    expect(THAI_BOXERS.map((t) => t.name)).toEqual(["Fire Ant", "Killer Bee", "Tan Kangaroo", "Scarlet Ibis", "Frost Owl", "Spotted Hyena"]);
    for (const t of THAI_BOXERS) {
      expect(checkSpec(t)).toEqual([]);
      expect(t.attacks.map((a) => a.name)).toEqual(CAMO_COBRA.attacks.map((a) => a.name));
      expect(t.palettes).toHaveLength(3);
      // Every cell is a frame of its own GIF.
      const frames = t.art.columns * t.art.rows;
      for (const a of [...t.anims, ...t.attacks.map((x) => x.anim)]) for (const c of cellList(a.cells)) expect(c).toBeLessThan(frames);
    }
  });

  it("number their frames like Rhivan's: the same move on the matching frame of their own GIF", () => {
    const jab = (t: typeof CAMO_COBRA) => cellList(t.attacks.find((a) => a.state === 200)!.anim.cells);
    expect(jab(CAMO_COBRA)).toEqual([10, 11, 12, 13, 14]);
    expect(jab(FROST_OWL)).toEqual([13, 14, 15, 16, 17]); // three frames more after his guard
    const backFist = (t: typeof CAMO_COBRA) => cellList(t.attacks.find((a) => a.state === 1000)!.anim.cells)[0];
    expect([backFist(CAMO_COBRA), backFist(KILLER_BEE), backFist(SPOTTED_HYENA)]).toEqual([372, 372, 372]);
    const win = (t: typeof CAMO_COBRA) => cellList(t.anims.find((a) => a.action === 180)!.cells)[0];
    expect([win(CAMO_COBRA), win(KILLER_BEE), win(FROST_OWL), win(SPOTTED_HYENA)]).toEqual([786, 785, 791, 788]);
  });

  it("scale Rhivan's hand-measured boxes to their own height", () => {
    const box = (t: typeof CAMO_COBRA) => t.attacks.find((a) => a.state === 200)!.hits[0]!.box!;
    expect(box(CAMO_COBRA)).toEqual([40, -95, 70, -78]);
    expect(box(KILLER_BEE)).toEqual([27, -65, 48, -53]); // 72 pixels tall against his 106
  });
});
