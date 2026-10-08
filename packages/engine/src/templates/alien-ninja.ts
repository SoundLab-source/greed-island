/**
 * "Alien ninja for fighting games (Stardrinkers style)" (Puffolotti, CC0; art/SOURCES.md): 693 frames of a female
 * alien in orange armour (a fan design after the Komato of Iji) as one GIF (456 x 355, a 64-colour palette in ramps:
 * 20 and 43-45 her blue head and limbs, 38-41 the orange armour, 22-25 the magenta, 2-5 the red blades), laid out 30
 * to a row so frame n is cell n. She fights in the "stone door" style with some "industrial suppression", and summons
 * her weapons as she uses them. The house fighter **Star Drinker** (Striker). The frame catalogue:
 *
 *   0-12 guard · 13-24 crouching · 25-39 stepping forward in guard · 40-52 another guard · 53-59 a low dive ·
 *   66-73 standing tall · 74-75 crouching · 76-95 jump · 97-110 punches, arms wide (107-109) · 126-131 low kick ·
 *   132-139 high kick · 140-149 side kick · 150-158 snap kick · 159-166 a long lunge · 180-187 rolling ·
 *   200-206 cartwheel · 213-217 a jump · 218-245 crouched · 246-252 rising palm · 253-265 crouched, low kick ·
 *   266-279 low side kick, sliding kick · 286-299 a jump with a split kick (290-291) · 300-322 flying and side kicks ·
 *   329-332 a long lunge · 340-345 THE DARK BEAM · 346-399 a summoned pistol, fired forward and up ·
 *   400-412 a guard, hands forward · 413-420 crouched, hunched · 421 hit · 422-430 knocked down, a kip-up ·
 *   431-438 lying, rising, standing tall · 439-445 launched, tumbling, lying · 446-455 a tucked spin ·
 *   456-467 red blades summoned, a lunge · 468-479 the blades whirling · 480-505 blade thrusts ·
 *   506-517 a spinning jump with the blades · 519-527 the splits over a blade · 528-569 punches, crouched ·
 *   570-578 arms raised · 600-609 high kick · 610-628 kicks · 629-635 high kick · 646-657 crouched, sweep ·
 *   668-683 jump, air kick, flying kick · 684-692 axe kick
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const ALIEN_NINJA: ArtSource = {
  id: "alien-ninja",
  file: "art/sources/alien-ninja/alien-ninja.gif",
  sha256: "c326a1aff7f09f276feddb2888028d507dae66e9bf0f0ae13d76c081c3c3fe2e",
  cellWidth: 456,
  cellHeight: 355,
  columns: 30,
  rows: 24,
  // Frame 0: her feet from x 217 to 245 on row 335.
  axis: { x: 231, y: 335 },
  stray: [],
  // 193 pixels tall, drawn at the Stardrinkers scale (a pixel a centimetre): at 640 about a Thai boxer's height.
  localcoord: 640,
  standardSprites: {
    "5000,0": feet(421), "5000,10": feet(421), "5000,20": feet(422),
    "5010,0": feet(413), "5010,10": feet(414), "5010,20": feet(415),
    "5020,0": feet(416), "5020,10": feet(417), "5020,20": feet(418),
    "5030,0": feet(439), "5030,10": feet(440), "5030,20": feet(441), "5030,30": feet(442), "5030,40": feet(443), "5030,50": feet(444),
    "5040,0": feet(431), "5040,10": feet(432), "5040,20": feet(445),
    "5060,0": feet(436), "5060,10": feet(439),
    "5070,0": feet(422), "5070,10": feet(423), "5070,20": feet(424),
  },
  credit: "Sprites: Alien ninja for fighting games (Stardrinkers style) by Puffolotti (CC0), https://opengameart.org/content/alien-ninja-for-fighting-games-stardrinkers-style",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const striker: TemplateSpec = { ...RUSHDOWN, art: ALIEN_NINJA };
/** One of the Striker's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = striker.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(striker, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / ALIEN_NINJA.localcoord);
const TALL = 193;
const GUARD = 0;
const words = heroWords([{ text: "BLACK HOLE!", color: FX.yellow }, { text: "PEW!", color: FX.yellow }], 2);

/** Her signature: the dark beam she summons over her shoulder, long and high. BLACK HOLE! */
const blackHole: AttackSpec = {
  state: 1400, name: "Black Hole", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(340, 345), 346, GUARD], ticks: [3, 4, 5, 5, 5, 5, 5, 6, 5], anchor: "feet" },
  hits: [{ frames: [2, 3, 4, 5], damage: 90, chip: 10, height: "high", weight: "heavy", hitStun: 24, blockStun: 16, push: 7, knockdown: true, launch: [4, -3], hitSound: SOUNDS.boom }],
  ai: { range: 200, weight: 0.8 },
};

export const STAR_DRINKER: TemplateSpec = {
  ...striker,
  id: "gi-star-drinker",
  name: "Star Drinker",
  anims: [
    a(0, range(0, 12), 4, "stand: guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [16], 3, "crouch turn"),
    a(10, [13, 14], 2, "stand to crouch"),
    a(11, range(15, 24), 6, "crouching"),
    a(12, [14, 13], 2, "crouch to stand"),
    a(20, range(25, 39), 3, "walk forward: stepping in guard"),
    a(21, range(25, 39).reverse(), 3, "walk back"),
    a(40, [74, 75], 2, "jump start"),
    a(41, range(76, 84), 4, "jump up"),
    a(42, range(76, 84), 4, "jump forward"),
    a(43, range(76, 84).reverse(), 4, "jump back"),
    a(47, [85], 3, "jump land"),
    a(100, range(25, 39), 2, "run"),
    a(105, [74, 80, 85], 4, "hop back"),
    a(120, [400, 405], 2, "guard start"),
    a(121, [413], 2, "crouch guard start"),
    a(122, [80], 2, "air guard start"),
    a(130, [405], 10, "stand guard: hands forward"),
    a(131, [413], 10, "crouch guard: hunched"),
    a(132, [80], 10, "air guard"),
    a(140, [405, 400], 2, "guard end"),
    a(141, [413], 2, "crouch guard end"),
    a(142, [80], 2, "air guard end"),
    a(150, [421, 405], 3, "stand guard hit"),
    a(151, [414], 6, "crouch guard hit"),
    a(152, [80], 6, "air guard hit"),
    a(170, range(66, 73), 6, "lose (time over): stands tall", true),
    a(175, range(66, 73), 6, "draw (time over)", true),
    a(5000, [421, 400], 3, "hit high, light"),
    a(5001, [421, 421, 400], 3, "hit high, medium"),
    a(5002, [421, 421, 421], 3, "hit high, hard"),
    a(5005, [400, GUARD], 3, "recover high, light"),
    a(5006, [421, 400, GUARD], 3, "recover high, medium"),
    a(5007, [421, 421, 400, GUARD], 3, "recover high, hard"),
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
    a(5030, [439], 4, "hit in the air"),
    a(5035, [440], 3, "air hit transition"),
    a(5040, [429, 430, GUARD], 4, "air recover: a flip"),
    a(5050, [422, 423], 5, "falling"),
    a(5060, [440, 441], 5, "falling, coming down"),
    a(5070, [424, 425], 4, "tripped"),
    a(5080, [427], 4, "hit while down"),
    a(5090, [439], 4, "hit up while down"),
    a(5100, [443, 444], 3, "hit the ground"),
    a(5101, [442], 4, "bounce"),
    a(5110, [431], 30, "lying down"),
    a(5120, [...range(432, 438), GUARD], [6, 5, 5, 4, 4, 4, 5, 5], "getting up"),
    a(5140, [431], 30, "lying defeated", true),
    a(5150, [431], 30, "lying defeated (match over)", true),
    a(5160, [442], 4, "bounce into the air"),
    a(5170, [443, 444], 4, "hit the ground after a bounce"),
    a(5200, [430, GUARD], 3, "fall recovery near the ground"),
    a(5210, [429, 430, GUARD], 3, "fall recovery in the air"),
    a(180, range(570, 575), [5, 5, 5, 6, 8, 60], "win: arms raised", true),
    a(181, range(66, 73), [5, 5, 5, 5, 5, 5, 5, 60], "win: stands tall", true),
    a(190, [...range(468, 479), GUARD], [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 8, 10], "intro: summons her blades and whirls them"),
    a(195, [...range(368, 378), GUARD], [4, 4, 4, 4, 5, 6, 5, 4, 4, 4, 4, 8], "taunt: fires her pistol in the air (PEW!)"),
  ],
  attacks: [
    redraw(200, "Quick Kick", range(126, 131), [2, 2, 3, 3, 3, 3], [2]),
    redraw(210, "Side Kick", range(140, 149), [2, 2, 2, 2, 3, 4, 3, 3, 3, 3], [5, 6, 7]),
    redraw(230, "Snap Kick", range(150, 158), [2, 2, 2, 2, 3, 4, 3, 3, 3], [5, 6]),
    redraw(240, "Roundhouse", range(600, 609), [2, 2, 2, 2, 3, 3, 4, 4, 3, 3], [5, 6, 7]),
    redraw(400, "Low Poke", [16, ...range(266, 268)], [2, 3, 4, 4], [1, 2]),
    redraw(410, "Rising Palm", range(246, 252), [2, 2, 3, 5, 5, 4, 4], [3, 4]),
    redraw(430, "Low Kick", range(253, 265), [2, 2, 2, 2, 2, 2, 3, 4, 3, 3, 3, 3, 3], [6, 7]),
    redraw(440, "Sweep", range(646, 657), [2, 2, 2, 2, 2, 2, 2, 3, 4, 4, 3, 3], [8, 9, 10]),
    redraw(600, "Air Kick", range(668, 672), [3, 3, 3, 5, 4], [3, 4]),
    redraw(630, "Flying Kick", range(674, 679), [3, 3, 3, 3, 6, 4], [4]),
    redraw(1000, "Blade Lunge", range(456, 467), [2, 2, 2, 2, 3, 3, 3, 4, 4, 3, 3, 3], [5, 6, 7]),
    redraw(1100, "Axe Kick", range(684, 692), [2, 2, 3, 4, 5, 4, 3, 3, 3], [3, 4]),
    redraw(1200, "Blade Storm", range(506, 517), [2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], [2, 3, 5]),
    blackHole,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 2, effect: { anim: WORD_ANIM, x: units(140), y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 195, frame: 4, sound: SOUNDS.zap, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 24), readable: true, ticks: 24 } },
    { action: 1000, frame: 3, sound: SOUNDS.shing },
    { action: 1200, frame: 2, sound: SOUNDS.swishBig },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Red Moon", colors: { 20: "#2a0008", 45: "#5a0010", 44: "#8c0018", 43: "#c81830" } },
    { name: "Jade Sky", colors: { 20: "#00281a", 45: "#005038", 44: "#008a5a", 43: "#00c07c", 41: "#2a2200", 40: "#5a4a00", 39: "#8c7400", 38: "#c0a000" } },
    { name: "Ghost", colors: { 20: "#202028", 45: "#50505c", 44: "#8a8a98", 43: "#c8c8d8", 25: "#003240", 24: "#006480", 23: "#0096c0", 22: "#00c8ff" } },
  ],
  portrait: { cell: GUARD },
};
