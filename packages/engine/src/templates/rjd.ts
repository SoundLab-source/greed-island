/**
 * "RJD", a big bearded brawler for MUGEN (Puffolotti, CC0; art/SOURCES.md): 1,435 frames as one animated GIF
 * (252 x 187, a 128-colour palette), laid out 30 to a row so frame n is cell n (art/gif.ts). A 1.93 m, 120 kg man
 * in a black jacket with orange stripes and grey jeans, boxing, on the generic move list the artist made for Ava Lee,
 * plus his own overhead hammer punch. The frame catalogue behind the house fighter's choices:
 *
 *   0-6 bouncing guard · 7-10 jab · 10-13 cross · 20-25 lunging punch · 26-29 high kick · 33-42 jumping spin kicks ·
 *   49-51 side kick · 53-57 high kick · 64-83 shuffling in guard · 88-99 a low dive and rising · 100-103 sliding kick ·
 *   104-119 stepping in guard · 120-122 big lunging punch · 123-131 cartwheel · 148-159 standing easy ·
 *   170-173 leaning back · 174-182 doubled over · 200-208 low punches · 209-214 slide · 215-222 a handstand roll ·
 *   224-242 crouched, creeping · 282-295 jump and flying kick · 313-317 rocked back · 318-328 knocked flying, lying ·
 *   329-332 launched upside down · 333-337 lying · 338-343 getting up · 352-359 covering up · 360-388 low kicks ·
 *   400-415 knocked down, falling back · 420-427 straights · 448-459 spinning back fist · 463-482 a long low lunge ·
 *   500-507 low straight · 508-521 jump and flying kick · 537-547 somersault · 568-583 jumping kicks ·
 *   588-600 falls back stiff · 601-613 falls forward on his face · 614-620 knee · 657-663 scratches his head ·
 *   717-723 side kick · 732-738 high kick · 746-750 spinning kick · 757-762 sweep · 824-829 straight ·
 *   840-847 ducking · 857-862 cartwheel · 863-871 a lunging charge · 872-881 a wide squat · 885-892 fist pump ·
 *   893-903 faces the camera and points · 921-937 bent over, winded · 948-957 THE HAMMER PUNCH ·
 *   958-975 jumping straight up · 1000-1050 punches in the air (1019-1023 forward, 1027-1033 an overhead hammer) ·
 *   1051-1121 kicks in the air (1116-1121 flying kick) · 1122-1135 crouched, crouching jab · 1136-1145 rising uppercut ·
 *   1146-1237 crouching punches and kicks · 1238-1259 rolls · 1280-1288 cartwheel · 1315-1326 forward flip ·
 *   1327-1331 arms wide, facing the camera · 1340-1368 flips, a dive and getting up · 1400-1434 low kicks and a slide
 *
 * Frames aren't all on one ground line (the falls sit lower), so every animation anchors each frame's lowest pixel.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { HEAVY } from "./heavy.ts";
import type { AnimSpec, ArtSource, AttackSpec, Cue, HueShift, TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });
const GUARD = 0;

export const RJD: ArtSource = {
  id: "rjd",
  file: "art/sources/rjd/rjd-sequence.gif",
  sha256: "6ad2b0ffda9fd32208a0723b6532842ce39ee9c892093c7c1d3f18da433d3359",
  cellWidth: 252,
  cellHeight: 187,
  columns: 30,
  rows: 48,
  // Frame 0: his body from x 100 to 158, feet on row 167.
  axis: { x: 127, y: 167 },
  stray: [],
  // 118 pixels tall: at 340 (Rhivan's) a head taller than the Thai boxers, as a 1.93 m man should be.
  localcoord: 340,
  standardSprites: {
    "5000,0": feet(314), "5000,10": feet(315), "5000,20": feet(316),
    "5010,0": feet(176), "5010,10": feet(177), "5010,20": feet(178),
    "5020,0": feet(842), "5020,10": feet(843), "5020,20": feet(843),
    "5030,0": feet(318), "5030,10": feet(319), "5030,20": feet(320), "5030,30": feet(321), "5030,40": feet(322), "5030,50": feet(323),
    "5040,0": feet(325), "5040,10": feet(326), "5040,20": feet(327),
    "5060,0": feet(329), "5060,10": feet(330),
    "5070,0": feet(590), "5070,10": feet(591), "5070,20": feet(592),
  },
  credit: "Sprites: RJD by Puffolotti (CC0), https://opengameart.org/content/rjd-mugenfighting-character-based-on-bud-spencer-something-left-to-be-fixed",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});

const bruiser: TemplateSpec = { ...HEAVY, art: RJD };
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => redrawMove(bruiser, state, name, cells, ticks, frames, { anchor: "feet" });
const units = (px: number) => Math.round((px * 320) / RJD.localcoord);

/** Clothes in a hue band, to another hue (only well-saturated colours by default). */
const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.45, ...more });
/** The jacket's stripes (orange-brown, well saturated) and the jeans (a greyish blue). */
const STRIPES = (hue: number | null, more: Partial<HueShift> = {}) => shift(18, 30, hue, { minSat: 0.5, ...more });
const JEANS = (hue: number | null, more: Partial<HueShift> = {}) => shift(198, 222, hue, { minSat: 0.08, ...more });

const words = heroWords([{ text: "BONK!", color: FX.yellow }, { text: "WHO, ME?", color: FX.white }], 2);
const say = (n: number, x: number, ticks: number) => ({ anim: WORD_ANIM + n, x: units(x), y: units(130), readable: true, ticks });

/** His signature: the fist raised high and brought down on the opponent's head like a hammer. BONK! */
const hammerPunch: AttackSpec = {
  state: 1400, name: "Hammer Punch", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [...range(948, 957), GUARD], ticks: [3, 4, 6, 3, 3, 4, 6, 6, 5, 5, 4], anchor: "feet" },
  hits: [{ frames: [4, 5], damage: 110, chip: 12, height: "overhead", weight: "heavy", hitStun: 30, blockStun: 18, push: 4, knockdown: true, launch: [1, -2], hitSound: SOUNDS.bonk }],
  moves: [{ frame: 2, x: 2 }, { frame: 5, x: 0 }],
  ai: { range: 70, weight: 1.2 },
};

export const HAMMER_BEAR: TemplateSpec = {
  ...bruiser,
  id: "gi-hammer-bear",
  name: "Hammer Bear",
  anims: [
    a(0, [...range(0, 6), ...range(1, 5).reverse()], 5, "stand: a bouncing guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [1124], 3, "crouch turn"),
    a(10, [840, 841], 2, "stand to crouch"),
    a(11, [1122, 1123, 1124, 1125, 1124, 1123], 8, "crouching, fists up"),
    a(12, [841, 840], 2, "crouch to stand"),
    a(20, range(64, 83), 4, "walk forward: shuffling in guard"),
    a(21, range(64, 83).reverse(), 4, "walk back"),
    a(40, [958, 959], 2, "jump start"),
    a(41, range(960, 972), 3, "jump up: knees up"),
    a(42, [...range(284, 287), ...range(290, 293)], 4, "jump forward"),
    a(43, range(960, 972).reverse(), 3, "jump back"),
    a(47, [973, 974], 3, "jump land"),
    a(100, range(104, 119), 2, "run: stepping in fast"),
    a(105, [958, 966, 975], 4, "hop back"),
    a(120, [353, 354], 2, "guard start"),
    a(121, [842], 2, "crouch guard start"),
    a(122, [966], 2, "air guard start"),
    a(130, [356], 10, "stand guard: covering up"),
    a(131, [842], 10, "crouch guard: ducked, covering"),
    a(132, [966], 10, "air guard"),
    a(140, [354, 353], 2, "guard end"),
    a(141, [842], 2, "crouch guard end"),
    a(142, [966], 2, "air guard end"),
    a(150, [357, 356], 3, "stand guard hit"),
    a(151, [843], 6, "crouch guard hit"),
    a(152, [966], 6, "air guard hit"),
    a(170, range(928, 933), 6, "lose (time over): bent over, winded", true),
    a(175, range(928, 933), 6, "draw (time over)", true),
    a(5000, [314, 315], 3, "hit high, light"),
    a(5001, [314, 315, 316], 3, "hit high, medium"),
    a(5002, [315, 316, 317], 3, "hit high, hard"),
    a(5005, [315, 314], 3, "recover high, light"),
    a(5006, [316, 315, 314], 3, "recover high, medium"),
    a(5007, [317, 316, 315, GUARD], 3, "recover high, hard"),
    a(5010, [176, 177], 3, "hit low, light"),
    a(5011, [176, 177, 178], 3, "hit low, medium"),
    a(5012, [177, 178, 179], 3, "hit low, hard"),
    a(5015, [177, 176], 3, "recover low, light"),
    a(5016, [178, 177, GUARD], 3, "recover low, medium"),
    a(5017, [179, 178, 177, GUARD], 3, "recover low, hard"),
    a(5020, [842], 6, "crouching hit, light"),
    a(5021, [843], 8, "crouching hit, medium"),
    a(5022, [843], 10, "crouching hit, hard"),
    a(5025, [842], 3, "crouching recover, light"),
    a(5026, [843], 4, "crouching recover, medium"),
    a(5027, [843, 842], 3, "crouching recover, hard"),
    a(5030, [318], 4, "hit in the air"),
    a(5035, [319], 3, "air hit transition"),
    a(5040, [331, 332, 343], 4, "air recover"),
    a(5050, [319, 320], 5, "falling"),
    a(5060, [321, 322], 5, "falling, coming down"),
    a(5070, [590, 591], 4, "tripped: falls back stiff"),
    a(5080, [326], 4, "hit while down"),
    a(5090, [330], 4, "hit up while down"),
    a(5100, [323, 325], 3, "hit the ground"),
    a(5101, [322], 4, "bounce"),
    a(5110, [326], 30, "lying down"),
    a(5120, [...range(337, 343), GUARD], [6, 5, 4, 4, 4, 4, 5, 5], "getting up"),
    a(5140, [326], 30, "lying defeated", true),
    a(5150, [326], 30, "lying defeated (match over)", true),
    a(5160, [322], 4, "bounce into the air"),
    a(5170, [323, 325], 4, "hit the ground after a bounce"),
    a(5200, [331, 343], 3, "fall recovery near the ground"),
    a(5210, [331, 332, 343], 3, "fall recovery in the air"),
    a(180, range(885, 892), [5, 5, 5, 5, 5, 6, 8, 60], "win: a fist pump", true),
    a(181, range(1327, 1330), [6, 6, 6, 60], "win: arms wide, facing the camera", true),
    a(190, [...range(657, 663), ...range(872, 880), GUARD], [6, 6, 6, 6, 6, 6, 8, 5, 5, 5, 5, 5, 5, 5, 5, 10, 10], "intro: scratches his head (WHO, ME?), then squares up"),
    a(195, range(893, 903), [5, 5, 5, 5, 5, 5, 5, 6, 10, 6, 5], "taunt: faces the camera and points"),
  ],
  attacks: [
    redraw(200, "Jab", range(6, 10), [2, 2, 3, 3, 3], [1, 2]),
    redraw(210, "Cross", [...range(10, 13), GUARD], [2, 3, 4, 4, 4], [2, 3]),
    redraw(230, "Side Kick", range(717, 723), [2, 3, 3, 4, 4, 3, 3], [2, 3, 4]),
    redraw(240, "High Kick", range(732, 738), [3, 3, 3, 4, 5, 4, 4], [3, 4]),
    redraw(400, "Crouching Jab", range(1129, 1135), [2, 2, 2, 3, 3, 3, 3], [3, 4]),
    redraw(410, "Rising Punch", range(1146, 1153), [2, 2, 2, 2, 3, 3, 4, 4], [5, 6]),
    redraw(430, "Low Kick", range(1400, 1405), [2, 3, 3, 4, 3, 3], [2, 3]),
    redraw(440, "Sweep", range(757, 762), [3, 3, 4, 4, 4, 4], [2, 3]),
    redraw(600, "Jumping Punch", range(1019, 1023), [3, 3, 4, 4, 4], [2, 3]),
    redraw(630, "Flying Kick", range(1116, 1121), [3, 3, 5, 5, 4, 4], [2, 3]),
    // Steps in and throws the lunging punch (the GIF's own charge travels inside its frames and would snap back).
    redraw(1000, "Bulldozer", [GUARD, ...range(104, 107), ...range(20, 25)], [2, 3, 3, 3, 3, 4, 5, 4, 4, 4, 4], [5, 6]),
    redraw(1100, "Heavy Uppercut", range(1136, 1145), [2, 2, 2, 2, 3, 6, 5, 4, 4, 4], [4, 5]),
    redraw(1200, "Hammer Drop", [958, 959, ...range(1027, 1033), 973], [3, 3, 3, 4, 6, 4, 4, 5, 5, 4], [6, 7]),
    hammerPunch,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 4, effect: say(0, 60, 30) },
    { action: 1200, frame: 6, sound: SOUNDS.bonk },
    { action: 190, frame: 2, effect: say(1, 0, 30) },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Gold Stripes", colors: {}, shifts: [STRIPES(48, { light: 1.25 }), JEANS(null, { light: 0.45 })] },
    { name: "Navy", colors: {}, shifts: [STRIPES(210), JEANS(28, { tint: 0.35, light: 1.1 })] },
    { name: "Red Stripes", colors: {}, shifts: [STRIPES(356, { light: 1.1 }), JEANS(212, { tint: 0.45 })] },
  ],
  portrait: { cell: GUARD },
};
