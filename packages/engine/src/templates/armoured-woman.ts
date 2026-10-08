/**
 * "Human woman wearing new komato armor (Shoto-cretin fighting style)" (Puffolotti, CC0; art/SOURCES.md): 1,044
 * frames of a woman in grey alien armour with big gauntlets (the armour after the Komato of Iji) as one GIF
 * (272 x 273, a 64-colour palette: 58-63 the armour's greys, 8-11 the brown bodysuit, 27-33 teal lights, 17-24
 * yellow, 43 the white motion trails drawn on her punches), laid out 30 to a row so frame n is cell n. The house
 * fighter **Shell Shock** (Brawler). The frame catalogue:
 *
 *   0-3 side on, turning to fight · 4-17 guard · 18-20 jab (a trail) · 24 an uppercut swipe · 31-35 one-two (trails) ·
 *   38-47 a big overhead swing (its arc drawn in white) · 54 a lunging punch · 62-64 straights · 73-79 low lunges ·
 *   86-95 a rushing punch · 108-114 a big hook · 128-153 more punches with trails · 160-166 high kick · 167-172 kick ·
 *   173-179 side kick · 186-190 spinning high kick · 200-271 kicks · 272-281 a wide squat · 282-289 an arm raised ·
 *   315-322 a lunging slam · 325-339 knocked down, lying, getting up · 340-399 guard, aiming a gauntlet ·
 *   400-404 a hop · 410-411 crouching down · 412-459 aiming, guard · 494-500 cartwheel · 501-508 a low dash ·
 *   533-536 hunched · 560-579 jump · 580-584 a somersault · 600-760 punches and kicks in the air (616-617, 725-726) ·
 *   760-799 crouching punches, a rising uppercut (794-795) · 800-839 crouching punches (804, 816) ·
 *   834-840 low kick · 848-859 slide, sweep (858) · 880-905 crouched · 906-916 rolls · 922-931 kicks ·
 *   960-974 guard · 975-979 head snapped back · 980-990 reeling, hunched · 991-999 knocked down ·
 *   1000-1018 launched, tumbling, lying · 1019-1030 falling back stiff · 1031-1039 getting up · 1040-1043 standing, stiff
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const ARMOURED_WOMAN: ArtSource = {
  id: "armoured-woman",
  file: "art/sources/armoured-woman/spriteset.gif",
  sha256: "9d266a83e49b27059a250ac0cfc82081bc0b32f06369716fc8e0829a37d6f8db",
  cellWidth: 272,
  cellHeight: 273,
  columns: 30,
  rows: 35,
  // The guard (frame 4): her body from x 58 to 158, feet on row 246.
  axis: { x: 106, y: 246 },
  stray: [],
  // 181 pixels tall at a centimetre a pixel: at 580 about the Thai boxers' height.
  localcoord: 580,
  standardSprites: {
    "5000,0": feet(976), "5000,10": feet(977), "5000,20": feet(978),
    "5010,0": feet(984), "5010,10": feet(985), "5010,20": feet(986),
    "5020,0": feet(886), "5020,10": feet(887), "5020,20": feet(888),
    "5030,0": feet(325), "5030,10": feet(326), "5030,20": feet(327), "5030,30": feet(328), "5030,40": feet(329), "5030,50": feet(330),
    "5040,0": feet(332), "5040,10": feet(333), "5040,20": feet(992),
    "5060,0": feet(1000), "5060,10": feet(995),
    "5070,0": feet(1021), "5070,10": feet(1022), "5070,20": feet(1023),
  },
  credit: "Sprites: Human woman wearing new komato armor (Shoto-cretin fighting style) by Puffolotti (CC0), https://opengameart.org/content/human-woman-wearing-new-komato-armor-shoto-cretin-fighting-style",
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const brawler: TemplateSpec = { ...ALL_ROUNDER, art: ARMOURED_WOMAN };
/** One of the Brawler's moves on these cells, its movement spread over the new length. */
const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
  const was = brawler.attacks.find((x) => x.state === state);
  const len = was ? cellList(was.anim.cells).length : cells.length;
  const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
  return redrawMove(brawler, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
};
const units = (px: number) => Math.round((px * 320) / ARMOURED_WOMAN.localcoord);
const TALL = 181;
const GUARD = 4;
const words = heroWords([{ text: "SHELL SHOCK!", color: FX.yellow }, { text: "TIN CAN?!", color: FX.white }], 2);

/** Her signature: the big overhead swing of a gauntlet, its arc drawn in white. SHELL SHOCK! */
const shellShock: AttackSpec = {
  state: 1400, name: "Shell Shock", from: "stand", command: "QCB_x", special: true,
  anim: { action: 1400, cells: [GUARD, ...range(38, 47), GUARD], ticks: [3, 3, 3, 3, 4, 4, 5, 4, 5, 6, 5, 5], anchor: "feet" },
  hits: [{ frames: [7, 8], damage: 100, chip: 11, height: "overhead", weight: "heavy", hitStun: 26, blockStun: 18, push: 6, knockdown: true, launch: [3, -3], hitSound: SOUNDS.clang }],
  moves: [{ frame: 4, x: 2 }, { frame: 8, x: 0 }],
  ai: { range: 80, weight: 1 },
};

export const SHELL_SHOCK: TemplateSpec = {
  ...brawler,
  id: "gi-shell-shock",
  name: "Shell Shock",
  anims: [
    a(0, range(4, 17), 4, "stand: guard"),
    a(5, [GUARD], 3, "turn"),
    a(6, [882], 3, "crouch turn"),
    a(10, [410, 411], 2, "stand to crouch"),
    a(11, range(880, 885), 6, "crouched"),
    a(12, [411, 410], 2, "crouch to stand"),
    a(20, range(4, 17), 3, "walk forward: bouncing in guard"),
    a(21, range(4, 17).reverse(), 3, "walk back"),
    a(40, [560, 561], 2, "jump start"),
    a(41, range(562, 570), 4, "jump up"),
    a(42, range(562, 570), 4, "jump forward"),
    a(43, range(562, 570).reverse(), 4, "jump back"),
    a(47, [410], 3, "jump land"),
    a(100, range(4, 17), 2, "run"),
    a(105, [400, 403, 404, 410], 4, "hop back"),
    a(120, [8], 2, "guard start"),
    a(121, [886], 2, "crouch guard start"),
    a(122, [566], 2, "air guard start"),
    a(130, [8], 10, "stand guard"),
    a(131, [886], 10, "crouch guard"),
    a(132, [566], 10, "air guard"),
    a(140, [8], 2, "guard end"),
    a(141, [886], 2, "crouch guard end"),
    a(142, [566], 2, "air guard end"),
    a(150, [976, 8], 3, "stand guard hit"),
    a(151, [887], 6, "crouch guard hit"),
    a(152, [566], 6, "air guard hit"),
    a(170, range(1040, 1043), 6, "lose (time over): stands stiff", true),
    a(175, range(1040, 1043), 6, "draw (time over)", true),
    a(5000, [976, 977], 3, "hit high, light"),
    a(5001, [976, 977, 978], 3, "hit high, medium"),
    a(5002, [977, 978, 979], 3, "hit high, hard"),
    a(5005, [977, 976], 3, "recover high, light"),
    a(5006, [978, 977, GUARD], 3, "recover high, medium"),
    a(5007, [979, 978, 977, GUARD], 3, "recover high, hard"),
    a(5010, [984, 985], 3, "hit low, light"),
    a(5011, [984, 985, 986], 3, "hit low, medium"),
    a(5012, [985, 986, 987], 3, "hit low, hard"),
    a(5015, [985, 984], 3, "recover low, light"),
    a(5016, [986, 985, GUARD], 3, "recover low, medium"),
    a(5017, [987, 986, 985, GUARD], 3, "recover low, hard"),
    a(5020, [886], 6, "crouching hit, light"),
    a(5021, [887], 8, "crouching hit, medium"),
    a(5022, [888], 10, "crouching hit, hard"),
    a(5025, [886], 3, "crouching recover, light"),
    a(5026, [887], 4, "crouching recover, medium"),
    a(5027, [888, 887], 3, "crouching recover, hard"),
    a(5030, [325], 4, "hit in the air"),
    a(5035, [326], 3, "air hit transition"),
    a(5040, [337, 338, 339, GUARD], 4, "air recover"),
    a(5050, [326, 327], 5, "falling"),
    a(5060, [328, 329], 5, "falling, coming down"),
    a(5070, [1021, 1022], 4, "tripped: falls back stiff"),
    a(5080, [332], 4, "hit while down"),
    a(5090, [995], 4, "hit up while down"),
    a(5100, [330, 331], 3, "hit the ground"),
    a(5101, [329], 4, "bounce"),
    a(5110, [332], 30, "lying down"),
    a(5120, [...range(1031, 1039), GUARD], [5, 5, 5, 4, 4, 4, 4, 4, 5, 5], "getting up"),
    a(5140, [332], 30, "lying defeated", true),
    a(5150, [332], 30, "lying defeated (match over)", true),
    a(5160, [995], 4, "bounce into the air"),
    a(5170, [330, 331], 4, "hit the ground after a bounce"),
    a(5200, [339, GUARD], 3, "fall recovery near the ground"),
    a(5210, [338, 339, GUARD], 3, "fall recovery in the air"),
    a(180, range(282, 289), [5, 5, 5, 5, 5, 6, 8, 60], "win: an arm raised", true),
    a(181, range(272, 281), [5, 5, 5, 5, 5, 5, 5, 6, 8, 60], "win: a wide squat", true),
    a(190, [...range(0, 3), ...range(4, 9)], [8, 6, 6, 6, 5, 5, 5, 5, 5, 10], "intro: side on, then turns to fight (TIN CAN?!)"),
    a(195, [...range(272, 281), GUARD], [5, 5, 5, 5, 6, 8, 8, 6, 5, 5, 6], "taunt: a wide squat"),
  ],
  attacks: [
    redraw(200, "Jab", [GUARD, ...range(17, 20)], [2, 2, 3, 3, 3], [2, 3]),
    redraw(210, "One-Two", [GUARD, ...range(31, 36)], [2, 2, 3, 3, 4, 3, 3], [2, 3, 4]),
    redraw(230, "Kick", [GUARD, ...range(167, 172)], [2, 2, 2, 4, 4, 3, 3], [3, 4]),
    redraw(240, "High Kick", [GUARD, ...range(160, 166)], [2, 2, 3, 4, 4, 4, 3, 3], [3, 4, 5]),
    redraw(400, "Crouching Punch", range(800, 806), [2, 2, 2, 2, 4, 4, 3], [4, 5]),
    redraw(410, "Crouching Uppercut", range(812, 818), [2, 2, 2, 2, 5, 4, 3], [4]),
    redraw(430, "Low Kick", range(834, 840), [2, 2, 3, 4, 4, 3, 3], [3, 4, 5]),
    redraw(440, "Sweep", range(850, 859), [2, 2, 2, 2, 2, 2, 2, 2, 5, 4], [8]),
    redraw(600, "Air Punch", range(612, 620), [2, 2, 2, 2, 3, 4, 3, 3, 3], [4, 5]),
    redraw(630, "Flying Kick", range(720, 728), [2, 2, 2, 2, 2, 4, 4, 3, 3], [5, 6]),
    redraw(1000, "Rushing Straight", [GUARD, ...range(86, 95)], [2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3], [3, 4, 5, 6]),
    redraw(1100, "Rising Uppercut", range(788, 797), [2, 2, 2, 2, 2, 2, 4, 5, 4, 4], [6, 7]),
    redraw(1200, "Spin Kick", [GUARD, ...range(186, 190)], [2, 3, 4, 4, 4, 3], [2, 3, 4]),
    shellShock,
  ],
  sounds: () => heroSounds(),
  effectArt: () => words,
  cues: [
    { action: 1400, frame: 7, effect: { anim: WORD_ANIM, x: units(60), y: units(TALL + 16), readable: true, ticks: 30 } },
    { action: 190, frame: 1, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 16), readable: true, ticks: 30 } },
  ] satisfies Cue[],
  colors: { [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Gunmetal", colors: { 58: "#4c5a78", 59: "#3a4a64", 60: "#3a4258", 61: "#2c3448", 62: "#232c40", 63: "#1a2232" } },
    { name: "Desert", colors: { 58: "#8a7a52", 59: "#6a5c3c", 60: "#6a5e40", 61: "#5a4e34", 62: "#4a3f28", 63: "#3a3020", 8: "#4a5a3a", 10: "#1e2814", 11: "#2c3820" } },
    { name: "Crimson", colors: { 58: "#7a3434", 59: "#602828", 60: "#5a2a2a", 61: "#4a2020", 62: "#3a1616", 63: "#2a1010", 27: "#ffd200", 29: "#d0aa00", 31: "#b09000", 33: "#705c00" } },
  ],
  portrait: { cell: GUARD },
};
