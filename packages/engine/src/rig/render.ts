/**
 * Drawing a rig fighter (rig/skeleton.ts) in a pose: every part along its
 * bone, back to front, each with a one-pixel outline round it (the cut-out
 * look) and shaded by which way its surface faces, then set down on the
 * ground and its effects drawn on top.
 */
import type { IndexedImage } from "../art/sheet.ts";
import { IMAGE_COLORS, IMAGE_FIRST, materialIndex, OUTLINE_INDEX, type Design, type PartImage, type Shape, type Tone } from "./parts.ts";
import { DEFAULT_PROPORTIONS, dir, DRAW_ORDER, solve, type BoneId, type PlacedBone, type Pose, type Proportions, type Skeleton } from "./skeleton.ts";

export interface Cell {
  width: number;
  height: number;
  /** Where the feet meet the ground. */
  axis: { x: number; y: number };
}

/** Light from in front and above (the fighter faces right; y points down). */
const LIGHT = (() => {
  const l = Math.hypot(0.55, 0.83);
  return { x: 0.55 / l, y: -0.83 / l };
})();

/** On the torso and head, "front" (v > 0) is the bone's right-hand side, since they point up. */
const frontSign = (id: BoneId) => (id === "torso" || id === "head" ? -1 : 1);

interface Hit {
  inside: boolean;
  /** Surface direction in the bone's (u, v), for shading; zero for flat shapes. */
  nu: number;
  nv: number;
}

function test(s: Shape, u: number, v: number): Hit {
  if (s.kind === "capsule") {
    const vc = s.v ?? 0;
    const len = s.u1 - s.u0;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, (u - s.u0) / len));
    const uc = s.u0 + t * len, r = s.r0 + t * (s.r1 - s.r0);
    const du = u - uc, dv = v - vc;
    return { inside: du * du + dv * dv <= r * r, nu: du / r, nv: dv / r };
  }
  if (s.kind === "ellipse") {
    const a = (u - s.u) / s.ru, b = (v - s.v) / s.rv;
    return { inside: a * a + b * b <= 1, nu: a, nv: b };
  }
  let inside = false;
  const pts = s.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ui, vi] = pts[i]!, [uj, vj] = pts[j]!;
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return { inside, nu: 0, nv: 0 };
}

/** How far a shape reaches from its bone, for the box to scan. */
function extent(s: Shape): { u0: number; u1: number; v0: number; v1: number } {
  if (s.kind === "capsule") {
    const r = Math.max(s.r0, s.r1), v = s.v ?? 0;
    return { u0: Math.min(s.u0, s.u1) - r, u1: Math.max(s.u0, s.u1) + r, v0: v - r, v1: v + r };
  }
  if (s.kind === "ellipse") return { u0: s.u - s.ru, u1: s.u + s.ru, v0: s.v - s.rv, v1: s.v + s.rv };
  const us = s.points.map((p) => p[0]), vs = s.points.map((p) => p[1]);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

/** Draw a drawn part (a picture) on its bone: nearest pixel, a shade darker on the far side, outlined. */
export function drawImagePart(out: IndexedImage, bone: PlacedBone, image: PartImage) {
  const back = bone.id.endsWith("B");
  const d = dir(bone.angle);
  const sign = frontSign(bone.id);
  const n = { x: d.y * sign, y: -d.x * sign };
  // Picture coordinates of a cell point: its (u, v) on the bone, stepped along the picture's u and v from the pivot.
  const sample = (x: number, y: number) => {
    const px = x - bone.at.x, py = y - bone.at.y;
    const u = px * d.x + py * d.y, v = px * n.x + py * n.y;
    const ix = Math.floor(image.pivot.x + u * image.u.x + v * image.v.x), iy = Math.floor(image.pivot.y + u * image.u.y + v * image.v.y);
    return ix < 0 || iy < 0 || ix >= image.width || iy >= image.height ? 0 : image.pixels[iy * image.width + ix]!;
  };
  // The picture's corners in the cell, for the box to scan: invert pivot + u*U + v*V.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const det = image.u.x * image.v.y - image.u.y * image.v.x;
  for (const [cx, cy] of [[0, 0], [image.width, 0], [0, image.height], [image.width, image.height]] as const) {
    const ax = cx - image.pivot.x, ay = cy - image.pivot.y;
    const u = (ax * image.v.y - ay * image.v.x) / det, v = (image.u.x * ay - image.u.y * ax) / det;
    const x = bone.at.x + u * d.x + v * n.x, y = bone.at.y + u * d.y + v * n.y;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const fromX = Math.max(0, Math.floor(x0) - 1), toX = Math.min(out.width - 1, Math.ceil(x1) + 1);
  const fromY = Math.max(0, Math.floor(y0) - 1), toY = Math.min(out.height - 1, Math.ceil(y1) + 1);
  for (let y = fromY; y <= toY; y++) {
    for (let x = fromX; x <= toX; x++) {
      const c = sample(x + 0.5, y + 0.5);
      if (!c) continue;
      const edge = !sample(x + 1.5, y + 0.5) || !sample(x - 0.5, y + 0.5) || !sample(x + 0.5, y + 1.5) || !sample(x + 0.5, y - 0.5);
      out.pixels[y * out.width + x] = edge ? OUTLINE_INDEX : back && c >= IMAGE_FIRST && c < IMAGE_FIRST + IMAGE_COLORS ? c + IMAGE_COLORS : c;
    }
  }
}

/** Draw one part on its bone into `out` (palette indices). */
export function drawPart(out: IndexedImage, design: Design, bone: PlacedBone, shapes: readonly Shape[]) {
  const back = bone.id.endsWith("B");
  const d = dir(bone.angle);
  const sign = frontSign(bone.id);
  // The front normal: d turned a quarter (for a bone hanging down, that's forward), flipped for the torso and head.
  const n = { x: d.y * sign, y: -d.x * sign };
  const toLocal = (x: number, y: number) => {
    const px = x - bone.at.x, py = y - bone.at.y;
    return { u: px * d.x + py * d.y, v: px * n.x + py * n.y };
  };
  const inPart = (x: number, y: number) => {
    const { u, v } = toLocal(x, y);
    return shapes.some((s) => test(s, u, v).inside);
  };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const e = extent(s);
    for (const [u, v] of [[e.u0, e.v0], [e.u0, e.v1], [e.u1, e.v0], [e.u1, e.v1]] as const) {
      const x = bone.at.x + u * d.x + v * n.x, y = bone.at.y + u * d.y + v * n.y;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const fromX = Math.max(0, Math.floor(x0) - 2), toX = Math.min(out.width - 1, Math.ceil(x1) + 2);
  const fromY = Math.max(0, Math.floor(y0) - 2), toY = Math.min(out.height - 1, Math.ceil(y1) + 2);
  for (let y = fromY; y <= toY; y++) {
    for (let x = fromX; x <= toX; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      const { u, v } = toLocal(cx, cy);
      let top: { s: Shape; h: Hit } | undefined;
      for (const s of shapes) {
        const h = test(s, u, v);
        if (h.inside) top = { s, h };
      }
      if (!top) continue;
      const edge = !inPart(cx + 1, cy) || !inPart(cx - 1, cy) || !inPart(cx, cy + 1) || !inPart(cx, cy - 1);
      let color: number;
      if (edge) color = OUTLINE_INDEX;
      else if (top.s.outline && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const l = toLocal(cx + ox!, cy + oy!);
        return !test(top!.s, l.u, l.v).inside;
      })) color = OUTLINE_INDEX;
      else {
        let tone: Tone = top.s.tone ?? "mid";
        if (!top.s.tone && !top.s.flat) {
          const wx = top.h.nu * d.x + top.h.nv * n.x, wy = top.h.nu * d.y + top.h.nv * n.y;
          const lit = wx * LIGHT.x + wy * LIGHT.y;
          tone = lit > 0.42 ? "light" : lit < -0.3 ? "dark" : "mid";
        }
        color = materialIndex(design, top.s.material, tone, back);
      }
      out.pixels[y * out.width + x] = color;
    }
  }
}

export function proportionsOf(design: Design): Proportions {
  return { ...DEFAULT_PROPORTIONS, ...design.proportions };
}

export interface Rendered {
  img: IndexedImage;
  /** Where every bone ended up in the cell, after setting the fighter down. */
  bones: Skeleton;
}

/**
 * The fighter in a pose, in a cell: set down so its lowest pixel touches the
 * ground (or `pose.air` pixels above it). Throws if any of it falls outside
 * the cell, so a pose can't be cut off without anyone noticing.
 */
export function renderPose(design: Design, pose: Pose, cell: Cell): Rendered {
  const p = proportionsOf(design);
  // Drawn on a canvas with room all round, then moved into the cell.
  const pad = 200;
  const canvas: IndexedImage = { width: cell.width + pad * 2, height: cell.height + pad * 2, pixels: new Uint8Array((cell.width + pad * 2) * (cell.height + pad * 2)) };
  const hipY = cell.axis.y - (p.thigh + p.shin);
  const bones = solve(pose, p, { x: pad + cell.axis.x + (pose.x ?? 0), y: pad + hipY });
  for (const id of DRAW_ORDER) {
    const part = design.parts[id];
    if (!part) continue;
    const isHand = id === "handF" || id === "handB";
    const open = isHand && pose.open?.[id === "handF" ? "F" : "B"];
    const image = open && part.openImage ? part.openImage : part.image;
    if (image) drawImagePart(canvas, bones[id], image);
    else drawPart(canvas, design, bones[id], open && part.open ? part.open : part.shapes);
  }
  let lowest = -1;
  for (let y = canvas.height - 1; y >= 0 && lowest < 0; y--) {
    for (let x = 0; x < canvas.width; x++) if (canvas.pixels[y * canvas.width + x]) { lowest = y; break; }
  }
  if (lowest < 0) throw new Error("the pose drew nothing");
  // Lowest pixel on the row just above the ground line, like a sprite's feet.
  const dy = cell.axis.y - 1 - Math.round(pose.air ?? 0) - (lowest - pad);
  const img: IndexedImage = { width: cell.width, height: cell.height, pixels: new Uint8Array(cell.width * cell.height) };
  let lost = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const c = canvas.pixels[y * canvas.width + x]!;
      if (!c) continue;
      const tx = x - pad, ty = y - pad + dy;
      if (tx < 0 || ty < 0 || tx >= cell.width || ty >= cell.height) lost++;
      else img.pixels[ty * cell.width + tx] = c;
    }
  }
  if (lost) throw new Error(`${lost} pixels fall outside the ${cell.width}x${cell.height} cell`);
  const moved = {} as Skeleton;
  for (const [id, b] of Object.entries(bones) as [BoneId, PlacedBone][]) {
    const m = (q: { x: number; y: number }) => ({ x: q.x - pad, y: q.y - pad + dy });
    moved[id] = { ...b, at: m(b.at), end: m(b.end) };
  }
  const put = (x: number, y: number, color: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < cell.width && y < cell.height) img.pixels[y * cell.width + x] = color;
  };
  for (const fx of pose.fx ?? []) fx({ put, bones: moved, ground: cell.axis.y });
  return { img, bones: moved };
}
