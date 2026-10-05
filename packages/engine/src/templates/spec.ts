/**
 * Fighter templates (DESIGN §11, docs/PHASE3.md "Fighter templates"): an
 * archetype's moves, animations, collision boxes, numbers and AI, built on a
 * sprite sheet. The Universal Prototype (CC0) supplies the reference art; a
 * community fighter later swaps in its own frames for the same slots.
 *
 * Distances and speeds in a spec are in 320-wide units (the scale of Kung Fu
 * Man and most MUGEN characters), so numbers compare across characters; the
 * builder converts them to the character's own `localcoord`.
 */
import type { Archetype } from "@greed-island/shared";
import type { Box } from "../art/air.ts";

export interface ArtSource {
  id: string;
  /** Relative to the repo root (the file itself is not in git; see art/SOURCES.md). */
  file: string;
  sha256: string;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  /** Where the fighter's feet meet the ground in every cell (the renders share one camera). */
  axis: { x: number; y: number };
  /** Palette indices of stray pixels to paint over. */
  stray: number[];
  /** The character's localcoord width: drawn size = 320 / localcoord of the sprite size. */
  localcoord: number;
  credit: string;
  /**
   * MUGEN's standard get-hit sprite numbers ("group,number" → cell), which
   * other characters' throws borrow from their victim. `feet` re-grounds an
   * airborne frame like AnimSpec.anchor.
   */
  standardSprites: Readonly<Record<string, number | { cell: number; anchor: "feet" }>>;
}

/** Cells of the sheet: a list, or an inclusive range (`to` below `from` plays backwards). */
export type Cells = readonly number[] | { from: number; to: number };

export interface AnimSpec {
  action: number;
  cells: Cells;
  /** Ticks per frame: one number for all, or one per frame. */
  ticks: number | readonly number[];
  /**
   * Loop from this frame (default 0: the whole animation repeats until its
   * state moves on); `false` holds the last frame for good (win poses, lying).
   */
  loop?: number | false;
  /**
   * Airborne frames were rendered off the ground inside their cells; "feet"
   * moves each frame (and its boxes) so its lowest pixel sits on the axis,
   * since the engine's own jump height already lifts the fighter.
   */
  anchor?: "feet";
  comment?: string;
}

/** high/mid: block standing or crouching; low: block crouching; overhead: block standing. */
export type HitHeight = "high" | "low" | "mid" | "overhead";
export type HitWeight = "light" | "medium" | "heavy";

/** One hit of an attack: which animation frames are active and what a hit does. */
export interface HitSpec {
  /** Animation frame indices (0-based) whose hitboxes are live. */
  frames: readonly number[];
  damage: number;
  /** Damage when blocked. */
  chip?: number;
  height: HitHeight;
  weight: HitWeight;
  /** Opponent hit stun and block stun, in ticks. */
  hitStun: number;
  blockStun: number;
  /** Knock-back speed on the ground (320 units per tick). */
  push: number;
  /** Knocks down (launches the opponent into a fall). */
  knockdown?: boolean;
  /** Trips (sweeps) the opponent. */
  trip?: boolean;
  /** Launch speed when knocking down or hitting in the air: x (away), y (up), 320 units. */
  launch?: readonly [number, number];
  /**
   * Hand-made hitbox instead of the automatic one, relative to the axis in sheet pixels: where the limb is drawn in
   * its cell (an animation anchored on its feet moves the box with the frame).
   */
  box?: Box;
}

export type Command =
  | "x" | "y" | "a" | "b"
  | "QCF_x" | "QCF_y" | "QCF_a" | "QCF_b"
  | "QCB_x" | "QCB_y" | "QCB_a" | "QCB_b"
  | "DP_x" | "DP_y" | "DP_a" | "DP_b"
  | "FF" | "BB";

export interface AttackSpec {
  /** State number (and its animation's action number). */
  state: number;
  name: string;
  anim: AnimSpec;
  /** How it starts: standing, crouching or in the air. */
  from: "stand" | "crouch" | "air";
  command: Command;
  /** Holding down for crouch moves is implied by `from`. */
  hits: readonly HitSpec[];
  /** Forward movement: speed (320 units per tick) set at a frame. */
  moves?: readonly { frame: number; x: number; y?: number }[];
  /** Special moves cost nothing but can't be cancelled into from normals. */
  special?: boolean;
  /**
   * Projectiles pass through the fighter for the whole move (a heavy's or a
   * grappler's way in against a zoner). The AI uses it when a projectile is
   * on its way and the opponent is near enough to charge at.
   */
  throughProjectiles?: boolean;
  /**
   * Fires a projectile instead of hitting with the body: it leaves at
   * animation `frame`, flies at `speed` (320 units per tick) at `height`
   * above the ground, and hits with the move's first HitSpec (whose `frames`
   * are then ignored). The ball is drawn by the builder.
   */
  projectile?: { frame: number; speed: number; height: number };
  /** AI: how far the hit reaches (320 units), and how much the AI likes it. */
  ai: { range: number; weight: number; antiAir?: boolean };
}

/**
 * A throw (docs/PHASE3.md "Fighter templates"). States: `state` reaches for
 * the opponent (a HitDef that only catches someone standing or crouching and
 * not already hit), `state + 10` holds and throws them, and the victim goes
 * through `state + 20` (held), `+ 21` (lifted) and `+ 22` (thrown) in our
 * code, drawn with its own standard get-hit sprites.
 */
export interface ThrowSpec {
  state: number;
  name: string;
  /** "throw": forward + strong punch up close; or a special motion. */
  command: Command | "throw";
  special?: boolean;
  /** The reach, as an animation on action `state`; `catchFrames` are when it can grab. */
  reach: AnimSpec;
  catchFrames: readonly number[];
  /** Forward movement during the reach (320 units per tick), like AttackSpec.moves. */
  moves?: readonly { frame: number; x: number }[];
  /** Holding and throwing, frame by frame: the thrower's cell and ticks, and where the victim is held (in front, up; 320 units). */
  hold: readonly { cell: number; ticks: number; victim: readonly [number, number]; lifted?: boolean }[];
  /** The hold frame where the victim is thrown, and its speed away and up (320 units per tick). */
  release: { frame: number; x: number; y: number };
  damage: number;
  /** AI: how close it must be (320 units), and how much the AI likes it. */
  ai: { range: number; weight: number };
}

export interface Constants {
  life: number;
  attack: number;
  defence: number;
  /** 320 units per tick. */
  walkFwd: number;
  walkBack: number;
  runFwd: number;
  hopBack: readonly [number, number];
  jumpUp: number;
  jumpFwd: number;
  jumpBack: number;
  /** 320 units per tick squared. */
  gravity: number;
  /** Body width in front and behind, and height, 320 units. */
  width: readonly [number, number];
  height: number;
}

export interface AiSpec {
  /**
   * Preferred distance to the opponent (320 units, body gap). Fighters
   * without a projectile stand no farther than their longest standing normal
   * reaches (measured), so this is a ceiling for them.
   */
  range: number;
  /** 0-1000 per tick: chance to attack when a move is in range. */
  aggression: number;
  /** 0-1000: chance to block an incoming attack. */
  block: number;
  /** 0-1000: chance to block an incoming projectile (default 800: it's seen coming from far away). */
  blockProjectile?: number;
  /** 0-1000 per tick: chance to answer an incoming projectile with a move that goes through it, when it has one (default 12). */
  throughProjectiles?: number;
  /** 0-1000 per tick: chance to start blocking an attack that's already on its way (default 35), so slow moves are blocked more than quick ones. */
  react?: number;
  /** 0-1000 per tick: chance to jump in when far. */
  jump: number;
  /** 0-1000 per tick: chance to run in instead of walking when far. */
  run: number;
  /** 0-1000 per tick: chance to walk back when the opponent is inside half its range (default 300). */
  retreat?: number;
}

export interface TemplateSpec {
  /** Character folder and roster id: gi-tpl-<archetype> for a template, gi-<name> for another house fighter built the same way. */
  id: string;
  name: string;
  archetype: Archetype;
  art: ArtSource;
  constants: Constants;
  /** Movement, guard, get-hit, intro and win animations. */
  anims: readonly AnimSpec[];
  attacks: readonly AttackSpec[];
  throws?: readonly ThrowSpec[];
  ai: AiSpec;
  /** This template's own colours (palette 1): source palette index → "#rrggbb", on top of the sheet's. */
  colors?: Readonly<Record<number, string>>;
  /** More outfits (palettes 2..n), each recolouring palette 1. */
  palettes: readonly PaletteSpec[];
  /** Cell used for the portrait (lifebar face); the box around the head is found from the pixels unless given (cell pixels). */
  portrait: { cell: number; box?: readonly [number, number, number, number] };
  /**
   * Parts of other models pasted onto this one's frames (templates/mix.ts): hair, a cap. Each part's colours get
   * their own palette slots from MIX_FIRST_SLOT on, in the order listed, so `colors` and outfits can recolour them.
   */
  looks?: readonly LookPart[];
}

/**
 * Part of another model's look: the pixels of these palette indices, from the same cell of `art` (a sheet on the
 * same layout, so the same pose), scaled to this model's size and aligned at the feet.
 */
export interface LookPart {
  art: ArtSource;
  /** The part's palette indices on its own sheet (e.g. a hair ramp). */
  indices: readonly number[];
  /** Move the part by this many pixels of this model's sheet (down and right are positive), to sit it better. */
  nudge?: { x?: number; y?: number };
}

export interface PaletteSpec {
  name: string;
  /** Source palette index → new colour "#rrggbb". */
  colors: Readonly<Record<number, string>>;
}

/**
 * Animations the engine's shared states play without checking they exist
 * (vendor/Ikemen-GO data/common1.cns.zss), plus the intro and win poses
 * our own states use. Every template must have them.
 */
export const REQUIRED_ACTIONS: readonly number[] = [
  0, 5, 6, 10, 11, 12, 20, 21, 40, 41, 42, 43, 47, 100, 105,
  120, 121, 122, 130, 131, 132, 140, 141, 142, 150, 151, 152, 170, 175, 180, 181, 190, 195,
  5000, 5001, 5002, 5005, 5006, 5007, 5010, 5011, 5012, 5015, 5016, 5017,
  5020, 5021, 5022, 5025, 5026, 5027, 5030, 5040, 5050, 5070, 5080, 5100, 5110, 5120, 5160, 5170,
];

/** Problems with a spec that don't need its sprite sheet to find. */
export function checkSpec(spec: TemplateSpec): string[] {
  const problems: string[] = [];
  const actions = new Map<number, AnimSpec>();
  for (const a of [...spec.anims, ...spec.attacks.map((x) => x.anim)]) {
    if (actions.has(a.action)) problems.push(`action ${a.action} is defined twice`);
    actions.set(a.action, a);
    const frames = cellList(a.cells);
    if (frames.length === 0) problems.push(`action ${a.action} has no frames`);
    const cells = spec.art.columns * spec.art.rows;
    for (const c of frames) if (!Number.isInteger(c) || c < 0 || c >= cells) problems.push(`action ${a.action}: cell ${c} is outside the sheet`);
    if (typeof a.ticks !== "number" && a.ticks.length !== frames.length) problems.push(`action ${a.action}: ${a.ticks.length} tick counts for ${frames.length} frames`);
    if (typeof a.loop === "number" && (a.loop < 0 || a.loop >= frames.length)) problems.push(`action ${a.action}: loop start ${a.loop} is outside the animation`);
  }
  for (const r of REQUIRED_ACTIONS) if (!actions.has(r)) problems.push(`required action ${r} is missing`);
  const states = new Set(spec.attacks.map((a) => a.state));
  for (const t of spec.throws ?? []) {
    if (t.reach.action !== t.state) problems.push(`${t.name}: its reach animation should be ${t.state}`);
    for (const n of [t.state, t.state + 10, t.state + 20, t.state + 21, t.state + 22]) {
      if (states.has(n) || actions.has(n) && n !== t.state) problems.push(`${t.name}: state or action ${n} is already used`);
      states.add(n);
    }
    const reach = cellList(t.reach.cells).length;
    for (const f of t.catchFrames) if (f < 0 || f >= reach) problems.push(`${t.name}: catch frame ${f} is outside the reach`);
    if (t.hold.length === 0) problems.push(`${t.name}: no hold frames`);
    if (t.release.frame < 0 || t.release.frame >= t.hold.length) problems.push(`${t.name}: release frame ${t.release.frame} is outside the hold`);
    if (t.damage <= 0) problems.push(`${t.name}: damage must be positive`);
    if (t.state < 200 || t.state + 22 >= 5000) problems.push(`${t.name}: throw states are 200-4977`);
  }
  for (const a of spec.attacks) {
    if (a.anim.action !== a.state) problems.push(`${a.name}: animation ${a.anim.action} should be ${a.state}`);
    const length = cellList(a.anim.cells).length;
    if (a.hits.length === 0) problems.push(`${a.name}: no hits`);
    if (a.projectile && (a.projectile.frame < 0 || a.projectile.frame >= length)) problems.push(`${a.name}: projectile frame ${a.projectile.frame} is outside the animation`);
    if (a.projectile && a.hits.length !== 1) problems.push(`${a.name}: a projectile has exactly one hit`);
    for (const h of a.hits) {
      if (h.frames.length === 0) problems.push(`${a.name}: a hit with no active frames`);
      for (const f of h.frames) if (f < 0 || f >= length) problems.push(`${a.name}: hit frame ${f} is outside its ${length} frames`);
      if (h.damage <= 0 || (h.chip ?? 0) < 0) problems.push(`${a.name}: damage must be positive`);
    }
    for (const m of a.moves ?? []) if (m.frame < 0 || m.frame >= length) problems.push(`${a.name}: move frame ${m.frame} is outside the animation`);
    if (a.state < 200 || a.state >= 5000) problems.push(`${a.name}: attack states are 200-4999`);
  }
  for (const p of [{ name: "main", colors: spec.colors ?? {} }, ...spec.palettes]) for (const [i, c] of Object.entries(p.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(c) || Number(i) < 1 || Number(i) > 255) problems.push(`palette ${p.name}: bad entry ${i} = ${c}`);
  }
  for (const p of spec.looks ?? []) {
    if (p.art.columns !== spec.art.columns || p.art.rows !== spec.art.rows) problems.push(`look from ${p.art.id}: its sheet isn't on this one's layout`);
    if (p.indices.length === 0) problems.push(`look from ${p.art.id}: no palette indices`);
    for (const n of p.indices) if (!Number.isInteger(n) || n < 1 || n > 255) problems.push(`look from ${p.art.id}: bad palette index ${n}`);
  }
  // Mixed-in parts take palette slots from 100 up to the projectile colours at 240 (templates/mix.ts).
  if ((spec.looks ?? []).reduce((n, p) => n + p.indices.length, 0) > 140) problems.push("the looks need more than 140 palette slots");
  if (!/^gi-[a-z0-9-]+$/.test(spec.id)) problems.push(`id ${spec.id} should look like gi-tpl-<archetype> (a template) or gi-<name>`);
  return problems;
}

export function cellList(c: Cells): number[] {
  if (Array.isArray(c)) return [...c];
  const { from, to } = c as { from: number; to: number };
  const step = to >= from ? 1 : -1;
  const out: number[] = [];
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i);
  return out;
}

export function ticksOf(a: AnimSpec, frame: number): number {
  const t = typeof a.ticks === "number" ? a.ticks : a.ticks[frame];
  if (t === undefined) throw new Error(`action ${a.action}: no ticks for frame ${frame}`);
  return t;
}
