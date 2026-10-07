/**
 * Four house fighters in the Mustermenschen "Farmer's dream" style (Puffolotti, CC0; art/SOURCES.md, mustermenschen.ts):
 * a spear (or a plain staff) used like a farm tool, with very long thrusts (the spear reaches a body length and more
 * past the guard), a flurry of jabs with it, sweeps, a twirl that rises into the air and spears from above; their own
 * move is a pitchfork thrown from the javelin pose (drawn in code). One move list, in the frame numbers of the
 * style's reference GIF ("Tasen girl 2 Farmer's dream (own)", 732 frames); the other bodies number theirs like it
 * through `steps` (sequence alignment, chains.ts). The catalogue behind the choices:
 *
 *   0-6 standing, spear trailing · 7-35 guard, spear low behind · 70-84 stepping, spear across · 85-94 spear on the
 *   shoulders · 95-110 jump · 113-122 twirl rising · 140-143 spear upright (a block) · 165-169 spear raised high ·
 *   170-180 free-hand jabs · 205-226 kicks · 315-330 a flurry of thrusts · 345-352 the long thrust · 375-380 thrust ·
 *   414-422 crouched with the spear · 443-448 rising thrust · 454-461 low thrust · 498-512 spearing down from the air
 *   · 513-524 flipping jump · 548-554 low kick · 562-565 hit · 566-574 knocked to sitting and up · 575-591 down ·
 *   604-619 launched and tumbling · 620-628 the javelin pose · 643-645 kneeling, spear upright · 688-694 one-handed
 *   thrust · 702-705 sweep · 724-731 spear planted
 *
 * The spear trails along the ground behind the guard, so each body is measured on its feet (the lowest rows'
 * thick runs), not on everything drawn.
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { steps } from "./chains.ts";
import { HEAVY } from "./heavy.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { bodyArt, shift, type Body } from "./mustermenschen.ts";
import { PROJECTILE_SLOTS, type ProjectileArt } from "./projectile.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type HitSpec, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const STYLE = "Farmer's dream";
const GUARD = 20;
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 562, "5000,10": 563, "5000,20": 564,
  "5010,0": 563, "5010,10": 564, "5010,20": 564,
  "5020,0": 564, "5020,10": 564, "5020,20": 565,
  "5030,0": 565, "5030,10": 576, "5030,20": 577, "5030,30": 579, "5030,40": 580, "5030,50": 581,
  "5040,0": 589, "5040,10": 590, "5040,20": 591,
  "5060,0": 604, "5060,10": 611,
  "5070,0": 566, "5070,10": 567, "5070,20": 568,
};

/** The pitchfork: a wooden shaft and three steel prongs, in the projectile slots. */
const FORK = ["#ffffff", "#c8ccd0", "#7c8288", "#9a6a34", "#5e3c18", "#24160a"] as const;

/** A pitchfork thrown prongs first, with a little wobble; it clangs and spins off when it hits. */
export function pitchforkArt(state: number): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const W = 44, H = 13;
  const add = (draw: (put: (x: number, y: number, shade: number) => void) => void) => {
    const img: IndexedImage = { width: W, height: H, pixels: new Uint8Array(W * H) };
    draw((x, y, shade) => {
      x = Math.round(x), y = Math.round(y);
      if (x >= 0 && y >= 0 && x < W && y < H) img.pixels[y * W + x] = PROJECTILE_SLOTS[shade]!;
    });
    sprites.push({ group: base, number: sprites.length, image: img, axisX: W / 2, axisY: Math.floor(H / 2), palette: 0 });
    return sprites.length - 1;
  };
  /** The fork pointing forward (to the right), turned by `tilt` (pixels of rise along it). */
  const fork = (tilt: number, spin = 0) => (put: (x: number, y: number, shade: number) => void) => {
    const c = (x: number) => 6 + Math.round(((x - W / 2) * tilt) / W);
    if (spin) {
      for (let k = -15; k <= 15; k++) put(W / 2 + k * Math.cos(spin), 6 + k * Math.sin(spin), 3);
      return;
    }
    for (let x = 2; x < 30; x++) { put(x, c(x), 3); put(x, c(x) + 1, 4); }
    for (let y = -4; y <= 4; y++) put(30, c(30) + y, 2);
    for (const dy of [-4, 0, 4]) for (let x = 31; x < 41; x++) put(x, c(x) + dy, x === 40 ? 0 : 1);
  };
  const fly = [add(fork(0)), add(fork(2)), add(fork(0)), add(fork(-2))];
  const hit = [add(fork(0, 0.9)), add(fork(0, 2.0)), add(fork(0, 3.0))];
  const box: Box = [0, -5, 20, 5];
  const actions: AirAction[] = [
    { action: base, comment: "the pitchfork flies", frames: fly.map((n) => ({ group: base, number: n, ticks: 3, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "it hits and spins off", frames: hit.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "it falls away", frames: hit.slice(1).map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

export function farmerFighter(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
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
  const toss = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: "Pitchfork Toss", from: "stand", command, special: true,
    anim: { action: state, cells: range(620, 628), ticks: [3, 3, 3, 3, 3, 3, 3, 4, 8], anchor: "feet" },
    hits: [{ frames: [8], damage: 52, chip: 6, height: "high", weight: "medium", hitStun: 20, blockStun: 12, push: 5, hitSound: SOUNDS.clang }],
    projectile: { frame: 8, speed: 6.5, height: units(o.body.tall * 0.72), offset: units(span), art: pitchforkArt },
    ai: { range: 320, weight: zoner ? 1 : 0.6 },
  });
  // The flurry: three thrusts as fast as the spear can go.
  const hit = (frames: number[], more: Partial<HitSpec> = {}): HitSpec => ({ frames, damage: 22, chip: 3, height: "high", weight: "light", hitStun: 16, blockStun: 10, push: 1, ...more });
  const flurry = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: "Haymaker Flurry", from: "stand", command, special: true,
    anim: { action: state, cells: range(315, 330), ticks: [3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 4], anchor: "feet" },
    hits: [hit([2, 3]), hit([7, 8]), hit([11, 12], { damage: 34, weight: "medium", push: 5 })],
    ai: { range: 110, weight: 0.6 },
  });
  const words = heroWords([{ text: "YEEHAW!", color: FX.yellow }], 2);
  const cues: Cue[] = [{ action: zoner ? 1000 : 1400, frame: 8, sound: SOUNDS.whoosh, effect: { anim: WORD_ANIM, x: units(span), y: units(o.body.tall + 8), readable: true, ticks: 26 } }];
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(15, 35), 4, "stand: guard, spear low behind"),
      a(5, at(GUARD), 3, "turn"),
      a(6, at(421), 3, "crouch turn"),
      a(10, at(44, 420), 3, "stand to crouch"),
      a(11, at(420, 421, 422, 421), 8, "crouched with the spear"),
      a(12, at(44, GUARD), 3, "crouch to stand"),
      a(20, range(70, 84), 4, "walk forward: stepping, spear across"),
      a(21, range(70, 84).reverse(), 4, "walk back"),
      a(40, at(95), 3, "jump start"),
      a(41, range(96, 110), 3, "jump up"),
      a(42, range(513, 524), 4, "jump forward: a flip with the spear"),
      a(43, range(96, 110).reverse(), 3, "jump back"),
      a(47, at(95), 3, "jump land"),
      a(100, range(70, 84), 2, "run"),
      a(105, range(102, 108), 4, "hop back"),
      a(120, at(140, 141), 2, "guard start"),
      a(121, at(643), 2, "crouch guard start"),
      a(122, at(521), 2, "air guard start"),
      a(130, at(141), 10, "stand guard: spear upright"),
      a(131, at(644), 10, "crouch guard: kneeling, spear upright"),
      a(132, at(521), 10, "air guard"),
      a(140, at(141, 140), 2, "guard end"),
      a(141, at(643), 2, "crouch guard end"),
      a(142, at(521), 2, "air guard end"),
      a(150, at(142, 141), 3, "stand guard hit"),
      a(151, at(645), 6, "crouch guard hit"),
      a(152, at(521), 6, "air guard hit"),
      a(170, at(0, 2, 4, 6), 6, "lose (time over): stands, spear trailing", true),
      a(175, at(0, 2, 4, 6), 6, "draw (time over)", true),
      a(5000, at(562, 563), 3, "hit high, light"),
      a(5001, at(562, 563, 564), 3, "hit high, medium"),
      a(5002, at(563, 564, 565), 3, "hit high, hard"),
      a(5005, at(563, 562), 3, "recover high, light"),
      a(5006, at(564, 563, 562), 3, "recover high, medium"),
      a(5007, at(565, 564, 563, GUARD), 3, "recover high, hard"),
      a(5010, at(563, 564), 3, "hit low, light"),
      a(5011, at(563, 564, 564), 3, "hit low, medium"),
      a(5012, at(564, 564, 563), 3, "hit low, hard"),
      a(5015, at(564, 563), 3, "recover low, light"),
      a(5016, at(564, 563, GUARD), 3, "recover low, medium"),
      a(5017, at(564, 564, 563, GUARD), 3, "recover low, hard"),
      a(5020, at(564), 6, "crouching hit, light"),
      a(5021, at(564), 8, "crouching hit, medium"),
      a(5022, at(565), 10, "crouching hit, hard"),
      a(5025, at(564), 3, "crouching recover, light"),
      a(5026, at(564), 4, "crouching recover, medium"),
      a(5027, at(565, 564), 3, "crouching recover, hard"),
      a(5030, at(565), 4, "hit in the air"),
      a(5035, at(575), 3, "air hit transition"),
      a(5040, at(521, 522), 4, "air recover"),
      a(5050, at(576, 577), 5, "falling"),
      a(5060, at(579, 580), 5, "falling, coming down"),
      a(5070, at(566, 567), 4, "tripped"),
      a(5080, at(590), 4, "hit while down"),
      a(5090, at(593), 4, "hit up while down"),
      a(5100, at(585, 586), 3, "hit the ground"),
      a(5101, at(593), 4, "bounce"),
      a(5110, at(589), 30, "lying down"),
      a(5120, at(569, 570, 571, 572, 573, 574), 5, "getting up: sits up, rises on the spear"),
      a(5140, at(589), 30, "lying defeated", true),
      a(5150, at(589), 30, "lying defeated (match over)", true),
      a(5160, at(593), 4, "bounce into the air"),
      a(5170, at(585, 589), 4, "hit the ground after a bounce"),
      a(5200, at(521, 522), 3, "fall recovery near the ground"),
      a(5210, at(521, 522, 521), 3, "fall recovery in the air"),
      a(180, at(165, 166, 167, 168, 169), [6, 6, 6, 6, 60], "win: raises the spear high", true),
      a(181, range(669, 676), [5, 5, 5, 5, 5, 5, 5, 60], "win: spear on the shoulders, then planted", true),
      a(190, [...range(724, 731), ...range(0, 14)], [...Array(8).fill(5), ...Array(15).fill(4)], "intro: spear planted, then into guard"),
      a(195, range(85, 94), 5, "taunt: spear on the shoulders"),
    ],
    attacks: [
      redraw(200, "Jab", range(170, 173), [2, 4, 3, 3], [1]),
      redraw(210, "Thrust", range(375, 380), [2, 3, 4, 3, 3, 3], [2, 3]),
      redraw(230, "Side Kick", range(213, 218), [2, 3, 4, 3, 3, 3], [2, 3]),
      redraw(240, "Long Thrust", range(345, 352), [3, 3, 3, 3, 3, 5, 5, 4], [5, 6]),
      redraw(400, "Low Thrust", range(454, 461), [2, 2, 2, 2, 4, 4, 3, 3], [4, 5]),
      redraw(410, "Rising Thrust", range(443, 448), [2, 2, 3, 4, 4, 3], [3, 4]),
      redraw(430, "Low Kick", range(548, 554), [2, 2, 2, 2, 4, 3, 3], [4]),
      redraw(440, "Spear Sweep", range(702, 705), [3, 4, 4, 4], [1, 2]),
      redraw(600, "Spear Drop", range(498, 505), [3, 3, 4, 4, 4, 4, 4, 4], [2, 3, 4]),
      redraw(630, "Diving Thrust", range(507, 512), [3, 3, 3, 3, 6, 4], [4]),
      zoner ? toss(1000, "QCF_x") : flurry(1000, "QCF_x"),
      redraw(1100, "Twirl", range(113, 120), [2, 2, 3, 3, 3, 3, 3, 3], [2, 3, 4]),
      redraw(1200, "One-Handed Thrust", range(688, 694), [3, 3, 3, 5, 4, 4, 4], [3, 4, 5]),
      zoner ? flurry(1400, "QCB_x") : toss(1400, "QCB_x"),
    ],
    sounds: () => heroSounds(),
    effectArt: () => words,
    cues,
    colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, FORK[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: m(GUARD) },
  };
}

const S = (...s: [number, number][]) => steps(s);

/** An alien in blue armour and a grey helmet: the style's reference GIF. */
export const IRON_HERON = farmerFighter({
  body: { id: "tasen-girl-2-farmer", file: "Tasen girl 2 Farmer's dream (own) 11AAT002.gif", who: "Tasen girl 2", sha256: "ae9b550d680fb40be37eb4ad93497226cd1b580ce0592a8692a6a80609d7c4e1", width: 259, height: 183, frames: 732, x0: 93, x1: 153, y1: 161, tall: 93, size: 1.05 },
  id: "gi-iron-heron", name: "Iron Heron", base: ZONER,
  outfits: [
    ["Red Heron", [shift(205, 235, 0)]],
    ["Green Heron", [shift(205, 235, 125)]],
    ["Gold Heron", [shift(205, 235, 42, { light: 1.4 })]],
  ],
});

/** A red cap, a grey vest and pink shorts. */
export const PINK_FLAMINGO = farmerFighter({
  body: { id: "jaqouline-farmer", file: "Jaqouline Chan Farmer's dream 02AAT002.gif", who: "Jaqouline Chan", sha256: "7b76848043c3109dfa7ff357f2b34729a53d0f3bdcd08cf823b0836881876d44", width: 179, height: 123, frames: 728, x0: 69, x1: 113, y1: 107, tall: 68, size: 0.95, map: S([0, 0], [20, -1], [37, -2], [42, -4]) },
  id: "gi-pink-flamingo", name: "Pink Flamingo", base: RUSHDOWN,
  outfits: [
    ["Blue Jay Shorts", [shift(305, 320, 210, { minSat: 0.3 }), shift(355, 5, 210)]],
    ["Lime Shorts", [shift(305, 320, 90, { minSat: 0.3 }), shift(355, 5, 120)]],
    ["Gold Shorts", [shift(305, 320, 42, { minSat: 0.3 }), shift(355, 5, 280)]],
  ],
});

/** A green tee and olive trousers, a plain wooden staff. */
export const BARN_OWL = farmerFighter({
  body: { id: "nick-farmer", file: "Nick Adler Farmer's dream 03AAT002.gif", who: "Nick Adler", sha256: "2b7d269c2cae2e0c7fe674137b4f67fe0002c3979b7d7aa33bdbc94ad058c9b6", width: 205, height: 141, frames: 726, x0: 79, x1: 129, y1: 122, tall: 79, map: S([0, 0], [21, -2], [37, -3], [53, -4], [672, -6]) },
  id: "gi-barn-owl", name: "Barn Owl", base: ALL_ROUNDER,
  outfits: [
    ["Denim", [shift(95, 108, 215, { minSat: 0.9 }), shift(65, 78, 220, { minSat: 0.9 })]],
    ["Plaid Red", [shift(95, 108, 0, { minSat: 0.9 }), shift(65, 78, 30, { minSat: 0.9 })]],
    ["Overalls", [shift(95, 108, 45, { minSat: 0.9, light: 1.3 }), shift(65, 78, 210, { minSat: 0.9 })]],
  ],
});

/** A tall alien in purple and yellow with blue trims. */
export const VIOLET_STORK = farmerFighter({
  body: { id: "tasen-woman-1-farmer", file: "Tasen woman 1 farmer's dream 13AAT002.gif", who: "Tasen woman 1", sha256: "1a73f07907a1f5ae8c35c4e6d4c89dc8d259ea5a041ba2b97de3c3ada39d6d2c", width: 294, height: 210, frames: 732, x0: 104, x1: 176, y1: 185, tall: 111, size: 1.12 },
  id: "gi-violet-stork", name: "Violet Stork", base: HEAVY,
  outfits: [
    ["Green Stork", [shift(255, 295, 130), shift(50, 95, 300)]],
    ["Red Stork", [shift(255, 295, 0), shift(50, 95, 45)]],
    ["Blue Stork", [shift(255, 295, 220), shift(50, 95, 190)]],
  ],
});

export const FARMERS: readonly TemplateSpec[] = [IRON_HERON, PINK_FLAMINGO, BARN_OWL, VIOLET_STORK];
