import { describe, expect, it } from "vitest";
import { readSff } from "../art/sff.ts";
import type { Sheet } from "../art/sheet.ts";
import { buildTemplateArt } from "./art.ts";
import { templateFiles } from "./build.ts";
import { commandsFile, constantsFile, statesFile, unitScale } from "./cns.ts";
import { TEMPLATES } from "./index.ts";
import { checkSpec, REQUIRED_ACTIONS, type TemplateSpec } from "./spec.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";

describe("template specs", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is complete and consistent", (_id, spec) => {
    expect(checkSpec(spec)).toEqual([]);
  });

  it("one template per archetype at most", () => {
    const archetypes = TEMPLATES.map((t) => t.archetype);
    expect(new Set(archetypes).size).toBe(archetypes.length);
  });

  it("finds problems", () => {
    const broken: TemplateSpec = {
      ...ALL_ROUNDER,
      id: "bad id",
      anims: ALL_ROUNDER.anims.filter((a) => a.action !== 5120),
      attacks: [{ ...ALL_ROUNDER.attacks[0]!, hits: [{ ...ALL_ROUNDER.attacks[0]!.hits[0]!, frames: [99] }] }],
      palettes: [{ name: "x", colors: { 300: "red" } }],
    };
    const problems = checkSpec(broken);
    expect(problems).toContain("required action 5120 is missing");
    expect(problems.some((p) => p.includes("hit frame 99"))).toBe(true);
    expect(problems.some((p) => p.includes("bad entry 300"))).toBe(true);
    expect(problems.some((p) => p.includes("gi-tpl-"))).toBe(true);
  });
});

describe("generated character code", () => {
  const spec = ALL_ROUNDER;
  const k = unitScale(spec);

  it("scales speeds and sizes to the character's own units", () => {
    const cns = constantsFile(spec);
    expect(cns).toContain(`walk.fwd = ${Math.round(spec.constants.walkFwd * k * 100) / 100}`);
    expect(cns).toContain("[Data]\nlife = 1000\nattack = 100\ndefence = 100");
    expect(cns).toContain(`yaccel = ${Math.round(spec.constants.gravity * k * 100) / 100}`);
  });

  it("has a state with one HitDef per hit for every attack, and hands the AI full control", () => {
    const st = statesFile(spec);
    for (const a of spec.attacks) {
      const block = st.slice(st.indexOf(`[Statedef ${a.state}]`), st.indexOf("[Statedef", st.indexOf(`[Statedef ${a.state}]`) + 1) >>> 0);
      expect(block).toContain(`anim = ${a.state}`);
      expect(block.match(/type = HitDef/g)?.length).toBe(a.hits.length);
    }
    expect(st).toContain("flag = NoAIButtonJam");
    expect(st).toContain("flag2 = NoAICheat");
  });

  it("gives people their inputs and the AI its own triggers, never mixed", () => {
    const cmd = commandsFile(spec);
    const blocks = cmd.split("\n\n").filter((b) => b.startsWith("[State -1"));
    expect(blocks.length).toBeGreaterThan(spec.attacks.length * 2);
    for (const b of blocks) {
      const ai = b.startsWith("[State -1, AI");
      if (ai) expect(b).toMatch(/AILevel/);
      else expect(b).toContain("triggerall = !AILevel");
    }
    for (const a of spec.attacks.filter((x) => x.special)) expect(cmd).toContain(`name = "${a.command}"`);
  });
});

/** A 2x2 sheet of 40x60 cells: 0 standing, 1 punching, 2 in the air, 3 lying down. */
function tinySheet(): Sheet {
  const cw = 40, ch = 60, width = cw * 2, height = ch * 2;
  const pixels = new Uint8Array(width * height);
  const paint = (c: number, f: (x: number, y: number) => boolean) => {
    const ox = (c % 2) * cw, oy = Math.floor(c / 2) * ch;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (f(x, y)) pixels[(oy + y) * width + ox + x] = 1;
  };
  const body = (x: number, y: number) => x >= 15 && x < 25 && y >= 10 && y < 58;
  paint(0, body);
  paint(1, (x, y) => body(x, y) || (x >= 25 && x < 38 && y >= 20 && y < 24));
  paint(2, (x, y) => x >= 15 && x < 25 && y >= 5 && y < 40);
  paint(3, (x, y) => x >= 2 && x < 38 && y >= 50 && y < 58);
  pixels[0] = 9; // a stray speck
  const palette = new Uint8Array(768);
  palette.set([200, 100, 50], 3);
  return { width, height, pixels, palette, cellWidth: cw, cellHeight: ch, columns: 2, rows: 2 };
}

function tinySpec(): TemplateSpec {
  return {
    ...ALL_ROUNDER,
    id: "gi-tpl-test",
    art: { ...ALL_ROUNDER.art, cellWidth: 40, cellHeight: 60, columns: 2, rows: 2, axis: { x: 20, y: 58 }, stray: [9], standardSprites: { "5000,10": 0, "5030,10": { cell: 2, anchor: "feet" } } },
    anims: REQUIRED_ACTIONS.map((action) => (action === 41 ? { action, cells: [2], ticks: 5, anchor: "feet" as const } : action === 5110 ? { action, cells: [3], ticks: 5, loop: false as const } : { action, cells: [0], ticks: 5 })),
    attacks: [{ ...ALL_ROUNDER.attacks[0]!, anim: { action: 200, cells: [0, 1, 0], ticks: [2, 4, 3] }, hits: [{ ...ALL_ROUNDER.attacks[0]!.hits[0]!, frames: [1] }] }],
    portrait: { cell: 0, box: [15, 10, 25, 20] },
  };
}

describe("template art", () => {
  it("builds one sprite per cell used, with hurtboxes, hitboxes and re-grounded air frames", () => {
    const art = buildTemplateArt(tinySpec(), tinySheet());
    const sprites = readSff(art.sff).sprites;
    const keys = sprites.map((s) => `${s.group},${s.number}`);
    // Cells 0, 2, 3 and 1 (first used by actions 0, 41, 5110 and 200), the standard sprites and two portraits.
    expect(keys).toEqual(["0,0", "41,0", "5110,0", "200,1", "5000,10", "5030,10", "9000,0", "9000,1"]);
    const stand = sprites[0]!;
    expect([stand.image.width, stand.image.height, stand.axisX, stand.axisY]).toEqual([10, 48, 5, 48]);
    // The stray speck at (0, 0) is gone: the trimmed stand sprite starts at the body.
    expect(stand.image.pixels.every((v) => v === 1)).toBe(true);

    const jab = art.actions.find((a) => a.action === 200)!;
    expect(jab.frames[1]!.clsn1).toEqual([[11, -38, 18, -34]]);
    expect(jab.frames[0]!.clsn1).toBeUndefined();
    const jump = art.actions.find((a) => a.action === 41)!.frames[0]!;
    expect(jump.y).toBe(18); // the air frame's lowest pixel (y = 39) moved down to the axis (58)
    expect(jump.clsn2!.at(-1)![3]).toBe(0);
    expect(art.actions.find((a) => a.action === 5110)!.frames.at(-1)!.ticks).toBe(-1);
    // The air standard sprite is grounded through its axis instead.
    const air = sprites.find((s) => s.group === 5030)!;
    expect(air.axisY).toBe(air.image.height);
  });

  it("refuses a hit frame where nothing reaches out", () => {
    const spec = tinySpec();
    spec.attacks = [{ ...spec.attacks[0]!, hits: [{ ...spec.attacks[0]!.hits[0]!, frames: [0] }] }];
    expect(() => buildTemplateArt(spec, tinySheet())).toThrow(/nothing reaches out/);
  });

  it("gives the same files and hash for the same spec", () => {
    const a = templateFiles(tinySpec(), tinySheet());
    const b = templateFiles(tinySpec(), tinySheet());
    expect(a.hash).toBe(b.hash);
    expect([...a.files.keys()].sort()).toEqual(["gi-states.cns", "gi-tpl-test.def", "gi.air", "gi.cmd", "gi.cns", "gi.sff"]);
  });
});
