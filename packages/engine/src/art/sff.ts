/**
 * IKEMEN/MUGEN sprite files (SFF version 2) with PNG8 sprites, the layout
 * IKEMEN GO v1.0.0 reads (vendor/Ikemen-GO src/image.go): a 512-byte header
 * (`SffHeader.Read`, :1482), 28-byte sprite nodes (`readHeaderV2`, :1112),
 * 16-byte palette nodes (`loadPalettes`, :2069) and a literal data block
 * holding the palettes (4 bytes per colour, `ReadPalette`, :2145) and the
 * sprite data. Format 10 sprite data is a 4-byte length then a palette PNG
 * whose pixel indices are used with the SFF palette (`readV2`, :1358).
 * Version 2.0.0.0: index 0 is transparent and every other colour opaque.
 * `readSff` reads any SFF the engine does: version 1 too, and every palette
 * sprite format.
 */
import { readPng, writePng } from "./png.ts";
import type { IndexedImage } from "./sheet.ts";

export interface SffSprite {
  group: number;
  number: number;
  image: IndexedImage;
  /** The axis: where the character's position falls, from the image's top-left corner. */
  axisX: number;
  axisY: number;
  /** Index into `palettes` (usually 0, the character's palette 1,1). */
  palette: number;
}

export interface SffPalette {
  group: number;
  number: number;
  /** RGB triples, at most 256. */
  colors: Uint8Array;
}

const HEADER = 512;
const SPRITE_NODE = 28;
const PALETTE_NODE = 16;
const FORMAT_PNG8 = 10;

function u16(n: number, what: string): number {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`${what} ${n} does not fit in 16 bits`);
  return n;
}

function i16(n: number, what: string): number {
  if (!Number.isInteger(n) || n < -0x8000 || n > 0x7fff) throw new Error(`${what} ${n} does not fit in 16 bits`);
  return n;
}

export function writeSff(sprites: readonly SffSprite[], palettes: readonly SffPalette[]): Buffer {
  if (palettes.length === 0) throw new Error("an SFF needs at least one palette");
  const seen = new Set<string>();
  for (const s of sprites) {
    const key = `${s.group},${s.number}`;
    if (seen.has(key)) throw new Error(`duplicate sprite ${key}`);
    seen.add(key);
    if (s.palette < 0 || s.palette >= palettes.length) throw new Error(`sprite ${key} uses a missing palette`);
  }
  const paletteData = palettes.map((p) => {
    if (p.colors.length === 0 || p.colors.length % 3 !== 0 || p.colors.length > 768) throw new Error(`palette ${p.group},${p.number} needs 1-256 RGB colours`);
    const out = Buffer.alloc((p.colors.length / 3) * 4);
    for (let i = 0; i < p.colors.length / 3; i++) {
      out[i * 4] = p.colors[i * 3]!;
      out[i * 4 + 1] = p.colors[i * 3 + 1]!;
      out[i * 4 + 2] = p.colors[i * 3 + 2]!;
    }
    return out;
  });
  const spriteData = sprites.map((s) => {
    const { width, height, pixels } = s.image;
    const pal = palettes[s.palette]!.colors;
    const png = writePng({ width, height, colorType: 3, pixels, palette: pal });
    const length = Buffer.alloc(4);
    length.writeUInt32LE(width * height);
    return Buffer.concat([length, png]);
  });

  const spriteNodes = HEADER;
  const paletteNodes = spriteNodes + sprites.length * SPRITE_NODE;
  const ldata = paletteNodes + palettes.length * PALETTE_NODE;
  const blocks: Buffer[] = [];
  let offset = 0;
  const place = (b: Buffer) => {
    const at = offset;
    blocks.push(b);
    offset += b.length;
    return at;
  };
  const paletteOffsets = paletteData.map(place);
  const spriteOffsets = spriteData.map(place);
  const ldataLength = offset;

  const header = Buffer.alloc(HEADER);
  header.write("ElecbyteSpr\0", 0, "latin1");
  header.set([0, 0, 0, 2], 12); // verlo3, verlo2, verlo1, verhi: 2.0.0.0
  header.set([0, 0, 0, 2], 24); // compatible version
  header.writeUInt32LE(spriteNodes, 36);
  header.writeUInt32LE(sprites.length, 40);
  header.writeUInt32LE(paletteNodes, 44);
  header.writeUInt32LE(palettes.length, 48);
  header.writeUInt32LE(ldata, 52);
  header.writeUInt32LE(ldataLength, 56);
  header.writeUInt32LE(ldata + ldataLength, 60); // tdata (unused, empty)
  header.writeUInt32LE(0, 64);

  const sNodes = Buffer.alloc(sprites.length * SPRITE_NODE);
  sprites.forEach((s, i) => {
    const o = i * SPRITE_NODE;
    const key = `sprite ${s.group},${s.number}`;
    sNodes.writeUInt16LE(u16(s.group, `${key} group`), o);
    sNodes.writeUInt16LE(u16(s.number, `${key} number`), o + 2);
    sNodes.writeUInt16LE(u16(s.image.width, `${key} width`), o + 4);
    sNodes.writeUInt16LE(u16(s.image.height, `${key} height`), o + 6);
    sNodes.writeInt16LE(i16(s.axisX, `${key} axis x`), o + 8);
    sNodes.writeInt16LE(i16(s.axisY, `${key} axis y`), o + 10);
    sNodes.writeUInt16LE(0, o + 12); // linked sprite (none)
    sNodes[o + 14] = FORMAT_PNG8;
    sNodes[o + 15] = 8; // colour depth
    sNodes.writeUInt32LE(spriteOffsets[i]!, o + 16);
    sNodes.writeUInt32LE(spriteData[i]!.length, o + 20);
    sNodes.writeUInt16LE(s.palette, o + 24);
    sNodes.writeUInt16LE(0, o + 26); // flags: literal data
  });
  const pNodes = Buffer.alloc(palettes.length * PALETTE_NODE);
  palettes.forEach((p, i) => {
    const o = i * PALETTE_NODE;
    pNodes.writeUInt16LE(u16(p.group, "palette group"), o);
    pNodes.writeUInt16LE(u16(p.number, "palette number"), o + 2);
    pNodes.writeUInt16LE(p.colors.length / 3, o + 4);
    pNodes.writeUInt16LE(0, o + 6); // linked palette (none)
    pNodes.writeUInt32LE(paletteOffsets[i]!, o + 8);
    pNodes.writeUInt32LE(paletteData[i]!.length, o + 12);
  });
  return Buffer.concat([header, sNodes, pNodes, ...blocks]);
}

export interface ReadSff {
  /** 1 (old MUGEN: PCX sprites) or 2. */
  version: 1 | 2;
  sprites: SffSprite[];
  /**
   * Version 2: the file's palettes. Version 1 has no palette list: each
   * sprite that carries its own palette adds one (group 0, numbered in
   * order), and sprites sharing a palette point at the same entry. A
   * character's colours then come from its .act files (`readAct`), which
   * replace palette 0 (the one its first sprite uses).
   */
  palettes: SffPalette[];
  /** Sprites that couldn't be read as palette sprites (true-colour PNGs, raw RGB), as "group,number". */
  skipped: string[];
}

const FORMAT_RAW = 0, FORMAT_RLE8 = 2, FORMAT_RLE5 = 3, FORMAT_LZ5 = 4;

/**
 * Read an SFF file: version 2 with any palette format (raw, RLE8, RLE5, LZ5,
 * PNG8) and version 1 (PCX), following IKEMEN GO v1.0.0's reader
 * (vendor/Ikemen-GO src/image.go: `loadSff` :1618, `Sprite.read` :998 for
 * version 1, `readV2` :1311 and the decoders `Rle8Decode` :1162,
 * `Rle5Decode` :1190, `Lz5Decode` :1234, `RlePcxDecode` :964). A sprite of
 * length 0 is a copy of an earlier one (`shareCopy`). The first of two
 * sprites with the same number wins, as in the engine.
 */
export function readSff(bytes: Uint8Array): ReadSff {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 32 || b.toString("latin1", 0, 12) !== "ElecbyteSpr\0") throw new Error("not an SFF file");
  const version = b[15];
  if (version === 1) return readV1(b);
  if (version === 2) return readV2(b);
  throw new Error(`SFF version ${version} is not supported`);
}

function addSprite(out: ReadSff, seen: Set<string>, s: SffSprite) {
  const key = `${s.group},${s.number}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.sprites.push(s);
}

function readV2(b: Buffer): ReadSff {
  const spriteNodes = b.readUInt32LE(36), spriteCount = b.readUInt32LE(40);
  const paletteNodes = b.readUInt32LE(44), paletteCount = b.readUInt32LE(48);
  const ldata = b.readUInt32LE(52), tdata = b.readUInt32LE(60);
  const palettes: SffPalette[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const o = paletteNodes + i * PALETTE_NODE;
    const group = b.readUInt16LE(o), number = b.readUInt16LE(o + 2), link = b.readUInt16LE(o + 6);
    const at = ldata + b.readUInt32LE(o + 8), size = b.readUInt32LE(o + 12);
    if (size === 0 && link < palettes.length) {
      palettes.push({ group, number, colors: palettes[link]!.colors });
      continue;
    }
    const colors = new Uint8Array((size >> 2) * 3);
    for (let c = 0; c < size >> 2; c++) colors.set(b.subarray(at + c * 4, at + c * 4 + 3), c * 3);
    palettes.push({ group, number, colors });
  }
  const out: ReadSff = { version: 2, sprites: [], palettes, skipped: [] };
  const seen = new Set<string>();
  const byIndex: (SffSprite | undefined)[] = [];
  for (let i = 0; i < spriteCount; i++) {
    const o = spriteNodes + i * SPRITE_NODE;
    const group = b.readUInt16LE(o), number = b.readUInt16LE(o + 2);
    const width = b.readUInt16LE(o + 4), height = b.readUInt16LE(o + 6);
    const axisX = b.readInt16LE(o + 8), axisY = b.readInt16LE(o + 10);
    const link = b.readUInt16LE(o + 12), format = b[o + 14]!, depth = b[o + 15]!;
    const size = b.readUInt32LE(o + 20), palette = b.readUInt16LE(o + 24), flags = b.readUInt16LE(o + 26);
    const at = (flags & 1 ? tdata : ldata) + b.readUInt32LE(o + 16);
    let sprite: SffSprite | undefined;
    if (size === 0) {
      const src = link < i ? byIndex[link] : undefined;
      if (src) sprite = { ...src, group, number, axisX, axisY };
    } else {
      const pixels = decodeV2(b, at, size, format, depth, width, height);
      if (pixels) sprite = { group, number, image: { width, height, pixels }, axisX, axisY, palette };
    }
    byIndex.push(sprite);
    if (sprite) addSprite(out, seen, sprite);
    else out.skipped.push(`${group},${number}`);
  }
  return out;
}

function decodeV2(b: Buffer, at: number, size: number, format: number, depth: number, width: number, height: number): Uint8Array | undefined {
  const n = width * height;
  if (format === FORMAT_RAW) return depth === 8 ? Uint8Array.from(b.subarray(at, at + size)) : undefined;
  const data = b.subarray(at + 4, at + Math.max(4, size));
  if (format === FORMAT_RLE8) return rle8(data, n);
  if (format === FORMAT_RLE5) return rle5(data, n);
  if (format === FORMAT_LZ5) return lz5(data, n);
  if (format === FORMAT_PNG8) {
    const png = readPng(data);
    if (png.colorType !== 3 || png.width !== width || png.height !== height) return undefined;
    return png.pixels;
  }
  return undefined; // 11 and 12: true-colour PNGs
}

function readV1(b: Buffer): ReadSff {
  const count = b.readUInt32LE(20);
  let shofs = b.readUInt32LE(24);
  const out: ReadSff = { version: 1, sprites: [], palettes: [], skipped: [] };
  const seen = new Set<string>();
  const byIndex: (SffSprite | undefined)[] = [];
  let prevPalette = -1;
  for (let i = 0; i < count && shofs + 32 <= b.length; i++) {
    const next = b.readUInt32LE(shofs), size = b.readUInt32LE(shofs + 4);
    const axisX = b.readInt16LE(shofs + 8), axisY = b.readInt16LE(shofs + 10);
    const group = b.readUInt16LE(shofs + 12), number = b.readUInt16LE(shofs + 14);
    const link = b.readUInt16LE(shofs + 16), samePalette = b[shofs + 18] !== 0;
    const offset = shofs + 32;
    let sprite: SffSprite | undefined;
    if (size === 0) {
      const src = link < i ? byIndex[link] : undefined;
      if (src) sprite = { ...src, group, number, axisX, axisY };
    } else {
      const first = prevPalette < 0 || (group === 0 && number === 0);
      const pcx = readPcx(b, offset, size, next, first, samePalette && prevPalette >= 0);
      if (pcx) {
        let palette = prevPalette;
        if (pcx.colors) palette = out.palettes.push({ group: 0, number: out.palettes.length, colors: pcx.colors }) - 1;
        prevPalette = palette;
        sprite = { group, number, image: pcx.image, axisX, axisY, palette: Math.max(0, palette) };
      }
    }
    byIndex.push(sprite);
    if (sprite) addSprite(out, seen, sprite);
    else out.skipped.push(`${group},${number}`);
    if (next <= shofs) break;
    shofs = next;
  }
  return out;
}

/** One version 1 sprite: a PCX image, its palette at the end unless it shares the previous one. */
function readPcx(b: Buffer, offset: number, size: number, next: number, first: boolean, samePalette: boolean) {
  if (offset + 128 > b.length) return undefined;
  const encoding = b[offset + 2], bpp = b[offset + 3];
  if (bpp !== 8) return undefined;
  const width = b.readUInt16LE(offset + 8) - b.readUInt16LE(offset + 4) + 1;
  const height = b.readUInt16LE(offset + 10) - b.readUInt16LE(offset + 6) + 1;
  const bpl = b.readUInt16LE(offset + 66);
  const start = offset + 128;
  let paletteAt: number, end: number;
  if (first) {
    // The engine's legacy rule for a character's first sprite (and its 0,0): the whole block is picture data, and
    // its palette (unless it shares the previous one) is the block's last 768 bytes.
    const datasize = next > offset ? next - offset : size;
    paletteAt = samePalette ? -1 : offset + datasize - 768;
    end = offset + datasize;
  } else {
    const blockEnd = next > offset ? next : offset + size;
    if (samePalette) {
      paletteAt = -1;
      end = blockEnd;
    } else {
      paletteAt = blockEnd - 769;
      for (let pos = blockEnd - 769; pos >= start; pos--) if (b[pos] === 0x0c) { paletteAt = pos; break; }
      end = paletteAt;
      paletteAt += 1;
    }
  }
  const data = b.subarray(start, Math.max(start, Math.min(end, b.length)));
  const pixels = encoding === 1 ? pcxRle(data, width, height, bpl) : Uint8Array.from(data.subarray(0, width * height));
  const colors = paletteAt >= 0 && paletteAt + 768 <= b.length ? Uint8Array.from(b.subarray(paletteAt, paletteAt + 768)) : undefined;
  return { image: { width, height, pixels }, colors: samePalette ? undefined : colors };
}

function pcxRle(rle: Uint8Array, width: number, height: number, bpl: number): Uint8Array {
  const p = new Uint8Array(width * height);
  if (rle.length === 0 || bpl <= 0) return p;
  let i = 0, j = 0, k = 0;
  const step = () => { if (i < rle.length - 1) i++; };
  while (j < p.length) {
    let n = 1, d = rle[i]!;
    step();
    if (d >= 0xc0) { n = d & 0x3f; d = rle[i]!; step(); }
    for (; n > 0; n--) {
      if (k < width && j < p.length) p[j++] = d;
      k++;
      if (k === bpl) { k = 0; n = 1; }
    }
  }
  return p;
}

function rle8(rle: Uint8Array, size: number): Uint8Array {
  const p = new Uint8Array(size);
  if (rle.length === 0) return p;
  let i = 0, j = 0;
  const step = () => { if (i < rle.length - 1) i++; };
  while (j < p.length) {
    let n = 1, d = rle[i]!;
    step();
    if ((d & 0xc0) === 0x40) { n = d & 0x3f; d = rle[i]!; step(); }
    for (; n > 0; n--) if (j < p.length) p[j++] = d;
  }
  return p;
}

function rle5(rle: Uint8Array, size: number): Uint8Array {
  const p = new Uint8Array(size);
  if (rle.length === 0) return p;
  let i = 0, j = 0;
  const step = () => { if (i < rle.length - 1) i++; };
  while (j < p.length) {
    let rl = rle[i]!;
    step();
    let dl = rle[i]! & 0x7f;
    let c = 0;
    if (rle[i]! >> 7 !== 0) { step(); c = rle[i]!; }
    step();
    for (;;) {
      if (j < p.length) p[j++] = c;
      rl--;
      if (rl < 0) {
        dl--;
        if (dl < 0) break;
        c = rle[i]! & 0x1f;
        rl = rle[i]! >> 5;
        step();
      }
    }
  }
  return p;
}

function lz5(rle: Uint8Array, size: number): Uint8Array {
  const p = new Uint8Array(size);
  if (rle.length === 0) return p;
  let i = 0, j = 0, n = 0;
  const step = () => { if (i < rle.length - 1) i++; };
  let ct = rle[i]!, cts = 0, rb = 0, rbc = 0;
  step();
  while (j < p.length) {
    let d = rle[i]!;
    step();
    if (ct & (1 << cts)) {
      if ((d & 0x3f) === 0) {
        d = ((d << 2) | rle[i]!) + 1;
        step();
        n = rle[i]! + 2;
        step();
      } else {
        rb = (rb | ((d & 0xc0) >> rbc)) & 0xff;
        rbc += 2;
        n = d & 0x3f;
        if (rbc < 8) {
          d = rle[i]! + 1;
          step();
        } else {
          d = rb + 1;
          rb = 0;
          rbc = 0;
        }
      }
      for (;;) {
        if (j < p.length) { p[j] = j - d >= 0 ? p[j - d]! : 0; j++; }
        n--;
        if (n < 0) break;
      }
    } else {
      if ((d & 0xe0) === 0) {
        n = rle[i]! + 8;
        step();
      } else {
        n = d >> 5;
        d &= 0x1f;
      }
      for (; n > 0; n--) if (j < p.length) p[j++] = d;
    }
    cts++;
    if (cts >= 8) {
      ct = rle[i]!;
      cts = 0;
      step();
    }
  }
  return p;
}

/**
 * A MUGEN .act palette: 256 RGB triples stored last colour first, so the
 * file's first triple is colour 255 (IKEMEN `readActPalette`, image.go:613).
 */
export function readAct(bytes: Uint8Array): Uint8Array {
  const colors = new Uint8Array(768);
  const count = Math.min(256, Math.floor(bytes.length / 3));
  for (let i = 0; i < count; i++) colors.set(bytes.subarray(i * 3, i * 3 + 3), (255 - i) * 3);
  return colors;
}
