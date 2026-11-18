/**
 * Parts, not frames (docs/PHASE3.md "Making our own characters", route 3): a
 * fighter drawn as about fifteen body parts on one shared skeleton, posed in
 * code for every animation, the way 2D cut-out games (Brawlhalla, Rayman
 * Legends) animate. A new fighter is a new set of parts; every move, hit
 * reaction and get-up comes with the skeleton.
 *
 * This file is the skeleton: its bones, a pose (an angle per joint), and
 * forward kinematics (where every bone lands in the cell).
 *
 * Angles are in degrees, turning counterclockwise on screen. A limb hanging
 * straight down is at 0, and positive swings it forward (the fighter faces
 * right), so a punch straight ahead is an upper arm at 90 with a straight
 * forearm (0). Knees bend with negative angles. The torso's `lean` is the
 * other way round: positive leans forward, as people say it.
 */

export type BoneId =
  | "hip" | "torso" | "head"
  | "upperArmB" | "foreArmB" | "handB"
  | "thighB" | "shinB" | "footB"
  | "thighF" | "shinF" | "footF"
  | "upperArmF" | "foreArmF" | "handF";

/** F is the near side (drawn in front), B the far side (drawn behind, a shade darker). */
export type Side = "F" | "B";

/** Bone lengths in sheet pixels, and where limbs join the torso. */
export interface Proportions {
  /** Hip to the base of the neck. */
  torso: number;
  /** Base of the neck to the top of the head. */
  head: number;
  upperArm: number;
  foreArm: number;
  hand: number;
  thigh: number;
  shin: number;
  /** Heel to toe. */
  foot: number;
  /** How far up the torso the shoulders sit (0-1). */
  shoulder: number;
  /** The far shoulder and hip sit this many pixels behind the near ones (a body seen from three quarters). */
  depth: number;
}

/** Proportions for a fighter about 200 pixels tall: drawn at localcoord 560 it stands as tall as the house roster. */
export const DEFAULT_PROPORTIONS: Proportions = {
  torso: 64, head: 32, upperArm: 39, foreArm: 35, hand: 12, thigh: 50, shin: 48, foot: 22, shoulder: 0.9, depth: 7,
};

/** Upper and lower bone, then hand or foot. */
export type Limb = readonly [number, number, number?];

/**
 * One pose: a picture of the fighter. Unset limbs take the guard stance's
 * angles. By default the drawn fighter is set down so its lowest pixel
 * touches the ground; `air` lifts it that many pixels instead (jumps).
 */
export interface Pose {
  /** Hip moved forward (or back, negative) from the axis, pixels. */
  x?: number;
  /** Lift off the ground in pixels; when unset, the lowest drawn pixel sits on the ground line. */
  air?: number;
  /** Whole body turned counterclockwise (positive falls backward), degrees, about the hip. */
  rot?: number;
  /** Torso lean, forward positive. */
  lean?: number;
  /** Head tilt from the torso's line, forward (chin down) positive. */
  head?: number;
  /** Upper arm (from the torso's line, 0 hanging along it, forward positive), forearm (bend, forward positive), hand. */
  armF?: Limb;
  armB?: Limb;
  /** Thigh (0 straight down, forward positive), shin (knee bend: negative), foot (from the shin, 90 at a right angle; unset, flat on the ground). */
  legF?: Limb;
  legB?: Limb;
  /** Open hands instead of fists. */
  open?: Partial<Record<Side, boolean>>;
  /** Squash and stretch about the hip: 1 is none (landing, crouching hard). */
  squash?: number;
  /** Effects drawn over the fighter (streaks, sparks), in the order given. */
  fx?: readonly FxDraw[];
}

/** A bone where it lands in the cell: from its joint `at`, pointing along `angle` (world, 0 down), `length` long. */
export interface PlacedBone {
  id: BoneId;
  at: { x: number; y: number };
  angle: number;
  length: number;
  /** The far end. */
  end: { x: number; y: number };
}

export type Skeleton = Record<BoneId, PlacedBone>;

/** Draws an effect on a posed fighter: `put` paints one pixel with a palette index; `bones` is where everything is. */
export type FxDraw = (ctx: { put: (x: number, y: number, color: number) => void; bones: Skeleton; ground: number }) => void;

export const GUARD_POSE: Required<Pick<Pose, "lean" | "head" | "armF" | "armB" | "legF" | "legB">> = {
  lean: 8,
  head: -4,
  armF: [35, 105, 0],
  armB: [20, 115, 0],
  legF: [24, -30],
  legB: [-20, -14],
};

const rad = (d: number) => (d * Math.PI) / 180;
/** The unit direction of a world angle (0 down, counterclockwise positive, y down on screen). */
export function dir(angle: number): { x: number; y: number } {
  return { x: Math.sin(rad(angle)), y: Math.cos(rad(angle)) };
}

function place(id: BoneId, at: { x: number; y: number }, angle: number, length: number): PlacedBone {
  const d = dir(angle);
  return { id, at, angle, length, end: { x: at.x + d.x * length, y: at.y + d.y * length } };
}

/**
 * Where every bone lands for a pose, with the hip at `hip` (cell pixels). The
 * caller sets the fighter down afterwards (render.ts), so `hip` only has to
 * be roughly right.
 */
export function solve(pose: Pose, p: Proportions, hip: { x: number; y: number }): Skeleton {
  const rot = pose.rot ?? 0;
  const squash = pose.squash ?? 1;
  const lean = pose.lean ?? GUARD_POSE.lean;
  // The torso points up (180) and leans forward by turning clockwise (negative).
  const torsoAngle = 180 + rot - lean;
  const s = (n: number) => n * squash;
  const bones = {} as Skeleton;
  bones.hip = place("hip", hip, rot, 0);
  bones.torso = place("torso", hip, torsoAngle, s(p.torso));
  bones.head = place("head", bones.torso.end, torsoAngle - (pose.head ?? GUARD_POSE.head), p.head);
  const back = dir(rot - 90); // towards the fighter's back
  const shoulder = (side: Side) => {
    const d = dir(torsoAngle);
    const at = { x: hip.x + d.x * s(p.torso) * p.shoulder, y: hip.y + d.y * s(p.torso) * p.shoulder };
    return side === "F" ? at : { x: at.x + back.x * p.depth, y: at.y + back.y * p.depth };
  };
  const hipJoint = (side: Side) => (side === "F" ? hip : { x: hip.x + back.x * p.depth * 0.6, y: hip.y + back.y * p.depth * 0.6 });
  for (const side of ["B", "F"] as const) {
    const arm = (side === "F" ? pose.armF : pose.armB) ?? (side === "F" ? GUARD_POSE.armF : GUARD_POSE.armB);
    // Arms hang along the torso at 0: the torso points up, so down along it is torsoAngle - 180.
    const upper = torsoAngle - 180 + arm[0];
    bones[`upperArm${side}`] = place(`upperArm${side}`, shoulder(side), upper, s(p.upperArm));
    bones[`foreArm${side}`] = place(`foreArm${side}`, bones[`upperArm${side}`].end, upper + arm[1], s(p.foreArm));
    bones[`hand${side}`] = place(`hand${side}`, bones[`foreArm${side}`].end, upper + arm[1] + (arm[2] ?? 0), p.hand);
    const leg = (side === "F" ? pose.legF : pose.legB) ?? (side === "F" ? GUARD_POSE.legF : GUARD_POSE.legB);
    const thigh = rot + leg[0];
    bones[`thigh${side}`] = place(`thigh${side}`, hipJoint(side), thigh, s(p.thigh));
    bones[`shin${side}`] = place(`shin${side}`, bones[`thigh${side}`].end, thigh + leg[1], s(p.shin));
    // Unset, the foot stays flat (level with the ground, whatever the shin does).
    bones[`foot${side}`] = place(`foot${side}`, bones[`shin${side}`].end, leg[2] === undefined ? rot + 90 : thigh + leg[1] + leg[2], p.foot);
  }
  return bones;
}

/** Back to front: the far arm and leg, the torso and head, then the near leg and arm. */
export const DRAW_ORDER: readonly BoneId[] = [
  "upperArmB", "foreArmB", "handB",
  "thighB", "shinB", "footB",
  "torso", "head",
  "thighF", "shinF", "footF",
  "upperArmF", "foreArmF", "handF",
];

/** Linear blend of two poses (angles, offsets), `t` from 0 (a) to 1 (b): in-between frames. Effects come from the nearer one. */
export function blend(a: Pose, b: Pose, t: number): Pose {
  const n = (x: number | undefined, y: number | undefined, d: number) => (x ?? d) + ((y ?? d) - (x ?? d)) * t;
  const limb = (x: Limb | undefined, y: Limb | undefined, d: Limb, end = 90): Limb => {
    const out: [number, number, number?] = [n(x?.[0], y?.[0], d[0]), n(x?.[1], y?.[1], d[1])];
    // A foot (or hand) angle only when either pose gives one; flat feet stay flat.
    if (x?.[2] !== undefined || y?.[2] !== undefined) out[2] = n(x?.[2], y?.[2], end);
    return out;
  };
  const out: Pose = {
    x: n(a.x, b.x, 0),
    rot: n(a.rot, b.rot, 0),
    lean: n(a.lean, b.lean, GUARD_POSE.lean),
    head: n(a.head, b.head, GUARD_POSE.head),
    armF: limb(a.armF, b.armF, GUARD_POSE.armF, 0),
    armB: limb(a.armB, b.armB, GUARD_POSE.armB, 0),
    legF: limb(a.legF, b.legF, GUARD_POSE.legF),
    legB: limb(a.legB, b.legB, GUARD_POSE.legB),
    squash: n(a.squash, b.squash, 1),
    open: t < 0.5 ? a.open : b.open,
    fx: t < 0.5 ? a.fx : b.fx,
  };
  if (a.air !== undefined || b.air !== undefined) out.air = n(a.air, b.air, 0);
  return out;
}
