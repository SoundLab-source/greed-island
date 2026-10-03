import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readPng, writePng } from "../art/png.ts";
import { readSff } from "../art/sff.ts";
import { sheetCells } from "../art/sheet.ts";
import { templateFiles } from "./build.ts";
import { artFromGuide, communityFiles, engineText, GUIDE_BOX, guideImage, guideLayout, GuideError, quantize, sampleArt, MAX_ART_COLORS } from "./guide.ts";
import { TEMPLATES } from "./index.ts";
import { fighterNumbers, templateFindings } from "./limits.ts";
import { tinySheet, tinySpec } from "./templates.test.ts";

const who = { id: "gi-sub-7", name: "Iron Heron", credit: "Art: Pixel Monks (submission #7)" };

describe("guide sheets", () => {
  it("fits every template's frames on one sheet, within the submission image limit", () => {
    for (const t of TEMPLATES) {
      const l = guideLayout(t);
      expect(l.box).toEqual(GUIDE_BOX);
      expect(l.cells.length).toBeGreaterThan(180);
      expect(new Set(l.cells).size).toBe(l.cells.length);
      expect(l.cells).toContain(t.portrait.cell);
      expect(l.width).toBeLessThanOrEqual(4096);
      expect(l.height).toBeLessThanOrEqual(4096);
      expect(l.columns * l.rows).toBeGreaterThanOrEqual(l.cells.length);
    }
  });

  it("draws every frame faded in its box, with the ground line and the ground point", () => {
    const spec = tinySpec();
    const layout = guideLayout(spec);
    expect(layout).toMatchObject({ cells: [0, 1, 2, 3], columns: 4, rows: 1, width: 160, height: 60 });
    const png = readPng(guideImage(spec, sheetCells(tinySheet(), spec.art.stray), layout));
    const px = (x: number, y: number) => [...png.pixels.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    expect(png).toMatchObject({ width: 160, height: 60, colorType: 6 });
    expect(px(17, 30)).toEqual([200, 100, 50, 110]); // box 1's body, faded
    expect(px(40 + 30, 22)).toEqual([200, 100, 50, 110]); // box 2's fist
    expect(px(5, 58)).toEqual([120, 170, 230, 255]); // the ground line
    expect(px(20, 58)).toEqual([0, 160, 0, 255]); // the ground point
    expect(px(30, 30)[3]).toBe(0); // transparent elsewhere
  });

  it("reads a sheet drawn on the guide back into the same frames", () => {
    const spec = tinySpec();
    const source = sheetCells(tinySheet(), spec.art.stray);
    const art = artFromGuide(spec, readPng(sampleArt(spec, source, guideLayout(spec))));
    for (const c of [0, 1, 2, 3]) {
      const a = art.cell(c), b = source.cell(c);
      expect(a.width).toBe(b.width);
      expect([...a.pixels].map((v) => v > 0)).toEqual([...b.pixels].map((v) => v > 0));
    }
    expect([...art.palette.subarray(3, 6)]).toEqual([200, 100, 50]);
  });

  it("builds a community fighter: the template's moves and reach with the new art, its own name and one palette", () => {
    const spec = tinySpec();
    const source = sheetCells(tinySheet(), spec.art.stray);
    const page = readPng(sampleArt(spec, source, guideLayout(spec), ([r, g, b]) => [b, g, r]));
    const out = communityFiles(spec, page, who);
    expect([...out.files.keys()].sort()).toEqual(["card.png", "gi-states.cns", "gi-sub-7.def", "gi.air", "gi.cmd", "gi.cns", "gi.sff", "numbers.json"]);
    const def = out.files.get("gi-sub-7.def")!.toString("latin1");
    expect(def).toContain('name = "Iron Heron"');
    expect(def).toContain("; Art: Pixel Monks (submission #7)");
    expect(def).toContain("pal.defaults = 1");
    const sff = readSff(out.files.get("gi.sff")!);
    expect(sff.palettes).toHaveLength(1);
    expect([...sff.palettes[0]!.colors.subarray(3, 6)]).toEqual([50, 100, 200]); // recoloured
    // The same shapes reach just as far, so it's within the template's limits.
    const template = templateFiles(spec, tinySheet());
    const templateReach = new Map(JSON.parse(template.files.get("numbers.json")!.toString()).moves.map((m: { state: number; reach: number }) => [m.state, m.reach]));
    expect([...out.reach]).toEqual([...templateReach]);
    expect(templateFindings(fighterNumbers(spec, out.reach), fighterNumbers(spec, templateReach as Map<number, number>))).toEqual([]);
    expect(readPng(out.files.get("card.png")!).colorType).toBe(6);
  });

  it("says what to fix in a drawn sheet", () => {
    const spec = tinySpec();
    const layout = guideLayout(spec);
    const source = sheetCells(tinySheet(), spec.art.stray);
    const page = readPng(sampleArt(spec, source, layout));
    const problems = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        expect(e).toBeInstanceOf(GuideError);
        return (e as GuideError).problems;
      }
      throw new Error("no problems found");
    };
    expect(problems(() => artFromGuide(spec, { ...page, width: 100 })).join()).toMatch(/is 100x60 pixels, but the Brawler guide is 160x60/);
    const rgb = readPng(writePng({ width: 160, height: 60, colorType: 2, pixels: new Uint8Array(160 * 60 * 3) }));
    expect(problems(() => artFromGuide(spec, rgb))).toEqual([expect.stringMatching(/no transparent background/)]);
    const blank = page.pixels.slice();
    for (let y = 0; y < 60; y++) blank.fill(0, (y * 160 + 120) * 4, (y * 160 + 160) * 4); // box 4 rubbed out
    for (let y = 0; y < 60; y++) blank.set([255, 0, 0, 255], (y * 160 + 40) * 4); // a line on box 2's edge
    expect(problems(() => artFromGuide(spec, { ...page, pixels: blank }))).toEqual(["box 4 is empty: every box needs its frame", "the drawing touches the edge of box 2, so it would be cut off: keep each frame inside its box"]);
    // A punch drawn without its fist has nothing reaching out on its hit frame.
    const noFist = page.pixels.slice();
    for (let y = 0; y < 60; y++) noFist.fill(0, (y * 160 + 40 + 25) * 4, (y * 160 + 40 + 39) * 4);
    expect(problems(() => communityFiles(spec, { ...page, pixels: noFist }, who))).toEqual([
      "box 2 (the Jab as it hits): nothing reaches out past the move's first frame, so it can't hit anything; draw the strike reaching forward",
    ]);
  });
});

describe("engineText", () => {
  it("keeps typed names to plain text that can't break out of the engine's files", () => {
    expect(engineText('Iron "Heron"; name = x\nlife = 9')).toBe("Iron Heron name = x life = 9");
    expect(engineText("Café Ñandú")).toBe("Cafe Nandu");
    expect(engineText("🔥")).toBe("");
  });
});

describe("quantize", () => {
  it("keeps up to the limit exactly, most used first, and merges the rest into at most the limit", () => {
    const few = new Map([[0xff0000, 5], [0x00ff00, 9]]);
    expect(quantize(few, 4).palette).toEqual([0x00ff00, 0xff0000]);
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 0xffffff }), fc.integer({ min: 1, max: 50 })), { minLength: 1, maxLength: 600 }), fc.integer({ min: 1, max: MAX_ART_COLORS }), (entries, max) => {
        const counts = new Map(entries);
        const { palette, index } = quantize(counts, max);
        expect(palette.length).toBeLessThanOrEqual(max);
        expect(palette.length).toBeGreaterThan(0);
        for (const c of counts.keys()) {
          const i = index.get(c)!;
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(palette.length);
        }
        if (counts.size <= max) expect(new Set(palette)).toEqual(new Set(counts.keys()));
      }),
    );
  });
});
