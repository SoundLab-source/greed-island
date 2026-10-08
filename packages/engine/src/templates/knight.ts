/**
 * "Basic knight for platformers and scrolling beat 'em up" (Puffolotti, CC0; art/SOURCES.md): 94 frames of a foot
 * soldier in a helmet and a red tunic with a short sword, as one GIF (120 x 110, a 32-colour palette: 1-6 the tunic,
 * 20-23 the skin, 10/12/15/16 the leggings, 11/17/18/24/27-31 the helmet and mail), laid out 30 to a row so frame n is
 * cell n. The house fighter **Small Change** (Striker). The frame catalogue:
 *
 *   0-2 guard · 3-4 a windup, the sword back · 5 sword drawn in · 6 thrust · 7 rising cut · 8 drawn in · 9 thrust ·
 *   10 an upswing · 11 the sword overhead · 12 a cut down and forward · 13 a low lunging thrust · 14-15 back to guard ·
 *   16-19 shifting his feet · 20-28 running, the sword up · 29-32 a jump with the sword overhead, cutting down ·
 *   33-36 a lunging thrust · 37-39 standing tall · 40-46 ducking into a hunched guard (42 lowest) · 48-52 knocked to
 *   his knees and down on his face · 53 hit, rocked upright · 54-59 knocked flying, tumbling · 60 lying on his back ·
 *   61-62 a jumping kick · 63 landing · 64-71 walking, sword forward · 72-73 standing, the sword down ·
 *   74-83 a crouched charge, the sword raised · 84 crouched · 85-93 frames 4 and 6-13 again with the sword's white
 *   trail drawn in (85 the windup, 86 thrust, 87 rising cut, 89 thrust, 90 upswing, 91 overhead, 92-93 a big arc)
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const KNIGHT: ArtSource = {
  id: "knight",
  file: "art/sources/knight/knight.gif",
  sha256: "3e25645d64a525bc0d21996d454ce41997d1a464282d224a41d51ea5a505ed63",
  cellWidth: 120,
  cellHeight: 110,
  columns: 30,
  rows: 4,
  // The guard (frame 0): his body from x 30 to 68, feet on row 92.
  axis: { x: 49, y: 92 },
  stray: [],
  // 66 pixels tall: at 240 a little shorter than the Thai boxers (he's small change).
  localcoord: 240,
  standardSprites: {
    "5000,0": feet(53), "5000,10": feet(16), "5000,20": feet(17),
    "5010,0": feet(41), "5010,10": feet(42), "5010,20": feet(43),
    "5020,0": feet(42), "5020,10": feet(43), "5020,20": feet(43),
    "5030,0": feet(54), "5030,10": feet(55), "5030,20": feet(56), "5030,30": feet(57), "5030,40": feet(58), "5030,50": feet(59),
    "5040,0": feet(60), "5040,10": feet(60), "5040,20": feet(59),
    "5060,0": feet(59), "5060,10": feet(58),
    "5070,0": feet(50), "5070,10": feet(51), "5070,20": feet(52),
  },
  credit: "Sprites: Basic knight for platformers and scrolling beat 'em up by Puffolotti (CC0), https://opengameart.org/content/basic-knight-for-platformers-and-scrolling-beat-em-up",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const striker: TemplateSpec = { ...RUSHDOWN, art: KNIGHT };
/** One of the Striker's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = striker.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(striker, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / KNIGHT.localcoord);
const TALL = 66;
const GUARD = 0;
const CROUCH = 42;
const words = heroWords([{ text: "CASH ADVANCE!", color: FX.yellow }, { text: "EN GARDE!", color: FX.white }, { text: "GOT CHANGE?", color: FX.yellow }, { text: "KEEP THE CHANGE!", color: FX.yellow }], 1);

/** His signature: a crouched charge with the sword raised, then one big arcing cut, two hits. CASH ADVANCE! */
const cashAdvance: AttackSpec = {
  state: 1400, name: "Cash Advance", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(74, 79), 11, 92, 93, 14, GUARD], ticks: [2, 2, 2, 2, 2, 2, 2, 3, 4, 4, 4, 5], anchor: "feet" },
  hits: [
    { frames: [8], damage: 40, chip: 5, height: "high", weight: "medium", hitStun: 18, blockStun: 11, push: 2, hitSound: SOUNDS.shing },
    { frames: [9], damage: 55, chip: 7, height: "mid", weight: "heavy", hitStun: 24, blockStun: 14, push: 6, knockdown: true, launch: [3, -4], hitSound: SOUNDS.coin },
  ],
  moves: [{ frame: 1, x: 6 }, { frame: 7, x: 0 }],
  ai: { range: 150, weight: 1 },
};

export const SMALL_CHANGE: TemplateSpec = {
  ...striker,
  id: "gi-small-change",
  name: "Small Change",
  anims: [
    a(0, [0, 1, 2, 1], 8, "stand: guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [CROUCH], 3, "crouch turn"),
    a(10, [41], 2, "stand to crouch"),
    a(11, [CROUCH], 6, "crouched: a hunched guard"),
    a(12, [41], 2, "crouch to stand"),
    a(20, range(64, 71), 4, "walk forward, the sword out"),
    a(21, range(64, 71).reverse(), 4, "walk back"),
    a(40, [63], 2, "jump start"),
    a(41, [62], 4, "jump up"),
    a(42, [62], 4, "jump forward"),
    a(43, [62], 4, "jump back"),
    a(47, [63], 3, "jump land"),
    a(100, range(21, 28), 3, "run, the sword up"),
    a(105, [63, 62, 63], 4, "hop back"),
    a(120, [44], 2, "guard start"),
    a(121, [CROUCH], 2, "crouch guard start"),
    a(122, [62], 2, "air guard start"),
    a(130, [44], 10, "stand guard: hunched behind the sword"),
    a(131, [CROUCH], 10, "crouch guard"),
    a(132, [62], 10, "air guard"),
    a(140, [44], 2, "guard end"),
    a(141, [CROUCH], 2, "crouch guard end"),
    a(142, [62], 2, "air guard end"),
    a(150, [45, 44], 3, "stand guard hit"),
    a(151, [43], 6, "crouch guard hit"),
    a(152, [62], 6, "air guard hit"),
    a(170, [72, 73], 8, "lose (time over): stands, the sword down", true),
    a(175, [72, 73], 8, "draw (time over)", true),
    a(5000, [53, 16], 3, "hit high, light"),
    a(5001, [53, 16, 17], 3, "hit high, medium"),
    a(5002, [53, 54, 53], 3, "hit high, hard"),
    a(5005, [16, GUARD], 3, "recover high, light"),
    a(5006, [17, 16, GUARD], 3, "recover high, medium"),
    a(5007, [53, 17, 16, GUARD], 3, "recover high, hard"),
    a(5010, [41, 42], 3, "hit low, light"),
    a(5011, [41, 42, 43], 3, "hit low, medium"),
    a(5012, [42, 43, 42], 3, "hit low, hard"),
    a(5015, [42, 41], 3, "recover low, light"),
    a(5016, [43, 41, GUARD], 3, "recover low, medium"),
    a(5017, [43, 42, 41, GUARD], 3, "recover low, hard"),
    a(5020, [CROUCH], 6, "crouching hit, light"),
    a(5021, [43], 8, "crouching hit, medium"),
    a(5022, [43], 10, "crouching hit, hard"),
    a(5025, [CROUCH], 3, "crouching recover, light"),
    a(5026, [43], 4, "crouching recover, medium"),
    a(5027, [43, CROUCH], 3, "crouching recover, hard"),
    a(5030, [54], 4, "hit in the air"),
    a(5035, [55], 3, "air hit transition"),
    a(5040, [62, 63, GUARD], 4, "air recover"),
    a(5050, [55, 56], 5, "falling: tumbling"),
    a(5060, [57, 58], 5, "falling, coming down"),
    a(5070, [50, 51], 4, "tripped: falls on his face"),
    a(5080, [60], 4, "hit while down"),
    a(5090, [59], 4, "hit up while down"),
    a(5100, [59, 60], 3, "hit the ground"),
    a(5101, [59], 4, "bounce"),
    a(5110, [60], 30, "lying down"),
    a(5120, [60, 52, 51, 50, 49, 48, GUARD], [6, 5, 5, 5, 5, 5, 6], "getting up: rolls over and pushes up"),
    a(5140, [60], 30, "lying defeated", true),
    a(5150, [60], 30, "lying defeated (match over)", true),
    a(5160, [59], 4, "bounce into the air"),
    a(5170, [59, 60], 4, "hit the ground after a bounce"),
    a(5200, [63, GUARD], 3, "fall recovery near the ground"),
    a(5210, [62, 63, GUARD], 3, "fall recovery in the air"),
    a(180, [GUARD, 37, 38, 39, 38], [5, 5, 6, 8, 60], "win: stands tall (KEEP THE CHANGE!)", true),
    a(181, [GUARD, 3, 85, 5, 86, 14, GUARD], [4, 4, 4, 4, 5, 6, 60], "win: a flourish of the sword", true),
    a(190, [...range(64, 71), GUARD], [5, 5, 5, 5, 5, 5, 5, 5, 10], "intro: marches in (EN GARDE!)"),
    a(195, [GUARD, 10, 10, 90, 14, GUARD], [5, 6, 12, 5, 6, 8], "taunt: raises the sword (GOT CHANGE?)"),
  ],
  attacks: [
    redraw(200, "Quick Thrust", [GUARD, 5, 6, 8], [2, 2, 4, 3], [2]),
    redraw(210, "Rising Cut", [GUARD, 5, 87, 8], [2, 3, 4, 4], [2]),
    redraw(230, "Second Thrust", [GUARD, 8, 89, 14], [2, 2, 4, 4], [2]),
    redraw(240, "Heavy Slash", [GUARD, 11, 92, 93, 14], [2, 3, 4, 4, 4], [2, 3]),
    redraw(400, "Low Thrust", [CROUCH, 13, 14, CROUCH], [2, 4, 3, 3], [1]),
    redraw(410, "Low Upswing", [CROUCH, 90, CROUCH], [3, 4, 4], [1]),
    redraw(430, "Ankle Cut", [CROUCH, 33, 34, CROUCH], [2, 2, 4, 3], [2]),
    redraw(440, "Low Arc", [CROUCH, 13, 93, 14], [2, 2, 5, 4], [2]),
    redraw(600, "Air Cut", [62, 29, 30, 31, 32], [2, 2, 3, 4, 4], [3, 4]),
    redraw(630, "Flying Kick", [62, 61, 61, 62], [2, 4, 4, 3], [1, 2]),
    redraw(1000, "Lunge", [GUARD, ...range(33, 37)], [2, 2, 4, 4, 3, 3], [2, 3]),
    redraw(1100, "Rising Upswing", [CROUCH, 10, 90, 91], [2, 3, 4, 4], [2, 3]),
    redraw(1200, "Whirl", [GUARD, 3, 85, 5, 86, 87], [2, 2, 3, 2, 3, 4], [2, 4, 5]),
    cashAdvance,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 8, effect: { anim: WORD_ANIM, x: units(30), y: units(TALL + 12), readable: true, ticks: 30 } },
    { action: 190, frame: 2, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 14), readable: true, ticks: 30 } },
    { action: 195, frame: 2, effect: { anim: WORD_ANIM + 2, x: units(20), y: units(TALL + 14), readable: true, ticks: 30 } },
    { action: 180, frame: 2, effect: { anim: WORD_ANIM + 3, x: 0, y: units(TALL + 14), readable: true, ticks: 70 } },
    { action: 1400, frame: 7, sound: SOUNDS.swishBig },
    { action: 1000, frame: 1, sound: SOUNDS.swish },
    { action: 1200, frame: 1, sound: SOUNDS.swishBig },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Spare Change", colors: { 1: "#2c2c30", 2: "#202024", 3: "#3a3a40", 4: "#323238", 5: "#4a4a52", 6: "#6a6a74" } },
    { name: "Loose Change", colors: { 1: "#14307b", 2: "#182a62", 3: "#20408b", 4: "#183a83", 5: "#41558b", 6: "#5a74b4" } },
    { name: "Pocket Change", colors: { 1: "#1f6a24", 2: "#1a521c", 3: "#2a7a2e", 4: "#257228", 5: "#4a7a4c", 6: "#6aa06c" } },
  ],
  portrait: { cell: GUARD },
};
