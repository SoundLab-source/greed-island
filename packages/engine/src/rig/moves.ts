/**
 * Every animation a rig fighter needs (rig/skeleton.ts), as poses: standing,
 * walking, jumping, guarding, getting hit, falling, lying and getting up, and
 * the MUGEN standard get-hit sprites other characters' throws borrow. These
 * are the same for every rig fighter; its own attacks, intro, win poses and
 * taunt come with it (e.g. templates/margin-call.ts).
 *
 * Tick counts follow the Universal Prototype templates' (sharedAnims), so a
 * rig fighter moves to the same rhythm as the rest of the roster.
 */
import { blend, type Pose } from "./skeleton.ts";

/** One animation as poses. */
export interface RigAnim {
  action: number;
  poses: readonly Pose[];
  ticks: number | readonly number[];
  loop?: number | false;
  anchor?: "feet";
  comment?: string;
}

/** `n` poses easing from `a` to `b`, not including `a`, ending on `b`. */
export function tween(a: Pose, b: Pose, n: number): Pose[] {
  return Array.from({ length: n }, (_, i) => blend(a, b, (i + 1) / n));
}

const cycle = (n: number, f: (t: number) => Pose) => Array.from({ length: n }, (_, i) => f(i / n));
const TAU = Math.PI * 2;

// ---- Standing, crouching, guarding -------------------------------------------------------------------------------

/** The fighting stance, breathing: `t` 0-1 round the loop. */
export const stance = (t: number): Pose => {
  const b = Math.sin(t * TAU);
  return { lean: 9 + b, head: -4, armF: [36 + b * 3, 104 - b * 2], armB: [21 + b * 2, 114], legF: [24 + b * 1.5, -30 - b * 3], legB: [-20, -14 - b * 3] };
};
export const STAND = stance(0);
export const CROUCH: Pose = { lean: 24, head: -14, armF: [48, 92], armB: [34, 104], legF: [80, -122], legB: [16, -128] };
const crouchBreath = (t: number): Pose => ({ ...CROUCH, armF: [48 + Math.sin(t * TAU) * 3, 92], legF: [80, -122 - Math.sin(t * TAU) * 2] });
export const GUARD: Pose = { lean: 2, head: 12, x: -3, armF: [62, 128, 10], armB: [52, 132, 10], legF: [26, -32], legB: [-24, -16] };
const GUARD_HIT: Pose = { ...GUARD, x: -9, lean: -6, head: 6 };
const CROUCH_GUARD: Pose = { ...CROUCH, head: 6, armF: [72, 124, 10], armB: [62, 128, 10] };
const CROUCH_GUARD_HIT: Pose = { ...CROUCH_GUARD, x: -7, lean: 14 };

// ---- Moving -----------------------------------------------------------------------------------------------------

const walk = (t: number, back = false): Pose => {
  const c = Math.cos(t * TAU), s = Math.sin(t * TAU);
  const k = back ? -1 : 1;
  return {
    lean: 10,
    head: -4,
    armF: [36 - c * 4, 104],
    armB: [22 + c * 4, 114],
    legF: [6 + c * 24 * k, -16 - Math.max(0, s * k) * 34],
    legB: [6 - c * 24 * k, -16 - Math.max(0, -s * k) * 34],
  };
};
const run = (t: number): Pose => {
  const c = Math.cos(t * TAU), s = Math.sin(t * TAU);
  return {
    lean: 28,
    head: -16,
    armF: [20 - c * 50, 95],
    armB: [20 + c * 50, 95],
    legF: [20 + c * 42, -30 - Math.max(0, s) * 70],
    legB: [20 - c * 42, -30 - Math.max(0, -s) * 70],
  };
};
const JUMP_CROUCH: Pose = { ...CROUCH, lean: 16, squash: 0.94, armF: [10, 40], armB: [-10, 40] };
const JUMP_RISE: Pose = { air: 30, lean: 4, head: -6, armF: [150, 30], armB: [120, 40], legF: [10, -20, 60], legB: [-12, -30, 40] };
const TUCK: Pose = { air: 30, lean: 30, head: -10, armF: [70, 90], armB: [60, 100], legF: [100, -130], legB: [80, -120] };
const JUMP_TOP: Pose = { air: 30, lean: 12, head: -6, armF: [70, 80], armB: [55, 90], legF: [60, -90], legB: [20, -70] };
const JUMP_FALL: Pose = { air: 30, lean: 6, head: -2, armF: [100, 40], armB: [80, 50], legF: [30, -40], legB: [-6, -20, 70] };
const LAND: Pose = { ...CROUCH, lean: 20, squash: 0.95, armF: [60, 70], armB: [40, 80] };
const flip = (rot: number): Pose => ({ ...TUCK, rot });

// ---- Getting hit ------------------------------------------------------------------------------------------------

const HIT_HIGH: Pose[] = [
  { x: -4, lean: -8, head: -22, armF: [20, 70], armB: [10, 70], legF: [22, -26], legB: [-22, -16] },
  { x: -8, lean: -18, head: -30, armF: [10, 40], armB: [-6, 40], legF: [20, -22], legB: [-24, -14] },
  { x: -12, lean: -28, head: -34, armF: [-4, 24], armB: [-20, 30], legF: [16, -18], legB: [-26, -10] },
];
const HIT_LOW: Pose[] = [
  { x: -4, lean: 30, head: 14, armF: [10, 60], armB: [0, 70], legF: [24, -34], legB: [-20, -20] },
  { x: -8, lean: 42, head: 20, armF: [0, 50], armB: [-10, 60], legF: [26, -42], legB: [-18, -24] },
  { x: -12, lean: 52, head: 26, armF: [-8, 40], armB: [-18, 50], legF: [28, -50], legB: [-16, -28] },
];
const CROUCH_HIT: Pose[] = [
  { ...CROUCH, x: -6, lean: 6, head: -24, armF: [20, 60], armB: [10, 60] },
  { ...CROUCH, x: -10, lean: -6, head: -30, armF: [6, 40], armB: [-6, 40] },
];
/** Knocked back through the air, turning over backwards: `rot` from upright (0) to head down (180). */
const tumble = (rot: number): Pose => ({ air: 20, rot, lean: -10, head: -20, armF: [150, 20], armB: [130, 30], legF: [40, -40], legB: [10, -20, 60] });
const LYING: Pose = { rot: 90, lean: 0, head: -6, armF: [150, 10], armB: [30, 10], legF: [14, -18], legB: [4, -8, 60] };
const LYING_HIT: Pose = { ...LYING, head: -16, armF: [120, 30], legF: [34, -50], legB: [24, -40] };
const BOUNCE: Pose = { ...LYING, air: 10, rot: 84, armF: [170, 20], legF: [40, -30] };
/** Getting up from lying on the back: sitting up, onto a knee, standing. */
const GET_UP: Pose[] = [
  { rot: 70, lean: 10, head: -10, armF: [-30, 20, 0], armB: [-40, 20, 0], legF: [40, -60], legB: [20, -40] },
  { rot: 45, lean: 30, head: -10, armF: [-40, 10, 0], armB: [-60, 10, 0], legF: [80, -110], legB: [50, -90] },
  { rot: 15, lean: 50, head: -14, armF: [-20, 20, 0], armB: [-40, 20, 0], legF: [100, -140], legB: [30, -140] },
  { ...CROUCH, lean: 40 },
  { ...CROUCH, lean: 28 },
  { lean: 22, head: -8, armF: [40, 90], armB: [30, 100], legF: [50, -80], legB: [0, -60] },
  { lean: 14, head: -6, armF: [36, 100], armB: [24, 108], legF: [34, -50], legB: [-14, -30] },
  STAND,
];
/** Tripped forward: tilting, then flat on the face. */
const tripped = (rot: number): Pose => ({ air: 6, rot, lean: 10, head: -20, armF: [150, 20], armB: [130, 20], legF: [-10, -30], legB: [-30, -20, 60] });
const SLUMPED: Pose = { lean: 30, head: 30, armF: [-4, 10], armB: [-8, 10], legF: [14, -20], legB: [-10, -10] };

export const STANDARD_POSES = {
  stand: STAND, hitHigh: HIT_HIGH, hitLow: HIT_LOW, crouchHit: CROUCH_HIT, tumble, lying: LYING, lyingHit: LYING_HIT, tripped,
} as const;

/** Standing up straight, arms by the sides: the start of most intros. */
export const UPRIGHT: Pose = { lean: 0, head: 0, armF: [8, 12], armB: [-6, 12], legF: [6, -4], legB: [-6, -2] };

/**
 * Every animation the engine's shared states play, by action number (spec.ts
 * REQUIRED_ACTIONS) except the intro (190), taunt (195) and win poses (180,
 * 181), which are the fighter's own.
 */
export function sharedRigAnims(): RigAnim[] {
  const breathe = cycle(8, stance);
  const crouching = cycle(6, crouchBreath);
  const once = (action: number, poses: readonly Pose[], ticks: number | readonly number[], comment: string, more: Partial<RigAnim> = {}): RigAnim => ({ action, poses, ticks, comment, ...more });
  const air = (a: RigAnim): RigAnim => ({ ...a, anchor: "feet" });
  const toCrouch = [blend(STAND, CROUCH, 0.35), blend(STAND, CROUCH, 0.7), CROUCH];
  return [
    once(0, breathe, 7, "stand"),
    once(5, [STAND], 3, "turn"),
    once(6, [CROUCH], 3, "crouch turn"),
    once(10, toCrouch, 2, "stand to crouch"),
    once(11, crouching, 8, "crouching"),
    once(12, [...toCrouch].reverse().slice(1).concat(STAND), 2, "crouch to stand"),
    once(20, cycle(8, (t) => walk(t)), 4, "walk forward"),
    once(21, cycle(8, (t) => walk(t, true)), 4, "walk back"),
    once(40, [JUMP_CROUCH], 3, "jump start"),
    air(once(41, [JUMP_RISE, blend(JUMP_RISE, JUMP_TOP, 0.5), JUMP_TOP, JUMP_FALL], 5, "jump up")),
    air(once(42, [JUMP_RISE, flip(0), flip(-60), flip(-130), flip(-200), flip(-270), flip(-330)], 5, "jump forward: a tucked somersault")),
    air(once(43, [JUMP_RISE, flip(0), flip(40), JUMP_FALL], 6, "jump back")),
    once(47, [LAND], 3, "jump land"),
    once(100, cycle(6, run), 4, "run"),
    air(once(105, [{ ...JUMP_TOP, lean: -10 }, JUMP_FALL], 6, "hop back")),
    once(120, [blend(STAND, GUARD, 0.5), GUARD], 2, "guard start"),
    once(121, [CROUCH_GUARD], 2, "crouch guard start"),
    air(once(122, [{ ...JUMP_TOP, armF: GUARD.armF, armB: GUARD.armB, head: 12 }], 2, "air guard start")),
    once(130, [GUARD], 10, "stand guard"),
    once(131, [CROUCH_GUARD], 10, "crouch guard"),
    air(once(132, [{ ...JUMP_TOP, armF: GUARD.armF, armB: GUARD.armB, head: 12 }], 10, "air guard")),
    once(140, [blend(STAND, GUARD, 0.5), STAND], 2, "guard end"),
    once(141, [CROUCH], 2, "crouch guard end"),
    air(once(142, [JUMP_TOP], 2, "air guard end")),
    once(150, [GUARD_HIT, GUARD], 3, "stand guard hit"),
    once(151, [CROUCH_GUARD_HIT], 6, "crouch guard hit"),
    air(once(152, [{ ...JUMP_TOP, armF: GUARD.armF, armB: GUARD.armB, head: 12, x: -6 }], 6, "air guard hit")),
    once(170, [blend(STAND, SLUMPED, 0.5), SLUMPED], 6, "lose (time over)", { loop: false }),
    once(175, [blend(STAND, SLUMPED, 0.5), SLUMPED], 6, "draw (time over)", { loop: false }),
    once(5000, HIT_HIGH.slice(0, 2), 3, "hit high, light"),
    once(5001, HIT_HIGH, 3, "hit high, medium"),
    once(5002, [HIT_HIGH[1]!, HIT_HIGH[2]!, HIT_HIGH[2]!], 3, "hit high, hard"),
    once(5005, [HIT_HIGH[1]!, HIT_HIGH[0]!], 3, "recover high, light"),
    once(5006, [HIT_HIGH[2]!, HIT_HIGH[1]!, HIT_HIGH[0]!], 3, "recover high, medium"),
    once(5007, [HIT_HIGH[2]!, HIT_HIGH[1]!, HIT_HIGH[0]!, blend(HIT_HIGH[0]!, STAND, 0.5)], 3, "recover high, hard"),
    once(5010, HIT_LOW.slice(0, 2), 3, "hit low, light"),
    once(5011, HIT_LOW, 3, "hit low, medium"),
    once(5012, [HIT_LOW[1]!, HIT_LOW[2]!, HIT_LOW[2]!], 3, "hit low, hard"),
    once(5015, [HIT_LOW[1]!, HIT_LOW[0]!], 3, "recover low, light"),
    once(5016, [HIT_LOW[2]!, HIT_LOW[1]!, HIT_LOW[0]!], 3, "recover low, medium"),
    once(5017, [HIT_LOW[2]!, HIT_LOW[1]!, HIT_LOW[0]!, blend(HIT_LOW[0]!, STAND, 0.5)], 3, "recover low, hard"),
    once(5020, [CROUCH_HIT[0]!], 6, "crouching hit, light"),
    once(5021, [CROUCH_HIT[0]!], 8, "crouching hit, medium"),
    once(5022, [CROUCH_HIT[1]!], 10, "crouching hit, hard"),
    once(5025, [CROUCH_HIT[0]!], 3, "crouching recover, light"),
    once(5026, [CROUCH_HIT[0]!], 4, "crouching recover, medium"),
    once(5027, [CROUCH_HIT[1]!, CROUCH_HIT[0]!], 3, "crouching recover, hard"),
    air(once(5030, [tumble(20)], 4, "hit in the air")),
    air(once(5035, [tumble(30)], 3, "air hit transition")),
    air(once(5040, [flip(40), flip(0), JUMP_FALL], 4, "air recover")),
    air(once(5050, [tumble(45), tumble(70)], 5, "falling")),
    air(once(5060, [tumble(85)], 5, "falling, coming down")),
    once(5070, [tripped(-30), tripped(-60)], 4, "tripped"),
    once(5080, [LYING_HIT], 4, "hit while down"),
    air(once(5090, [tumble(60)], 4, "hit up while down")),
    air(once(5100, [BOUNCE, LYING], 3, "hit the ground")),
    air(once(5101, [BOUNCE], 4, "bounce")),
    once(5110, [LYING], 30, "lying down"),
    once(5120, GET_UP, 4, "getting up"),
    once(5140, [LYING], 30, "lying defeated", { loop: false }),
    once(5150, [LYING], 30, "lying defeated (match over)", { loop: false }),
    air(once(5160, [BOUNCE], 4, "bounce into the air")),
    air(once(5170, [BOUNCE, LYING_HIT], 4, "hit the ground after a bounce")),
    air(once(5200, [flip(20), JUMP_FALL], 3, "fall recovery near the ground")),
    air(once(5210, [flip(60), flip(20), flip(-10), JUMP_FALL], 3, "fall recovery in the air")),
  ];
}

/** MUGEN's standard get-hit sprites (templates/standard.ts) as poses: `feet` re-grounds an airborne one. */
export function standardRigPoses(): Record<string, { pose: Pose; anchor?: "feet" }> {
  const g = (pose: Pose) => ({ pose });
  const f = (pose: Pose) => ({ pose, anchor: "feet" as const });
  return {
    "5000,0": g(HIT_HIGH[0]!), "5000,10": g(HIT_HIGH[1]!), "5000,20": g(HIT_HIGH[2]!),
    "5010,0": g(HIT_LOW[0]!), "5010,10": g(HIT_LOW[1]!), "5010,20": g(HIT_LOW[2]!),
    "5020,0": g(CROUCH_HIT[0]!), "5020,10": g(CROUCH_HIT[0]!), "5020,20": g(CROUCH_HIT[1]!),
    "5030,0": f(tumble(10)), "5030,10": f(tumble(35)), "5030,20": f(tumble(80)),
    "5030,30": f(tumble(95)), "5030,40": f(tumble(130)), "5030,50": f(tumble(160)),
    "5040,0": f(BOUNCE), "5040,10": g(LYING), "5040,20": g(LYING_HIT),
    "5060,0": f(tumble(0)), "5060,10": f(tumble(180)),
    "5070,0": f(tripped(-30)), "5070,10": f(tripped(-60)), "5070,20": f(tripped(-90)),
  };
}
