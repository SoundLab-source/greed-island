import { describe, expect, it } from "vitest";
import { readPng, writePng } from "../art/png.ts";
import { templateFiles } from "./build.ts";
import { lookFiles, LOOK_PALETTE_FILE } from "./look.ts";
import { tinySheet, tinySpec } from "./templates.test.ts";

/** A made-up NFT picture: a green figure on a flat blue background. */
function nft() {
  const px = new Uint8Array(40 * 40 * 4);
  for (let i = 0; i < 40 * 40; i++) px.set(i % 40 > 12 && i % 40 < 28 && i > 40 * 10 ? [40, 180, 60, 255] : [30, 60, 200, 255], i * 4);
  return readPng(writePng({ width: 40, height: 40, colorType: 6, pixels: px }));
}

describe("NFT looks on a fighter's sprites", () => {
  const spec = tinySpec();
  const built = templateFiles(spec, tinySheet());
  const fighter = { dir: spec.id, def: built.files.get(`${spec.id}.def`)!.toString("latin1"), sff: built.files.get("gi.sff")!, palette: 1 };

  it("writes a .def that uses the fighter's files with the look's palette as colour 1", () => {
    const out = lookFiles("gi-look-1", fighter, nft());
    expect([...out.files.keys()].sort()).toEqual(["card.png", "gi-look-1.def", LOOK_PALETTE_FILE]);
    const def = out.files.get("gi-look-1.def")!.toString("latin1");
    expect(def).toMatch(/^\[Files\]\npal1 = look\.act$/m);
    expect(def).toContain(`sprite = ../${spec.id}/gi.sff`);
    expect(def).toContain(`st = ../${spec.id}/gi-states.cns`);
    expect(def).toContain("stcommon = common1.cns"); // the engine's own, found in data/
    expect(def).toMatch(/^\[Info\]\npal\.defaults = 1$/m);
    expect(def.match(/pal\.defaults/g)).toHaveLength(1);
    expect(out.colors).toEqual(["#28b43c"]); // the figure's green; the blue background is left out
  });

  it("recolours the drawn colour in the NFT's colour, in an ACT file (last index first)", () => {
    const out = lookFiles("gi-look-1", fighter, nft());
    const act = out.files.get(LOOK_PALETTE_FILE)!;
    expect(act.length).toBe(768);
    const [r, g, b] = act.subarray((255 - 1) * 3, (255 - 1) * 3 + 3);
    expect(g! > r! && g! > b!).toBe(true); // index 1 (the sheet's one colour) is green now
    const card = readPng(out.files.get("card.png")!);
    expect(card.colorType).toBe(6);
    const drawn = [...Array(card.width * card.height).keys()].find((i) => card.pixels[i * 4 + 3] === 255)!;
    expect([...card.pixels.subarray(drawn * 4, drawn * 4 + 3)]).toEqual([r, g, b]);
  });

  it("refuses what it can't do", () => {
    expect(() => lookFiles("gi-look-1", { ...fighter, palette: 9 }, nft())).toThrow(/no colour 9/);
    expect(() => lookFiles("gi-look-1", { ...fighter, dir: "../kfm" }, nft())).toThrow(/own characters/);
    expect(() => lookFiles("../x", fighter, nft())).toThrow(/own characters/);
    expect(() => lookFiles("gi-look-1", { ...fighter, def: fighter.def.replace("sprite = gi.sff", "sprite = ../../x.sff") }, nft())).toThrow(/isn't in its own folder/);
    const clear = readPng(writePng({ width: 4, height: 4, colorType: 6, pixels: new Uint8Array(64) }));
    expect(() => lookFiles("gi-look-1", fighter, clear)).toThrow(/no colours/);
  });
});
