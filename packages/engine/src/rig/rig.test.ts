import { describe, expect, it } from "vitest";
import { bounds } from "../art/sheet.ts";
import { templateFiles } from "../templates/build.ts";
import { ALL_ROUNDER } from "../templates/all-rounder.ts";
import { MARGIN_CALL, MARGIN_CALL_DESIGN } from "../templates/margin-call.ts";
import { checkSpec, cellList } from "../templates/spec.ts";
import { RIG_CELL } from "./fighter.ts";
import { person } from "./kit.ts";
import { STAND } from "./moves.ts";
import { checkDesign, designPalette, materialIndex, OUTLINE_INDEX, shades, type Design } from "./parts.ts";
import { renderPose } from "./render.ts";
import { blend, DEFAULT_PROPORTIONS, solve } from "./skeleton.ts";

const TINY: Design = {
  materials: { skin: "#d9a07a", hair: "#2b2018", eye: "#141018", top: "#3050a0", legs: "#303030" },
  ...person({ top: "top", legs: "legs" }),
};

describe("the skeleton", () => {
  it("points a punch straight ahead and keeps unset feet flat", () => {
    const b = solve({ lean: 0, armF: [90, 0], legF: [40, -60] }, DEFAULT_PROPORTIONS, { x: 0, y: 0 });
    const arm = b.upperArmF;
    expect(arm.end.x - arm.at.x).toBeCloseTo(DEFAULT_PROPORTIONS.upperArm);
    expect(arm.end.y - arm.at.y).toBeCloseTo(0);
    // The torso points straight up from the hip, the head above it.
    expect(b.torso.end.x).toBeCloseTo(0);
    expect(b.head.end.y).toBeLessThan(b.torso.end.y);
    // A flat foot points forward and level, whatever the leg does.
    expect(b.footF.end.y - b.footF.at.y).toBeCloseTo(0);
    expect(b.footF.end.x).toBeGreaterThan(b.footF.at.x);
  });

  it("leans forward with a positive lean and falls backwards with a positive rot", () => {
    const lean = solve({ lean: 30 }, DEFAULT_PROPORTIONS, { x: 0, y: 0 });
    expect(lean.torso.end.x).toBeGreaterThan(0);
    const fall = solve({ rot: 60, lean: 0 }, DEFAULT_PROPORTIONS, { x: 0, y: 0 });
    expect(fall.head.end.x).toBeLessThan(0);
  });

  it("blends halfway between two poses", () => {
    const mid = blend({ armF: [0, 0] }, { armF: [90, 40] }, 0.5);
    expect(mid.armF).toEqual([45, 20]);
  });
});

describe("drawing a pose", () => {
  it("sets the fighter down on the ground, or `air` pixels above it", () => {
    const { img } = renderPose(TINY, STAND, RIG_CELL);
    expect(bounds(img)!.y1).toBe(RIG_CELL.axis.y);
    const up = renderPose(TINY, { ...STAND, air: 25 }, RIG_CELL).img;
    expect(bounds(up)!.y1).toBe(RIG_CELL.axis.y - 25);
  });

  it("outlines every part and shades it in the material's tones", () => {
    const { img } = renderPose(TINY, STAND, RIG_CELL);
    const used = new Set(img.pixels);
    expect(used.has(OUTLINE_INDEX)).toBe(true);
    for (const tone of ["light", "mid", "dark"] as const) expect(used.has(materialIndex(TINY, "top", tone))).toBe(true);
    // Nothing outside the design's own colours.
    const max = 1 + Object.keys(TINY.materials).length * 3;
    for (const v of used) expect(v).toBeLessThanOrEqual(max);
  });

  it("refuses a pose that falls outside its cell", () => {
    expect(() => renderPose(TINY, { ...STAND, x: 400 }, RIG_CELL)).toThrow(/outside/);
  });

  it("makes three shades per material and catches unknown materials", () => {
    const s = shades("#808080");
    expect(s.mid).toBe("#808080");
    expect(parseInt(s.light.slice(1, 3), 16)).toBeGreaterThan(0x80);
    expect(parseInt(s.dark.slice(1, 3), 16)).toBeLessThan(0x80);
    const pal = designPalette(TINY);
    expect([...pal.subarray(materialIndex(TINY, "top", "mid") * 3, materialIndex(TINY, "top", "mid") * 3 + 3)]).toEqual([0x30, 0x50, 0xa0]);
    expect(checkDesign({ ...TINY, parts: { torso: { shapes: [{ kind: "ellipse", u: 0, v: 0, ru: 4, rv: 4, material: "gold" }] } } })).toEqual(["torso: unknown material gold"]);
  });
});

describe("Margin Call, the first rig fighter", () => {
  it("is a complete fighter on the Brawler's numbers", () => {
    expect(checkSpec(MARGIN_CALL)).toEqual([]);
    expect(checkDesign(MARGIN_CALL_DESIGN)).toEqual([]);
    expect(MARGIN_CALL.archetype).toBe("ALL_ROUNDER");
    expect(MARGIN_CALL.constants).toEqual(ALL_ROUNDER.constants);
    expect(MARGIN_CALL.palettes).toHaveLength(3);
    // Every base move keeps its timing and hits: only the pictures and names are his.
    for (const a of ALL_ROUNDER.attacks) {
      const m = MARGIN_CALL.attacks.find((x) => x.state === a.state)!;
      expect(m.anim.ticks).toEqual(a.anim.ticks);
      expect(cellList(m.anim.cells)).toHaveLength(cellList(a.anim.cells).length);
      expect(m.hits.map(({ box: _box, ...h }) => h)).toEqual(a.hits.map(({ box: _box, ...h }) => h));
      // Hitboxes from the striking bones, in front of him.
      for (const h of m.hits) expect(h.box![2]).toBeGreaterThan(MARGIN_CALL.constants.width[0]);
    }
    expect(MARGIN_CALL.attacks.find((a) => a.state === 1000)!.name).toBe("Cold Call");
  });

  it("builds without any downloaded art, and each move reaches about as far as the Brawler's AI expects", async () => {
    const sheet = await MARGIN_CALL.art.sheet!({ ikemenDir: "", repoRoot: "" });
    const out = templateFiles(MARGIN_CALL, sheet);
    expect(out.files.has("gi.sff")).toBe(true);
    expect(out.files.has("card.png")).toBe(true);
    const numbers = JSON.parse(out.files.get("numbers.json")!.toString()) as { moves: { state: number; reach: number | null }[] };
    for (const a of ALL_ROUNDER.attacks) {
      const reach = numbers.moves.find((m) => m.state === a.state)!.reach!;
      // Within 15% of where the AI likes to use it (the rush carries him much further, which is fine).
      expect(reach, a.name).toBeGreaterThanOrEqual(a.ai.range * 0.85);
      if (a.state !== 1000) expect(reach, a.name).toBeLessThanOrEqual(a.ai.range * 1.15);
    }
    // His effects (speed lines, the candle, the swoosh) are drawn but never hurtboxes.
    const effects = new Set(MARGIN_CALL.art.effects);
    expect(effects.size).toBeGreaterThan(0);
  }, 60_000);
});
