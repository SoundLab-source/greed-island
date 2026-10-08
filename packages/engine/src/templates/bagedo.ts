/**
 * "Komato berserker Bagedo for fighting games" (Puffolotti, CC0; art/SOURCES.md): 3,068 frames of a big armoured
 * Komato (an Iji fan design) who drives blades out of his gauntlets as he punches, in the "industrial suppression"
 * style, as one GIF (198 x 187, a 64-colour palette: 1-2 the dark red body, 20-32 the steel armour, 23-27 the pale blue
 * blades), laid out 30 to a row so frame n is cell n. The artist shares the set among several characters; this is
 * Bagedo's. The house fighter **Hostile Takeover** (Brawler). The set is dense and dark, so it was surveyed by
 * measuring each frame (reach, height, feet off the ground), then the moves checked by eye. The catalogue:
 *
 *   0-234 guards and idles · 235-247 a lunging blade punch · 291-307 stepping in, blade out · 330-340 a low lunge ·
 *   762-772 a long blade thrust (765-769) · 784-797 punches (786, 794) · 864-875 a rushing thrust (868-869) ·
 *   900-911 a hop · 1036-1046 a blade swing (1041-1042) · 1373-1386 side kick (1375-1377), high kicks (1381-1384) ·
 *   1426-1443 a roll, gunfire (1431), a kick (1441) · 1776-1791 a low stance, low punch (1787) · 1863-1878 low thrust
 *   (1865) · 2214-2219 low blade (2216) · 2335-2342 low sweep (2340) · 2584-2590 air kick (2587) · 2651-2672 air
 *   blades (2655, 2664) · 2691-2724 blade flurries · 2748-2797 a stepping blade flurry (2752, 2763, 2769) ·
 *   2855-2866 a pink weapon drawn · 2895-2912 standing tall, hands up · 2925-2953 knocked flying, a tucked spin ·
 *   2970-2974 hit crouching · 2975-2981 rocked back · 2982-2994 staggering, doubled over (2986-2988) ·
 *   2995-3012 knocked down, lying (3009-3012) · 3013-3016 kneeling up · 3017-3021 launched · 3026-3041 tumbling,
 *   lying · 3042-3046 getting up · 3047-3067 standing, flexing
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const BAGEDO: ArtSource = {
  id: "komato-bagedo",
  file: "art/sources/komato-bagedo/sequence-blades.gif",
  sha256: "42d3d12b53fa3b70d472f2d457cdd50569dad38165ae722e5c5364661e3d8fdf",
  cellWidth: 198,
  cellHeight: 187,
  columns: 30,
  rows: 103,
  // The guard (frame 0): his body from x 52 to 122, feet on row 160.
  axis: { x: 90, y: 160 },
  stray: [],
  // 110 pixels tall: at 300 a big brute, a head over the Tasen.
  localcoord: 300,
  standardSprites: {
    "5000,0": feet(2976), "5000,10": feet(2977), "5000,20": feet(2978),
    "5010,0": feet(2986), "5010,10": feet(2987), "5010,20": feet(2988),
    "5020,0": feet(2971), "5020,10": feet(2972), "5020,20": feet(2973),
    "5030,0": feet(3000), "5030,10": feet(3001), "5030,20": feet(3002), "5030,30": feet(3003), "5030,40": feet(3004), "5030,50": feet(3005),
    "5040,0": feet(3010), "5040,10": feet(3011), "5040,20": feet(3040),
    "5060,0": feet(3018), "5060,10": feet(3019),
    "5070,0": feet(3001), "5070,10": feet(3002), "5070,20": feet(3003),
  },
  credit: "Sprites: Komato berserker Bagedo for fighting games by Puffolotti (CC0), https://opengameart.org/content/komato-berserker-bagedo-for-fighting-games",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const brawler: TemplateSpec = { ...ALL_ROUNDER, art: BAGEDO };
/** One of the Brawler's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = brawler.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(brawler, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / BAGEDO.localcoord);
const TALL = 110;
const GUARD = 0;
const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.25, ...more });
/** The dark red body, and the steel armour. */
const BODY = (hue: number | null, more: Partial<HueShift> = {}) => shift(0, 30, hue, { lights: [0, 0.3], ...more });
const STEEL = (hue: number | null, more: Partial<HueShift> = {}) => shift(196, 226, hue, { minSat: 0.08, lights: [0, 0.62], ...more });
const words = heroWords([{ text: "TAKEOVER!", color: FX.yellow }, { text: "YOU'RE FIRED!", color: FX.yellow }, { text: "MERGER!", color: FX.white }], 2);

/** His signature: a stepping flurry of blade punches, three hits. TAKEOVER! */
const hostileTakeover: AttackSpec = {
  state: 1400, name: "Hostile Takeover", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(2748, 2772), GUARD], ticks: [2, ...Array(25).fill(2), 6], anchor: "feet" },
  hits: [
    { frames: [5], damage: 35, height: "high", weight: "medium", hitStun: 18, blockStun: 10, push: 1, hitSound: SOUNDS.shing },
    { frames: [16], damage: 35, height: "high", weight: "medium", hitStun: 18, blockStun: 10, push: 1, hitSound: SOUNDS.shing },
    { frames: [22], damage: 45, chip: 6, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 6, knockdown: true, launch: [3, -4], hitSound: SOUNDS.shing },
  ],
  ai: { range: 75, weight: 1 },
};

export const HOSTILE_TAKEOVER: TemplateSpec = {
  ...brawler,
  id: "gi-hostile-takeover",
  name: "Hostile Takeover",
  anims: [
    a(0, range(0, 12), 4, "stand: guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [1780], 3, "crouch turn"),
    a(10, [1776, 1778], 2, "stand to crouch"),
    a(11, range(1778, 1786), 6, "a low stance"),
    a(12, [1778, 1776], 2, "crouch to stand"),
    a(20, range(0, 12), 3, "walk forward"),
    a(21, range(0, 12).reverse(), 3, "walk back"),
    a(40, [900, 901], 2, "jump start"),
    a(41, range(902, 909), 4, "jump up"),
    a(42, range(902, 909), 4, "jump forward"),
    a(43, range(902, 909).reverse(), 4, "jump back"),
    a(47, [910], 3, "jump land"),
    a(100, range(0, 12), 2, "run"),
    a(105, [900, 905, 910], 4, "hop back"),
    a(120, [232, 233], 2, "guard start"),
    a(121, [1781], 2, "crouch guard start"),
    a(122, [2943], 2, "air guard start"),
    a(130, [233], 10, "stand guard"),
    a(131, [1781], 10, "crouch guard"),
    a(132, [2943], 10, "air guard: tucked"),
    a(140, [233, 232], 2, "guard end"),
    a(141, [1781], 2, "crouch guard end"),
    a(142, [2943], 2, "air guard end"),
    a(150, [2976, 233], 3, "stand guard hit"),
    a(151, [2971], 6, "crouch guard hit"),
    a(152, [2943], 6, "air guard hit"),
    a(170, range(2895, 2899), 6, "lose (time over): stands tall", true),
    a(175, range(2895, 2899), 6, "draw (time over)", true),
    a(5000, [2976, 2977], 3, "hit high, light"),
    a(5001, [2976, 2977, 2978], 3, "hit high, medium"),
    a(5002, [2977, 2978, 2979], 3, "hit high, hard"),
    a(5005, [2977, 2976], 3, "recover high, light"),
    a(5006, [2978, 2977, GUARD], 3, "recover high, medium"),
    a(5007, [2979, 2978, 2977, GUARD], 3, "recover high, hard"),
    a(5010, [2986, 2987], 3, "hit low, light"),
    a(5011, [2986, 2987, 2988], 3, "hit low, medium"),
    a(5012, [2987, 2988, 2989], 3, "hit low, hard"),
    a(5015, [2987, 2986], 3, "recover low, light"),
    a(5016, [2988, 2987, GUARD], 3, "recover low, medium"),
    a(5017, [2989, 2988, 2987, GUARD], 3, "recover low, hard"),
    a(5020, [2971], 6, "crouching hit, light"),
    a(5021, [2972], 8, "crouching hit, medium"),
    a(5022, [2973], 10, "crouching hit, hard"),
    a(5025, [2971], 3, "crouching recover, light"),
    a(5026, [2972], 4, "crouching recover, medium"),
    a(5027, [2973, 2972], 3, "crouching recover, hard"),
    a(5030, [3000], 4, "hit in the air"),
    a(5035, [3001], 3, "air hit transition"),
    a(5040, [2941, 2943, 2945, GUARD], 3, "air recover: a tucked spin"),
    a(5050, [3001, 3002], 5, "falling"),
    a(5060, [3003, 3004], 5, "falling, coming down"),
    a(5070, [3001, 3002], 4, "tripped"),
    a(5080, [3011], 4, "hit while down"),
    a(5090, [3018], 4, "hit up while down"),
    a(5100, [3006, 3009], 3, "hit the ground"),
    a(5101, [3005], 4, "bounce"),
    a(5110, [3010], 30, "lying down"),
    a(5120, [3012, ...range(3013, 3016), GUARD], [6, 5, 5, 5, 5, 5], "getting up: kneels, then stands"),
    a(5140, [3010], 30, "lying defeated", true),
    a(5150, [3010], 30, "lying defeated (match over)", true),
    a(5160, [3005], 4, "bounce into the air"),
    a(5170, [3006, 3009], 4, "hit the ground after a bounce"),
    a(5200, [2945, GUARD], 3, "fall recovery near the ground"),
    a(5210, [2941, 2945, GUARD], 3, "fall recovery in the air"),
    a(180, range(3047, 3056), [5, 5, 5, 5, 5, 5, 5, 5, 8, 60], "win: flexing (YOU'RE FIRED!)", true),
    a(181, range(2895, 2912), [...Array(17).fill(4), 60], "win: standing tall, hands up", true),
    a(190, [...range(2895, 2912), GUARD], [...Array(18).fill(4), 10], "intro: stands tall, hands up (MERGER!), then into his guard"),
    a(195, [...range(2855, 2866), GUARD], [...Array(12).fill(4), 8], "taunt: draws a pink weapon"),
  ],
  attacks: [
    redraw(200, "Blade Jab", [GUARD, ...range(784, 788)], [2, 2, 2, 4, 3, 3], [3]),
    redraw(210, "Blade Thrust", range(762, 772), [2, 2, 2, 3, 4, 3, 3, 4, 3, 3, 3], [3, 4]),
    redraw(230, "Side Kick", range(1373, 1380), [2, 2, 3, 4, 3, 3, 3, 3], [2, 3, 4]),
    redraw(240, "High Kick", range(1380, 1386), [2, 3, 4, 3, 3, 3, 3], [1, 2]),
    redraw(400, "Low Punch", range(1784, 1791), [2, 2, 2, 4, 3, 3, 3, 3], [3]),
    redraw(410, "Low Thrust", range(1863, 1868), [2, 2, 4, 3, 3, 3], [2]),
    redraw(430, "Low Blade", range(2214, 2219), [2, 2, 4, 3, 3, 3], [2, 3]),
    redraw(440, "Sweep", range(2335, 2342), [2, 2, 2, 2, 2, 4, 4, 3], [5, 6]),
    redraw(600, "Air Kick", range(2584, 2590), [2, 2, 2, 4, 4, 3, 3], [3, 4]),
    redraw(630, "Air Blades", range(2651, 2658), [2, 2, 2, 2, 4, 4, 3, 3], [4, 5]),
    redraw(1000, "Rushing Thrust", [GUARD, ...range(864, 875)], [2, 2, 2, 2, 3, 4, 4, 3, 3, 3, 3, 3, 3], [5, 6]),
    redraw(1100, "Blade Swing", range(1036, 1046), [2, 2, 2, 2, 2, 4, 4, 3, 3, 3, 3], [5, 6]),
    redraw(1200, "Roll and Fire", range(1426, 1443), [2, 2, 2, 2, 2, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 4, 3, 3], [5, 15]),
    hostileTakeover,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 16, effect: { anim: WORD_ANIM, x: units(60), y: units(TALL + 12), readable: true, ticks: 30 } },
    { action: 180, frame: 3, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 70 } },
    { action: 190, frame: 4, effect: { anim: WORD_ANIM + 2, x: 0, y: units(TALL + 16), readable: true, ticks: 40 } },
    { action: 1200, frame: 5, sound: SOUNDS.zap },
    { action: 210, frame: 3, sound: SOUNDS.shing },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Blue Chip", colors: {}, shifts: [BODY(220, { tint: 0.4 }), STEEL(45, { tint: 0.25, light: 1.1 })] },
    { name: "Greenmail", colors: {}, shifts: [BODY(120, { tint: 0.4 }), STEEL(null, { light: 0.8 })] },
    { name: "Purple Patch", colors: {}, shifts: [BODY(285, { tint: 0.45 }), STEEL(330, { tint: 0.2 })] },
  ],
  portrait: { cell: GUARD },
};
