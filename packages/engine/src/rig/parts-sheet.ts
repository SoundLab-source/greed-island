/**
 * The parts guide: one page an artist draws a fighter on, nine boxes, one per
 * part (head, torso, upper arm, forearm, fist, open hand, thigh, shin, foot),
 * instead of about 190 frames. Each box shows the joint it turns about (green),
 * where the bone ends (red), and a plain body part faded in for size. The far
 * arm and leg reuse the near ones, drawn a shade darker.
 *
 * The artist draws on a layer over the guide, the fighter facing right, hides
 * the guide and exports their layer as a PNG of the same size with a
 * transparent background. `readPartsSheet` turns that into a design
 * (rig/parts.ts) that every rig move set can pose. Any colours, up to 50 after
 * reduction; any PNG type.
 */
import { readPng, toRgba, writePng } from "../art/png.ts";
import { quantize } from "../art/quantize.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { drawText } from "../fx/font.ts";
import { person } from "./kit.ts";
import { designPalette, IMAGE_COLORS, IMAGE_FIRST, type Design, type Part, type PartImage } from "./parts.ts";
import { drawPart } from "./render.ts";
import { DEFAULT_PROPORTIONS, dir, type BoneId, type PlacedBone } from "./skeleton.ts";

export type SheetPart = "head" | "torso" | "upperArm" | "foreArm" | "fist" | "openHand" | "thigh" | "shin" | "foot";

interface Slot {
  part: SheetPart;
  label: string;
  /** Where the joint sits in the box (fighter pixels), and which way the bone points in the picture. */
  pivot: { x: number; y: number };
  points: "down" | "up" | "right";
  length: number;
  required: boolean;
}

/** Each box, in fighter pixels; the guide is drawn `scale` times bigger so it's comfortable to draw on. */
export const BOX = { width: 100, height: 120 } as const;
const COLUMNS = 3;
const P = DEFAULT_PROPORTIONS;
export const SLOTS: readonly Slot[] = [
  { part: "head", label: "HEAD", pivot: { x: 46, y: 96 }, points: "up", length: P.head, required: true },
  { part: "torso", label: "TORSO", pivot: { x: 46, y: 106 }, points: "up", length: P.torso, required: true },
  { part: "upperArm", label: "UPPER ARM", pivot: { x: 50, y: 22 }, points: "down", length: P.upperArm, required: true },
  { part: "foreArm", label: "FOREARM", pivot: { x: 50, y: 22 }, points: "down", length: P.foreArm, required: true },
  { part: "fist", label: "FIST", pivot: { x: 50, y: 34 }, points: "down", length: P.hand, required: true },
  { part: "openHand", label: "OPEN HAND", pivot: { x: 50, y: 34 }, points: "down", length: P.hand, required: false },
  { part: "thigh", label: "THIGH", pivot: { x: 50, y: 22 }, points: "down", length: P.thigh, required: true },
  { part: "shin", label: "SHIN", pivot: { x: 50, y: 22 }, points: "down", length: P.shin, required: true },
  { part: "foot", label: "FOOT", pivot: { x: 32, y: 70 }, points: "right", length: P.foot, required: true },
];

const AXES = {
  down: { u: { x: 0, y: 1 }, v: { x: 1, y: 0 }, angle: 0 },
  up: { u: { x: 0, y: -1 }, v: { x: 1, y: 0 }, angle: 180 },
  right: { u: { x: 1, y: 0 }, v: { x: 0, y: -1 }, angle: 90 },
} as const;

export function guideSize(scale: number): { width: number; height: number } {
  return { width: BOX.width * COLUMNS * scale, height: BOX.height * Math.ceil(SLOTS.length / COLUMNS) * scale };
}

const boxOrigin = (i: number) => ({ x: (i % COLUMNS) * BOX.width, y: Math.floor(i / COLUMNS) * BOX.height });

/** The bone a slot's part hangs on, in the guide (fighter pixels), for drawing the faded example. */
function guideBone(slot: Slot, i: number): PlacedBone {
  const o = boxOrigin(i);
  const at = { x: o.x + slot.pivot.x, y: o.y + slot.pivot.y };
  const angle = AXES[slot.points].angle;
  const d = dir(angle);
  const id: BoneId = slot.part === "head" ? "head" : slot.part === "torso" ? "torso" : slot.part === "fist" || slot.part === "openHand" ? "handF" : `${slot.part}F`;
  return { id, at, angle, length: slot.length, end: { x: at.x + d.x * slot.length, y: at.y + d.y * slot.length } };
}

/** A plain person, faded into the guide's boxes for size. */
const EXAMPLE: Design = { materials: { skin: "#b8b8b8", hair: "#909090", eye: "#606060", cloth: "#a0a0a0" }, ...person({ top: "cloth", legs: "cloth", sleeves: "cloth", shoes: "cloth", hair: "crop" }) };

/** The guide sheet as a PNG, `scale` guide pixels per fighter pixel (default 4). */
export function partsGuidePng(scale = 4): Buffer {
  const fighter = guideSize(1);
  const ex: IndexedImage = { width: fighter.width, height: fighter.height, pixels: new Uint8Array(fighter.width * fighter.height) };
  SLOTS.forEach((slot, i) => {
    const bone = guideBone(slot, i);
    const part = EXAMPLE.parts[bone.id]!;
    drawPart(ex, EXAMPLE, bone, slot.part === "openHand" ? part.open! : part.shapes);
  });
  const pal = designPalette(EXAMPLE);
  const { width: W, height: H } = guideSize(scale);
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = ex.pixels[Math.floor(y / scale) * ex.width + Math.floor(x / scale)]!;
      const grey = v ? Math.round(255 - (255 - pal[v * 3]!) * 0.35) : 255;
      rgba.set([grey, grey, grey, 255], (y * W + x) * 4);
    }
  }
  const put = (x: number, y: number, c: readonly number[]) => {
    if (x >= 0 && y >= 0 && x < W && y < H) rgba.set([...c, 255], (Math.round(y) * W + Math.round(x)) * 4);
  };
  const dot = (cx: number, cy: number, r: number, c: readonly number[]) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) put(cx + x, cy + y, c);
  };
  SLOTS.forEach((slot, i) => {
    const o = boxOrigin(i);
    const x0 = o.x * scale, y0 = o.y * scale, x1 = x0 + BOX.width * scale - 1, y1 = y0 + BOX.height * scale - 1;
    for (let x = x0; x <= x1; x++) { put(x, y0, [150, 170, 210]); put(x, y1, [150, 170, 210]); }
    for (let y = y0; y <= y1; y++) { put(x0, y, [150, 170, 210]); put(x1, y, [150, 170, 210]); }
    const b = guideBone(slot, i);
    for (let t = 0; t <= 1; t += 1 / (slot.length * scale)) put((b.at.x + (b.end.x - b.at.x) * t) * scale, (b.at.y + (b.end.y - b.at.y) * t) * scale, [120, 120, 140]);
    dot(b.at.x * scale, b.at.y * scale, Math.max(3, scale + 1), [40, 190, 90]);
    dot(b.end.x * scale, b.end.y * scale, Math.max(2, scale), [220, 70, 70]);
    // The label, and an arrow showing which way the fighter faces.
    const text: IndexedImage = { width: BOX.width * scale, height: 14 * scale, pixels: new Uint8Array(BOX.width * scale * 14 * scale) };
    drawText(text, slot.label + (slot.required ? "" : " - OPTIONAL"), 6, 6, 1, Math.max(1, Math.floor(scale / 2)));
    drawText(text, "FACES RIGHT", BOX.width * scale - 6 - 11 * 6 * Math.max(1, Math.floor(scale / 3)), 6, 2, Math.max(1, Math.floor(scale / 3)));
    text.pixels.forEach((v, k) => {
      if (v) put(x0 + (k % text.width), y0 + Math.floor(k / text.width), v === 1 ? [60, 70, 110] : [150, 150, 170]);
    });
  });
  return writePng({ width: W, height: H, colorType: 6, pixels: rgba });
}

export interface PartsSheetResult {
  design: Design;
  /** In words for the artist: a box left empty, a drawing cut off at its box's edge, the wrong size. */
  problems: string[];
  /** Smaller things worth knowing (colours reduced, the open hand reusing the fist). */
  notes: string[];
}

/**
 * A drawn parts sheet (PNG bytes, the guide's size at any whole scale) as a
 * design. Throws only if it can't be read at all; everything else is listed.
 */
export function readPartsSheet(bytes: Uint8Array): PartsSheetResult {
  const png = readPng(bytes);
  const rgba = toRgba(png);
  const base = guideSize(1);
  const scale = png.width / base.width;
  const problems: string[] = [];
  const notes: string[] = [];
  if (!Number.isInteger(scale) || scale < 1 || png.height !== base.height * scale) {
    throw new Error(`the parts sheet is ${png.width}x${png.height}; it should be the guide's size, ${base.width * 4}x${base.height * 4} (or ${base.width}x${base.height} times any whole number)`);
  }
  // Each fighter pixel from a scale x scale block: drawn if at least half of it is, in the average of its drawn colours.
  const cells = new Uint32Array(base.width * base.height).fill(0xffffffff);
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let y = 0; y < base.height; y++) {
    for (let x = 0; x < base.width; x++) {
      let n = 0, r = 0, g = 0, b = 0;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const o = ((y * scale + dy) * png.width + x * scale + dx) * 4;
        if (rgba[o + 3]! >= 128) { n++; r += rgba[o]!; g += rgba[o + 1]!; b += rgba[o + 2]!; }
      }
      if (n * 2 < scale * scale) continue;
      opaque++;
      const c = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
      cells[y * base.width + x] = c;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  if (opaque > base.width * base.height * 0.9) problems.push("the sheet has no transparent background: hide the guide and export only your drawing, as a PNG with transparency");
  const { palette, index } = quantize(counts, IMAGE_COLORS);
  if (counts.size > IMAGE_COLORS) notes.push(`${counts.size} colours reduced to ${IMAGE_COLORS}`);
  const parts: Partial<Record<SheetPart, PartImage>> = {};
  SLOTS.forEach((slot, i) => {
    const o = boxOrigin(i);
    const pixels = new Uint8Array(BOX.width * BOX.height);
    let any = 0, edge = 0;
    for (let y = 0; y < BOX.height; y++) {
      for (let x = 0; x < BOX.width; x++) {
        const c = cells[(o.y + y) * base.width + o.x + x]!;
        if (c === 0xffffffff) continue;
        pixels[y * BOX.width + x] = IMAGE_FIRST + index.get(c)!;
        any++;
        if (x === 0 || y === 0 || x === BOX.width - 1 || y === BOX.height - 1) edge++;
      }
    }
    if (!any) {
      if (slot.required) problems.push(`the ${slot.label.toLowerCase()} box is empty`);
      return;
    }
    if (edge > 2) problems.push(`the ${slot.label.toLowerCase()} touches its box's edge, so it may be cut off: keep each part inside its box`);
    const axes = AXES[slot.points];
    parts[slot.part] = { width: BOX.width, height: BOX.height, pixels, pivot: slot.pivot, u: axes.u, v: axes.v };
  });
  if (!parts.openHand && parts.fist) notes.push("no open hand drawn: the fist is used for it");
  const shapeless = (image?: PartImage, openImage?: PartImage): Part => ({ shapes: [], ...(image ? { image } : {}), ...(openImage ? { openImage } : {}) });
  const design: Design = {
    materials: {},
    imageColors: palette.map((c) => "#" + c.toString(16).padStart(6, "0")),
    parts: {
      head: shapeless(parts.head),
      torso: shapeless(parts.torso),
      ...Object.fromEntries((["F", "B"] as const).flatMap((s) => [
        [`upperArm${s}`, shapeless(parts.upperArm)],
        [`foreArm${s}`, shapeless(parts.foreArm)],
        [`hand${s}`, shapeless(parts.fist, parts.openHand ?? parts.fist)],
        [`thigh${s}`, shapeless(parts.thigh)],
        [`shin${s}`, shapeless(parts.shin)],
        [`foot${s}`, shapeless(parts.foot)],
      ])),
    },
  };
  // Parts left empty aren't drawn at all.
  for (const [bone, part] of Object.entries(design.parts)) if (!part!.image) delete (design.parts as Record<string, Part>)[bone];
  return { design, problems, notes };
}

/**
 * A design's parts drawn on the guide in their own colours, as an artist would hand it in (RGBA PNG at `scale`): for
 * trying the import end to end, and as a starting point to draw over.
 */
export function partsSheetFromDesign(design: Design, scale = 4): Buffer {
  const fighter = guideSize(1);
  const img: IndexedImage = { width: fighter.width, height: fighter.height, pixels: new Uint8Array(fighter.width * fighter.height) };
  SLOTS.forEach((slot, i) => {
    const bone = guideBone(slot, i);
    const part = design.parts[bone.id];
    if (!part) return;
    drawPart(img, design, bone, slot.part === "openHand" ? part.open ?? part.shapes : part.shapes);
  });
  const pal = designPalette(design);
  const { width: W, height: H } = guideSize(scale);
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = img.pixels[Math.floor(y / scale) * img.width + Math.floor(x / scale)]!;
    if (v) rgba.set([pal[v * 3]!, pal[v * 3 + 1]!, pal[v * 3 + 2]!, 255], (y * W + x) * 4);
  }
  return writePng({ width: W, height: H, colorType: 6, pixels: rgba });
}
