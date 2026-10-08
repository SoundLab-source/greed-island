/**
 * "Chibi grunt base, several fighting styles" (Puffolotti, CC0; art/SOURCES.md): 5,380 frames of a big-headed little
 * soldier in an olive shirt and green trousers (palette ramps 25-28 the shirt, 29-32 the trousers, 9-12 the hair, 5-8
 * the skin, 37-40 the boots) as one GIF (141 x 152), laid out 30 to a row so frame n is cell n. The basics and one
 * style's punches and kicks are in the first 900 frames, which this fighter uses; the rest are more styles. The house
 * fighter **Short Fuse** (Striker). The catalogue of those frames:
 *
 *   0-13 walk · 14-23 guard · 24-27 waving · 50-54 standing · 55-62 covering the face · 63-73 doubled over ·
 *   74-75 crouched · 78-86 falling back, lying · 87-99 knocked flying, tumbling flat · 100-105 lying ·
 *   106-117 launched stiff, falling flat · 118-124 rolling up · 125-149 staggering back · 160-186 stepping ·
 *   186-199 jump · 216-218 pointing · 225-229 jab (226) · 262-267 punch · 282-287 cross (284-285) · 350-356 a punch ·
 *   376-382 kick (379-381) · 384-390 spinning kick (386-387) · 402-407 rising kick (404-406) · 413-420 high kick
 *   (416-418) · 426-434 spin kick (427, 429) · 500-534 a grab and a tackle · 552-558 cartwheel · 560-705 jumps and air
 *   attacks (603-604 air punch, 669-670 flying kick, 700-702 dive kick) · 706-758 crouched, low punches (729), low kicks
 *   (738, 745-746) · 764-772 a roll · 786-799 a flurry of punches (787, 792-794, 797) · 808-842 kicks · 849-855 a low
 *   sweep (851-853)
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const CHIBI_GRUNT: ArtSource = {
  id: "chibi-grunt",
  file: "art/sources/chibi-grunt/sequence.gif",
  sha256: "c8db090952a5d5bdc2b663b01226e86b4a7bede5bcd59a23f58e0a20177c7821",
  cellWidth: 141,
  cellHeight: 152,
  columns: 30,
  rows: 180,
  // The guard (frame 14): feet from x 59 to 82, on row 133.
  axis: { x: 70, y: 133 },
  stray: [],
  // 70 pixels tall, a chibi: at 300 three-quarters of a Thai boxer's height.
  localcoord: 300,
  standardSprites: {
    "5000,0": feet(125), "5000,10": feet(126), "5000,20": feet(127),
    "5010,0": feet(64), "5010,10": feet(65), "5010,20": feet(66),
    "5020,0": feet(74), "5020,10": feet(75), "5020,20": feet(75),
    "5030,0": feet(87), "5030,10": feet(88), "5030,20": feet(89), "5030,30": feet(90), "5030,40": feet(91), "5030,50": feet(93),
    "5040,0": feet(104), "5040,10": feet(105), "5040,20": feet(84),
    "5060,0": feet(106), "5060,10": feet(107),
    "5070,0": feet(78), "5070,10": feet(79), "5070,20": feet(80),
  },
  credit: "Sprites: Chibi grunt base, several fighting styles by Puffolotti (CC0), https://opengameart.org/content/chibi-grunt-base-several-fighting-styles-1",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const striker: TemplateSpec = { ...RUSHDOWN, art: CHIBI_GRUNT };
/** One of the Striker's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = striker.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(striker, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / CHIBI_GRUNT.localcoord);
const TALL = 70;
const GUARD = 14;
const words = heroWords([{ text: "TANTRUM!", color: FX.yellow }, { text: "HI!", color: FX.white }, { text: "YOU!", color: FX.yellow }, { text: "TOO SHORT?!", color: FX.yellow }], 2);

/** His signature: a frantic flurry of punches, three hits. TANTRUM! */
const temperTantrum: AttackSpec = {
  state: 1400, name: "Temper Tantrum", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [...range(786, 799), GUARD], ticks: [2, 3, 2, 2, 2, 2, 3, 3, 2, 2, 2, 3, 3, 3, 5], anchor: "feet" },
  hits: [
    { frames: [1], damage: 25, height: "high", weight: "light", hitStun: 16, blockStun: 9, push: 1 },
    { frames: [6, 7], damage: 25, height: "high", weight: "light", hitStun: 16, blockStun: 9, push: 1 },
    { frames: [11], damage: 40, chip: 5, height: "high", weight: "heavy", hitStun: 22, blockStun: 13, push: 6, knockdown: true, launch: [3, -4] },
  ],
  moves: [{ frame: 0, x: 2 }, { frame: 12, x: 0 }],
  ai: { range: 55, weight: 1 },
};

export const SHORT_FUSE: TemplateSpec = {
  ...striker,
  id: "gi-short-fuse",
  name: "Short Fuse",
  anims: [
    a(0, range(14, 23), 4, "stand: guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [75], 3, "crouch turn"),
    a(10, [74], 2, "stand to crouch"),
    a(11, range(710, 713), 6, "crouched"),
    a(12, [74], 2, "crouch to stand"),
    a(20, range(0, 13), 3, "walk forward"),
    a(21, range(0, 13).reverse(), 3, "walk back"),
    a(40, [186], 2, "jump start"),
    a(41, range(187, 192), 4, "jump up"),
    a(42, range(187, 192), 4, "jump forward"),
    a(43, range(187, 192).reverse(), 4, "jump back"),
    a(47, [193, 194], 3, "jump land"),
    a(100, range(160, 170), 2, "run"),
    a(105, [186, 189, 193], 4, "hop back"),
    a(120, [57, 58], 2, "guard start"),
    a(121, [75], 2, "crouch guard start"),
    a(122, [189], 2, "air guard start"),
    a(130, [58], 10, "stand guard: covering the face"),
    a(131, [75], 10, "crouch guard"),
    a(132, [189], 10, "air guard"),
    a(140, [58, 57], 2, "guard end"),
    a(141, [75], 2, "crouch guard end"),
    a(142, [189], 2, "air guard end"),
    a(150, [59, 58], 3, "stand guard hit"),
    a(151, [74], 6, "crouch guard hit"),
    a(152, [189], 6, "air guard hit"),
    a(170, range(50, 54), 6, "lose (time over): stands there", true),
    a(175, range(50, 54), 6, "draw (time over)", true),
    a(5000, [125, 126], 3, "hit high, light"),
    a(5001, [125, 126, 127], 3, "hit high, medium"),
    a(5002, [126, 127, 128], 3, "hit high, hard"),
    a(5005, [126, 125], 3, "recover high, light"),
    a(5006, [127, 126, GUARD], 3, "recover high, medium"),
    a(5007, [128, 127, 126, GUARD], 3, "recover high, hard"),
    a(5010, [64, 65], 3, "hit low, light"),
    a(5011, [64, 65, 66], 3, "hit low, medium"),
    a(5012, [65, 66, 67], 3, "hit low, hard"),
    a(5015, [65, 64], 3, "recover low, light"),
    a(5016, [66, 65, GUARD], 3, "recover low, medium"),
    a(5017, [67, 66, 65, GUARD], 3, "recover low, hard"),
    a(5020, [74], 6, "crouching hit, light"),
    a(5021, [75], 8, "crouching hit, medium"),
    a(5022, [75], 10, "crouching hit, hard"),
    a(5025, [74], 3, "crouching recover, light"),
    a(5026, [75], 4, "crouching recover, medium"),
    a(5027, [75, 74], 3, "crouching recover, hard"),
    a(5030, [87], 4, "hit in the air"),
    a(5035, [88], 3, "air hit transition"),
    a(5040, [764, 766, 768, GUARD], 3, "air recover: a roll"),
    a(5050, [88, 89], 5, "falling"),
    a(5060, [90, 91], 5, "falling, coming down"),
    a(5070, [78, 79], 4, "tripped: falls back"),
    a(5080, [105], 4, "hit while down"),
    a(5090, [93], 4, "hit up while down"),
    a(5100, [92, 104], 3, "hit the ground"),
    a(5101, [93], 4, "bounce"),
    a(5110, [104], 30, "lying down"),
    a(5120, [...range(118, 124), GUARD], [6, 5, 5, 4, 4, 4, 5, 5], "getting up: rolls up"),
    a(5140, [104], 30, "lying defeated", true),
    a(5150, [104], 30, "lying defeated (match over)", true),
    a(5160, [93], 4, "bounce into the air"),
    a(5170, [92, 104], 4, "hit the ground after a bounce"),
    a(5200, [768, GUARD], 3, "fall recovery near the ground"),
    a(5210, [764, 768, GUARD], 3, "fall recovery in the air"),
    a(180, [...range(24, 27), ...range(24, 27)], [5, 5, 5, 5, 5, 5, 5, 60], "win: waving (TOO SHORT?!)", true),
    a(181, range(552, 558), [4, 4, 4, 4, 4, 5, 60], "win: a cartwheel", true),
    a(190, [...range(24, 27), ...range(24, 27), GUARD], [5, 5, 5, 5, 5, 5, 5, 5, 10], "intro: waves (HI!)"),
    a(195, [...range(215, 219), GUARD], [5, 5, 6, 12, 6, 8], "taunt: points (YOU!)"),
  ],
  attacks: [
    redraw(200, "Jab", [GUARD, ...range(225, 229)], [2, 2, 3, 3, 3, 3], [2]),
    redraw(210, "Cross", [GUARD, ...range(282, 287)], [2, 2, 2, 4, 4, 3, 3], [3, 4]),
    redraw(230, "Kick", range(376, 382), [2, 2, 2, 3, 4, 4, 3], [3, 4, 5]),
    redraw(240, "High Kick", range(413, 420), [2, 2, 2, 3, 4, 4, 3, 3], [3, 4, 5]),
    redraw(400, "Low Punch", range(725, 731), [2, 2, 2, 2, 4, 3, 3], [4]),
    redraw(410, "Low Kick", range(742, 747), [2, 2, 2, 4, 4, 3], [3, 4]),
    redraw(430, "Shin Kick", range(736, 741), [2, 2, 4, 3, 3, 3], [2, 3]),
    redraw(440, "Sweep", range(849, 855), [2, 2, 4, 4, 4, 3, 3], [2, 3, 4]),
    redraw(600, "Air Punch", range(600, 606), [2, 2, 2, 4, 4, 3, 3], [3, 4]),
    redraw(630, "Flying Kick", range(666, 672), [2, 2, 2, 4, 4, 3, 3], [3, 4]),
    redraw(1000, "Spin Kick", range(426, 434), [2, 3, 3, 3, 3, 3, 3, 3, 3], [1, 3]),
    redraw(1100, "Rising Kick", range(402, 407), [2, 2, 3, 4, 4, 3], [2, 3, 4]),
    redraw(1200, "Tornado Kick", range(384, 390), [2, 2, 3, 4, 3, 3, 3], [2, 3]),
    temperTantrum,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 6, effect: { anim: WORD_ANIM, x: units(30), y: units(TALL + 12), readable: true, ticks: 30 } },
    { action: 190, frame: 1, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 195, frame: 2, effect: { anim: WORD_ANIM + 2, x: units(20), y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 180, frame: 2, effect: { anim: WORD_ANIM + 3, x: 0, y: units(TALL + 16), readable: true, ticks: 70 } },
    { action: 1400, frame: 1, sound: SOUNDS.swish },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Hot Head", colors: { 25: "#b02a1a", 26: "#8a2014", 27: "#5c150d", 28: "#2e0b07", 9: "#c86a12", 10: "#9a500e", 11: "#6a3709", 12: "#351c05" } },
    { name: "Navy Brat", colors: { 25: "#2a4a8a", 26: "#20386a", 27: "#152548", 28: "#0b1324", 29: "#3a3a3a", 30: "#2c2c2c", 31: "#1e1e1e", 32: "#0f0f0f" } },
    { name: "Pocket Rocket", colors: { 25: "#e8c020", 26: "#b89418", 27: "#7c6410", 28: "#3e3208", 29: "#2a2a6a", 30: "#202050", 31: "#151536", 32: "#0b0b1b" } },
  ],
  portrait: { cell: GUARD },
};
