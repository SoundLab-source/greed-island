/**
 * "Complete komato beast 1 for platformer or fighting games" (Puffolotti, CC0; art/SOURCES.md): 1,231 frames of a
 * hunched alien soldier with green blades for forearms (an Iji fan design) as one GIF (197 x 171, a 64-colour
 * palette: 8-15 the green blades, 2-7 the reddish body, 48-61 the grey armour, 28-38 yellow plates), laid out 30 to a
 * row so frame n is cell n. Multiple walks and runs (one on all fours), rush combos and falls. The house fighter
 * **Paper Shredder** (Bruiser). The frame catalogue:
 *
 *   0-19 hunched guard · 20-30 stepping · 31-68 guards, crouched · 69-79 blade thrusts (71, 75) · 80-99 leaping
 *   overhead slashes (86, 92, 99) · 100-111 a spread slash · 112-119 swipes (113, 117) · 125-136 arms raised, roaring ·
 *   140-149 kicks · 150-156 rising slash · 200-212 crouched · 213-218 kick · 219-310 kicks (295, 303, 310) ·
 *   315-319 a roll · 350-375 kicks · 400-411 a tall jump · 420-434 a charge of slashes (421, 427, 433) ·
 *   466-478 a leaping dive · 480-494 running on all fours · 495-534 crouched · 535-556 slashes, kicks ·
 *   570-576 rising slash from a crouch · 640-650 a dive, lying · 674-684 roaring · 686-694 air kicks (688-689) ·
 *   700-714 standing upright, arms wide · 800-812 knocked back, falling forward · 813-819 rocked, hunched ·
 *   820-830 staggering · 831-840 knocked flat, launched, lying · 841-868 tumbling, lying, getting up (856-861) ·
 *   905-939 kicks · 946-975 crouched, hit crouching (961-963), rolling · 1000-1036 falls and lying ·
 *   1050-1060 flying kick (1054) · 1073-1092 low slashes (1074) · 1093-1099 rising slash · 1110-1117 low kick ·
 *   1130-1139 splits sweep (1136) · 1140-1230 more slashes and kicks
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { HEAVY } from "./heavy.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const KOMATO_BEAST: ArtSource = {
  id: "komato-beast",
  file: "art/sources/komato-beast/sequence.gif",
  sha256: "e510c17d2c6d8acfe4b928591209e0c3d99dd9079f0c35557bbd5204e6097df1",
  cellWidth: 197,
  cellHeight: 171,
  columns: 30,
  rows: 42,
  // The guard (frame 0): its body from x 45 to 111, feet on row 143.
  axis: { x: 80, y: 143 },
  stray: [],
  // 86 pixels tall, hunched: at 250 a bulky brute on screen.
  localcoord: 250,
  standardSprites: {
    "5000,0": feet(813), "5000,10": feet(814), "5000,20": feet(815),
    "5010,0": feet(817), "5010,10": feet(818), "5010,20": feet(819),
    "5020,0": feet(961), "5020,10": feet(962), "5020,20": feet(963),
    "5030,0": feet(831), "5030,10": feet(832), "5030,20": feet(833), "5030,30": feet(834), "5030,40": feet(835), "5030,50": feet(839),
    "5040,0": feet(836), "5040,10": feet(840), "5040,20": feet(856),
    "5060,0": feet(837), "5060,10": feet(838),
    "5070,0": feet(808), "5070,10": feet(809), "5070,20": feet(810),
  },
  credit: "Sprites: Complete komato beast 1 by Puffolotti (CC0), https://opengameart.org/content/complete-komato-beast-1-for-platformer-or-fighting-games",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const bruiser: TemplateSpec = { ...HEAVY, art: KOMATO_BEAST };
/** One of the Bruiser's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = bruiser.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(bruiser, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / KOMATO_BEAST.localcoord);
const TALL = 86;
const GUARD = 0;
const words = heroWords([{ text: "SHRED!", color: FX.yellow }, { text: "RAAAH!", color: FX.white }, { text: "SHREDDED!", color: FX.yellow }], 2);

/** Its signature: swipe, swipe, and a rising slash. SHRED! */
const shred: AttackSpec = {
  state: 1400, name: "Shred", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(112, 119), ...range(150, 154), GUARD], ticks: [2, 2, 3, 3, 2, 2, 3, 3, 2, 2, 3, 4, 5, 4, 4], anchor: "feet" },
  hits: [
    { frames: [2], damage: 30, height: "high", weight: "light", hitStun: 16, blockStun: 10, push: 1, hitSound: SOUNDS.shing },
    { frames: [6], damage: 30, height: "high", weight: "light", hitStun: 16, blockStun: 10, push: 1, hitSound: SOUNDS.shing },
    { frames: [10, 11], damage: 50, chip: 6, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 4, knockdown: true, launch: [2, -6], hitSound: SOUNDS.shing },
  ],
  ai: { range: 60, weight: 1 },
};

export const PAPER_SHREDDER: TemplateSpec = {
  ...bruiser,
  id: "gi-paper-shredder",
  name: "Paper Shredder",
  anims: [
    a(0, range(0, 19), 4, "stand: a hunched guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [517], 3, "crouch turn"),
    a(10, [505, 510], 2, "stand to crouch"),
    a(11, range(515, 519), 6, "crouched"),
    a(12, [510, 505], 2, "crouch to stand"),
    a(20, range(20, 30), 4, "walk forward"),
    a(21, range(20, 30).reverse(), 4, "walk back"),
    a(40, [400], 2, "jump start"),
    a(41, range(401, 411), 4, "jump up"),
    a(42, range(401, 411), 4, "jump forward"),
    a(43, range(401, 411).reverse(), 4, "jump back"),
    a(47, [505], 3, "jump land"),
    a(100, range(480, 494), 2, "run: on all fours"),
    a(105, [400, 405, 411], 4, "hop back"),
    a(120, [64], 2, "guard start"),
    a(121, [517], 2, "crouch guard start"),
    a(122, [405], 2, "air guard start"),
    a(130, [64], 10, "stand guard"),
    a(131, [517], 10, "crouch guard"),
    a(132, [405], 10, "air guard"),
    a(140, [64], 2, "guard end"),
    a(141, [517], 2, "crouch guard end"),
    a(142, [405], 2, "air guard end"),
    a(150, [814, 64], 3, "stand guard hit"),
    a(151, [961], 6, "crouch guard hit"),
    a(152, [405], 6, "air guard hit"),
    a(170, range(700, 704), 6, "lose (time over): stands upright", true),
    a(175, range(700, 704), 6, "draw (time over)", true),
    a(5000, [813, 814], 3, "hit high, light"),
    a(5001, [813, 814, 815], 3, "hit high, medium"),
    a(5002, [814, 815, 816], 3, "hit high, hard"),
    a(5005, [814, 813], 3, "recover high, light"),
    a(5006, [815, 814, GUARD], 3, "recover high, medium"),
    a(5007, [816, 815, 814, GUARD], 3, "recover high, hard"),
    a(5010, [817, 818], 3, "hit low, light"),
    a(5011, [817, 818, 819], 3, "hit low, medium"),
    a(5012, [818, 819, 819], 3, "hit low, hard"),
    a(5015, [818, 817], 3, "recover low, light"),
    a(5016, [819, 818, GUARD], 3, "recover low, medium"),
    a(5017, [819, 819, 818, GUARD], 3, "recover low, hard"),
    a(5020, [961], 6, "crouching hit, light"),
    a(5021, [962], 8, "crouching hit, medium"),
    a(5022, [963], 10, "crouching hit, hard"),
    a(5025, [961], 3, "crouching recover, light"),
    a(5026, [962], 4, "crouching recover, medium"),
    a(5027, [963, 962], 3, "crouching recover, hard"),
    a(5030, [831], 4, "hit in the air"),
    a(5035, [832], 3, "air hit transition"),
    a(5040, [813, GUARD], 4, "air recover"),
    a(5050, [832, 833], 5, "falling"),
    a(5060, [834, 835], 5, "falling, coming down"),
    a(5070, [808, 809], 4, "tripped: falls forward"),
    a(5080, [840], 4, "hit while down"),
    a(5090, [837], 4, "hit up while down"),
    a(5100, [835, 836], 3, "hit the ground"),
    a(5101, [839], 4, "bounce"),
    a(5110, [856], 30, "lying down"),
    a(5120, [...range(857, 861), 505, GUARD], [6, 5, 5, 4, 4, 4, 5], "getting up"),
    a(5140, [856], 30, "lying defeated", true),
    a(5150, [856], 30, "lying defeated (match over)", true),
    a(5160, [839], 4, "bounce into the air"),
    a(5170, [835, 836], 4, "hit the ground after a bounce"),
    a(5200, [813, GUARD], 3, "fall recovery near the ground"),
    a(5210, [831, 813, GUARD], 3, "fall recovery in the air"),
    a(180, range(125, 136), [4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 8, 60], "win: arms raised, roaring (SHREDDED!)", true),
    a(181, range(700, 714), [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 8, 60], "win: standing upright, arms wide", true),
    a(190, [...range(674, 684), GUARD], [5, 5, 5, 5, 5, 5, 5, 6, 8, 8, 6, 10], "intro: roars (RAAAH!), then hunches into its guard"),
    a(195, [...range(674, 684), GUARD], [4, 4, 4, 4, 4, 4, 4, 6, 8, 8, 6, 8], "taunt: roars (RAAAH!)"),
  ],
  attacks: [
    redraw(200, "Blade Jab", [GUARD, ...range(69, 73)], [2, 2, 2, 3, 3, 3], [3]),
    redraw(210, "Blade Thrust", [GUARD, ...range(74, 79)], [2, 2, 3, 4, 3, 3, 3], [2, 3]),
    redraw(230, "Kick", [GUARD, ...range(213, 218)], [2, 2, 2, 3, 4, 3, 3], [3, 4]),
    redraw(240, "Lunging Slash", [GUARD, ...range(96, 99)], [2, 3, 3, 3, 6], [4]),
    redraw(400, "Low Slash", range(1073, 1078), [2, 3, 4, 3, 3, 3], [1, 2]),
    redraw(410, "Rising Slash", [1073, ...range(570, 574)], [2, 3, 3, 4, 4, 3], [1, 2, 3]),
    redraw(430, "Low Kick", range(1110, 1115), [2, 2, 3, 4, 3, 3], [2, 3]),
    redraw(440, "Splits Sweep", range(1130, 1139), [2, 2, 2, 2, 2, 2, 4, 4, 3, 3], [6, 7]),
    redraw(600, "Air Kick", range(686, 691), [2, 2, 3, 4, 3, 3], [2, 3]),
    redraw(630, "Flying Kick", range(1050, 1058), [2, 2, 2, 2, 4, 4, 3, 3, 3], [4, 5]),
    redraw(1000, "Shredding Charge", [GUARD, ...range(420, 434)], [2, 2, 3, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2, 2, 3, 3], [2, 8, 14]),
    redraw(1100, "Uppercut Slash", [GUARD, ...range(150, 156)], [2, 2, 4, 5, 4, 3, 3, 3], [2, 3]),
    redraw(1200, "Leaping Chop", [GUARD, ...range(82, 88)], [2, 3, 3, 3, 3, 5, 4, 4], [5]),
    shred,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 10, effect: { anim: WORD_ANIM, x: units(50), y: units(TALL + 12), readable: true, ticks: 28 } },
    { action: 190, frame: 4, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 195, frame: 4, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 180, frame: 6, effect: { anim: WORD_ANIM + 2, x: 0, y: units(TALL + 16), readable: true, ticks: 70 } },
    { action: 1000, frame: 2, sound: SOUNDS.shing },
    { action: 1100, frame: 2, sound: SOUNDS.shing },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Red Tape", colors: { 8: "#e83030", 9: "#c02424", 10: "#8c1414", 11: "#601010", 12: "#3c0c0c", 13: "#6a3a3a", 14: "#a04040", 15: "#5a2a24" } },
    { name: "Deep Freeze", colors: { 8: "#40e0ff", 9: "#2cb8e0", 10: "#1484a8", 11: "#0c5878", 12: "#0a3448", 13: "#3a6a78", 14: "#4aa0c0", 15: "#2a5060" } },
    { name: "Golden Parachute", colors: { 8: "#ffe040", 9: "#e0bc20", 10: "#a88410", 11: "#78600c", 12: "#4a3a08", 13: "#78703a", 14: "#c0a840", 15: "#6a5a24" } },
  ],
  portrait: { cell: GUARD },
};
