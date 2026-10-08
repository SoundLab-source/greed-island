/**
 * "Armin the android for fighting games" (Puffolotti, CC0; art/SOURCES.md): two GIFs of a shirtless muscleman in camo
 * trousers (a cyborg, as the story goes, modelled on "an actor from the past"). The second (805 frames, 370 x 248, a
 * 256-colour palette) is the fuller one, a kickboxer's move list with throws; the first (402 frames) is a shorter set
 * on the generic sequence and isn't used. The house fighter **Box Office** (Striker), an action-movie hero. The frame
 * catalogue of the second GIF, laid out 30 to a row so frame n is cell n:
 *
 *   0-9 bouncing guard · 10-12 knee up · 13-20 jab · 21-32 cross · 33-61 punches · 62-69 side kick ·
 *   70-76 high kick · 93-97 kicks · 100-112 a guard, covering up (106-108) · 113-139 hops and punches ·
 *   140-152 stepping in, punching · 200-215 kicks · 246-252 high kick, side kick · 280-299 punches ·
 *   300-305 snap kick · 320-339 a low lunging punch into a high kick · 340-409 punch combinations ·
 *   410-419 low lunge, uppercut · 440-455 kicks · 456-470 a low dive · 480-486 cartwheel kick ·
 *   487-493 fists raised · 494-499 rocked back · 506-514 doubled over · 520-559 standing easy · 560-574 kicks ·
 *   575-588 crouched, crouching punches · 594-599 crouching kick · 600-606 rising high kick ·
 *   608-618 a low sliding kick · 619-637 crouched · 638-657 jump · 658-663 a roll · 664-687 jumps ·
 *   688-695 air kick · 697-702 flying kick · 706-707 tucked · 708-711 rocked back · 712-716 hit crouching ·
 *   719-732 falls, launched, lying, getting up · 733-743 standing tall · 744-752 sweep ·
 *   753-766 handstand spin kick · 767-804 stepping in, a grab and turning (throw)
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const ARMIN: ArtSource = {
  id: "armin",
  file: "art/sources/armin/armin2.gif",
  sha256: "52fa0e14e44002954a6799fe2fdb4232ff0ed82975333ef9b51746a01d5373a2",
  cellWidth: 370,
  cellHeight: 248,
  columns: 30,
  rows: 27,
  // The guard (frame 0): his feet about x 150, on row 230.
  axis: { x: 150, y: 230 },
  stray: [],
  // 183 pixels tall: at 520 about Hammer Bear's height, a big man.
  localcoord: 520,
  standardSprites: {
    "5000,0": feet(708), "5000,10": feet(709), "5000,20": feet(710),
    "5010,0": feet(510), "5010,10": feet(511), "5010,20": feet(512),
    "5020,0": feet(714), "5020,10": feet(715), "5020,20": feet(716),
    "5030,0": feet(719), "5030,10": feet(727), "5030,20": feet(728), "5030,30": feet(729), "5030,40": feet(721), "5030,50": feet(722),
    "5040,0": feet(730), "5040,10": feet(731), "5040,20": feet(720),
    "5060,0": feet(725), "5060,10": feet(726),
    "5070,0": feet(727), "5070,10": feet(728), "5070,20": feet(729),
  },
  credit: "Sprites: Armin the android for fighting games by Puffolotti (CC0), https://opengameart.org/content/armin-the-android-for-fighting-games",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const striker: TemplateSpec = { ...RUSHDOWN, art: ARMIN };
/** One of the Striker's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = striker.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(striker, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / ARMIN.localcoord);
const TALL = 183;
const GUARD = 0;
/** The camo's greens (well below the skin's saturation), to another hue. */
const CAMO = (hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from: 60, to: 100, hue, minSat: 0.1, ...more });
const words = heroWords([{ text: "BLOCKBUSTER!", color: FX.yellow }, { text: "COMING SOON", color: FX.white }, { text: "BOX OFFICE HIT!", color: FX.yellow }, { text: "ROLL CREDITS", color: FX.white }], 2);

/** His signature: a low lunging punch, then up into a high kick. BLOCKBUSTER! */
const blockbuster: AttackSpec = {
  state: 1400, name: "Blockbuster", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(325, 337), GUARD], ticks: [2, 2, 2, 2, 3, 3, 4, 4, 3, 3, 3, 3, 3, 6, 5], anchor: "feet" },
  hits: [
    { frames: [6, 7], damage: 50, chip: 6, height: "low", weight: "medium", hitStun: 22, blockStun: 12, push: 2 },
    { frames: [12], damage: 60, chip: 6, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 6, knockdown: true, launch: [3, -5] },
  ],
  ai: { range: 90, weight: 0.9 },
};

export const BOX_OFFICE: TemplateSpec = {
  ...striker,
  id: "gi-box-office",
  name: "Box Office",
  anims: [
    a(0, range(0, 9), 4, "stand: a bouncing guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [585], 3, "crouch turn"),
    a(10, [576, 577], 2, "stand to crouch"),
    a(11, range(584, 587), 6, "crouched"),
    a(12, [577, 576], 2, "crouch to stand"),
    a(20, range(0, 9), 3, "walk forward: bouncing in guard"),
    a(21, range(0, 9).reverse(), 3, "walk back"),
    a(40, [638, 639], 2, "jump start"),
    a(41, range(640, 650), 4, "jump up"),
    a(42, range(664, 676), 3, "jump forward"),
    a(43, range(640, 650).reverse(), 4, "jump back"),
    a(47, [657], 3, "jump land"),
    a(100, range(140, 148), 2, "run: stepping in"),
    a(105, [639, 645, 657], 4, "hop back"),
    a(120, [106, 107], 2, "guard start"),
    a(121, [585], 2, "crouch guard start"),
    a(122, [707], 2, "air guard start"),
    a(130, [108], 10, "stand guard: covering up"),
    a(131, [585], 10, "crouch guard"),
    a(132, [707], 10, "air guard: tucked"),
    a(140, [107, 106], 2, "guard end"),
    a(141, [585], 2, "crouch guard end"),
    a(142, [707], 2, "air guard end"),
    a(150, [709, 108], 3, "stand guard hit"),
    a(151, [714], 6, "crouch guard hit"),
    a(152, [707], 6, "air guard hit"),
    a(170, range(733, 743), 6, "lose (time over): stands tall", true),
    a(175, range(733, 743), 6, "draw (time over)", true),
    a(5000, [708, 709], 3, "hit high, light"),
    a(5001, [708, 709, 710], 3, "hit high, medium"),
    a(5002, [709, 710, 711], 3, "hit high, hard"),
    a(5005, [709, 708], 3, "recover high, light"),
    a(5006, [710, 709, GUARD], 3, "recover high, medium"),
    a(5007, [711, 710, 709, GUARD], 3, "recover high, hard"),
    a(5010, [510, 511], 3, "hit low, light"),
    a(5011, [510, 511, 512], 3, "hit low, medium"),
    a(5012, [511, 512, 513], 3, "hit low, hard"),
    a(5015, [511, 510], 3, "recover low, light"),
    a(5016, [512, 511, GUARD], 3, "recover low, medium"),
    a(5017, [513, 512, 511, GUARD], 3, "recover low, hard"),
    a(5020, [714], 6, "crouching hit, light"),
    a(5021, [715], 8, "crouching hit, medium"),
    a(5022, [716], 10, "crouching hit, hard"),
    a(5025, [714], 3, "crouching recover, light"),
    a(5026, [715], 4, "crouching recover, medium"),
    a(5027, [716, 715], 3, "crouching recover, hard"),
    a(5030, [719], 4, "hit in the air"),
    a(5035, [727], 3, "air hit transition"),
    a(5040, [706, 707, GUARD], 4, "air recover: tucked"),
    a(5050, [727, 728], 5, "falling"),
    a(5060, [728, 729], 5, "falling, coming down"),
    a(5070, [727, 728], 4, "tripped"),
    a(5080, [731], 4, "hit while down"),
    a(5090, [721], 4, "hit up while down"),
    a(5100, [729, 730], 3, "hit the ground"),
    a(5101, [722], 4, "bounce"),
    a(5110, [730], 30, "lying down"),
    a(5120, [731, 732, 586, 576, GUARD], [6, 6, 5, 4, 5], "getting up"),
    a(5140, [730], 30, "lying defeated", true),
    a(5150, [730], 30, "lying defeated (match over)", true),
    a(5160, [722], 4, "bounce into the air"),
    a(5170, [729, 730], 4, "hit the ground after a bounce"),
    a(5200, [707, GUARD], 3, "fall recovery near the ground"),
    a(5210, [706, 707, GUARD], 3, "fall recovery in the air"),
    a(180, range(487, 493), [5, 5, 5, 5, 6, 8, 60], "win: fists raised (BOX OFFICE HIT!)", true),
    a(181, range(733, 743), [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 60], "win: stands tall", true),
    a(190, [...range(733, 743), GUARD], [8, 6, 6, 6, 6, 6, 6, 6, 6, 6, 8, 10], "intro: stands tall (COMING SOON), then into his guard"),
    a(195, [...range(487, 493), GUARD], [5, 5, 5, 5, 6, 10, 6, 6], "taunt: fists raised (ROLL CREDITS)"),
  ],
  attacks: [
    redraw(200, "Jab", [GUARD, ...range(17, 20)], [2, 2, 3, 3, 3], [2, 3]),
    redraw(210, "Cross", [GUARD, ...range(23, 29)], [2, 2, 2, 2, 3, 4, 3, 3], [4, 5]),
    redraw(230, "Snap Kick", range(300, 305), [2, 2, 2, 3, 4, 3], [3, 4]),
    redraw(240, "Roundhouse", range(62, 69), [2, 2, 2, 3, 4, 4, 4, 3], [4, 5, 6]),
    redraw(400, "Crouching Jab", [577, 578, 579, 580], [2, 2, 4, 3], [2]),
    redraw(410, "Crouching Straight", [577, 582, 583, 584], [2, 2, 5, 3], [2]),
    redraw(430, "Crouching Kick", [577, 595, 596, 597, 598], [2, 2, 3, 4, 3], [2, 3]),
    redraw(440, "Sweep", range(744, 750), [2, 2, 3, 4, 4, 3, 3], [2, 3, 4]),
    redraw(600, "Air Kick", range(689, 695), [2, 2, 3, 4, 4, 3, 3], [2, 3]),
    redraw(630, "Flying Kick", range(697, 702), [2, 3, 4, 4, 4, 3], [2, 3, 4]),
    redraw(1000, "Cartwheel Kick", range(480, 486), [3, 3, 3, 4, 4, 4, 4], [3, 4]),
    redraw(1100, "Rising Kick", range(600, 606), [2, 2, 2, 2, 4, 5, 4], [4, 5]),
    redraw(1200, "Handstand Kick", range(753, 766), [2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3], [6, 7, 8, 9]),
    blockbuster,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 12, sound: SOUNDS.boom, effect: { anim: WORD_ANIM, x: units(80), y: units(TALL + 12), readable: true, ticks: 30 } },
    { action: 190, frame: 1, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 40 } },
    { action: 180, frame: 3, effect: { anim: WORD_ANIM + 2, x: 0, y: units(TALL + 16), readable: true, ticks: 70 } },
    { action: 195, frame: 3, effect: { anim: WORD_ANIM + 3, x: 0, y: units(TALL + 16), readable: true, ticks: 30 } },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Desert Storm", colors: {}, shifts: [CAMO(38, { tint: 0.25, light: 1.15 })] },
    { name: "Urban", colors: {}, shifts: [CAMO(null, { light: 0.95 })] },
    { name: "Night Ops", colors: {}, shifts: [CAMO(215, { tint: 0.3, light: 0.7 })] },
  ],
  portrait: { cell: GUARD },
};
