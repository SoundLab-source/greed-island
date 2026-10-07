/**
 * Two house fighters in the Mustermenschen "Alpha Contact" style (Puffolotti, CC0; art/SOURCES.md, mustermenschen.ts):
 * hunched alien brutes with long swipes, a huge front kick, a pounce, a curled-up roll for a jump, a flying kick and a
 * rocket launcher hoisted onto the shoulder (the rocket and blast from military.ts, KABOOM! above). One move list,
 * in the frame numbers of "Komato berserker alpha contact" (688 frames); Puji's GIF has two frames fewer from 165 on.
 * (Ansaksie's GIF has a palette per frame, which the GIF reader doesn't take yet.) The catalogue behind the choices:
 *
 *   0-7 guard · 7-10 jab · 10-11 covering up · 11-16 long swipe · 28-33 uppercut · 48-53 lunging straight ·
 *   127-133 big front kick · 144-152 stepping in · 168 crouching down · 172-176 crouching punch · 186-191 crouched ·
 *   196-201 rising tall to flex · 205-213 a pounce from the crouch · 241-249 the rocket launcher, crouching ·
 *   253-260 jump · 292-297 hop · 328-334 flexing · 334-335 rocked back · 336-337 knocked sitting · 341-345 dazed ·
 *   342-343 doubled over · 355-366 knocked down and lying · 367-371 launched and tumbling · 373-377 rolling up to
 *   stand · 378-385 curled into a ball, rolling · 395-403 flying kick · 428-434 crouching kick · 444-450 sweep ·
 *   461-466 air kick · 594-601 high kick · 612-619 a roll into a kick · 642-648 flexing, arms up · 660-675 beckoning
 */
import { HEAVY } from "./heavy.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { steps } from "./chains.ts";
import { rocketArt } from "./military.ts";
import { bodyArt, shift, type Body } from "./mustermenschen.ts";
import { PROJECTILE_SLOTS } from "./projectile.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const STYLE = "Alpha Contact";
const GUARD = 0;
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 334, "5000,10": 335, "5000,20": 335,
  "5010,0": 342, "5010,10": 343, "5010,20": 343,
  "5020,0": 336, "5020,10": 337, "5020,20": 337,
  "5030,0": 355, "5030,10": 356, "5030,20": 357, "5030,30": 362, "5030,40": 360, "5030,50": 358,
  "5040,0": 359, "5040,10": 364, "5040,20": 365,
  "5060,0": 367, "5060,10": 368,
  "5070,0": 369, "5070,10": 370, "5070,20": 371,
};

/** The rocket's colours (military.ts draws it in the projectile slots). */
const ROCKET = ["#fff6c0", "#ffc83a", "#ff6a1a", "#9aa3a8", "#4c5458", "#d8282a"] as const;

export function alphaFighter(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
  const m = o.body.map ?? ((n: number) => n);
  const art = bodyArt(o.body, STYLE, Object.fromEntries(Object.entries(STANDARD).map(([k, n]) => [k, { cell: m(n), anchor: "feet" as const }])));
  const range = (from: number, to: number) => cellRange(from, to).map(m);
  const at = (...cells: number[]) => cells.map(m);
  const base: TemplateSpec = { ...o.base, art };
  const zoner = o.base.archetype === "ZONER";
  const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[], extra: Parameters<typeof redrawMove>[6] = {}) => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(base, state, name, cells, ticks, frames, { ...feet, ...extra, ...(moves ? { moves } : {}) });
  };
  const units = (px: number) => Math.round((px * 320) / art.localcoord);
  const span = o.body.x1 - o.body.x0;
  const rocket = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: "Shoulder Rocket", from: "stand", command, special: true,
    anim: { action: state, cells: range(241, 249), ticks: [3, 3, 3, 4, 4, 8, 5, 4, 4], anchor: "feet" },
    hits: [{ frames: [5], damage: 62, chip: 8, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 6, knockdown: true, launch: [3, -4], hitSound: SOUNDS.boom }],
    projectile: { frame: 5, speed: 5, height: units(o.body.tall * 0.95), offset: units(span * 0.6), art: rocketArt },
    ai: { range: 320, weight: zoner ? 1 : 0.6 },
  });
  const pounce = (state: number, command: AttackSpec["command"]): AttackSpec =>
    zoner
      ? {
          state, name: "Pounce", from: "stand", command, special: true,
          anim: { action: state, cells: range(205, 213), ticks: [3, 3, 3, 3, 3, 4, 4, 4, 4], anchor: "feet" },
          hits: [{ frames: [4, 5, 6], damage: 72, chip: 7, height: "high", weight: "heavy", hitStun: 20, blockStun: 15, push: 7, knockdown: true, launch: [3, -4] }],
          moves: [{ frame: 2, x: 4 }, { frame: 7, x: 0 }],
          ai: { range: 110, weight: 0.6 },
        }
      : redraw(state, "Pounce", range(205, 213), [3, 3, 3, 3, 3, 4, 4, 4, 4], [4, 5, 6]);
  const words = heroWords([{ text: "KABOOM!", color: FX.yellow }, { text: "GRAAAH!", color: FX.yellow }], 2);
  const say = (n: number, x: number, ticks: number) => ({ anim: WORD_ANIM + n, x: units(x), y: units(o.body.tall + 8), readable: true, ticks });
  const cues: Cue[] = [
    { action: zoner ? 1000 : 1400, frame: 5, sound: SOUNDS.boom, effect: say(0, span, 24) },
    { action: 180, frame: 2, sound: SOUNDS.thud, effect: say(1, 0, 60) },
  ];
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(0, 7), 6, "stand: a hunched guard"),
      a(5, at(GUARD), 3, "turn"),
      a(6, at(188), 3, "crouch turn"),
      a(10, at(168, 186), 3, "stand to crouch"),
      a(11, at(186, 187, 188, 187), 8, "crouched"),
      a(12, at(168, GUARD), 3, "crouch to stand"),
      a(20, range(144, 152), 4, "walk forward: stepping in"),
      a(21, range(144, 152).reverse(), 4, "walk back"),
      a(40, at(253), 3, "jump start"),
      a(41, range(254, 260), 5, "jump up"),
      a(42, range(378, 385), 4, "jump forward: curled into a ball"),
      a(43, range(378, 385).reverse(), 4, "jump back: curled into a ball"),
      a(47, at(168), 3, "jump land"),
      a(100, range(144, 152), 2, "run"),
      a(105, range(292, 297), 4, "hop back"),
      a(120, at(10, 11), 2, "guard start"),
      a(121, at(188), 2, "crouch guard start"),
      a(122, at(380), 2, "air guard start"),
      a(130, at(11), 10, "stand guard: covering up"),
      a(131, at(188), 10, "crouch guard"),
      a(132, at(380), 10, "air guard: curled up"),
      a(140, at(11, 10), 2, "guard end"),
      a(141, at(188), 2, "crouch guard end"),
      a(142, at(380), 2, "air guard end"),
      a(150, at(12, 11), 3, "stand guard hit"),
      a(151, at(189), 6, "crouch guard hit"),
      a(152, at(380), 6, "air guard hit"),
      a(170, range(341, 345), 6, "lose (time over): dazed", true),
      a(175, range(341, 345), 6, "draw (time over)", true),
      a(5000, at(334, 335), 3, "hit high, light"),
      a(5001, at(334, 335, 335), 3, "hit high, medium"),
      a(5002, at(335, 335, 334), 4, "hit high, hard"),
      a(5005, at(335, 334), 3, "recover high, light"),
      a(5006, at(335, 334, GUARD), 3, "recover high, medium"),
      a(5007, at(335, 335, 334, GUARD), 3, "recover high, hard"),
      a(5010, at(342, 343), 3, "hit low, light"),
      a(5011, at(342, 343, 343), 3, "hit low, medium"),
      a(5012, at(343, 343, 342), 4, "hit low, hard"),
      a(5015, at(343, 342), 3, "recover low, light"),
      a(5016, at(343, 342, GUARD), 3, "recover low, medium"),
      a(5017, at(343, 343, 342, GUARD), 3, "recover low, hard"),
      a(5020, at(336), 6, "crouching hit, light"),
      a(5021, at(337), 8, "crouching hit, medium"),
      a(5022, at(337), 10, "crouching hit, hard"),
      a(5025, at(336), 3, "crouching recover, light"),
      a(5026, at(337), 4, "crouching recover, medium"),
      a(5027, at(337, 336), 3, "crouching recover, hard"),
      a(5030, at(355), 4, "hit in the air"),
      a(5035, at(356), 3, "air hit transition"),
      a(5040, at(380, 381), 4, "air recover: curls up"),
      a(5050, at(355, 356), 5, "falling"),
      a(5060, at(356, 357), 5, "falling, coming down"),
      a(5070, at(369, 370), 4, "tripped"),
      a(5080, at(360), 4, "hit while down"),
      a(5090, at(362), 4, "hit up while down"),
      a(5100, at(357, 358), 3, "hit the ground"),
      a(5101, at(362), 4, "bounce"),
      a(5110, at(359), 30, "lying down"),
      a(5120, range(373, 377).concat(at(GUARD)), 5, "getting up: rolls up to stand"),
      a(5140, at(359), 30, "lying defeated", true),
      a(5150, at(359), 30, "lying defeated (match over)", true),
      a(5160, at(362), 4, "bounce into the air"),
      a(5170, at(357, 359), 4, "hit the ground after a bounce"),
      a(5200, at(380, 381), 3, "fall recovery near the ground"),
      a(5210, at(380, 381, 380), 3, "fall recovery in the air"),
      a(180, range(642, 648), [5, 5, 5, 5, 5, 5, 60], "win: flexes, arms up (GRAAAH!)", true),
      a(181, range(328, 333), [5, 5, 5, 5, 5, 60], "win: rises tall and flexes", true),
      a(190, [...range(196, 201), ...range(202, 204), ...at(GUARD)], [8, 6, 6, 6, 20, 6, 5, 5, 5, 8], "intro: rises tall, flexes, hunches into guard"),
      a(195, range(660, 675), 4, "taunt: beckons"),
    ],
    attacks: [
      redraw(200, "Jab", range(7, 10), [2, 4, 3, 3], [1]),
      redraw(210, "Swipe", range(11, 16), [2, 2, 4, 4, 3, 3], [2, 3]),
      redraw(230, "Front Kick", range(127, 133), [3, 3, 3, 4, 4, 3, 3], [3, 4]),
      redraw(240, "Lunging Straight", range(48, 53), [3, 3, 4, 4, 3, 3], [2, 3]),
      redraw(400, "Crouching Punch", range(172, 176), [2, 2, 3, 3, 3], [2, 3]),
      redraw(410, "Uppercut", range(28, 33), [2, 3, 4, 4, 3, 3], [1]),
      redraw(430, "Crouching Kick", range(428, 434), [2, 2, 2, 2, 4, 3, 3], [4, 5]),
      redraw(440, "Sweep", range(444, 450), [3, 3, 4, 4, 4, 3, 3], [2, 3, 4]),
      redraw(600, "Air Kick", range(461, 466), [3, 3, 5, 5, 4, 4], [2, 3]),
      redraw(630, "Flying Kick", range(395, 403), [3, 3, 4, 4, 4, 4, 3, 3, 3], [2, 3, 4]),
      zoner ? rocket(1000, "QCF_x") : pounce(1000, "QCF_x"),
      redraw(1100, "High Kick", range(594, 601), [2, 2, 2, 3, 4, 4, 3, 3], [4, 5]),
      redraw(1200, "Rolling Kick", range(612, 619), [3, 3, 3, 3, 3, 3, 3, 6], [7]),
      zoner ? pounce(1400, "QCB_x") : rocket(1400, "QCB_x"),
    ],
    sounds: () => heroSounds(),
    effectArt: () => words,
    cues,
    colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, ROCKET[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: m(GUARD) },
  };
}

/** A hunched swamp-green alien brute in grey armour: the style's reference GIF. */
export const BOG_BRUTE = alphaFighter({
  body: { id: "komato-alpha", file: "Komato berserker alpha contact.gif", who: "Komato berserker", sha256: "62fa6e030607074f5f05cbc9febddb91a2bb4f105c6e34a5bd9236a11e5bcc40", width: 229, height: 227, frames: 688, x0: 74, x1: 131, y1: 213, tall: 116, size: 1.18 },
  id: "gi-bog-brute", name: "Bog Brute", base: HEAVY,
  // The skin is a family of greens (hues 60-125, moderately saturated): all of them turn together.
  outfits: [
    ["Lava Brute", [shift(55, 130, 15, { minSat: 0.25 })]],
    ["Ice Brute", [shift(55, 130, 200, { minSat: 0.25 })]],
    ["Purple Brute", [shift(55, 130, 275, { minSat: 0.25 })]],
  ],
});

/** A wiry alien in white and red with blue gloves. Two frames fewer than the reference from frame 165. */
export const ASTRO_APE = alphaFighter({
  body: { id: "puji-alpha", file: "Puji for Alpha Contact.gif", who: "Puji", sha256: "13ce59cbcf8fbb1fd30a7615527bbc404c3faeb99e4700e16b3544ce6dbbb9d2", width: 166, height: 171, frames: 686, x0: 49, x1: 95, y1: 156, tall: 83, map: steps([[0, 0], [165, -2]]) },
  id: "gi-astro-ape", name: "Astro Ape", base: ZONER,
  outfits: [
    ["Blue Ape", [shift(355, 5, 215), shift(215, 230, 0)]],
    ["Green Ape", [shift(355, 5, 125), shift(215, 230, 45)]],
    ["Black Ape", [shift(355, 5, null, { light: 0.4 }), shift(215, 230, 280)]],
  ],
});

export const ALPHA: readonly TemplateSpec[] = [BOG_BRUTE, ASTRO_APE];
