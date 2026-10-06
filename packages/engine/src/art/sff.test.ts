import { describe, expect, it } from "vitest";
import { readAct, readSff } from "./sff.ts";

/** A version 2 file: one palette and the given sprites, each stored in `format` with `data` as its bytes. */
function v2File(sprites: { group: number; number: number; width: number; height: number; format: number; data: number[]; link?: number }[]): Buffer {
  const colors = Buffer.alloc(4 * 4);
  colors.set([0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0]);
  const blocks: Buffer[] = [colors];
  let at = colors.length;
  const nodes = Buffer.alloc(sprites.length * 28);
  sprites.forEach((s, i) => {
    // Compressed formats start with the uncompressed length; raw (0) doesn't.
    const body = Buffer.from(s.format === 0 ? s.data : [0, 0, 0, 0, ...s.data]);
    const o = i * 28;
    nodes.writeUInt16LE(s.group, o);
    nodes.writeUInt16LE(s.number, o + 2);
    nodes.writeUInt16LE(s.width, o + 4);
    nodes.writeUInt16LE(s.height, o + 6);
    nodes.writeInt16LE(1, o + 8);
    nodes.writeInt16LE(2, o + 10);
    nodes.writeUInt16LE(s.link ?? 0, o + 12);
    nodes[o + 14] = s.format;
    nodes[o + 15] = 8;
    nodes.writeUInt32LE(s.link === undefined ? at : 0, o + 16);
    nodes.writeUInt32LE(s.link === undefined ? body.length : 0, o + 20);
    if (s.link === undefined) {
      blocks.push(body);
      at += body.length;
    }
  });
  const header = Buffer.alloc(512);
  header.write("ElecbyteSpr\0", 0, "latin1");
  header.set([0, 1, 0, 2], 12);
  const paletteNode = Buffer.alloc(16);
  paletteNode.writeUInt16LE(1, 0);
  paletteNode.writeUInt16LE(1, 2);
  paletteNode.writeUInt16LE(4, 4);
  paletteNode.writeUInt32LE(0, 8);
  paletteNode.writeUInt32LE(colors.length, 12);
  header.writeUInt32LE(512, 36);
  header.writeUInt32LE(sprites.length, 40);
  header.writeUInt32LE(512 + nodes.length, 44);
  header.writeUInt32LE(1, 48);
  header.writeUInt32LE(512 + nodes.length + 16, 52);
  return Buffer.concat([header, nodes, paletteNode, ...blocks]);
}

/** A version 1 file of PCX sprites: each RLE-encoded, with its own palette or the previous one's, or a link to an earlier sprite. */
function v1File(sprites: { group: number; number: number; width: number; height: number; rle: number[]; palette?: number[]; link?: number }[]): Buffer {
  const parts: Buffer[] = [];
  const header = Buffer.alloc(512);
  header.write("ElecbyteSpr\0", 0, "latin1");
  header.set([0, 1, 0, 1], 12);
  header.writeUInt32LE(sprites.length, 20);
  header.writeUInt32LE(512, 24);
  header.writeUInt32LE(32, 28);
  parts.push(header);
  let offset = 512;
  sprites.forEach((s, i) => {
    let body = Buffer.alloc(0);
    if (s.link === undefined) {
      const pcx = Buffer.alloc(128);
      pcx.set([10, 5, 1, 8], 0);
      pcx.writeUInt16LE(s.width - 1, 8);
      pcx.writeUInt16LE(s.height - 1, 10);
      pcx.writeUInt16LE(s.width, 66);
      const pal = s.palette ? Buffer.concat([Buffer.from([0x0c]), Buffer.from(s.palette.concat(Array(768 - s.palette.length).fill(0)))]) : Buffer.alloc(0);
      body = Buffer.concat([pcx, Buffer.from(s.rle), pal]);
    }
    const sub = Buffer.alloc(32);
    const next = i === sprites.length - 1 ? 0 : offset + 32 + body.length;
    sub.writeUInt32LE(next, 0);
    sub.writeUInt32LE(body.length, 4);
    sub.writeInt16LE(3, 8);
    sub.writeInt16LE(4, 10);
    sub.writeUInt16LE(s.group, 12);
    sub.writeUInt16LE(s.number, 14);
    sub.writeUInt16LE(s.link ?? 0, 16);
    sub[18] = s.palette ? 0 : 1;
    parts.push(sub, body);
    offset += 32 + body.length;
  });
  return Buffer.concat(parts);
}

describe("reading other SFF files", () => {
  it("reads version 2 sprites in every palette format, and linked copies", () => {
    const bytes = v2File([
      { group: 0, number: 0, width: 3, height: 1, format: 0, data: [1, 2, 3] },
      // RLE8: 0x43 repeats the next byte 3 times; a byte under 0x40 is itself.
      { group: 1, number: 0, width: 2, height: 2, format: 2, data: [0x43, 2, 1] },
      // RLE5: a run of 3 of colour 3, then one packet of 2 of colour 1.
      { group: 2, number: 0, width: 5, height: 1, format: 3, data: [2, 0x81, 3, (1 << 5) | 1] },
      // LZ5: two RLE packets (1,1 then 2), then copy 3 from 3 back.
      { group: 3, number: 0, width: 3, height: 2, format: 4, data: [0x04, 0x41, 0x22, 0x02, 0x02] },
      { group: 4, number: 0, width: 3, height: 1, format: 0, data: [], link: 0 },
    ]);
    const sff = readSff(bytes);
    expect(sff.version).toBe(2);
    expect(sff.skipped).toEqual([]);
    const px = (g: number) => [...sff.sprites.find((s) => s.group === g)!.image.pixels];
    expect(px(0)).toEqual([1, 2, 3]);
    expect(px(1)).toEqual([2, 2, 2, 1]);
    expect(px(2)).toEqual([3, 3, 3, 1, 1]);
    expect(px(3)).toEqual([1, 1, 2, 1, 1, 2]);
    expect(px(4)).toEqual([1, 2, 3]);
    expect(sff.sprites[0]!.axisX).toBe(1);
    expect([...sff.palettes[0]!.colors.subarray(3, 6)]).toEqual([255, 0, 0]);
  });

  it("reads version 1 PCX sprites with their palettes", () => {
    const bytes = v1File([
      // 0xC3 repeats the next byte 3 times (PCX RLE).
      { group: 0, number: 0, width: 3, height: 2, rle: [0xc3, 5, 1, 2, 3], palette: [0, 0, 0, 10, 20, 30] },
      { group: 200, number: 1, width: 2, height: 1, rle: [0xc2, 1] },
      { group: 200, number: 2, width: 2, height: 1, rle: [4, 4], palette: [0, 0, 0, 9, 9, 9] },
      { group: 300, number: 0, width: 0, height: 0, rle: [], link: 1 },
    ]);
    const sff = readSff(bytes);
    expect(sff.version).toBe(1);
    expect(sff.sprites.map((s) => `${s.group},${s.number}`)).toEqual(["0,0", "200,1", "200,2", "300,0"]);
    expect([...sff.sprites[0]!.image.pixels]).toEqual([5, 5, 5, 1, 2, 3]);
    expect([sff.sprites[0]!.axisX, sff.sprites[0]!.axisY]).toEqual([3, 4]);
    expect([...sff.sprites[1]!.image.pixels]).toEqual([1, 1]);
    // The second shares the first's palette; the third has its own.
    expect(sff.sprites.map((s) => s.palette)).toEqual([0, 0, 1, 0]);
    expect([...sff.palettes[0]!.colors.subarray(3, 6)]).toEqual([10, 20, 30]);
    expect([...sff.palettes[1]!.colors.subarray(3, 6)]).toEqual([9, 9, 9]);
    expect([...sff.sprites[3]!.image.pixels]).toEqual([1, 1]);
  });

  it("reads .act palettes last colour first", () => {
    const act = new Uint8Array(768);
    act.set([1, 2, 3], 0); // colour 255
    act.set([7, 8, 9], 765); // colour 0
    const colors = readAct(act);
    expect([...colors.subarray(0, 3)]).toEqual([7, 8, 9]);
    expect([...colors.subarray(765, 768)]).toEqual([1, 2, 3]);
  });

  it("refuses what isn't an SFF", () => {
    expect(() => readSff(Buffer.alloc(64))).toThrow(/not an SFF/);
  });
});
