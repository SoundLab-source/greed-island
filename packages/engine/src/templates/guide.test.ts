import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readPng, writePng } from "../art/png.ts";
import { readSff } from "../art/sff.ts";
import { sheetCells } from "../art/sheet.ts";
import { templateFiles } from "./build.ts";
import { FACE_SIZES, PORTRAIT_PALETTE } from "./art.ts";
import { artFromGuide, communityFiles, engineText, GUIDE_BOX, guideCells, guideImage, guideLayout, GuideError, MAX_PORTRAIT_COLORS, POSE_GUIDE_FRAMES, poseGuideImage, portraitArt, quantize, sampleArt, MAX_ART_COLORS } from "./guide.ts";
import { TEMPLATES } from "./index.ts";
import { fighterNumbers, templateFindings } from "./limits.ts";
import { tinySheet, tinySpec } from "./templates.test.ts";

const who = { id: "gi-sub-7", name: "Iron Heron", credit: "Art: Pixel Monks (submission #7)" };

describe("guide sheets", () => {
  it("fits every template's frames on one sheet, within the submission image limit", () => {
    for (const t of TEMPLATES) {
      const l = guideLayout(t);
      expect(l.box).toEqual(GUIDE_BOX);
      expect(l.cells.length).toBeGreaterThan(170);
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
      "its sprite sheet: box 2 (the Jab as it hits): nothing reaches out past the move's first frame, so it can't hit anything; draw the strike reaching forward",
    ]);
  });
});

/** What a call throws as a GuideError's problems. */
function problemsOf(f: () => unknown): string[] {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(GuideError);
    return (e as GuideError).problems;
  }
  throw new Error("no problems found");
}

/** An RGBA picture from a function of each pixel. */
function picture(width: number, height: number, at: (x: number, y: number) => [number, number, number, number]) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(at(x, y), (y * width + x) * 4);
  return readPng(writePng({ width, height, colorType: 6, pixels }));
}

describe("alternate colour sheets", () => {
  const spec = tinySpec();
  const source = sheetCells(tinySheet(), spec.art.stray);
  const layout = guideLayout(spec);
  const page = readPng(sampleArt(spec, source, layout));
  const swap = ([r, g, b]: [number, number, number]): [number, number, number] => [255 - r, b, g];

  it("gives the fighter one more palette each: every colour swapped for the one drawn over it", () => {
    const out = communityFiles(spec, page, who, { alternates: [readPng(sampleArt(spec, source, layout, swap)), readPng(sampleArt(spec, source, layout, () => [9, 9, 9]))] });
    expect(out.files.get("gi-sub-7.def")!.toString("latin1")).toContain("pal.defaults = 1,2,3");
    // A picture of each outfit for staff, besides the main one.
    expect([...out.files.keys()].filter((f) => f.startsWith("card"))).toEqual(["card.png", "card-2.png", "card-3.png"]);
    const { palettes } = readSff(out.files.get("gi.sff")!);
    expect(palettes.map((p) => `${p.group},${p.number}`)).toEqual(["1,1", "1,2", "1,3"]);
    const used = new Set([0, 1, 2, 3].flatMap((c) => [...artFromGuide(spec, page).cell(c).pixels]).filter((v) => v > 0));
    for (const k of used) {
      const rgb = [...palettes[0]!.colors.subarray(k * 3, k * 3 + 3)] as [number, number, number];
      expect([...palettes[1]!.colors.subarray(k * 3, k * 3 + 3)]).toEqual(swap(rgb));
      expect([...palettes[2]!.colors.subarray(k * 3, k * 3 + 3)]).toEqual([9, 9, 9]);
    }
    // The projectile keeps its colours in every outfit.
    expect(palettes[1]!.colors.subarray(240 * 3, 246 * 3)).toEqual(palettes[0]!.colors.subarray(240 * 3, 246 * 3));
  });

  it("says when it isn't a recoloured copy of the sprite sheet", () => {
    const alt = readPng(sampleArt(spec, source, layout, swap));
    expect(problemsOf(() => communityFiles(spec, page, who, { alternates: [{ ...alt, width: 100 }] }))).toEqual([expect.stringMatching(/^its alternate colour sheet 1: it is 100x60 pixels, but the sprite sheet is 160x60/)]);
    const moved = alt.pixels.slice();
    for (let y = 0; y < 60; y++) moved.fill(0, (y * 160 + 120) * 4, (y * 160 + 160) * 4); // box 4 rubbed out
    const patchy = alt.pixels.slice();
    for (let i = 0; i < 160 * 60; i++) if (i % 160 < 80 && patchy[i * 4 + 3]) patchy.set([0, 255, 0], i * 4); // boxes 1-2 one colour
    expect(problemsOf(() => communityFiles(spec, page, who, { alternates: [alt, { ...alt, pixels: moved }, { ...alt, pixels: patchy }] }))).toEqual([
      expect.stringMatching(/^its alternate colour sheet 2: it isn't the same drawing as the sprite sheet \(\d+% of the drawing is in different places\)/),
      expect.stringMatching(/^its alternate colour sheet 3: parts that are one colour on the sprite sheet are different colours here/),
    ]);
  });
});

describe("portraits", () => {
  it("cuts the drawn part square, from the top of a tall picture and the middle of a wide one", () => {
    const red: [number, number, number, number] = [220, 20, 20, 255];
    // Tall, with a transparent margin on the left: the top square is all red.
    const tall = portraitArt(picture(30, 60, (x, y) => (x < 5 ? [0, 0, 0, 0] : y < 25 ? red : [20, 20, 220, 255])));
    expect([tall.small.width, tall.small.height, tall.large.width, tall.large.height]).toEqual([FACE_SIZES.small, FACE_SIZES.small, FACE_SIZES.large, FACE_SIZES.large]);
    expect([...tall.palette]).toEqual([0, 0, 0, 220, 20, 20]);
    expect(new Set(tall.large.pixels)).toEqual(new Set([1]));
    // Wide and opaque (no transparency at all): the middle third.
    const rgb = new Uint8Array(60 * 20 * 3);
    for (let i = 0; i < 60 * 20; i++) rgb.set(i % 60 < 20 ? [0, 200, 0] : i % 60 < 40 ? [220, 20, 20] : [20, 20, 220], i * 3);
    const wide = portraitArt(readPng(writePng({ width: 60, height: 20, colorType: 2, pixels: rgb })));
    expect([...wide.palette]).toEqual([0, 0, 0, 220, 20, 20]);
    expect(new Set(wide.small.pixels)).toEqual(new Set([1]));
  });

  it("keeps a picture with many colours to fewer than the fighter's 256, averaging as it shrinks", () => {
    const art = portraitArt(picture(300, 300, (x, y) => [x % 256, y % 256, (x * y) % 256, 255]));
    expect(art.palette.length / 3).toBeLessThanOrEqual(MAX_PORTRAIT_COLORS + 1);
    expect(art.palette.length / 3).toBeLessThan(256);
    expect([...art.large.pixels].every((v) => v > 0)).toBe(true);
  });

  it("becomes the lifebar faces, in a palette of their own that choosing a colour doesn't repaint", () => {
    const spec = tinySpec();
    const source = sheetCells(tinySheet(), spec.art.stray);
    const layout = guideLayout(spec);
    const page = readPng(sampleArt(spec, source, layout));
    const out = communityFiles(spec, page, who, { portrait: picture(50, 50, () => [10, 200, 90, 255]), alternates: [readPng(sampleArt(spec, source, layout, () => [1, 2, 3]))] });
    const sff = readSff(out.files.get("gi.sff")!);
    expect(sff.palettes.map((p) => `${p.group},${p.number}`)).toEqual(["1,1", "1,2", `${PORTRAIT_PALETTE.group},${PORTRAIT_PALETTE.number}`]);
    const faces = sff.sprites.filter((s) => s.group === 9000);
    expect(faces.map((s) => [s.number, s.image.width, s.palette])).toEqual([[0, FACE_SIZES.small, 2], [1, FACE_SIZES.large, 2]]);
    expect([...sff.palettes[2]!.colors.subarray(3, 6)]).toEqual([10, 200, 90]);
    // Without a portrait, the faces are cut from the stance in the fighter's colours.
    const plain = readSff(communityFiles(spec, page, who).files.get("gi.sff")!);
    expect(plain.sprites.filter((s) => s.group === 9000).map((s) => s.palette)).toEqual([0, 0]);
  });

  it("says what's wrong with the portrait along with the sprite sheet's problems", () => {
    const spec = tinySpec();
    const empty = picture(10, 10, () => [0, 0, 0, 0]);
    const rgb = readPng(writePng({ width: 160, height: 60, colorType: 2, pixels: new Uint8Array(160 * 60 * 3) }));
    expect(problemsOf(() => communityFiles(spec, rgb, who, { portrait: empty }))).toEqual([
      expect.stringMatching(/^its sprite sheet: the sprite sheet has no transparent background/),
      "its portrait: there's nothing on it: it's all transparent",
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

describe("intros and win poses", () => {
  const spec = tinySpec();
  const source = sheetCells(tinySheet(), spec.art.stray);
  const layout = guideLayout(spec);
  const page = readPng(sampleArt(spec, source, layout));
  /** A pose drawn on the pose guide: these cells of the sheet, a box each, recoloured like the sprite sheet. */
  const strip = (cells: number[], recolor?: (rgb: [number, number, number]) => [number, number, number]) =>
    readPng(sampleArt(spec, source, { ...layout, cells, columns: cells.length, rows: 1, width: cells.length * layout.box.width }, recolor));
  const action = (out: ReturnType<typeof communityFiles>, n: number) => out.art.actions.find((a) => a.action === n);

  it("leaves the template's own intro and win poses off the main guide, and has a pose guide for them", () => {
    const posed = { ...spec, anims: spec.anims.map((a) => (a.action === 190 ? { ...a, cells: [3] } : a.action === 5110 ? { ...a, cells: [0] } : a)) };
    expect(guideCells(posed)).toEqual([0, 1, 2]); // cell 3 only played the intro
    const guide = readPng(poseGuideImage(spec, source, layout));
    expect([guide.width, guide.height]).toEqual([POSE_GUIDE_FRAMES * layout.box.width, layout.box.height]);
    const px = (x: number, y: number) => [...guide.pixels.subarray((y * guide.width + x) * 4, (y * guide.width + x) * 4 + 4)];
    expect(px(17, 30)).toEqual([200, 100, 50, 110]); // the stance, faded, in the first box
    expect(px(40 + 17, 30)[3]).toBe(0); // the others are empty
    expect(px(40 + 5, 58)).toEqual([120, 170, 230, 255]); // with the ground line
  });

  it("plays the community's own intros (one at random) and win poses, in the sprite sheet's colours", () => {
    const out = communityFiles(spec, page, who, { intros: [strip([1, 0]), strip([3, 3, 1])], wins: [strip([2])] });
    expect(action(out, 190)!.frames.map((f) => f.ticks)).toEqual([6, 30]);
    expect(action(out, 192)!.frames.map((f) => f.ticks)).toEqual([6, 6, 30]);
    expect(action(out, 180)!.frames.map((f) => f.ticks)).toEqual([-1]); // one frame, held
    expect(action(out, 181)!.frames).toEqual(action(out, 180)!.frames.map((f) => ({ ...f, group: 181 }))); // one pose plays both
    expect(out.files.get("gi-states.cns")!.toString("latin1")).toContain("value = ifelse(Random < 500, 190, 192)");
    // Its frames are new sprites, drawn with the sprite sheet's palette.
    const sff = readSff(out.files.get("gi.sff")!);
    const intro = sff.sprites.filter((s) => s.group === 190);
    expect(intro).toHaveLength(2);
    expect(new Set(intro.flatMap((s) => [...s.image.pixels]))).toEqual(new Set([0, 1]));
  });

  it("holds the stance when it has none of its own, and plays one intro without picking", () => {
    const out = communityFiles(spec, page, who);
    for (const n of [190, 180, 181]) expect(action(out, n)!.frames).toHaveLength(1);
    expect(action(out, 192)).toBeUndefined();
    expect(communityFiles(spec, page, who, { intros: [strip([1])] }).files.get("gi-states.cns")!.toString("latin1")).not.toContain("pick an intro");
  });

  it("says what's wrong with a pose", () => {
    const one = strip([1]);
    const problems = (images: Parameters<typeof communityFiles>[3]) => problemsOf(() => communityFiles(spec, page, who, images));
    expect(problems({ intros: [{ ...one, height: 50 }] })).toEqual([expect.stringMatching(/^its intro: it is 40x50 pixels, but a pose is drawn on the pose guide: 60 pixels tall and 40 wide for each frame/)]);
    expect(problems({ wins: [strip([1], () => [0, 255, 0])] })).toEqual(["its win pose: it uses colours that aren't on the sprite sheet: draw it with the sprite sheet's colours, so the fighter's outfits recolour it too"]);
    const gap = strip([1, 0, 1]);
    for (let y = 0; y < 60; y++) gap.pixels.fill(0, (y * 120 + 40) * 4, (y * 120 + 80) * 4); // the middle box rubbed out
    const edge = strip([1]);
    for (let y = 0; y < 60; y++) edge.pixels.set([200, 100, 50, 255], (y * 40) * 4); // a line on the box's left edge
    expect(problems({ intros: [one, gap], wins: [edge] })).toEqual([
      "its intro 2: box 2 is empty: draw the frames one after another, from the first box",
      "its win pose: the drawing touches the edge of box 1, so it would be cut off: keep each frame inside its box",
    ]);
    expect(problems({ intros: [readPng(writePng({ width: 40, height: 60, colorType: 6, pixels: new Uint8Array(40 * 60 * 4) }))] })).toEqual(["its intro: there's nothing drawn on it"]);
  });
});