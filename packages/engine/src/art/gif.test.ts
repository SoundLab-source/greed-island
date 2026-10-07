import { describe, expect, it } from "vitest";
import { gifSheet, readGif } from "./gif.ts";

/** GIF LZW compression (the standard encoder), for building test files. */
function lzwEncode(pixels: number[], minCode: number): number[] {
  const clear = 1 << minCode, end = clear + 1;
  const out: number[] = [];
  let acc = 0, bits = 0, codeSize = minCode + 1;
  const put = (code: number) => {
    acc |= code << bits;
    bits += codeSize;
    while (bits >= 8) { out.push(acc & 0xff); acc >>= 8; bits -= 8; }
  };
  let dict = new Map<string, number>(), next = end + 1;
  put(clear);
  let w = String(pixels[0]);
  for (const k of pixels.slice(1)) {
    const wk = `${w},${k}`;
    if (dict.has(wk)) { w = wk; continue; }
    put(w.includes(",") ? dict.get(w)! : Number(w));
    if (next < 4096) {
      dict.set(wk, next++);
      if (next - 1 === 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      put(clear);
      dict = new Map();
      next = end + 1;
      codeSize = minCode + 1;
    }
    w = String(k);
  }
  put(w.includes(",") ? dict.get(w)! : Number(w));
  put(end);
  if (bits > 0) out.push(acc & 0xff);
  return out;
}

/** A GIF89a with a 4-colour global palette and the given frames (each: position, size, pixels), transparent colour 3. */
function makeGif(width: number, height: number, frames: { x: number; y: number; w: number; h: number; px: number[]; disposal?: number }[]): Uint8Array {
  const b: number[] = [...Buffer.from("GIF89a"), width & 0xff, width >> 8, height & 0xff, height >> 8, 0x81, 0, 0];
  b.push(0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255); // black, red, green, blue
  for (const f of frames) {
    b.push(0x21, 0xf9, 4, ((f.disposal ?? 1) << 2) | 1, 10, 0, 3, 0);
    b.push(0x2c, f.x & 0xff, f.x >> 8, f.y & 0xff, f.y >> 8, f.w & 0xff, f.w >> 8, f.h & 0xff, f.h >> 8, 0);
    const data = lzwEncode(f.px, 2);
    b.push(2);
    for (let i = 0; i < data.length; i += 255) { const c = data.slice(i, i + 255); b.push(c.length, ...c); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}

/** The same GIF, but each frame with a 4-colour palette of its own (given as RGB triples), and no global one. */
function makeLocalGif(width: number, height: number, frames: { px: number[]; table: number[] }[]): Uint8Array {
  const b: number[] = [...Buffer.from("GIF89a"), width & 0xff, width >> 8, height & 0xff, height >> 8, 0, 0, 0];
  for (const f of frames) {
    b.push(0x21, 0xf9, 4, (1 << 2) | 1, 10, 0, 3, 0);
    b.push(0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, 0x81, ...f.table);
    const data = lzwEncode(f.px, 2);
    b.push(2);
    for (let i = 0; i < data.length; i += 255) { const c = data.slice(i, i + 255); b.push(c.length, ...c); }
    b.push(0);
  }
  b.push(0x3b);
  return Uint8Array.from(b);
}

describe("readGif", () => {
  it("gathers frames' own palettes into one by colour, index 0 for nothing", () => {
    const red = [255, 0, 0], green = [0, 255, 0], blue = [0, 0, 255], spare = [9, 9, 9];
    const gif = readGif(makeLocalGif(2, 1, [
      { px: [1, 3], table: [...spare, ...red, ...green, ...spare] },
      { px: [2, 1], table: [...spare, ...blue, ...red, ...spare] },
    ]));
    expect(gif.transparent).toBe(0);
    // Red, then blue, in the order first used; colour 3 (transparent in each frame) is never drawn.
    expect([...gif.frames[0]!]).toEqual([2, 0]);
    expect([...gif.frames[1]!]).toEqual([2, 4]);
    expect([...gif.palette.subarray(6, 9)]).toEqual(red);
    expect([...gif.palette.subarray(12, 15)]).toEqual(blue);
  });

  it("composes frames on the canvas, keeping what a frame leaves transparent", () => {
    const gif = readGif(makeGif(2, 2, [
      { x: 0, y: 0, w: 2, h: 2, px: [1, 2, 3, 1] },
      { x: 1, y: 1, w: 1, h: 1, px: [2] },
    ]));
    expect(gif.width).toBe(2);
    expect(gif.transparent).toBe(3);
    expect([...gif.frames[0]!]).toEqual([1, 2, 3, 1]);
    expect([...gif.frames[1]!]).toEqual([1, 2, 3, 2]);
  });

  it("clears a frame's area when its disposal says so", () => {
    const gif = readGif(makeGif(2, 1, [
      { x: 0, y: 0, w: 2, h: 1, px: [1, 1], disposal: 2 },
      { x: 1, y: 0, w: 1, h: 1, px: [2] },
    ]));
    expect([...gif.frames[1]!]).toEqual([3, 2]);
  });

  it("decodes long compressed runs (codes growing past 9 bits)", () => {
    const px = Array.from({ length: 64 * 64 }, (_, i) => ((i * 7) ^ (i >> 5)) % 3);
    const gif = readGif(makeGif(64, 64, [{ x: 0, y: 0, w: 64, h: 64, px }]));
    expect([...gif.frames[0]!]).toEqual(px);
  });
});

describe("gifSheet", () => {
  it("lays frames out on a grid with the transparent colour at palette index 0", () => {
    const gif = readGif(makeGif(2, 2, [
      { x: 0, y: 0, w: 2, h: 2, px: [1, 2, 3, 1] },
      { x: 1, y: 1, w: 1, h: 1, px: [2] },
      { x: 0, y: 0, w: 1, h: 1, px: [0] },
    ]));
    const sheet = gifSheet(gif, 2);
    expect(sheet.rows).toBe(2);
    expect([sheet.width, sheet.height]).toEqual([4, 4]);
    // Blue (the transparent colour) and black swap places.
    expect([...sheet.palette!.subarray(0, 3)]).toEqual([0, 0, 255]);
    expect([...sheet.palette!.subarray(9, 12)]).toEqual([0, 0, 0]);
    expect(sheet.alpha![0]).toBe(0);
    // Row 0: frame 0 then frame 1; frame 2's black pixel is now index 3.
    expect([...sheet.pixels.subarray(0, 4)]).toEqual([1, 2, 1, 2]);
    expect([...sheet.pixels.subarray(4, 8)]).toEqual([0, 1, 0, 2]);
    expect(sheet.pixels[8]).toBe(3);
  });
});
