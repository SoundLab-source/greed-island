/**
 * House fighter "Margin Call" (ALL_ROUNDER): the first fighter of our own,
 * made of parts rather than frames (rig/, docs/PHASE3.md "Parts, not
 * frames"). A broker in a navy suit and a red tie who fights like a boxer:
 * a jab, a cross, kicks he learned somewhere expensive, and three specials of
 * his own: Cold Call (a rushing straight trailing red), Green Candle (a rising
 * uppercut that draws a green candle on the chart) and Golden Parachute (a
 * spinning heel kick with a gold swoosh). He keeps the Brawler's numbers and
 * AI. No art was downloaded or drawn by hand: every frame is drawn in code.
 */
import { burst, candle, dollar, speedLines, swoosh } from "../rig/fx.ts";
import { rigFighter, type RigFighterOptions } from "../rig/fighter.ts";
import { person } from "../rig/kit.ts";
import { STAND, UPRIGHT } from "../rig/moves.ts";
import { FX_FIRST, type Design } from "../rig/parts.ts";
import { blend, type Pose } from "../rig/skeleton.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";

/** Effect colours: white and pale for speed lines; red, green and gold for his specials. */
export const MC_FX = {
  white: FX_FIRST, pale: FX_FIRST + 1,
  red: FX_FIRST + 2, redDark: FX_FIRST + 3,
  green: FX_FIRST + 4, greenDark: FX_FIRST + 5, greenLight: FX_FIRST + 6,
  gold: FX_FIRST + 7, goldLight: FX_FIRST + 8,
} as const;
const FX_COLORS: Record<number, string> = {
  [MC_FX.white]: "#ffffff", [MC_FX.pale]: "#c9d6ea",
  [MC_FX.red]: "#ff4a4a", [MC_FX.redDark]: "#a8202a",
  [MC_FX.green]: "#39d36b", [MC_FX.greenDark]: "#167a3a", [MC_FX.greenLight]: "#b4ffc8",
  [MC_FX.gold]: "#f2b622", [MC_FX.goldLight]: "#ffe9a0",
};
const SPEED = [MC_FX.white, MC_FX.pale];

export const MARGIN_CALL_DESIGN: Design = {
  materials: { skin: "#d9a07a", hair: "#2b2018", eye: "#141018", suit: "#2c3a5c", shirt: "#ece8e0", tie: "#c3303c", shoes: "#2a1c14" },
  ...person({
    hair: "slick",
    top: "suit",
    sleeves: "suit",
    legs: "suit",
    shoes: "shoes",
    extra: {
      // Shirt collar, the tie down his front, and a lapel line; shirt cuffs.
      torso: [
        { kind: "poly", material: "shirt", points: [[62, 5], [44, 17], [46, 21], [62, 20]] },
        { kind: "poly", material: "tie", points: [[60, 15], [55, 20], [27, 21], [24, 18.5], [52, 15.5]] },
        { kind: "poly", material: "suit", tone: "dark", flat: true, points: [[56, 9], [40, 17], [40, 15], [55, 7]] },
      ],
      foreArmF: [{ kind: "capsule", material: "shirt", u0: 31, u1: 34, r0: 5.8, r1: 5.8 }],
      foreArmB: [{ kind: "capsule", material: "shirt", u0: 31, u1: 34, r0: 5.8, r1: 5.8 }],
    },
  }),
};

// ---- Poses -------------------------------------------------------------------------------------------------------

const S = STAND;
const pose = (p: Pose): Pose => ({ ...S, ...p });

// Jab: a quick front-hand punch.
const JAB_OUT = pose({ x: 6, lean: 16, head: -8, armF: [86, 6], armB: [26, 118], legF: [30, -30], legB: [-24, -10] });
const JAB = [pose({ lean: 12, armF: [56, 70] }), JAB_OUT, { ...JAB_OUT, fx: [speedLines("handF", 26, SPEED)] }, blend(JAB_OUT, S, 0.4), blend(JAB_OUT, S, 0.75), S];

// Lunge punch (a cross): the back hand, stepping in.
const CROSS_WIND = pose({ x: -4, lean: 4, armF: [44, 110], armB: [-10, 120], legF: [26, -32], legB: [-22, -18] });
const CROSS_OUT = pose({ x: 34, lean: 34, head: -14, armF: [10, 120], armB: [100, 2], legF: [44, -40], legB: [-34, -4] });
const CROSS = [blend(S, CROSS_WIND, 0.5), CROSS_WIND, blend(CROSS_WIND, CROSS_OUT, 0.5), { ...CROSS_OUT, fx: [speedLines("handB", 34, SPEED)] }, CROSS_OUT, blend(CROSS_OUT, S, 0.35), blend(CROSS_OUT, S, 0.7), S];

// Mid kick: a front kick to the body.
const MID_CHAMBER = pose({ lean: 0, armF: [40, 110], armB: [10, 100], legF: [92, -110] });
const MID_OUT = pose({ x: 20, lean: -16, head: 6, armF: [50, 100], armB: [-10, 70], legF: [90, 0, 50], legB: [-6, -4] });
const MID_KICK = [MID_CHAMBER, blend(MID_CHAMBER, MID_OUT, 0.6), MID_OUT, { ...MID_OUT, fx: [speedLines("footF", 22, SPEED)] }, MID_CHAMBER, blend(MID_CHAMBER, S, 0.5), S];

// High kick: to the head, leaning back.
const HIGH_OUT = pose({ x: 48, lean: -38, head: 22, armF: [60, 90], armB: [-30, 50], legF: [108, 0, 40], legB: [-10, -2] });
const HIGH_KICK = [pose({ lean: -6, legF: [80, -100], armB: [0, 80] }), HIGH_OUT, { ...HIGH_OUT, fx: [swoosh("thighF", -20, 40, SPEED, 5, 52)] }, blend(HIGH_OUT, S, 0.4), blend(HIGH_OUT, S, 0.7), S];

// Crouching jab.
const CROUCH = pose({ lean: 24, head: -14, armF: [48, 92], armB: [34, 104], legF: [80, -122], legB: [16, -128] });
const CJAB_OUT = { ...CROUCH, x: 16, lean: 34, armF: [72, 4] as const };
const CROUCH_JAB = [blend(CROUCH, CJAB_OUT, 0.5), CJAB_OUT, { ...CJAB_OUT, fx: [speedLines("handF", 20, SPEED)] }, blend(CJAB_OUT, CROUCH, 0.5), CROUCH];

// Crouching straight: rising from the crouch, punching up and forward (against jumps).
const CSTR_UP = pose({ x: 26, lean: 20, head: -24, armF: [128, 4], armB: [30, 100], legF: [56, -80], legB: [6, -80] });
const CROUCH_STRAIGHT = [CROUCH, blend(CROUCH, CSTR_UP, 0.5), CSTR_UP, { ...CSTR_UP, fx: [speedLines("handF", 18, SPEED, 6)] }, blend(CSTR_UP, CROUCH, 0.5), CROUCH];

// Low kick: a crouching shin kick along the floor.
const LOWK_OUT = { ...CROUCH, x: 18, lean: 22, armF: [60, 90] as const, legF: [86, -6, 40] as const, legB: [10, -132] as const };
const LOW_KICK = [CROUCH, blend(CROUCH, LOWK_OUT, 0.5), LOWK_OUT, { ...LOWK_OUT, fx: [speedLines("footF", 18, SPEED, 5)] }, blend(LOWK_OUT, CROUCH, 0.5), CROUCH];

// Sweep: down on one hand, the leg swept round along the ground.
const SWEEP_LOW = { ...CROUCH, lean: 50, head: -20, armF: [40, 30] as const, armB: [20, 20] as const, legF: [60, -130] as const, legB: [30, -140] as const };
const SWEEP_OUT = { ...SWEEP_LOW, x: 46, lean: 62, armF: [70, 10] as const, legF: [92, 2, 30] as const };
const SWEEP = [CROUCH, SWEEP_LOW, blend(SWEEP_LOW, SWEEP_OUT, 0.4), blend(SWEEP_LOW, SWEEP_OUT, 0.75), { ...SWEEP_OUT, fx: [swoosh("thighF", -120, -90, SPEED, 5, 52)] }, SWEEP_OUT, blend(SWEEP_OUT, CROUCH, 0.5)];

// Jumping punch: down and forward.
const AIR: Pose = { air: 30, lean: 16, head: -10, armF: [70, 80], armB: [55, 90], legF: [70, -110], legB: [30, -90] };
const AIR_PUNCH_OUT: Pose = { ...AIR, x: 22, lean: 30, armF: [76, 0], armB: [20, 100] };
const JUMP_PUNCH = [AIR, blend(AIR, AIR_PUNCH_OUT, 0.5), AIR_PUNCH_OUT, { ...AIR_PUNCH_OUT, fx: [speedLines("handF", 18, SPEED)] }, AIR];

// Flying kick: one leg straight out, down and forward.
const FLY_OUT: Pose = { ...AIR, x: 28, lean: -14, head: 8, armF: [80, 90], armB: [20, 60], legF: [74, 0, 40], legB: [70, -140] };
const FLYING_KICK = [{ ...AIR, legF: [90, -120] as const }, FLY_OUT, { ...FLY_OUT, fx: [speedLines("footF", 26, SPEED)] }, blend(FLY_OUT, AIR, 0.5), AIR];

// Cold Call: a long rushing straight, trailing red.
const COLD_WIND = pose({ x: -8, lean: 2, head: 0, armF: [-20, 110], armB: [30, 110], legF: [30, -40], legB: [-26, -20] });
const COLD_RUN = pose({ x: 6, lean: 30, head: -18, armF: [-10, 100], armB: [50, 100], legF: [50, -60], legB: [-30, -30] });
const COLD_OUT = pose({ x: 20, lean: 34, head: -16, armF: [92, 2], armB: [-10, 100], legF: [50, -50], legB: [-42, -4] });
const redTrail = [speedLines("handF", 60, [MC_FX.red, MC_FX.redDark], 8)];
const COLD_CALL = [
  COLD_WIND, blend(COLD_WIND, COLD_RUN, 0.5), COLD_RUN, { ...COLD_RUN, fx: [speedLines("handF", 30, [MC_FX.red, MC_FX.redDark], 8)] },
  blend(COLD_RUN, COLD_OUT, 0.6), { ...COLD_OUT, fx: [...redTrail, burst("handF", 22, [MC_FX.white, MC_FX.red])] }, { ...COLD_OUT, fx: redTrail },
  blend(COLD_OUT, S, 0.3), blend(COLD_OUT, S, 0.6), S,
];

// Green Candle: a rising uppercut that leaves a green candle on the chart.
const GC_LOW = pose({ ...CROUCH, lean: 30, armF: [10, 120], armB: [40, 100] });
const GC_UP = pose({ air: 20, x: 34, lean: 6, head: -20, armF: [138, 4], armB: [20, 90], legF: [40, -60, 40], legB: [-10, -20, 40] });
const green = (h: number) => candle("handF", 14, 10, 10, h, MC_FX.green, MC_FX.greenDark, 8);
const GREEN_CANDLE = [
  GC_LOW, blend(GC_LOW, GC_UP, 0.5), { ...GC_UP, fx: [green(40), burst("handF", 18, [MC_FX.greenLight, MC_FX.green])] },
  { ...GC_UP, air: 26, fx: [green(70)] }, { ...blend(GC_UP, S, 0.4), fx: [green(70)] }, blend(GC_UP, S, 0.75),
];

// Golden Parachute: a spinning heel kick with the back leg, a gold swoosh behind it.
const GP_TURN = pose({ lean: 26, head: -10, armF: [20, 60], armB: [70, 60], legF: [40, -60], legB: [-20, -20] });
const GP_SPIN = pose({ x: 6, lean: 40, head: 10, armF: [-30, 40], armB: [100, 20], legF: [16, -20], legB: [-60, -10, 60] });
const GP_OUT = pose({ x: 34, lean: -32, head: 16, armF: [-40, 60], armB: [40, 60], legF: [-10, -10], legB: [118, -4, 50] });
const gold = [swoosh("thighB", -70, 32, [MC_FX.goldLight, MC_FX.gold], 7, 58)];
const GOLDEN_PARACHUTE = [
  GP_TURN, blend(GP_TURN, GP_SPIN, 0.5), GP_SPIN, { ...blend(GP_SPIN, GP_OUT, 0.5), fx: [swoosh("thighB", -70, -10, [MC_FX.goldLight, MC_FX.gold], 5, 58)] },
  { ...GP_OUT, fx: gold }, { ...GP_OUT, fx: [...gold, dollar("footB", 10, -14, MC_FX.gold)] }, blend(GP_OUT, S, 0.45), blend(GP_OUT, S, 0.8),
];

// Intro: straightens his tie, then squares up.
const TIE = pose({ ...UPRIGHT, head: 10, armF: [30, 150, 20], armB: [-6, 12] });
const TIE_PULL = { ...TIE, head: 16, armF: [26, 156, 10] as const };
const INTRO_POSES = [UPRIGHT, blend(UPRIGHT, TIE, 0.5), TIE, TIE_PULL, TIE, TIE_PULL, TIE, blend(TIE, S, 0.5), S];

// Taunt: beckons with an open hand.
const BECKON = pose({ lean: -4, head: -8, armF: [80, 30, 20], armB: [20, 110], open: { F: true } });
const BECKON_IN = { ...BECKON, armF: [80, 110, 40] as const };
const TAUNT_POSES = [blend(S, BECKON, 0.5), BECKON, BECKON_IN, BECKON, BECKON_IN, BECKON, blend(BECKON, S, 0.5)];

// Wins: checks his watch; arms wide with money in the air.
const WATCH = pose({ ...UPRIGHT, head: 30, armF: [52, 118, 0], armB: [-4, 12] });
const WIN_WATCH = [UPRIGHT, blend(UPRIGHT, WATCH, 0.5), WATCH, { ...WATCH, head: 18 }, WATCH];
const WIDE = pose({ ...UPRIGHT, lean: -6, head: -8, armF: [128, 24], armB: [168, 6], open: { F: true, B: true } });
const cash = [dollar("handF", 6, -26, MC_FX.green, 3), dollar("handB", -14, -34, MC_FX.green, 3)];
const WIN_WIDE = [UPRIGHT, blend(UPRIGHT, WIDE, 0.5), { ...WIDE, fx: cash }, { ...WIDE, head: -22, fx: cash }];

/**
 * His moves as a set any rig fighter on the Brawler's numbers can use (a fighter drawn on the parts guide, say):
 * the poses, his effects, intro, taunt and win poses.
 */
export const BRAWLER_MOVE_SET = {
  base: ALL_ROUNDER,
  fx: FX_COLORS,
  moves: {
    200: { poses: JAB, strike: ["foreArmF", "handF"] },
    210: { name: "Cross", poses: CROSS, strike: ["foreArmB", "handB"] },
    230: { name: "Front Kick", poses: MID_KICK, strike: ["shinF", "footF"] },
    240: { poses: HIGH_KICK, strike: ["shinF", "footF"] },
    400: { poses: CROUCH_JAB, strike: ["foreArmF", "handF"] },
    410: { name: "Rising Straight", poses: CROUCH_STRAIGHT, strike: ["foreArmF", "handF"] },
    430: { poses: LOW_KICK, strike: ["shinF", "footF"] },
    440: { poses: SWEEP, strike: ["shinF", "footF"] },
    600: { poses: JUMP_PUNCH, strike: ["foreArmF", "handF"] },
    630: { poses: FLYING_KICK, strike: ["shinF", "footF"] },
    1000: { name: "Cold Call", poses: COLD_CALL, strike: ["foreArmF", "handF"] },
    1100: { name: "Green Candle", poses: GREEN_CANDLE, strike: ["foreArmF", "handF"] },
    1200: { name: "Golden Parachute", poses: GOLDEN_PARACHUTE, strike: ["shinB", "footB"] },
  },
  intro: { poses: INTRO_POSES, ticks: [6, 5, 8, 6, 6, 6, 10, 5, 10], comment: "intro: straightens his tie" },
  taunt: { poses: TAUNT_POSES, ticks: [4, 6, 6, 6, 6, 6, 4], comment: "taunt: come on" },
  wins: [
    { poses: WIN_WATCH, ticks: [6, 6, 30, 20, 60], comment: "win: checks his watch" },
    { poses: WIN_WIDE, ticks: [6, 6, 20, 60], comment: "win: arms wide, money in the air" },
  ],
} satisfies Pick<RigFighterOptions, "base" | "fx" | "moves" | "intro" | "taunt" | "wins">;

export const MARGIN_CALL = rigFighter({
  ...BRAWLER_MOVE_SET,
  id: "gi-margin-call",
  name: "Margin Call",
  design: MARGIN_CALL_DESIGN,
  outfits: [
    { name: "Black Monday", materials: { suit: "#26262c", tie: "#d4a52a", shirt: "#d8d8dc" } },
    { name: "Bear Market", materials: { suit: "#5a3e2b", tie: "#2d5a3a", shirt: "#efe6d2", hair: "#6b4a2e" } },
    { name: "Casual Friday", materials: { suit: "#8a7a5c", tie: "#3a6fb0", shirt: "#bcd4ee", shoes: "#5a3a22" } },
  ],
  credit: "Drawn in code by Greed Island (rig/): an original character, no outside art",
});
