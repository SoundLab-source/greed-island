/**
 * IKEMEN/MUGEN sprite files (SFF version 2) with PNG8 sprites, the layout
 * IKEMEN GO v1.0.0 reads (vendor/Ikemen-GO src/image.go): a 512-byte header
 * (`SffHeader.Read`, :1482), 28-byte sprite nodes (`readHeaderV2`, :1112),
 * 16-byte palette nodes (`loadPalettes`, :2069) and a literal data block
 * holding the palettes (4 bytes per colour, `ReadPalette`, :2145) and the
 * sprite data. Format 10 sprite data is a 4-byte length then a palette PNG
 * whose pixel indices are used with the SFF palette (`readV2`, :1358).
 * Version 2.0.0.0: index 0 is transparent and every other colour opaque.
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
  sprites: SffSprite[];
  palettes: SffPalette[];
}

/** Read back an SFF v2 file of PNG8 sprites (what `writeSff` makes), for tests and checks. */
export function readSff(bytes: Uint8Array): ReadSff {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString("latin1", 0, 12) !== "ElecbyteSpr\0") throw new Error("not an SFF file");
  if (b[15] !== 2) throw new Error(`SFF version ${b[15]} is not supported`);
  const spriteNodes = b.readUInt32LE(36), spriteCount = b.readUInt32LE(40);
  const paletteNodes = b.readUInt32LE(44), paletteCount = b.readUInt32LE(48);
  const ldata = b.readUInt32LE(52);
  const palettes: SffPalette[] = [];
  for (let i = 0; i < paletteCount; i++) {
    const o = paletteNodes + i * PALETTE_NODE;
    const at = ldata + b.readUInt32LE(o + 8), size = b.readUInt32LE(o + 12);
    const colors = new Uint8Array((size / 4) * 3);
    for (let c = 0; c < size / 4; c++) colors.set(b.subarray(at + c * 4, at + c * 4 + 3), c * 3);
    palettes.push({ group: b.readUInt16LE(o), number: b.readUInt16LE(o + 2), colors });
  }
  const sprites: SffSprite[] = [];
  for (let i = 0; i < spriteCount; i++) {
    const o = spriteNodes + i * SPRITE_NODE;
    if (b[o + 14] !== FORMAT_PNG8) throw new Error(`sprite ${i} is not PNG8`);
    const at = ldata + b.readUInt32LE(o + 16), size = b.readUInt32LE(o + 20);
    const png = readPng(b.subarray(at + 4, at + size));
    const width = b.readUInt16LE(o + 4), height = b.readUInt16LE(o + 6);
    if (png.width !== width || png.height !== height) throw new Error(`sprite ${i}: PNG size does not match its node`);
    sprites.push({
      group: b.readUInt16LE(o),
      number: b.readUInt16LE(o + 2),
      image: { width, height, pixels: png.pixels },
      axisX: b.readInt16LE(o + 8),
      axisY: b.readInt16LE(o + 10),
      palette: b.readUInt16LE(o + 24),
    });
  }
  return { sprites, palettes };
}
