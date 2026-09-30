import { describe, expect, it } from "vitest";
import { writeAir } from "./air.ts";
import { hitbox, hurtboxes } from "./clsn.ts";
import { readPng, writePng } from "./png.ts";
import { readSff, writeSff } from "./sff.ts";
import { bounds, cell, cleanStrays, crop, scale, type IndexedImage, type Sheet } from "./sheet.ts";

function image(width: number, height: number, fill: (x: number, y: number) => number): IndexedImage {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = fill(x, y);
  return { width, height, pixels };
}

const PALETTE = Uint8Array.from({ length: 16 * 3 }, (_, i) => (i * 37) % 256);

describe("png", () => {
  it("round-trips palette images, keeping the indices", () => {
    const img = image(7, 5, (x, y) => (x + y) % 16);
    const back = readPng(writePng({ ...img, colorType: 3, palette: PALETTE }));
    expect(back.colorType).toBe(3);
    expect([back.width, back.height]).toEqual([7, 5]);
    expect(Buffer.from(back.pixels)).toEqual(Buffer.from(img.pixels));
    expect(Buffer.from(back.palette!)).toEqual(Buffer.from(PALETTE));
  });

  it("round-trips RGBA images (written with the sub filter)", () => {
    const pixels = Uint8Array.from({ length: 4 * 3 * 4 }, (_, i) => (i * 53) % 256);
    const back = readPng(writePng({ width: 4, height: 3, colorType: 6, pixels }));
    expect(Buffer.from(back.pixels)).toEqual(Buffer.from(pixels));
  });

  it("rejects files that aren't PNGs", () => {
    expect(() => readPng(Buffer.from("hello, world"))).toThrow(/not a PNG/);
  });
});

describe("sheet", () => {
  const sheet: Sheet = {
    ...image(6, 4, (x, y) => 1 + (y >= 2 ? 3 : 0) + Math.floor(x / 2)),
    palette: new Uint8Array(768),
    cellWidth: 2,
    cellHeight: 2,
    columns: 3,
    rows: 2,
  };

  it("cuts cells left to right, then top to bottom", () => {
    expect([...cell(sheet, 0).pixels]).toEqual([1, 1, 1, 1]);
    expect([...cell(sheet, 2).pixels]).toEqual([3, 3, 3, 3]);
    expect([...cell(sheet, 4).pixels]).toEqual([5, 5, 5, 5]);
    expect(() => cell(sheet, 6)).toThrow(/outside/);
  });

  it("repaints stray pixels with their neighbours' colour, or clears them", () => {
    const body = image(5, 5, (x, y) => (x === 2 && y === 2 ? 9 : x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 4 : 0));
    const lone = image(5, 5, (x, y) => (x === 0 && y === 0 ? 9 : 0));
    expect(cleanStrays(body, new Set([9])).pixels[12]).toBe(4);
    expect(cleanStrays(lone, new Set([9])).pixels[0]).toBe(0);
  });

  it("finds bounds, crops and scales", () => {
    const img = image(6, 6, (x, y) => (x >= 2 && x < 5 && y >= 1 && y < 3 ? 7 : 0));
    const b = bounds(img)!;
    expect(b).toEqual({ x0: 2, y0: 1, x1: 5, y1: 3 });
    expect(crop(img, b).pixels.every((v) => v === 7)).toBe(true);
    expect(bounds(image(3, 3, () => 0))).toBeNull();
    const big = scale(image(2, 1, (x) => x + 1), 4, 2);
    expect([...big.pixels]).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });
});

describe("sff", () => {
  it("writes a version 2 file that reads back the same", () => {
    const a = image(3, 2, (x) => x);
    const b = image(2, 4, (x, y) => (x + y) % 3);
    const palettes = [
      { group: 1, number: 1, colors: PALETTE },
      { group: 1, number: 2, colors: PALETTE.map((v) => 255 - v) },
    ];
    const bytes = writeSff(
      [
        { group: 0, number: 0, image: a, axisX: 1, axisY: 2, palette: 0 },
        { group: 200, number: 3, image: b, axisX: -5, axisY: 40, palette: 0 },
      ],
      palettes,
    );
    expect(bytes.toString("latin1", 0, 12)).toBe("ElecbyteSpr\0");
    expect([...bytes.subarray(12, 16)]).toEqual([0, 0, 0, 2]);
    expect(bytes.readUInt32LE(36)).toBe(512); // first sprite node right after the header
    expect(bytes.readUInt32LE(40)).toBe(2);
    expect(bytes.readUInt32LE(44)).toBe(512 + 2 * 28);
    expect(bytes.readUInt32LE(48)).toBe(2);
    const back = readSff(bytes);
    expect(back.sprites.map((s) => [s.group, s.number, s.axisX, s.axisY, s.image.width, s.image.height])).toEqual([
      [0, 0, 1, 2, 3, 2],
      [200, 3, -5, 40, 2, 4],
    ]);
    expect(Buffer.from(back.sprites[1]!.image.pixels)).toEqual(Buffer.from(b.pixels));
    expect(Buffer.from(back.palettes[1]!.colors)).toEqual(Buffer.from(palettes[1]!.colors));
  });

  it("refuses duplicate sprites and values that don't fit", () => {
    const a = image(1, 1, () => 1);
    const pal = [{ group: 1, number: 1, colors: PALETTE }];
    expect(() => writeSff([{ group: 0, number: 0, image: a, axisX: 0, axisY: 0, palette: 0 }, { group: 0, number: 0, image: a, axisX: 0, axisY: 0, palette: 0 }], pal)).toThrow(/duplicate/);
    expect(() => writeSff([{ group: 0, number: 0, image: a, axisX: 40000, axisY: 0, palette: 0 }], pal)).toThrow(/16 bits/);
    expect(() => writeSff([{ group: 0, number: 0, image: a, axisX: 0, axisY: 0, palette: 1 }], pal)).toThrow(/missing palette/);
  });
});

describe("air", () => {
  it("writes actions with per-frame boxes and a loop start", () => {
    const text = writeAir([
      {
        action: 200,
        frames: [
          { group: 200, number: 0, ticks: 3, clsn2: [[-10, -80, 10, 0]] },
          { group: 200, number: 1, ticks: 4, clsn2: [[-10, -80, 10, 0]], clsn1: [[10, -60, 40, -50]] },
          { group: 200, number: 2, ticks: -1, flip: "H" },
        ],
        loopStart: 2,
      },
    ]);
    expect(text).toBe(
      [
        "[Begin Action 200]",
        "Clsn2: 1",
        "  Clsn2[0] = -10, -80, 10, 0",
        "200,0, 0,0, 3",
        "Clsn2: 1",
        "  Clsn2[0] = -10, -80, 10, 0",
        "Clsn1: 1",
        "  Clsn1[0] = 10, -60, 40, -50",
        "200,1, 0,0, 4",
        "Loopstart",
        "200,2, 0,0, -1, H",
        "",
      ].join("\n"),
    );
    expect(() => writeAir([{ action: 1, frames: [] }])).toThrow(/no frames/);
    expect(() => writeAir([{ action: 1, frames: [{ group: 0, number: 0, ticks: 0 }] }])).toThrow(/bad ticks/);
  });
});

describe("collision boxes", () => {
  // A 40x60 "fighter" standing on the axis at (20, 60), 10 wide.
  const axis = { x: 20, y: 60 };
  const body = (x: number, y: number) => x >= 15 && x < 25 && y >= 10 && y < 60;
  const stance = image(40, 60, (x, y) => (body(x, y) ? 1 : 0));
  // The same fighter with an arm reaching out to x = 38 at shoulder height.
  const punch = image(40, 60, (x, y) => (body(x, y) || (x >= 25 && x < 38 && y >= 20 && y < 24) ? 1 : 0));

  it("hurtboxes cover the drawn pixels in bands", () => {
    const boxes = hurtboxes(stance, axis, 2, 10);
    expect(boxes).toEqual([
      [-5, -50, 5, -25],
      [-5, -25, 5, 0],
    ]);
  });

  it("the hitbox is the part that reaches past the starting pose", () => {
    expect(hitbox(punch, stance, axis, { margin: 2, minPixels: 5 })).toEqual([7, -40, 18, -36]);
    expect(hitbox(stance, stance, axis, { margin: 2, minPixels: 5 })).toBeNull();
  });
});
