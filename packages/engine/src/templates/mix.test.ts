import { describe, expect, it } from "vitest";
import type { CellSource } from "../art/sheet.ts";
import { MIX_FIRST_SLOT, lookCells, mixLooks, mixSlots } from "./mix.ts";
import { checkSpec, type ArtSource } from "./spec.ts";
import { tinySpec } from "./templates.test.ts";

const art = (localcoord: number, axis: { x: number; y: number }): ArtSource => ({
  id: "t", file: "t.png", sha256: "", cellWidth: 8, cellHeight: 8, columns: 1, rows: 1, axis, stray: [], localcoord, credit: "", standardSprites: {},
});

/** One 8x8 cell drawn by `paint`, with colour n = (n, n, n). */
function source(paint: (x: number, y: number) => number): CellSource {
  const pixels = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pixels[y * 8 + x] = paint(x, y);
  const palette = new Uint8Array(768);
  for (let n = 0; n < 256; n++) palette.set([n, n, n], n * 3);
  return { palette, cellWidth: 8, cellHeight: 8, cell: () => ({ width: 8, height: 8, pixels }) };
}

describe("mixLooks", () => {
  // A body of colour 5 in columns 2-5; the part model has "hair" (colour 53) on its top row and a shirt (25) below.
  const body = source((x) => (x >= 2 && x <= 5 ? 5 : 0));
  const other = source((x, y) => (x >= 2 && x <= 5 ? (y === 0 ? 53 : 25) : 0));

  it("pastes only the part's indices, into their own palette slots", () => {
    const mixed = mixLooks(body, art(320, { x: 4, y: 7 }), [{ art: art(320, { x: 4, y: 7 }), indices: [53], cells: other }]);
    const img = mixed.cell(0);
    expect([...img.pixels.subarray(0, 8)]).toEqual([0, 0, MIX_FIRST_SLOT, MIX_FIRST_SLOT, MIX_FIRST_SLOT, MIX_FIRST_SLOT, 0, 0]);
    expect([...img.pixels.subarray(8, 16)]).toEqual([0, 0, 5, 5, 5, 5, 0, 0]); // the shirt isn't part of the look
    expect([...mixed.palette.subarray(MIX_FIRST_SLOT * 3, MIX_FIRST_SLOT * 3 + 3)]).toEqual([53, 53, 53]);
    expect([...mixed.palette.subarray(5 * 3, 5 * 3 + 3)]).toEqual([5, 5, 5]); // the base's own colours stay
  });

  it("scales the part to the base model's size around the feet, and nudges it", () => {
    // The part model drawn at half the base's size (localcoord 160 against 320) is scaled up twice to match: base
    // row y shows part row (y - 7) / 2 + 7, so the part's row 5 covers base rows 2-3; nudged down a row, rows 3-4.
    const tall = source((_x, y) => (y === 5 ? 53 : 0));
    const rows = (img: { pixels: Uint8Array }) => [...Array(8).keys()].filter((y) => img.pixels.subarray(y * 8, y * 8 + 8).includes(MIX_FIRST_SLOT));
    const half = mixLooks(body, art(320, { x: 4, y: 7 }), [{ art: art(160, { x: 4, y: 7 }), indices: [53], cells: tall }]);
    expect(rows(half.cell(0))).toEqual([2, 3]);
    const nudged = mixLooks(body, art(320, { x: 4, y: 7 }), [{ art: art(160, { x: 4, y: 7 }), indices: [53], cells: tall, nudge: { y: 1 } }]);
    expect(rows(nudged.cell(0))).toEqual([3, 4]);
  });

  it("gives each part's colours consecutive slots", () => {
    expect(mixSlots([{ art: art(320, { x: 0, y: 0 }), indices: [53, 54] }, { art: art(320, { x: 0, y: 0 }), indices: [9] }]).map((m) => [...m])).toEqual([
      [[53, MIX_FIRST_SLOT], [54, MIX_FIRST_SLOT + 1]],
      [[9, MIX_FIRST_SLOT + 2]],
    ]);
  });

  it("gives a fighter its looks from each part model's sheet, and checks the parts in the spec", () => {
    const base = tinySpec();
    const partArt = { ...base.art, id: "part" };
    const spec = { ...base, looks: [{ art: partArt, indices: [53] }] };
    const asked: string[] = [];
    const plain = lookCells(base, body, () => { throw new Error("no looks, no sheets"); });
    expect(plain).toBe(body);
    const mixed = lookCells(spec, body, (a) => (asked.push(a.id), other));
    expect(asked).toEqual(["part"]);
    expect(mixed.cell(0).pixels).toContain(MIX_FIRST_SLOT);
    expect(checkSpec(spec)).toEqual([]);
    expect(checkSpec({ ...spec, looks: [{ art: { ...partArt, rows: 1 }, indices: [0] }] })).toEqual([
      "look from part: its sheet isn't on this one's layout",
      "look from part: bad palette index 0",
    ]);
  });
});
