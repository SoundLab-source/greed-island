import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { actFile, fromOklab, mainColors, oklab, paletteAdjacency, recolorPalette } from "./recolor.ts";

/** An RGBA picture from a function of each pixel. */
function picture(width: number, height: number, at: (x: number, y: number) => [number, number, number, number?]): Uint8Array {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a = 255] = at(x, y);
    px.set([r, g, b, a], (y * width + x) * 4);
  }
  return px;
}
const rgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const hue = (c: number) => {
  const [, a, b] = oklab(c);
  return (Math.atan2(b, a) * 180) / Math.PI;
};

describe("oklab", () => {
  it("round-trips colours to within one step a channel", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffff }), (c) => {
        const back = fromOklab(oklab(c));
        for (const s of [16, 8, 0]) expect(Math.abs(((back >> s) & 255) - ((c >> s) & 255))).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe("mainColors", () => {
  it("leaves out a flat background and small accents, most used first", () => {
    // Teal background, a brown head, a bigger yellow body touching the bottom edge, small red eyes.
    const px = picture(100, 100, (x, y) => {
      if (Math.abs(y - 35) < 3 && (Math.abs(x - 42) < 3 || Math.abs(x - 58) < 3)) return [220, 30, 30];
      if ((x - 50) ** 2 + (y - 40) ** 2 < 22 ** 2) return [120, 75, 40];
      if (y > 62 && Math.abs(x - 50) < 35) return [235, 200, 40];
      return [40, 170, 160];
    });
    expect(mainColors(px, 100, 100)).toEqual([rgb(235, 200, 40), rgb(120, 75, 40)]);
  });

  it("leaves out a gradient background too, and transparent pixels", () => {
    const px = picture(120, 120, (x, y) => ((x - 60) ** 2 + (y - 70) ** 2 < 40 ** 2 ? [130, 60, 170] : [240 - y, 120 + y / 2, 160 + y / 2]));
    expect(mainColors(px, 120, 120)).toEqual([rgb(130, 60, 170)]);
    const clear = picture(40, 40, (x) => (x > 10 && x < 30 ? [200, 30, 30] : [0, 0, 0, 0]));
    expect(mainColors(clear, 40, 40)).toEqual([rgb(200, 30, 30)]);
    expect(mainColors(picture(4, 4, () => [0, 0, 0, 0]), 4, 4)).toEqual([]);
  });

  it("takes a picture that's all one colour as that colour", () => {
    expect(mainColors(picture(30, 30, () => [10, 90, 200]), 30, 30)).toEqual([rgb(10, 90, 200)]);
  });
});

describe("recolorPalette", () => {
  // Two ramps: reds (indices 1-4, drawn most) and blues (5-8), plus a near-black outline (9) and a kept slot (240).
  const palette = new Uint8Array(768);
  const reds = [[90, 20, 20], [150, 40, 40], [200, 60, 60], [240, 120, 120]];
  const blues = [[20, 30, 90], [40, 60, 150], [70, 100, 210], [140, 170, 240]];
  [...reds, ...blues, [12, 10, 10]].forEach((c, i) => palette.set(c, (i + 1) * 3));
  palette.set([255, 0, 255], 240 * 3);
  // A sprite: a red area shaded in rings (dark at the edge, light in the middle, as pixel art shades a shape), a smaller
  // blue area beside it shaded the same way, an outline around both, and the kept colour in a corner.
  const W = 64, H = 40, SPLIT = 40;
  const sprite = { width: W, height: H, pixels: new Uint8Array(W * H) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || x === SPLIT;
      const ring = Math.min(3, Math.floor(Math.min(y - 1, H - 2 - y, x < SPLIT ? x - 1 : x - SPLIT - 1, x < SPLIT ? SPLIT - 1 - x : W - 2 - x) / 3));
      sprite.pixels[y * W + x] = edge ? 9 : (x < SPLIT ? 1 : 5) + ring;
    }
  }
  sprite.pixels[W + 1] = 240;
  const usage = new Array<number>(256).fill(0);
  for (const v of sprite.pixels) usage[v]!++;
  const adjacency = paletteAdjacency([sprite]);
  const at = (p: Uint8Array, i: number) => rgb(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);

  it("counts which colours are drawn side by side", () => {
    expect(adjacency.get(1 * 256 + 2)! > 50).toBe(true); // neighbouring red rings
    expect(adjacency.get(1 * 256 + 3)).toBeUndefined(); // never touch
    expect(adjacency.get(1 * 256 + 9)! > 0 && adjacency.get(5 * 256 + 9)! > 0).toBe(true); // both areas meet the outline
  });

  it("groups each area's shades, gives the most drawn area the first target and keeps its shading; other areas keep their colours", () => {
    const green = rgb(40, 180, 60);
    const out = recolorPalette({ palette, usage, adjacency, targets: [green], keep: new Set([240]) });
    for (const i of [1, 2, 3, 4]) expect(Math.abs(hue(at(out, i)) - hue(green))).toBeLessThan(8);
    const L = [1, 2, 3, 4].map((i) => oklab(at(out, i))[0]);
    expect(L).toEqual([...L].sort((a, b) => a - b)); // still dark to light
    for (const i of [5, 6, 7, 8, 240]) expect(at(out, i)).toBe(at(palette, i));
    expect(oklab(at(out, 9))[0]).toBeLessThan(0.3); // the outline stays dark
    expect(at(out, 0)).toBe(0);
  });

  it("gives the second group the second target, and leaves unused palette entries alone", () => {
    const out = recolorPalette({ palette, usage, adjacency, targets: [rgb(40, 180, 60), rgb(230, 200, 30)], keep: new Set([240]) });
    for (const i of [5, 6, 7, 8]) expect(Math.abs(hue(at(out, i)) - hue(rgb(230, 200, 30)))).toBeLessThan(15); // the darkest shade drifts a little as its colour fades
    expect(at(out, 100)).toBe(at(palette, 100));
    expect(recolorPalette({ palette, usage, adjacency, targets: [] })).toEqual(palette);
  });
});

describe("actFile", () => {
  it("writes 256 colours, last index first", () => {
    const p = Uint8Array.from({ length: 768 }, (_, i) => i % 251);
    const act = actFile(p);
    expect(act.length).toBe(768);
    expect([...act.subarray(0, 3)]).toEqual([...p.subarray(255 * 3, 256 * 3)]);
    expect([...act.subarray(255 * 3)]).toEqual([...p.subarray(0, 3)]);
  });
});
