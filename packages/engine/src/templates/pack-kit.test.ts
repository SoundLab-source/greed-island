import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writePng } from "../art/png.ts";
import { arcs, packHash, PackKit } from "./pack-kit.ts";

/** A strip of `n` square frames (size x size, RGBA): a red block with a blue "head" on its right, standing on the bottom row. */
function strip(n: number, size = 10): Buffer {
  const W = n * size;
  const px = new Uint8Array(W * size * 4);
  for (let k = 0; k < n; k++) {
    for (let y = 5; y < size; y++) for (let x = 2; x < 7; x++) px.set([200, 0, 0, 255], (y * W + k * size + x) * 4);
    px.set([0, 0, 200, 255], (5 * W + k * size + 7) * 4);
  }
  return writePng({ width: W, height: size, colorType: 6, pixels: px });
}

const dir = await mkdtemp(path.join(tmpdir(), "gi-pack-"));
afterAll(() => rm(dir, { recursive: true, force: true }));
await writeFile(path.join(dir, "idle.png"), strip(2));
await writeFile(path.join(dir, "run.png"), strip(3));
const strips = { idle: "idle.png", run: "run.png" };

const kit = async (body = { front: 3, back: 3, height: 5 }) =>
  new PackKit({ id: "test", strips, idle: "idle", body, sha256: await packHash(dir, strips), cell: { width: 20, height: 12, feet: { x: 8, y: 11 } }, scale: 2, localcoord: 320, fx: { 200: "#ffffff" }, credit: "test" });

describe("pixel pack kit", () => {
  it("gathers the strips' colours into one palette and measures the body from the idle frame", async () => {
    const k = await kit();
    const loaded = await k.load(dir);
    expect(Object.keys(loaded.frames)).toEqual(["idle", "run"]);
    expect(loaded.frames["run"]).toHaveLength(3);
    // Red and blue, slots 1 and 2; the effect colour in its slot.
    expect([...loaded.palette.subarray(3, 9)]).toEqual([200, 0, 0, 0, 0, 200]);
    expect([...loaded.palette.subarray(600, 603)]).toEqual([255, 255, 255]);
    expect(loaded.body).toEqual({ front: 3, back: 3, height: 5 });
  });

  it("refuses art whose body or digest isn't what the moves were written for", async () => {
    await expect((await kit({ front: 9, back: 3, height: 5 })).load(dir)).rejects.toThrow(/body/);
    const wrong = new PackKit({ ...(await kit()).art, sha256: "0".repeat(64) });
    await expect(wrong.load(dir)).rejects.toThrow(/digest/);
  });

  it("draws poses on the feet, mirrored, with effects, and scales cells up whole", async () => {
    const k = await kit();
    const stand = k.cell("stand", { s: "idle" });
    const back = k.cell("turned", { s: "idle", flip: true, fx: [(c) => arcs(c.img, c.x + 5, c.y - 3, 2, 1, 1, 200)] });
    expect(k.cell("stand", { s: "run" })).toBe(stand);
    const loaded = await k.load(dir);
    const img = k.draw(loaded, k.poses[stand]!);
    // Feet at (8, 11): the block from 2 left of them to 2 right, the head just in front.
    expect(img.pixels[10 * 20 + 6]).toBe(1);
    expect(img.pixels[6 * 20 + 10]).toBe(2);
    const turned = k.draw(loaded, k.poses[back]!);
    expect(turned.pixels[6 * 20 + 5]).toBe(2);
    expect(turned.pixels.includes(200)).toBe(true);
    const sheet = await k.sheet(dir);
    expect([sheet.cellWidth, sheet.cellHeight]).toEqual([40, 24]);
    expect(sheet.pixels[(10 * 2 + 1) * sheet.width + 6 * 2 + 1]).toBe(1);
    expect(k.box(1, -2, 3, 0)).toEqual([2, -4, 6, 0]);
    const art = k.source({});
    expect(art).toMatchObject({ axis: { x: 16, y: 22 }, columns: 10, rows: 1, effects: [200] });
  });
});
