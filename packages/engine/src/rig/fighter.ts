/**
 * A rig fighter as a TemplateSpec (templates/spec.ts), so `pnpm
 * templates:build`, the balance tool and the roster treat it like any other
 * house fighter. Its sheet is drawn in code: every pose it uses, once, one per
 * cell. It keeps an archetype template's numbers and AI (`base`): each of the
 * base's attacks is given the same number of poses, so its timing, hits and
 * movement stay the template's, and its hitbox is worked out from the bones
 * (the fist or foot that strikes), not guessed from the pixels.
 */
import type { Box } from "../art/air.ts";
import type { Sheet } from "../art/sheet.ts";
import type { AnimSpec, ArtSource, AttackSpec, Cue, TemplateSpec } from "../templates/spec.ts";
import { cellList } from "../templates/spec.ts";
import type { StandardSprite } from "../templates/standard.ts";
import { sharedRigAnims, standardRigPoses, type RigAnim } from "./moves.ts";
import { checkDesign, designPalette, materialColors, type Design } from "./parts.ts";
import { renderPose, type Cell, type Rendered } from "./render.ts";
import type { BoneId, Pose } from "./skeleton.ts";

/** Every rig fighter's cell: room for a kick at full stretch and an uppercut's raised fist. */
export const RIG_CELL: Cell = { width: 440, height: 320, axis: { x: 200, y: 300 } };
/** Drawn at this localcoord, the default proportions stand about 116 units tall, like the Universal Prototype fighters. */
export const RIG_LOCALCOORD = 560;

export interface RigMove {
  /** The move's own name (default the base's). */
  name?: string;
  /** One pose per frame of the base's animation. */
  poses: readonly Pose[];
  /** The bones that land the blow; the hitbox wraps them (from joint to end) on the active frames. */
  strike: readonly BoneId[];
  /** Pixels added round the striking bones (default 7). */
  pad?: number;
}

export interface RigOutfit {
  name: string;
  /** Material → colour, over the design's own. */
  materials: Readonly<Record<string, string>>;
}

export interface RigFighterOptions {
  id: string;
  name: string;
  /** The archetype template whose numbers, moves' timing and AI it keeps. */
  base: TemplateSpec;
  design: Design;
  /** Further outfits (palettes 2..n). */
  outfits: readonly RigOutfit[];
  /** Base attack state → its poses. Every attack of the base needs one. */
  moves: Readonly<Record<number, RigMove>>;
  /** Intro (190), taunt (195) and the two win poses (180, 181). */
  intro: Omit<RigAnim, "action">;
  taunt: Omit<RigAnim, "action">;
  wins: readonly [Omit<RigAnim, "action">, Omit<RigAnim, "action">];
  /** Effect colours (FX_FIRST..FX_LAST) → "#rrggbb"; effects are left out of hurtboxes. */
  fx?: Readonly<Record<number, string>>;
  constants?: Partial<TemplateSpec["constants"]>;
  credit: string;
  sounds?: TemplateSpec["sounds"];
  cues?: readonly Cue[];
}

/** The cells of a rig fighter: each distinct pose (by identity) once. */
class PoseBook {
  readonly poses: Pose[] = [];
  private readonly index = new Map<Pose, number>();
  cell(p: Pose): number {
    let n = this.index.get(p);
    if (n === undefined) {
      n = this.poses.length;
      this.poses.push(p);
      this.index.set(p, n);
    }
    return n;
  }
}

const COLUMNS = 16;

/** The hitbox (axis-relative, cell pixels) round the striking bones of a drawn pose. */
export function strikeBox(r: Rendered, bones: readonly BoneId[], pad = 7): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of bones) {
    const b = r.bones[id];
    for (const q of [b.at, b.end]) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }
  }
  const { x, y } = RIG_CELL.axis;
  return [Math.round(x0 - pad - x), Math.round(y0 - pad - y), Math.round(x1 + pad - x), Math.round(y1 + pad - y)];
}

export function rigFighter(o: RigFighterOptions): TemplateSpec & { rig: { design: Design; poses: readonly Pose[] } } {
  const problems = checkDesign(o.design);
  if (problems.length) throw new Error(`${o.id}: ${problems.join("; ")}`);
  const book = new PoseBook();
  const rendered = new Map<Pose, Rendered>();
  const draw = (p: Pose) => {
    let r = rendered.get(p);
    if (!r) {
      r = renderPose(o.design, p, RIG_CELL);
      rendered.set(p, r);
    }
    return r;
  };
  const toAnim = (a: RigAnim): AnimSpec => ({
    action: a.action,
    cells: a.poses.map((p) => book.cell(p)),
    ticks: a.ticks,
    ...(a.loop !== undefined ? { loop: a.loop } : {}),
    ...(a.anchor ? { anchor: a.anchor } : {}),
    ...(a.comment ? { comment: a.comment } : {}),
  });
  const anims: AnimSpec[] = [
    ...sharedRigAnims().map(toAnim),
    toAnim({ ...o.intro, action: 190 }),
    toAnim({ ...o.taunt, action: 195 }),
    toAnim({ ...o.wins[0], action: 180, loop: false }),
    toAnim({ ...o.wins[1], action: 181, loop: false }),
  ];
  const attacks: AttackSpec[] = o.base.attacks.map((a) => {
    const m = o.moves[a.state];
    if (!m) throw new Error(`${o.id}: no poses for ${a.name} (state ${a.state})`);
    const frames = cellList(a.anim.cells).length;
    if (m.poses.length !== frames) throw new Error(`${o.id}: ${m.name ?? a.name} has ${m.poses.length} poses for the base's ${frames} frames`);
    const anim: AnimSpec = { ...a.anim, cells: m.poses.map((p) => book.cell(p)) };
    const hits = a.projectile ? a.hits : a.hits.map((h) => {
      // One box for the hit: round the striking bones on all its active frames.
      const boxes = h.frames.map((f) => strikeBox(draw(m.poses[f]!), m.strike, m.pad));
      const box: Box = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
      return { ...h, box };
    });
    return { ...a, name: m.name ?? a.name, anim, hits };
  });
  const standard: Record<string, StandardSprite> = {};
  for (const [key, s] of Object.entries(standardRigPoses())) standard[key] = s.anchor ? { cell: book.cell(s.pose), anchor: s.anchor } : book.cell(s.pose);
  const poses = book.poses;
  const standCell = anims[0]!.cells as number[];
  const head = draw(poses[standCell[0]!]!).bones.head;
  const cx = (head.at.x + head.end.x) / 2, cy = (head.at.y + head.end.y) / 2;
  const fxColors = o.fx ?? {};
  const art: ArtSource = {
    id: `rig-${o.id}`,
    file: "(drawn in code: packages/engine/src/rig)",
    sha256: "",
    cellWidth: RIG_CELL.width,
    cellHeight: RIG_CELL.height,
    columns: COLUMNS,
    rows: Math.ceil(poses.length / COLUMNS),
    axis: RIG_CELL.axis,
    stray: [],
    localcoord: RIG_LOCALCOORD,
    standardSprites: standard,
    effects: Object.keys(fxColors).map(Number),
    sheet: async () => rigSheet(o.design, poses, fxColors, (p) => rendered.get(p) ?? renderPose(o.design, p, RIG_CELL)),
    credit: o.credit,
  };
  return {
    id: o.id,
    name: o.name,
    archetype: o.base.archetype,
    art,
    constants: { ...o.base.constants, ...o.constants },
    anims,
    attacks,
    ...(o.base.throws ? { throws: o.base.throws } : {}),
    ai: o.base.ai,
    palettes: o.outfits.map((f) => ({ name: f.name, colors: materialColors(o.design, f.materials) })),
    portrait: { cell: standCell[0]!, box: [Math.round(cx - 26), Math.round(cy - 26), Math.round(cx + 26), Math.round(cy + 26)] },
    ...(o.sounds ? { sounds: o.sounds } : {}),
    ...(o.cues ? { cues: o.cues } : {}),
    rig: { design: o.design, poses },
  };
}

/** Every pose drawn into its cell, 16 to a row. */
export function rigSheet(design: Design, poses: readonly Pose[], fx: Readonly<Record<number, string>>, draw: (p: Pose) => Rendered = (p) => renderPose(design, p, RIG_CELL)): Sheet {
  const { width: w, height: h } = RIG_CELL;
  const rows = Math.ceil(poses.length / COLUMNS);
  const sheet: Sheet = { width: w * COLUMNS, height: h * rows, pixels: new Uint8Array(w * COLUMNS * h * rows), palette: designPalette(design, fx), cellWidth: w, cellHeight: h, columns: COLUMNS, rows };
  poses.forEach((p, n) => {
    const img = draw(p).img;
    const x0 = (n % COLUMNS) * w, y0 = Math.floor(n / COLUMNS) * h;
    for (let y = 0; y < h; y++) sheet.pixels.set(img.pixels.subarray(y * w, (y + 1) * w), (y0 + y) * sheet.width + x0);
  });
  return sheet;
}
