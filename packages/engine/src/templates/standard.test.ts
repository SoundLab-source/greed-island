import { describe, expect, it } from "vitest";
import { readSff } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { buildTemplateArt, OWN_SPRITE_OFFSET } from "./art.ts";
import { HOUSE_FIGHTERS, TEMPLATES } from "./index.ts";
import { headDirection, headPoint, missingStandard, REQUIRED_STANDARD, reservedGroups, rotateImage, standardSprites, waistPoint } from "./standard.ts";

/** A stick figure: a 5x5 head on top of a 3-wide body, 30 tall, in a 20x40 image. */
function figure(): IndexedImage {
  const width = 20, height = 40, pixels = new Uint8Array(width * height);
  for (let y = 5; y < 35; y++) for (let x = 8; x < 11; x++) pixels[y * width + x] = 1;
  for (let y = 5; y < 10; y++) for (let x = 7; x < 12; x++) pixels[y * width + x] = 2;
  return { width, height, pixels };
}

describe("standard get-hit sprites", () => {
  it("every fighter's art has all of them", () => {
    for (const spec of [...TEMPLATES, ...HOUSE_FIGHTERS]) expect(missingStandard(spec.art.standardSprites), spec.id).toEqual([]);
    expect(REQUIRED_STANDARD).toHaveLength(23);
  });

  it("turns a picture clockwise", () => {
    const bar: IndexedImage = { width: 1, height: 3, pixels: Uint8Array.from([1, 2, 3]) };
    const drawn = (img: IndexedImage) => [...img.pixels].filter((v) => v !== 0);
    // Upright 1-2-3 (top to bottom) turned a quarter clockwise reads 3-2-1 left to right.
    expect(drawn(rotateImage(bar, 90))).toEqual([3, 2, 1]);
    expect(drawn(rotateImage(bar, 180))).toEqual([3, 2, 1]);
    expect(drawn(rotateImage(bar, -90))).toEqual([1, 2, 3]);
  });

  it("finds the waist in the middle of the body and the head near its end", () => {
    const img = figure();
    const waist = waistPoint(img);
    expect(waist.x).toBe(9);
    expect(waist.y).toBeGreaterThan(15);
    expect(waist.y).toBeLessThan(22);
    const head = headPoint(img, "up");
    expect(head.x).toBe(9);
    expect(head.y).toBe(5 + Math.round(30 * 0.18));
    // Lying on its back with the head to the left (the figure turned a quarter anticlockwise).
    const lying = rotateImage(img, -90);
    const h = headPoint(lying, "left");
    expect(lying.pixels[h.y * lying.width + h.x]).not.toBe(0);
    expect(h.x).toBeLessThan(waistPoint(lying).x);
  });

  it("knows which way the head points in each pose", () => {
    expect(headDirection(5000, 20)).toBe("up");
    expect(headDirection(5030, 0)).toBe("up");
    expect(headDirection(5030, 30)).toBe("left");
    expect(headDirection(5030, 50)).toBe("down");
    expect(headDirection(5040, 10)).toBe("left");
    expect(headDirection(5060, 10)).toBe("down");
    expect(headDirection(5070, 20)).toBe("right");
  });

  it("adds a waist and a head copy for each family, and grounds turned poses", () => {
    const img = figure();
    const sprites = standardSprites({ "5000,0": 0, "5020,0": 0, "5070,20": { cell: 0, rotate: 90 } }, () => img, { x: 9, y: 35 });
    expect(sprites.map((s) => `${s.group},${s.number}`)).toEqual(["5000,0", "5001,0", "5002,0", "5020,0", "5070,20", "5071,20", "5072,20"]);
    const [feet, waist, head] = sprites;
    expect([feet!.axisX, feet!.axisY]).toEqual([2, 30]); // the sheet's ground point in the trimmed picture
    expect(waist!.image).toBe(feet!.image);
    expect(head!.axisY).toBeLessThan(waist!.axisY);
    const flat = sprites[4]!;
    expect(flat.image.width).toBeGreaterThan(flat.image.height); // lying, head forward
    expect([flat.axisX, flat.axisY]).toEqual([Math.round(flat.image.width / 2), flat.image.height]);
    expect(sprites[6]!.axisX).toBeGreaterThan(sprites[5]!.axisX); // the head is forward of the waist
  });

  it("keeps a fighter's own animations off the standard sprite numbers", () => {
    const spec = TEMPLATES[0]!;
    expect(reservedGroups(spec.art.standardSprites).has(5001)).toBe(true);
    // Built on a blank sheet with one figure in every cell the template uses.
    const cells = new Map<number, IndexedImage>();
    const source = { palette: new Uint8Array(768), cellWidth: 20, cellHeight: 40, cell: (i: number) => cells.get(i) ?? cells.set(i, figure()).get(i)! };
    const art = buildTemplateArt({ ...spec, art: { ...spec.art, axis: { x: 9, y: 35 } }, attacks: [], throws: [] }, source);
    const keys = new Set(readSff(art.sff).sprites.map((s) => `${s.group},${s.number}`));
    for (const k of REQUIRED_STANDARD) for (const d of k.startsWith("5020") ? [0] : [0, 1, 2]) {
      const [g, n] = k.split(",").map(Number) as [number, number];
      expect(keys.has(`${g + d},${n}`), `${g + d},${n}`).toBe(true);
    }
    // "Hit high, medium" (action 5001) draws its own frames (15000,n and 15001,n), not the waist copies.
    const hitMedium = art.actions.find((a) => a.action === 5001)!;
    expect(hitMedium.frames.map((f) => f.group)).toEqual([5000, 5000, 5001].map((g) => g + OWN_SPRITE_OFFSET));
  });
});
