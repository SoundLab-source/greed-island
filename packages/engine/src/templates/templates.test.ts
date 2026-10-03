import { describe, expect, it } from "vitest";
import { readSff } from "../art/sff.ts";
import type { Sheet } from "../art/sheet.ts";
import { buildTemplateArt } from "./art.ts";
import { templateFiles } from "./build.ts";
import { commandsFile, constantsFile, statesFile, unitScale } from "./cns.ts";
import { TEMPLATES } from "./index.ts";
import { checkSpec, REQUIRED_ACTIONS, type TemplateSpec } from "./spec.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { orb, PROJECTILE_SLOTS } from "./projectile.ts";
import { ZONER } from "./zoner.ts";
import { measureReach } from "./reach.ts";

describe("template specs", () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))("%s is complete and consistent", (_id, spec) => {
    expect(checkSpec(spec)).toEqual([]);
  });

  it("one template per archetype, all five", () => {
    expect(new Set(TEMPLATES.map((t) => t.archetype))).toEqual(new Set(["ALL_ROUNDER", "RUSHDOWN", "HEAVY", "GRAPPLER", "ZONER"]));
  });

  it("finds throw and projectile problems", () => {
    const t = GRAPPLER.throws![0]!;
    const problems = checkSpec({
      ...GRAPPLER,
      throws: [{ ...t, catchFrames: [7], release: { ...t.release, frame: 40 } }, { ...t, name: "Again" }],
      attacks: [...GRAPPLER.attacks, { ...ZONER.attacks.find((a) => a.projectile)!, state: 1500, anim: { ...ZONER.attacks.find((a) => a.projectile)!.anim, action: 1500 }, projectile: { frame: 30, speed: 5, height: 60 } }],
    });
    expect(problems.some((p) => p.includes("catch frame 7"))).toBe(true);
    expect(problems.some((p) => p.includes("release frame 40"))).toBe(true);
    expect(problems.some((p) => p.includes("Again: state or action 800 is already used"))).toBe(true);
    expect(problems.some((p) => p.includes("projectile frame 30"))).toBe(true);
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
    expect(cns).toContain(`[Data]\nlife = ${spec.constants.life}\nattack = ${spec.constants.attack}\ndefence = ${spec.constants.defence}`);
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

  const aiBlock = (cmd: string, title: string) => cmd.split("\n\n").find((b) => b.includes(`[State -1, ${title}]`)) ?? "";

  it("holds its attacks back while it blocks, reacts to slow moves and blocks most projectiles", () => {
    const cmd = commandsFile(spec);
    expect(aiBlock(cmd, "AI: decide to block")).toContain(`var(50) = Random < ${spec.ai.block}`);
    expect(aiBlock(cmd, "AI: decide to block a projectile")).toContain("InGuardDist && (EnemyNear, NumProj) > 0 && !var(52)");
    expect(aiBlock(cmd, "AI: decide to block a projectile")).toContain("var(50) = Random < 800");
    expect(aiBlock(cmd, "AI: react and block")).toContain("!var(50) && P2MoveType = A && Random < 35");
    const ground = spec.attacks.filter((a) => a.from !== "air");
    expect(ground.length).toBeGreaterThan(8);
    for (const a of ground) expect(aiBlock(cmd, `AI: ${a.name}`)).toContain("triggerall = !(InGuardDist && var(50))");
    for (const title of ["AI: run in", "AI: jump in"]) expect(aiBlock(cmd, title)).toContain("triggerall = !(InGuardDist && var(50))");
    // Combos carry on: a normal that hit still cancels into a special.
    expect(aiBlock(cmd, "AI: combo into Spin Kick")).not.toContain("var(50)");
  });

  it("walks in until all but its shortest standing normal reach", () => {
    const reach = new Map([[200, 30], [210, 40], [230, 45], [240, 39]]);
    expect(aiBlock(commandsFile(spec, reach), "AI: walk in")).toContain(`P2BodyDist X > ${Math.round(39 * k * 100) / 100} `);
    // Never farther than the spec's own preferred range.
    const close = { ...spec, ai: { ...spec.ai, range: 25 } };
    expect(aiBlock(commandsFile(close, reach), "AI: walk in")).toContain(`P2BodyDist X > ${Math.round(25 * k * 100) / 100} `);
  });

  it("has the two AIs take turns acting first, so neither side of the screen has an edge", () => {
    const st = statesFile(spec);
    expect(st).toMatch(/\[State -2, AI: take turns going first\]\ntype = AssertSpecial\ntrigger1 = AILevel > 0 && \(GameTime % 2\) = \(TeamSide - 1\)\nflag = RunFirst/);
  });
});

describe("throws and projectiles", () => {
  it("a throw grabs, holds, damages and throws the victim through our states", () => {
    const st = statesFile(GRAPPLER);
    const slam = GRAPPLER.throws![0]!;
    expect(st).toContain("attr = S, NT");
    expect(st).toContain("p1stateno = 810");
    expect(st).toContain("p2stateno = 820");
    expect(st.match(/\[State 810, hold \d+\]/g)?.length).toBe(slam.release.frame + 1);
    expect(st).toContain(`value = ${-slam.damage}`);
    expect(st).toMatch(/\[State 810, throw\]\ntype = TargetState\ntrigger1 = AnimElem = 7\nvalue = 822/);
    expect(st).toContain("type = ChangeAnim2");
    expect(st).toMatch(/\[Statedef 822\][\s\S]*?value = 5100/);
    expect(st).toContain("attr = S, ST"); // the dive grab is a special throw
    const cmd = commandsFile(GRAPPLER);
    expect(cmd).toMatch(/\[State -1, Body Slam\][\s\S]*?command = "holdfwd"[\s\S]*?P2BodyDist X <=/);
    expect(cmd).toContain("[State -1, AI: Dive Grab]");
  });

  it("a projectile move fires a Projectile with the move's hit instead of a HitDef", () => {
    const st = statesFile(ZONER);
    const block = st.slice(st.indexOf("[Statedef 1000]"), st.indexOf("[Statedef", st.indexOf("[Statedef 1000]") + 1));
    expect(block).toContain("type = Projectile");
    expect(block).toContain("projanim = 1050");
    expect(block).toContain("attr = S, SP");
    expect(block).not.toContain("type = HitDef");
    expect(commandsFile(ZONER)).toContain("NumProjID(1000) = 0");
  });

  it("a move that goes through projectiles is immune to them only, and the AI answers projectiles with it", () => {
    const charge = HEAVY.attacks.find((a) => a.throughProjectiles)!;
    const st = statesFile(HEAVY);
    const block = st.slice(st.indexOf(`[Statedef ${charge.state}]`), st.indexOf("[Statedef", st.indexOf(`[Statedef ${charge.state}]`) + 1));
    // An empty stance part: "SCA" there would stop every attack, not just projectiles.
    expect(block).toMatch(/type = NotHitBy\ntrigger1 = 1\nvalue = , NP, SP, HP\ntime = 1/);
    expect(st.match(/type = NotHitBy/g)?.length).toBe(1);
    const cmd = commandsFile(HEAVY);
    const rule = cmd.split("\n\n").find((b) => b.startsWith(`[State -1, AI: ${charge.name} through a projectile]`))!;
    expect(rule).toContain("triggerall = InGuardDist && (EnemyNear, NumProj) > 0");
    expect(rule).toContain("trigger1 = Random < 12");
    expect(cmd.indexOf(rule)).toBeLessThan(cmd.indexOf("[State -1, AI: block]"));
    expect(GRAPPLER.attacks.some((a) => a.throughProjectiles)).toBe(true);
    expect(statesFile(ALL_ROUNDER)).not.toContain("NotHitBy");
    expect(commandsFile(ALL_ROUNDER)).not.toContain("through a projectile");
  });

  it("draws the ball in its own palette slots, hollow when it bursts", () => {
    const ball = orb(10, 1.5);
    const used = new Set(ball.pixels);
    used.delete(0);
    expect([...used].every((v) => (PROJECTILE_SLOTS as readonly number[]).includes(v))).toBe(true);
    const burst = orb(10, 1, 0.5);
    expect(burst.pixels[11 * burst.width + 11]).toBe(0); // the middle is clear
  });
});

/** A 2x2 sheet of 40x60 cells: 0 standing, 1 punching, 2 in the air, 3 lying down. */
export function tinySheet(): Sheet {
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

export function tinySpec(): TemplateSpec {
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

  it("adds victim animations for throws and projectile sprites and animations", () => {
    const spec = tinySpec();
    spec.throws = [{ state: 800, name: "Grab", command: "throw", reach: { action: 800, cells: [0, 1], ticks: [2, 4] }, catchFrames: [1], hold: [{ cell: 0, ticks: 4, victim: [20, 0] }, { cell: 2, ticks: 4, victim: [10, 60], lifted: true }, { cell: 0, ticks: 6, victim: [30, 0] }], release: { frame: 2, x: 2, y: 3 }, damage: 100, ai: { range: 20, weight: 1 } }];
    spec.attacks = [...spec.attacks, { ...spec.attacks[0]!, state: 1000, name: "Ball", anim: { action: 1000, cells: [0, 1], ticks: [3, 3] }, projectile: { frame: 1, speed: 5, height: 60 } }];
    const art = buildTemplateArt(spec, tinySheet());
    expect(art.air).toMatch(/\[Begin Action 820\]\n5010,0, 0,0, -1/);
    expect(art.air).toContain("[Begin Action 822]");
    expect(art.air).toContain("[Begin Action 1050]");
    expect(art.air).toContain("[Begin Action 1052]");
    expect(art.actions.find((a) => a.action === 800)!.frames[1]!.clsn1).toBeDefined();
    expect(art.actions.find((a) => a.action === 1000)!.frames.every((f) => !f.clsn1)).toBe(true);
    expect(readSff(art.sff).sprites.filter((s) => s.group === 1050).length).toBeGreaterThan(5);
  });

  it("measures each move's reach from its hitboxes and forward movement, for the AI", () => {
    const spec = tinySpec();
    spec.constants = { ...spec.constants, width: [0, 0] };
    spec.attacks = [spec.attacks[0]!, { ...spec.attacks[0]!, state: 210, name: "Lunge", anim: { action: 210, cells: [0, 1, 0], ticks: [2, 4, 3] }, moves: [{ frame: 0, x: 5 }] }];
    const art = buildTemplateArt(spec, tinySheet());
    const reach = measureReach(spec, art.actions);
    // The fist's tip is 18 sheet pixels in front of the axis: 18 / 1.7 = 10.6 units, 90% of it.
    expect(reach.get(200)).toBe(10);
    // Plus 2 ticks at 5 units per tick before the hit.
    expect(reach.get(210)).toBe(19);
    expect(commandsFile(spec, reach)).toContain(`P2BodyDist X <= ${Math.round(19 * 1.7 * 100) / 100}`);
  });

  it("counts a charge's travel up to its last active frame", () => {
    const spec = tinySpec();
    spec.constants = { ...spec.constants, width: [0, 0] };
    const base = spec.attacks[0]!;
    spec.attacks = [base, { ...base, state: 220, name: "Charge", anim: { action: 220, cells: [0, 1, 1, 0], ticks: [2, 4, 3, 3] }, hits: [{ ...base.hits[0]!, frames: [1, 2] }], moves: [{ frame: 0, x: 5 }, { frame: 3, x: 0 }] }];
    const reach = measureReach(spec, buildTemplateArt(spec, tinySheet()).actions);
    // 2 + 4 ticks at 5 units per tick before the last active frame, plus the fist: (30 + 10.6) x 90%.
    expect(reach.get(220)).toBe(37);
  });

  it("gives the same files and hash for the same spec", () => {
    const a = templateFiles(tinySpec(), tinySheet());
    const b = templateFiles(tinySpec(), tinySheet());
    expect(a.hash).toBe(b.hash);
    expect([...a.files.keys()].sort()).toEqual(["card.png", "gi-states.cns", "gi-tpl-test.def", "gi.air", "gi.cmd", "gi.cns", "gi.sff", "guide.png", "numbers.json", "pose-guide.png"]);
  });
});
