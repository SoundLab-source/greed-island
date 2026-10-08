import { describe, expect, it } from "vitest";
import { readSff } from "../art/sff.ts";
import { Canvas, hex, ridge } from "./draw.ts";
import { GROUND, HEIGHT, STAGES, stageFiles, stagePreview, WIDTH } from "./stages.ts";

describe("drawn stages", () => {
  it("ridges tile seamlessly", () => {
    const line = ridge(2560, 1, [[3, 50], [7, 20]]);
    expect(line(0)).toBeCloseTo(line(2560), 6);
  });

  it("a canvas keeps index 0 transparent and stops at 255 colours", () => {
    const c = new Canvas(4, 4);
    c.set(0, 0, hex("#ff0000"));
    expect(c.pixels[0]).toBe(1);
    expect(c.palette().length).toBe(6);
    for (let i = 0; i < 254; i++) c.index([i, 1, 2]);
    expect(() => c.index([255, 255, 254])).toThrow(/255 colours/);
  });

  it.each(STAGES.map((s) => [s.name, s] as const))("%s: a sprite and palette per layer, the floor at the ground line", (_name, design) => {
    const { sff, def } = stageFiles(design);
    const read = readSff(sff);
    const layers = design.draw();
    const sprites = layers.reduce((n, l) => n + 1 + (l.frames?.length ?? 0), 0);
    expect(read.sprites.length).toBe(sprites);
    expect(read.palettes.length).toBe(sprites);
    expect(def).toContain(`spr = ${design.id}.sff`);
    expect(def).toContain(`zoffset = ${GROUND}`);
    expect(def).toContain("localcoord = 1280, 720");
    expect(def).toContain(`[BG ${layers.length - 1}]`);
    expect(def).toContain(`start = 0, ${GROUND}`);
    expect(read.sprites[0]!.image.pixels.every((v) => v !== 0)).toBe(true); // the sky covers everything
  });

  it("writes moving parts as IKEMEN reads them (stage.go): animations, drift, bobbing, light, repeating both ways", () => {
    const frame = () => {
      const c = new Canvas(8, 8);
      c.set(1, 1, hex("#ffffff"));
      return c;
    };
    const design = {
      id: "gi-test",
      name: "Test",
      draw: () => [
        { canvas: frame(), y: 0, delta: [0, 0] as const, tile: false },
        { canvas: frame(), frames: [frame(), frame()], ticks: 5, y: 600, x: -2000, delta: [1, 1] as const, tile: true, tileSpacing: 4200, velocity: [2.4, 0] as const, bob: [5, 34] as const },
        { canvas: frame(), y: 10, delta: [0.8, 0.8] as const, tile: true, tileY: true, light: true },
      ],
    };
    const { sff, def } = stageFiles(design);
    expect(readSff(sff).sprites.map((s) => `${s.group},${s.number}`)).toEqual(["0,0", "1,0", "1,1", "1,2", "2,0"]);
    expect(def).toContain("[BG 1]\ntype = anim\nactionno = 101\nlayerno = 0\nstart = -2000, 600\ndelta = 1, 1\nmask = 1\ntile = 1, 0\ntilespacing = 4200, 0\nvelocity = 2.4, 0\nsin.y = 5, 34, 0\n");
    expect(def).toContain("[Begin Action 101]\n1,0, 0,0, 5\n1,1, 0,0, 5\n1,2, 0,0, 5\n");
    expect(def).toContain("[BG 2]\ntype = normal\nspriteno = 2, 0\nlayerno = 0\nstart = 0, 10\ndelta = 0.8, 0.8\nmask = 1\ntile = 1, 1\ntrans = add\n");
  });

  it("previews light added onto what's behind it", () => {
    const back = new Canvas(WIDTH, HEIGHT);
    back.fill(0, 0, WIDTH, HEIGHT, hex("#102030"));
    const light = new Canvas(WIDTH, HEIGHT);
    light.fill(0, 0, 10, 10, hex("#101010"));
    const px = stagePreview([{ canvas: back, y: 0, delta: [0, 0], tile: false }, { canvas: light, y: 0, delta: [0, 0], tile: false, light: true }]);
    expect([...px.subarray(0, 4)]).toEqual([0x20, 0x30, 0x40, 255]);
    expect([...px.subarray(40 * 4, 40 * 4 + 4)]).toEqual([0x10, 0x20, 0x30, 255]);
  });
});
