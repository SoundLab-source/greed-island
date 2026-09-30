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

export type HitHeight = "high" | "low" | "mid";
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
  /** Hand-made hitbox instead of the automatic one, relative to the axis in sheet pixels. */
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
  /** AI: how far the hit reaches (320 units), and how much the AI likes it. */
  ai: { range: number; weight: number; antiAir?: boolean };
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
  /** Preferred distance to the opponent (320 units). */
  range: number;
  /** 0-1000 per tick: chance to attack when a move is in range. */
  aggression: number;
  /** 0-1000: chance to block an incoming attack. */
  block: number;
  /** 0-1000 per tick: chance to jump in when far. */
  jump: number;
  /** 0-1000 per tick: chance to run in instead of walking when far. */
  run: number;
}

export interface TemplateSpec {
  /** Character folder and roster id: gi-tpl-<archetype>. */
  id: string;
  name: string;
  archetype: Archetype;
  art: ArtSource;
  constants: Constants;
  /** Movement, guard, get-hit, intro and win animations. */
  anims: readonly AnimSpec[];
  attacks: readonly AttackSpec[];
  ai: AiSpec;
  /** Colour ramps to recolour for palettes 2..n: each maps source palette indices to new RGB. */
  palettes: readonly PaletteSpec[];
  /** Cell used for the portrait (lifebar face), and the box around the head in cell pixels. */
  portrait: { cell: number; box: readonly [number, number, number, number] };
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
  for (const a of spec.attacks) {
    if (a.anim.action !== a.state) problems.push(`${a.name}: animation ${a.anim.action} should be ${a.state}`);
    const length = cellList(a.anim.cells).length;
    if (a.hits.length === 0) problems.push(`${a.name}: no hits`);
    for (const h of a.hits) {
      if (h.frames.length === 0) problems.push(`${a.name}: a hit with no active frames`);
      for (const f of h.frames) if (f < 0 || f >= length) problems.push(`${a.name}: hit frame ${f} is outside its ${length} frames`);
      if (h.damage <= 0 || (h.chip ?? 0) < 0) problems.push(`${a.name}: damage must be positive`);
    }
    for (const m of a.moves ?? []) if (m.frame < 0 || m.frame >= length) problems.push(`${a.name}: move frame ${m.frame} is outside the animation`);
    if (a.state < 200 || a.state >= 5000) problems.push(`${a.name}: attack states are 200-4999`);
  }
  for (const p of spec.palettes) for (const [i, c] of Object.entries(p.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(c) || Number(i) < 1 || Number(i) > 255) problems.push(`palette ${p.name}: bad entry ${i} = ${c}`);
  }
  if (!/^gi-tpl-[a-z-]+$/.test(spec.id)) problems.push(`id ${spec.id} should look like gi-tpl-<archetype>`);
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
