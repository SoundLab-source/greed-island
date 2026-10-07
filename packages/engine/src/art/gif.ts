/**
 * Animated GIFs as sprite sheets: some free fighter art is published as one
 * animated GIF of every frame (art/SOURCES.md). `readGif` decodes the frames
 * (LZW, transparency, frame disposal) onto the GIF's own canvas, and
 * `gifSheet` lays them out on a grid like any other palette sheet, frame n in
 * cell n, with the transparent colour moved to palette index 0 (IKEMEN draws
 * index 0 as transparent).
 */
import type { PngImage } from "./png.ts";

export interface Gif {
  width: number;
  height: number;
  /** The global colour table, RGB triples. */
  palette: Uint8Array;
  /** The palette index frames use for "nothing here", or -1. */
  transparent: number;
  /** Each frame as composed on the canvas: palette indices, `transparent` where nothing is drawn. */
  frames: Uint8Array[];
}

/**
 * Decode an animated GIF. With one global palette, frames keep its indices. When frames bring palettes of their own
 * (or there's no global one), every colour is gathered by its RGB into one palette instead, index 0 kept for
 * "nothing here" (`transparent`), and refused past 255 colours.
 */
export function readGif(bytes: Uint8Array): Gif {
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") throw new Error("not a GIF");
  const u16 = (o: number) => bytes[o]! | (bytes[o + 1]! << 8);
  const width = u16(6), height = u16(8), flags = bytes[10]!;
  let p = 13;
  const globalTable = flags & 0x80 ? bytes.slice(p, p + 3 * 2 ** ((flags & 7) + 1)) : null;
  if (globalTable) p += globalTable.length;
  const merged = !globalTable || hasLocalTables(bytes, p);
  // Merged: colours by RGB, index 0 for nothing; otherwise the global table as it is.
  const colours = new Map<number, number>();
  const mergedPalette: number[] = [255, 0, 255];
  const toMerged = (table: Uint8Array) => {
    const map = new Int16Array(table.length / 3);
    for (let i = 0; i < map.length; i++) {
      const rgb = (table[i * 3]! << 16) | (table[i * 3 + 1]! << 8) | table[i * 3 + 2]!;
      let n = colours.get(rgb);
      if (n === undefined) {
        n = colours.size + 1;
        if (n > 255) throw new Error("GIF: more than 255 colours across its frames' palettes");
        colours.set(rgb, n);
        mergedPalette.push(table[i * 3]!, table[i * 3 + 1]!, table[i * 3 + 2]!);
      }
      map[i] = n;
    }
    return map;
  };
  const globalMap = merged && globalTable ? toMerged(globalTable) : null;
  const frames: Uint8Array[] = [];
  const BLANK = -1;
  let canvas = new Int16Array(width * height).fill(BLANK);
  let frameTransparent = -1, disposal = 0, transparent = merged ? 0 : -1;
  while (p < bytes.length) {
    const block = bytes[p++]!;
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[p++]!;
      if (label === 0xf9) {
        const f = bytes[p + 1]!;
        disposal = (f >> 2) & 7;
        frameTransparent = f & 1 ? bytes[p + 4]! : -1;
        if (frameTransparent >= 0 && !merged) {
          if (transparent >= 0 && transparent !== frameTransparent) throw new Error("GIF frames use different transparent colours");
          transparent = frameTransparent;
        }
      }
      while (bytes[p]) p += bytes[p]! + 1;
      p++;
      continue;
    }
    if (block !== 0x2c) throw new Error(`GIF: unknown block ${block} at byte ${p - 1}`);
    const x = u16(p), y = u16(p + 2), w = u16(p + 4), h = u16(p + 6), f = bytes[p + 8]!;
    p += 9;
    let map = globalMap;
    if (f & 0x80) {
      const local = bytes.slice(p, p + 3 * 2 ** ((f & 7) + 1));
      p += local.length;
      map = toMerged(local);
    }
    if (f & 0x40) throw new Error("interlaced GIF frames aren't supported");
    if (merged && !map) throw new Error("GIF: a frame with no palette");
    const minCode = bytes[p++]!;
    const chunks: Uint8Array[] = [];
    while (bytes[p]) { chunks.push(bytes.subarray(p + 1, p + 1 + bytes[p]!)); p += bytes[p]! + 1; }
    p++;
    const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let o = 0;
    for (const c of chunks) { data.set(c, o); o += c.length; }
    const pixels = lzwDecode(data, minCode, w * h);
    const before = disposal === 3 ? canvas.slice() : null;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = pixels[j * w + i]!;
        if (v !== frameTransparent && x + i < width && y + j < height) canvas[(y + j) * width + x + i] = map ? map[v]! : v;
      }
    }
    const frame = new Uint8Array(width * height);
    const empty = transparent >= 0 ? transparent : 0;
    for (let i = 0; i < frame.length; i++) frame[i] = canvas[i] === BLANK ? empty : canvas[i]!;
    frames.push(frame);
    if (disposal === 2) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) canvas[(y + j) * width + x + i] = BLANK;
    else if (before) canvas = before;
  }
  const palette = merged ? Uint8Array.from(mergedPalette) : globalTable!;
  return { width, height, palette, transparent, frames };
}

/** Whether any image in the GIF (from byte `p`, after the header and global table) brings its own palette. */
function hasLocalTables(bytes: Uint8Array, p: number): boolean {
  while (p < bytes.length) {
    const block = bytes[p++]!;
    if (block === 0x3b) return false;
    if (block === 0x21) {
      p++;
      while (bytes[p]) p += bytes[p]! + 1;
      p++;
      continue;
    }
    if (block !== 0x2c) return false;
    const f = bytes[p + 8]!;
    if (f & 0x80) return true;
    p += 10;
    while (bytes[p]) p += bytes[p]! + 1;
    p++;
  }
  return false;
}

/** GIF image data: variable-width LZW codes, least significant bit first. */
function lzwDecode(data: Uint8Array, minCode: number, size: number): Uint8Array {
  const out = new Uint8Array(size);
  const clear = 1 << minCode, end = clear + 1;
  // Each code's string is its prefix code plus its last byte; strings are written out back to front.
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), length = new Int32Array(4096);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; length[i] = 1; }
  let next = end + 1, codeSize = minCode + 1, prev = -1, o = 0, bit = 0;
  const total = data.length * 8;
  const emit = (code: number) => {
    const n = length[code]!;
    let c = code;
    for (let k = n - 1; k >= 0; k--) { if (o + k < size) out[o + k] = suffix[c]!; c = prefix[c]!; }
    o += n;
  };
  const first = (code: number) => { let c = code; while (prefix[c]! >= 0) c = prefix[c]!; return suffix[c]!; };
  while (bit + codeSize <= total && o < size) {
    let code = 0;
    for (let i = 0; i < codeSize; i++) if (data[(bit + i) >> 3]! & (1 << ((bit + i) & 7))) code |= 1 << i;
    bit += codeSize;
    if (code === clear) { next = end + 1; codeSize = minCode + 1; prev = -1; continue; }
    if (code === end) break;
    if (prev < 0) { emit(code); prev = code; continue; }
    if (code < next) {
      if (next < 4096) { prefix[next] = prev; suffix[next] = first(code); length[next] = length[prev]! + 1; next++; }
      emit(code);
    } else {
      if (next < 4096) { prefix[next] = prev; suffix[next] = first(prev); length[next] = length[prev]! + 1; next++; }
      emit(next - 1);
    }
    if (next === 1 << codeSize && codeSize < 12) codeSize++;
    prev = code;
  }
  return out;
}

/** A GIF's frames on a grid, `columns` to a row (frame n in cell n), as a palette PNG image with the transparent colour at index 0. */
export function gifSheet(gif: Gif, columns: number): PngImage & { rows: number } {
  const t = gif.transparent >= 0 ? gif.transparent : 0;
  const colours = gif.palette.length / 3;
  const palette = gif.palette.slice();
  if (t !== 0) {
    palette.set(gif.palette.subarray(t * 3, t * 3 + 3), 0);
    palette.set(gif.palette.subarray(0, 3), t * 3);
  }
  const swap = (v: number) => (v === t ? 0 : v === 0 ? t : v);
  const rows = Math.ceil(gif.frames.length / columns);
  const W = columns * gif.width;
  const pixels = new Uint8Array(W * rows * gif.height);
  gif.frames.forEach((f, k) => {
    const ox = (k % columns) * gif.width, oy = Math.floor(k / columns) * gif.height;
    for (let y = 0; y < gif.height; y++) for (let x = 0; x < gif.width; x++) pixels[(oy + y) * W + ox + x] = swap(f[y * gif.width + x]!);
  });
  const alpha = new Uint8Array(colours).fill(255);
  alpha[0] = 0;
  return { width: W, height: rows * gif.height, colorType: 3, pixels, palette, alpha, rows };
}
