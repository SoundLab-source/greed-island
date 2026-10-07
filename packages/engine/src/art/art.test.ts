import fc from "fast-check";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { writeAir } from "./air.ts";
import { effectHitbox, hitbox, hurtboxes } from "./clsn.ts";
import { readPng, writePng } from "./png.ts";
import { readSff, writeSff } from "./sff.ts";
import { bounds, cell, cleanStrays, crop, scale, type IndexedImage, type Sheet } from "./sheet.ts";

function image(width: number, height: number, fill: (x: number, y: number) => number): IndexedImage {
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = fill(x, y);
  return { width, height, pixels };
}

const PALETTE = Uint8Array.from({ length: 16 * 3 }, (_, i) => (i * 37) % 256);

/** A PNG at any bit depth, interlaced or not, rows unfiltered: `samples` are raw values, `channels` per pixel. */
function encodePng(o: { width: number; height: number; colorType: number; depth: number; interlace: boolean; samples: number[]; trns?: number[] }): Buffer {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[o.colorType]!;
  const passes = o.interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows: number[] = [];
  for (const [x0, y0, dx, dy] of passes as [number, number, number, number][]) {
    const pw = Math.ceil((o.width - x0) / dx), ph = Math.ceil((o.height - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    for (let r = 0; r < ph; r++) {
      const row = new Uint8Array(Math.ceil((pw * channels * o.depth) / 8));
      let bit = 0;
      for (let i = 0; i < pw; i++) {
        for (let c = 0; c < channels; c++) {
          const v = o.samples[((y0 + r * dy) * o.width + x0 + i * dx) * channels + c]!;
          if (o.depth === 16) row.set([v >> 8, v & 255], bit / 8);
          else if (o.depth === 8) row[bit / 8] = v;
          else row[bit >> 3]! |= v << (8 - o.depth - (bit & 7));
          bit += o.depth;
        }
      }
      rows.push(0, ...row);
    }
  }
  const chunk = (kind: string, body: Uint8Array) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length);
    head.write(kind, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])));
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0);
  ihdr.writeUInt32BE(o.height, 4);
  ihdr.set([o.depth, o.colorType, 0, 0, o.interlace ? 1 : 0], 8);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (o.colorType === 3) parts.push(chunk("PLTE", Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256)));
  if (o.trns) parts.push(chunk("tRNS", Uint8Array.from(o.trns.flatMap((v) => [v >> 8, v & 255]))));
  parts.push(chunk("IDAT", deflateSync(Uint8Array.from(rows))), chunk("IEND", new Uint8Array(0)));
  return Buffer.concat(parts);
}

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

  it("reads every bit depth, interlaced or not, as 8-bit samples (palette indices stay indices)", () => {
    const kinds = [[0, 1], [0, 2], [0, 4], [0, 8], [0, 16], [2, 8], [2, 16], [3, 1], [3, 2], [3, 4], [3, 8], [4, 8], [4, 16], [6, 8], [6, 16]] as const;
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.boolean(), fc.integer({ min: 1, max: 19 }), fc.integer({ min: 1, max: 19 }), fc.integer(), ([colorType, depth], interlace, width, height, seed) => {
        const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
        const max = 2 ** depth - 1;
        const samples = Array.from({ length: width * height * channels }, (_, i) => Math.abs((seed + i * 7919) * 2654435761) % (max + 1));
        const png = readPng(encodePng({ width, height, colorType, depth, interlace, samples }));
        const want = samples.map((v) => (depth === 16 ? v >> 8 : depth === 8 || colorType === 3 ? v : Math.round((v * 255) / max)));
        expect(png).toMatchObject({ width, height, colorType });
        expect([...png.pixels]).toEqual(want);
      }),
      { numRuns: 200 },
    );
  });

  it("turns a grey or RGB image's transparent colour into an alpha channel", () => {
    const samples = [10, 20, 30, 1000, 2000, 3000, 10, 20, 30, 0, 0, 0];
    const png = readPng(encodePng({ width: 2, height: 2, colorType: 2, depth: 16, interlace: true, samples, trns: [1000, 2000, 3000] }));
    expect(png.colorType).toBe(6);
    expect([...png.pixels]).toEqual([0, 0, 0, 255, 3, 7, 11, 0, 0, 0, 0, 255, 0, 0, 0, 255]);
    const grey = readPng(encodePng({ width: 3, height: 1, colorType: 0, depth: 2, interlace: false, samples: [0, 3, 1], trns: [3] }));
    expect(grey.colorType).toBe(4);
    expect([...grey.pixels]).toEqual([0, 255, 255, 0, 85, 255]);
  });

  it("rejects files that aren't PNGs, and bit depths a colour type can't have", () => {
    expect(() => readPng(Buffer.from("hello, world"))).toThrow(/not a PNG/);
    expect(() => readPng(encodePng({ width: 1, height: 1, colorType: 2, depth: 4, interlace: false, samples: [1, 2, 3] }))).toThrow(/bit depth 4 for colour type 2/);
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

  it("passes over specks (a flame's embers) for the furthest part big enough", () => {
    const ember = image(40, 60, (x, y) => (punch.pixels[y * 40 + x] || (x === 39 && y === 5) ? 1 : 0));
    expect(hitbox(ember, stance, axis, { margin: 2, minPixels: 5 })).toEqual([7, -40, 18, -36]);
  });

  it("an attack drawn as an effect hits around all of the effect that reaches out", () => {
    // A sword trail (colour 9) in front, in two pieces, plus a fist (colour 1) that the effect box ignores.
    const slash = image(40, 60, (x, y) => (body(x, y) ? 1 : (x >= 27 && x < 34 && y >= 12 && y < 16) || (x >= 30 && x < 36 && y >= 30 && y < 33) ? 9 : 0));
    expect(effectHitbox(slash, stance, axis, new Set([9]), { margin: 2, minPixels: 5 })).toEqual([7, -48, 16, -27]);
    expect(effectHitbox(punch, stance, axis, new Set([9]), { margin: 2, minPixels: 5 })).toBeNull();
  });
});
