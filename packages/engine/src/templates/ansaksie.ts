/**
 * "Ansaksie compatible with Alpha Contact" from Mustermenschen V1 (Puffolotti, CC0; art/SOURCES.md): 693 frames of a
 * lean Komato in blue armour with purple plates (palette 2-5 the blue, 14-16 and 22 the purple, 6-7 and 19 the red
 * skin, 13/17/25 the yellow lights), as one GIF (246 x 191, a palette per frame, gathered into one by art/gif.ts).
 * Despite its name it isn't on the Alpha Contact move list (alpha.ts), so it gets its own. The house fighter
 * **Purple Reign** (Sage), who summons a gun, red blades and a launcher. The catalogue, laid out 30 to a row:
 *
 *   0-13 guard, arms out · 14-25 crouched · 26-52 stepping in guard · 53-62 a belly dive · 66-73 jump · 74-75 landing ·
 *   76-95 a spinning jump · 104-115 arms wide, a double strike (107-108) · 125-131 kick (128) · 133-140 high side kick
 *   (136) · 141-150 side kick (145) · 151-160 jumping side kick (155) · 161-172 a lunging punch (163) · 184-196
 *   knocked flying, landing, getting up · 197-212 standing upright, a flip · 213-246 jumps, crouched · 253-262 low
 *   punch (258-260) · 263-268 low kick (266) · 276-285 knocked down, getting up · 287-291 the splits · 300-337 air kicks ·
 *   338-349 THE LAUNCHER, summoned and fired overhead (341-345) · 350-363 the gun, fired forward (351-354, 359-362) ·
 *   366-380 the gun, fired low and up · 413-420 hunched, hit · 421 rocked · 422-433 knocked down, launched, lying ·
 *   434-440 getting up · 441-455 tumbling, curled into a ball · 456-467 red blades summoned, a thrust (461-463) ·
 *   468-480 blades swung (473, 475) · 481-505 blade thrusts (487, 496-502) · 506-518 a spin of blades (508-512) ·
 *   519-527 a huge blade plunged down · 560-575 crouched, rising to arms raised · 600-612 a rising high kick (604-608) ·
 *   613-640 crouching kicks · 641-657 low kicks, sweep (654-656) · 658-667 a slide kick · 668-673 air kick (671) ·
 *   674-683 flying kick (678) · 684-692 axe kick (687-688)
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { laserArt } from "./chains.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { MUSTERMENSCHEN, MUSTERMENSCHEN_URL } from "./mustermenschen.ts";
import { PROJECTILE_SLOTS } from "./projectile.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const ANSAKSIE: ArtSource = {
  id: "ansaksie",
  file: `${MUSTERMENSCHEN}/Ansaksie compatible with Alpha Contact.gif`,
  sha256: "a064a51ea672b9f05a1b05498981d0c20bbb3c5cc18145fa4f178272f829a74f",
  cellWidth: 246,
  cellHeight: 191,
  columns: 30,
  rows: 24,
  // The guard (frame 0): feet from x 115 to 134, on row 181.
  axis: { x: 125, y: 181 },
  stray: [],
  // 101 pixels tall: at 300 about the Alpha Contact brutes' height.
  localcoord: 300,
  standardSprites: {
    "5000,0": feet(421), "5000,10": feet(421), "5000,20": feet(422),
    "5010,0": feet(413), "5010,10": feet(414), "5010,20": feet(415),
    "5020,0": feet(416), "5020,10": feet(417), "5020,20": feet(418),
    "5030,0": feet(184), "5030,10": feet(185), "5030,20": feet(186), "5030,30": feet(441), "5030,40": feet(442), "5030,50": feet(443),
    "5040,0": feet(432), "5040,10": feet(433), "5040,20": feet(445),
    "5060,0": feet(428), "5060,10": feet(430),
    "5070,0": feet(422), "5070,10": feet(423), "5070,20": feet(424),
  },
  credit: `Sprites: Mustermenschen V1 (Ansaksie, Alpha Contact) by Puffolotti (CC0), ${MUSTERMENSCHEN_URL}`,
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const sage: TemplateSpec = { ...ZONER, art: ANSAKSIE };
/** One of the Sage's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = sage.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(sage, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / ANSAKSIE.localcoord);
const TALL = 101;
const GUARD = 0;
/** The gun's bolt: royal purple. */
const BOLT = ["#ffffff", "#f4e0ff", "#d690ff", "#a030ff", "#6000b0", "#300058"] as const;
const words = heroWords([{ text: "BOW DOWN!", color: FX.yellow }, { text: "ALL HAIL!", color: FX.yellow }, { text: "PEW!", color: FX.yellow }], 2);

/** The gun: summoned and fired forward, a purple bolt. */
const royalDecree: AttackSpec = {
  state: 1000, name: "Royal Decree", from: "stand", command: "QCF_x", special: true,
  anim: { action: 1000, cells: range(350, 358), ticks: [3, 3, 6, 4, 3, 3, 3, 3, 3], anchor: "feet" },
  hits: [{ frames: [2], damage: 50, chip: 6, height: "high", weight: "medium", hitStun: 18, blockStun: 12, push: 4, hitSound: SOUNDS.zap }],
  projectile: { frame: 2, speed: 8, height: units(TALL * 0.66), offset: units(50), art: laserArt },
  ai: { range: 300, weight: 1 },
};

/** The signature: a launcher summoned onto the shoulder and fired, a long dark blast. BOW DOWN! */
const bowDown: AttackSpec = {
  state: 1400, name: "Bow Down", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [...range(338, 349), GUARD], ticks: [3, 3, 3, 5, 5, 5, 5, 6, 4, 4, 4, 4, 4], anchor: "feet" },
  hits: [{ frames: [3, 4, 5, 6], damage: 90, chip: 10, height: "high", weight: "heavy", hitStun: 24, blockStun: 16, push: 8, knockdown: true, launch: [5, -3], hitSound: SOUNDS.boom }],
  ai: { range: 200, weight: 0.8 },
};

export const PURPLE_REIGN: TemplateSpec = {
  ...sage,
  id: "gi-purple-reign",
  name: "Purple Reign",
  anims: [
    a(0, range(0, 13), 4, "stand: guard, arms out"),
    a(5, [GUARD], 3, "turn"),
    a(6, [16], 3, "crouch turn"),
    a(10, [14, 15], 2, "stand to crouch"),
    a(11, range(16, 25), 6, "crouched"),
    a(12, [15, 14], 2, "crouch to stand"),
    a(20, range(26, 36), 3, "walk forward: stepping in guard"),
    a(21, range(26, 36).reverse(), 3, "walk back"),
    a(40, [74], 2, "jump start"),
    a(41, range(66, 73), 4, "jump up"),
    a(42, range(76, 95), 2, "jump forward: a spinning jump"),
    a(43, range(66, 73).reverse(), 4, "jump back"),
    a(47, [74, 75], 3, "jump land"),
    a(100, range(26, 36), 2, "run"),
    a(105, [74, 70, 75], 4, "hop back"),
    a(120, [104], 2, "guard start"),
    a(121, [418], 2, "crouch guard start"),
    a(122, [70], 2, "air guard start"),
    a(130, [105], 10, "stand guard"),
    a(131, [418], 10, "crouch guard: hunched"),
    a(132, [70], 10, "air guard"),
    a(140, [104], 2, "guard end"),
    a(141, [418], 2, "crouch guard end"),
    a(142, [70], 2, "air guard end"),
    a(150, [421, 105], 3, "stand guard hit"),
    a(151, [416], 6, "crouch guard hit"),
    a(152, [70], 6, "air guard hit"),
    a(170, range(197, 199), 6, "lose (time over): stands upright", true),
    a(175, range(197, 199), 6, "draw (time over)", true),
    a(5000, [421, 0], 3, "hit high, light"),
    a(5001, [421, 421, 0], 3, "hit high, medium"),
    a(5002, [421, 422, 421], 3, "hit high, hard"),
    a(5005, [421, GUARD], 3, "recover high, light"),
    a(5006, [421, 421, GUARD], 3, "recover high, medium"),
    a(5007, [422, 421, 421, GUARD], 3, "recover high, hard"),
    a(5010, [413, 414], 3, "hit low, light"),
    a(5011, [413, 414, 415], 3, "hit low, medium"),
    a(5012, [414, 415, 415], 3, "hit low, hard"),
    a(5015, [414, 413], 3, "recover low, light"),
    a(5016, [415, 414, GUARD], 3, "recover low, medium"),
    a(5017, [415, 415, 414, GUARD], 3, "recover low, hard"),
    a(5020, [416], 6, "crouching hit, light"),
    a(5021, [417], 8, "crouching hit, medium"),
    a(5022, [418], 10, "crouching hit, hard"),
    a(5025, [416], 3, "crouching recover, light"),
    a(5026, [417], 4, "crouching recover, medium"),
    a(5027, [418, 417], 3, "crouching recover, hard"),
    a(5030, [184], 4, "hit in the air"),
    a(5035, [185], 3, "air hit transition"),
    a(5040, [450, 453, 455, GUARD], 3, "air recover: curled into a ball"),
    a(5050, [185, 186], 5, "falling"),
    a(5060, [441, 442], 5, "falling, coming down"),
    a(5070, [422, 423], 4, "tripped"),
    a(5080, [433], 4, "hit while down"),
    a(5090, [429], 4, "hit up while down"),
    a(5100, [443, 432], 3, "hit the ground"),
    a(5101, [429], 4, "bounce"),
    a(5110, [432], 30, "lying down"),
    a(5120, [...range(434, 440), GUARD], [6, 5, 5, 4, 4, 4, 5, 5], "getting up"),
    a(5140, [432], 30, "lying defeated", true),
    a(5150, [432], 30, "lying defeated (match over)", true),
    a(5160, [429], 4, "bounce into the air"),
    a(5170, [443, 432], 4, "hit the ground after a bounce"),
    a(5200, [455, GUARD], 3, "fall recovery near the ground"),
    a(5210, [450, 455, GUARD], 3, "fall recovery in the air"),
    a(180, range(570, 575), [5, 5, 5, 6, 8, 60], "win: rises, arms raised (ALL HAIL!)", true),
    a(181, range(197, 199), [6, 6, 60], "win: stands upright", true),
    a(190, [...range(456, 467), GUARD], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 8, 10], "intro: summons red blades and thrusts"),
    a(195, [...range(519, 527), GUARD], [4, 4, 4, 4, 5, 5, 6, 8, 10, 6], "taunt: plunges a huge blade down"),
  ],
  attacks: [
    redraw(200, "Double Strike", range(104, 109), [2, 2, 2, 4, 4, 3], [3, 4]),
    redraw(210, "Lunging Punch", range(161, 167), [2, 2, 4, 4, 3, 3, 3], [2]),
    redraw(230, "Kick", range(125, 131), [2, 2, 2, 4, 3, 3, 3], [3]),
    redraw(240, "High Side Kick", range(133, 140), [2, 2, 2, 4, 4, 3, 3, 3], [3, 4]),
    redraw(400, "Low Punch", range(253, 262), [2, 2, 2, 2, 2, 4, 4, 4, 3, 3], [5, 6, 7]),
    redraw(410, "Rising Kick", range(600, 610), [2, 2, 2, 2, 3, 4, 4, 3, 3, 3, 3], [4, 5, 6]),
    redraw(430, "Low Kick", range(264, 268), [2, 2, 4, 3, 3], [2, 3]),
    redraw(440, "Sweep", range(646, 657), [2, 2, 2, 2, 2, 2, 2, 2, 4, 4, 3, 3], [8, 9, 10]),
    redraw(600, "Air Kick", range(668, 673), [2, 2, 2, 4, 3, 3], [3]),
    redraw(630, "Flying Kick", range(674, 683), [2, 2, 2, 2, 5, 3, 3, 3, 3, 3], [4]),
    royalDecree,
    redraw(1100, "Axe Kick", range(684, 692), [2, 2, 2, 4, 4, 3, 3, 3, 3], [3, 4]),
    redraw(1200, "Blade Spin", range(506, 517), [2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3], [2, 3, 5]),
    bowDown,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 3, effect: { anim: WORD_ANIM, x: units(60), y: units(TALL + 20), readable: true, ticks: 30 } },
    { action: 180, frame: 3, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 70 } },
    { action: 1000, frame: 2, sound: SOUNDS.zap, effect: { anim: WORD_ANIM + 2, x: units(50), y: units(TALL + 12), readable: true, ticks: 20 } },
    { action: 1200, frame: 2, sound: SOUNDS.swishBig },
    { action: 190, frame: 2, sound: SOUNDS.shing },
  ] satisfies Cue[],
  colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, BOLT[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Royal Gold", colors: { 14: "#665000", 15: "#998000", 16: "#ccaa00", 22: "#332800", 8: "#261e00" } },
    { name: "Emerald Reign", colors: { 14: "#00663a", 15: "#009955", 16: "#00cc72", 22: "#003320", 8: "#002616" } },
    { name: "Crimson Reign", colors: { 14: "#66000f", 15: "#990016", 16: "#cc001e", 22: "#330008", 8: "#260006", 2: "#1a1a1a", 3: "#3a3a3a", 4: "#262626", 5: "#0d0d0d" } },
  ],
  portrait: { cell: GUARD },
};
