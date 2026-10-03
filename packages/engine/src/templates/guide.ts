/**
 * Community fighters drawn on a template (docs/PHASE3.md "Fighters from their
 * own art"). The guide sheet shows every frame a template uses, one per box,
 * on one page; an artist draws their fighter over it on a transparent layer
 * and sends that layer as the sprite sheet. Reading it back gives the template
 * builder a frame for every cell it uses, so the fighter keeps the template's
 * moves, timing and numbers, with collision boxes worked out from the new art.
 */
import type { SffPalette } from "../art/sff.ts";
import { writePng, type PngImage } from "../art/png.ts";
import { bounds, type CellSource, type IndexedImage } from "../art/sheet.ts";
import { allAnims, buildTemplateArt, cardImage, FACE_SIZES } from "./art.ts";
import { withHash, type TemplateFiles } from "./build.ts";
import { commandsFile, constantsFile, defFile, statesFile } from "./cns.ts";
import { fighterNumbers } from "./limits.ts";
import { DIGITS } from "./preview.ts";
import { PROJECTILE_COLORS, PROJECTILE_SLOTS } from "./projectile.ts";
import { measureReach } from "./reach.ts";
import { cellList, type TemplateSpec } from "./spec.ts";

export interface GuideBox {
  width: number;
  height: number;
  /** The ground point inside the box. */
  axis: { x: number; y: number };
}

/** One box of the guide for the Universal Prototype templates: room for every frame of every template, and some to spare. */
export const GUIDE_BOX: GuideBox = { width: 240, height: 232, axis: { x: 108, y: 212 } };
export const GUIDE_COLUMNS = 17;
/** Colours a drawing may use: palette indices 1-239 (0 is transparent; 240-245 draw the projectile). */
export const MAX_ART_COLORS = 239;

export interface GuideLayout {
  templateId: string;
  /** Sheet cells of the template, one per box: left to right, then top to bottom. */
  cells: number[];
  columns: number;
  rows: number;
  box: GuideBox;
  /** The whole page in pixels. */
  width: number;
  height: number;
}

/** Every cell a template's character uses: its animations (throws included), the standard get-hit sprites and the portrait. */
export function guideCells(spec: TemplateSpec): number[] {
  const set = new Set<number>();
  for (const a of allAnims(spec)) for (const c of cellList(a.cells)) set.add(c);
  for (const e of Object.values(spec.art.standardSprites)) set.add(typeof e === "number" ? e : e.cell);
  set.add(spec.portrait.cell);
  return [...set].sort((a, b) => a - b);
}

/** Where a box's top-left corner sits in a template cell (both share the ground point), or null if the box doesn't fit in a cell. */
function offsetIn(spec: TemplateSpec, box: GuideBox): { dx: number; dy: number } | null {
  const dx = spec.art.axis.x - box.axis.x;
  const dy = spec.art.axis.y - box.axis.y;
  return dx < 0 || dy < 0 || dx + box.width > spec.art.cellWidth || dy + box.height > spec.art.cellHeight ? null : { dx, dy };
}

export function guideLayout(spec: TemplateSpec): GuideLayout {
  const cells = guideCells(spec);
  // The standard box, or a whole cell for art whose cells are smaller (tests).
  const box = offsetIn(spec, GUIDE_BOX) ? GUIDE_BOX : { width: spec.art.cellWidth, height: spec.art.cellHeight, axis: spec.art.axis };
  const columns = Math.max(1, Math.min(GUIDE_COLUMNS, cells.length));
  const rows = Math.ceil(cells.length / columns);
  return { templateId: spec.id, cells, columns, rows, box, width: columns * box.width, height: rows * box.height };
}

function offset(spec: TemplateSpec, layout: GuideLayout): { dx: number; dy: number } {
  const o = offsetIn(spec, layout.box);
  if (!o) throw new Error(`${spec.id}: its cells are too small for the guide's boxes`);
  return o;
}

/**
 * The guide sheet as an RGBA PNG: each box with the template's frame (faded),
 * the ground line, the ground point and the box's number. Artists draw on a
 * layer above it and send only their layer, at the same size.
 */
export function guideImage(spec: TemplateSpec, source: CellSource, layout: GuideLayout): Buffer {
  const { dx, dy } = offset(spec, layout);
  const GUIDE_BOX = layout.box;
  const W = layout.width, H = layout.height;
  const out = new Uint8Array(W * H * 4);
  const put = (x: number, y: number, r: number, g: number, b: number, a: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    out.set([r, g, b, a], (y * W + x) * 4);
  };
  layout.cells.forEach((c, n) => {
    const ox = (n % layout.columns) * GUIDE_BOX.width;
    const oy = Math.floor(n / layout.columns) * GUIDE_BOX.height;
    const img = source.cell(c);
    for (let y = 0; y < GUIDE_BOX.height; y++) {
      for (let x = 0; x < GUIDE_BOX.width; x++) {
        const v = img.pixels[(y + dy) * img.width + x + dx]!;
        if (v) put(ox + x, oy + y, source.palette[v * 3]!, source.palette[v * 3 + 1]!, source.palette[v * 3 + 2]!, 110);
      }
    }
    for (let x = 0; x < GUIDE_BOX.width; x++) {
      put(ox + x, oy, 190, 190, 190, 255);
      put(ox + x, oy + GUIDE_BOX.axis.y, 120, 170, 230, 255);
    }
    for (let y = 0; y < GUIDE_BOX.height; y++) put(ox, oy + y, 190, 190, 190, 255);
    for (let d = -5; d <= 5; d++) {
      put(ox + GUIDE_BOX.axis.x + d, oy + GUIDE_BOX.axis.y, 0, 160, 0, 255);
      put(ox + GUIDE_BOX.axis.x, oy + GUIDE_BOX.axis.y + d, 0, 160, 0, 255);
    }
    [...String(n + 1)].forEach((digit, i) => {
      const glyph = DIGITS[digit]!;
      for (let j = 0; j < 15; j++) {
        if (glyph[j] !== "1") continue;
        for (let s = 0; s < 4; s++) put(ox + 4 + i * 8 + (j % 3) * 2 + (s % 2), oy + 4 + Math.floor(j / 3) * 2 + (s >> 1), 90, 90, 90, 255);
      }
    });
  });
  return writePng({ width: W, height: H, colorType: 6, pixels: out });
}

/**
 * A sheet "drawn" on the guide by tracing the template's own frames, with
 * `recolor` applied to each colour: for trying the pipeline end to end, and in
 * tests, before any artist has drawn one.
 */
export function sampleArt(spec: TemplateSpec, source: CellSource, layout: GuideLayout, recolor: (rgb: [number, number, number]) => [number, number, number] = (c) => c): Buffer {
  const { dx, dy } = offset(spec, layout);
  const box = layout.box;
  const out = new Uint8Array(layout.width * layout.height * 4);
  layout.cells.forEach((c, n) => {
    const ox = (n % layout.columns) * box.width;
    const oy = Math.floor(n / layout.columns) * box.height;
    const img = source.cell(c);
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        const v = img.pixels[(y + dy) * img.width + x + dx]!;
        if (!v) continue;
        const rgb = recolor([source.palette[v * 3]!, source.palette[v * 3 + 1]!, source.palette[v * 3 + 2]!]);
        out.set([...rgb, 255], ((oy + y) * layout.width + ox + x) * 4);
      }
    }
  });
  return writePng({ width: layout.width, height: layout.height, colorType: 6, pixels: out });
}

/** What's wrong with a drawn sheet, in words for the artist. */
export class GuideError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
  }
}

/** Any PNG as RGBA samples. */
function toRgba(png: PngImage): Uint8Array {
  const n = png.width * png.height;
  const p = png.pixels;
  if (png.colorType === 6) return p;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    switch (png.colorType) {
      case 0:
        out.set([p[i]!, p[i]!, p[i]!, 255], i * 4);
        break;
      case 2:
        out.set([p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!, 255], i * 4);
        break;
      case 3: {
        const v = p[i]!;
        out.set([png.palette?.[v * 3] ?? 0, png.palette?.[v * 3 + 1] ?? 0, png.palette?.[v * 3 + 2] ?? 0, png.alpha?.[v] ?? 255], i * 4);
        break;
      }
      case 4:
        out.set([p[i * 2]!, p[i * 2]!, p[i * 2]!, p[i * 2 + 1]!], i * 4);
        break;
    }
  }
  return out;
}

/** RGBA samples of a PNG that can have transparency; null when it can't (grey or RGB, or a palette with none). */
function rgbaOf(png: PngImage): Uint8Array | null {
  if (png.colorType === 0 || png.colorType === 2) return null;
  if (png.colorType === 3 && (!png.palette || !png.alpha || ![...png.alpha].some((a) => a < 128))) return null;
  return toRgba(png);
}

const rgbAt = (rgba: Uint8Array, i: number) => (rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]!;
const rgbOf = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/**
 * At most `max` colours for the drawing (median cut, weighted by how often
 * each colour is used): the palette, and each colour's palette position.
 */
export function quantize(counts: ReadonlyMap<number, number>, max: number): { palette: number[]; index: Map<number, number> } {
  const colors = [...counts.keys()];
  if (colors.length <= max) {
    const palette = colors.sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
    return { palette, index: new Map(palette.map((c, i) => [c, i])) };
  }
  const ch = (c: number, k: number) => (c >> (16 - 8 * k)) & 255;
  type Box = { colors: number[]; spread: number; channel: number };
  const measure = (list: number[]): Box => {
    let best = 0, channel = 0;
    for (let k = 0; k < 3; k++) {
      let lo = 255, hi = 0;
      for (const c of list) {
        const v = ch(c, k);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) [best, channel] = [hi - lo, k];
    }
    return { colors: list, spread: best, channel };
  };
  const boxes: Box[] = [measure(colors)];
  while (boxes.length < max) {
    let at = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i]!.colors.length > 1 && (at < 0 || boxes[i]!.spread > boxes[at]!.spread)) at = i;
    if (at < 0 || boxes[at]!.spread === 0) break;
    const box = boxes[at]!;
    const sorted = [...box.colors].sort((a, b) => ch(a, box.channel) - ch(b, box.channel));
    const total = sorted.reduce((s, c) => s + counts.get(c)!, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += counts.get(sorted[i]!)!;
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(at, 1, measure(sorted.slice(0, cut)), measure(sorted.slice(cut)));
  }
  const palette: number[] = [];
  const index = new Map<number, number>();
  for (const box of boxes) {
    let r = 0, g = 0, b = 0, w = 0;
    for (const c of box.colors) {
      const k = counts.get(c)!;
      r += ch(c, 0) * k;
      g += ch(c, 1) * k;
      b += ch(c, 2) * k;
      w += k;
    }
    for (const c of box.colors) index.set(c, palette.length);
    palette.push((Math.round(r / w) << 16) | (Math.round(g / w) << 8) | Math.round(b / w));
  }
  return { palette, index };
}

/** How many problems to list before summing up the rest. */
const MAX_LISTED = 8;

/** A drawn sheet as read: its frames, and each drawn colour's palette position, for reading alternate colour sheets against it. */
interface Drawing {
  art: CellSource;
  rgba: Uint8Array;
  /** The drawing's colours (RGB), palette index 1 onwards. */
  colors: number[];
  /** Drawn colour → position in `colors`. */
  index: Map<number, number>;
}

/**
 * Read a drawn sheet back into frames for the template builder. Throws a
 * GuideError listing what to fix: the wrong size, no transparent background,
 * an empty box, or a drawing cut off at the edge of its box.
 */
export function artFromGuide(spec: TemplateSpec, page: PngImage, layout: GuideLayout = guideLayout(spec)): CellSource {
  return readDrawing(spec, page, layout).art;
}

function readDrawing(spec: TemplateSpec, page: PngImage, layout: GuideLayout): Drawing {
  if (page.width !== layout.width || page.height !== layout.height) {
    throw new GuideError([`the sprite sheet is ${page.width}x${page.height} pixels, but the ${spec.name} guide is ${layout.width}x${layout.height}: draw on the guide and keep its size`]);
  }
  const rgba = rgbaOf(page);
  if (!rgba) throw new GuideError(["the sprite sheet has no transparent background: send only the layer you drew, with everything else transparent"]);
  const W = page.width;
  const GUIDE_BOX = layout.box;
  const counts = new Map<number, number>();
  for (let i = 0; i < W * page.height; i++) {
    if (rgba[i * 4 + 3]! < 128) continue;
    const c = rgbAt(rgba, i);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const { palette, index } = quantize(counts, MAX_ART_COLORS);
  const pal = new Uint8Array(768);
  palette.forEach((c, i) => pal.set(rgbOf(c), (i + 1) * 3));

  const problems: string[] = [];
  const empty: number[] = [];
  const cut: number[] = [];
  const boxes = layout.cells.map((_, n) => {
    const ox = (n % layout.columns) * GUIDE_BOX.width;
    const oy = Math.floor(n / layout.columns) * GUIDE_BOX.height;
    const pixels = new Uint8Array(GUIDE_BOX.width * GUIDE_BOX.height);
    let edge = 0;
    for (let y = 0; y < GUIDE_BOX.height; y++) {
      for (let x = 0; x < GUIDE_BOX.width; x++) {
        const i = (oy + y) * W + ox + x;
        if (rgba[i * 4 + 3]! < 128) continue;
        pixels[y * GUIDE_BOX.width + x] = index.get(rgbAt(rgba, i))! + 1;
        if (x === 0 || y === 0 || x === GUIDE_BOX.width - 1 || y === GUIDE_BOX.height - 1) edge++;
      }
    }
    const img: IndexedImage = { width: GUIDE_BOX.width, height: GUIDE_BOX.height, pixels };
    if (!bounds(img)) empty.push(n + 1);
    else if (edge > 0) cut.push(n + 1);
    return img;
  });
  const list = (boxes: number[]) => boxes.slice(0, MAX_LISTED).join(", ") + (boxes.length > MAX_LISTED ? ` and ${boxes.length - MAX_LISTED} more` : "");
  if (empty.length) problems.push(`${empty.length === 1 ? "box" : "boxes"} ${list(empty)} ${empty.length === 1 ? "is" : "are"} empty: every box needs its frame`);
  if (cut.length) problems.push(`the drawing touches the edge of ${cut.length === 1 ? "box" : "boxes"} ${list(cut)}, so it would be cut off: keep each frame inside its box`);
  if (problems.length) throw new GuideError(problems);

  const { dx, dy } = offset(spec, layout);
  const boxOf = new Map(layout.cells.map((c, n) => [c, n]));
  const cache = new Map<number, IndexedImage>();
  const art: CellSource = {
    palette: pal,
    cellWidth: spec.art.cellWidth,
    cellHeight: spec.art.cellHeight,
    cell(c) {
      let img = cache.get(c);
      if (img) return img;
      const n = boxOf.get(c);
      if (n === undefined) throw new Error(`cell ${c} isn't on the ${spec.name} guide`);
      const box = boxes[n]!;
      const pixels = new Uint8Array(spec.art.cellWidth * spec.art.cellHeight);
      for (let y = 0; y < GUIDE_BOX.height; y++) pixels.set(box.pixels.subarray(y * GUIDE_BOX.width, (y + 1) * GUIDE_BOX.width), (y + dy) * spec.art.cellWidth + dx);
      img = { width: spec.art.cellWidth, height: spec.art.cellHeight, pixels };
      cache.set(c, img);
      return img;
    },
  };
  return { art, rgba, colors: palette, index };
}

/** How much of a drawing may differ between the sprite sheet and an alternate colour sheet (stray pixels), as a share of the drawn pixels. */
const ALTERNATE_SHAPE_TOLERANCE = 0.02;
/** How much of an alternate colour sheet has to follow one colour swap per sprite sheet colour. */
const ALTERNATE_SWAP_SHARE = 0.9;

/**
 * An alternate colour sheet: a copy of the sprite sheet with its colours
 * changed. Each of the drawing's colours becomes the colour most often drawn
 * over it, which gives the fighter another palette (an outfit). Throws a
 * GuideError when it isn't the same drawing, or when it can't be done with
 * one colour swap per colour.
 */
function alternateColors(base: Drawing, page: PngImage, layout: GuideLayout): Uint8Array {
  if (page.width !== layout.width || page.height !== layout.height) {
    throw new GuideError([`it is ${page.width}x${page.height} pixels, but the sprite sheet is ${layout.width}x${layout.height}: recolour a copy of the sprite sheet and keep its size`]);
  }
  const rgba = rgbaOf(page);
  if (!rgba) throw new GuideError(["it has no transparent background: recolour a copy of the sprite sheet, keeping everything around the drawing transparent"]);
  const tallies = base.colors.map(() => new Map<number, number>());
  let drawn = 0, moved = 0;
  for (let i = 0; i < page.width * page.height; i++) {
    const inBase = base.rgba[i * 4 + 3]! >= 128, inAlt = rgba[i * 4 + 3]! >= 128;
    if (inBase) drawn++;
    if (inBase !== inAlt) moved++;
    if (!inBase || !inAlt) continue;
    const t = tallies[base.index.get(rgbAt(base.rgba, i))!]!;
    const c = rgbAt(rgba, i);
    t.set(c, (t.get(c) ?? 0) + 1);
  }
  if (moved > drawn * ALTERNATE_SHAPE_TOLERANCE) {
    throw new GuideError([`it isn't the same drawing as the sprite sheet (${Math.round((moved / Math.max(1, drawn)) * 100)}% of the drawing is in different places): only change the colours of a copy of the sprite sheet`]);
  }
  const near = (a: number, b: number) => rgbOf(a).every((v, k) => Math.abs(v - rgbOf(b)[k]!) <= 40);
  const pal = new Uint8Array(768);
  let swapped = 0, total = 0;
  tallies.forEach((t, k) => {
    let best = base.colors[k]!, most = 0;
    for (const [c, n] of t) if (n > most || (n === most && c < best)) [best, most] = [c, n];
    pal.set(rgbOf(best), (k + 1) * 3);
    for (const [c, n] of t) {
      total += n;
      if (near(c, best)) swapped += n;
    }
  });
  if (total > 0 && swapped < total * ALTERNATE_SWAP_SHARE) {
    throw new GuideError(["parts that are one colour on the sprite sheet are different colours here: an alternate colour sheet can only swap each colour for another, so keep parts that share a colour on the sprite sheet the same colour"]);
  }
  return pal;
}

/** Colours a portrait may use: fewer than the fighter's 256, so the engine never mistakes its palette for one of the fighter's colours. */
export const MAX_PORTRAIT_COLORS = 254;

export interface PortraitArt {
  small: IndexedImage;
  large: IndexedImage;
  /** Its own palette: index 0 transparent, at most MAX_PORTRAIT_COLORS colours after it. */
  palette: Uint8Array;
}

/**
 * A submitted portrait as the fighter's lifebar faces: the drawn part
 * (transparent margins trimmed), cut square (from the top of a tall picture,
 * the middle of a wide one), shrunk with averaging, in its own colours.
 */
export function portraitArt(page: PngImage): PortraitArt {
  const rgba = toRgba(page);
  const W = page.width;
  let x0 = W, y0 = page.height, x1 = 0, y1 = 0;
  for (let y = 0; y < page.height; y++) {
    for (let x = 0; x < W; x++) {
      if (rgba[(y * W + x) * 4 + 3]! < 128) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x >= x1) x1 = x + 1;
      if (y >= y1) y1 = y + 1;
    }
  }
  if (x1 <= x0) throw new GuideError(["there's nothing on it: it's all transparent"]);
  const side = Math.min(x1 - x0, y1 - y0);
  const left = x0 + Math.floor((x1 - x0 - side) / 2);
  const top = y0;
  // Each face pixel: the average of the picture's pixels under it (colours weighted by how opaque they are).
  const shrink = (size: number) => {
    const out = new Uint8Array(size * size * 4);
    for (let ty = 0; ty < size; ty++) {
      const sy0 = top + Math.floor((ty * side) / size), sy1 = Math.max(sy0 + 1, top + Math.floor(((ty + 1) * side) / size));
      for (let tx = 0; tx < size; tx++) {
        const sx0 = left + Math.floor((tx * side) / size), sx1 = Math.max(sx0 + 1, left + Math.floor(((tx + 1) * side) / size));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = sy0; y < sy1; y++) {
          for (let x = sx0; x < sx1; x++) {
            const o = (y * W + x) * 4, al = rgba[o + 3]!;
            r += rgba[o]! * al;
            g += rgba[o + 1]! * al;
            b += rgba[o + 2]! * al;
            a += al;
            n++;
          }
        }
        if (a / n >= 128) out.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), 255], (ty * size + tx) * 4);
      }
    }
    return out;
  };
  const faces = { small: shrink(FACE_SIZES.small), large: shrink(FACE_SIZES.large) };
  const counts = new Map<number, number>();
  for (const f of [faces.small, faces.large]) {
    for (let i = 0; i < f.length / 4; i++) if (f[i * 4 + 3]) counts.set(rgbAt(f, i), (counts.get(rgbAt(f, i)) ?? 0) + 1);
  }
  const { palette, index } = quantize(counts, MAX_PORTRAIT_COLORS);
  const indexed = (f: Uint8Array, size: number): IndexedImage => {
    const pixels = new Uint8Array(size * size);
    for (let i = 0; i < size * size; i++) if (f[i * 4 + 3]) pixels[i] = index.get(rgbAt(f, i))! + 1;
    return { width: size, height: size, pixels };
  };
  const pal = new Uint8Array((palette.length + 1) * 3);
  palette.forEach((c, i) => pal.set(rgbOf(c), (i + 1) * 3));
  return { small: indexed(faces.small, FACE_SIZES.small), large: indexed(faces.large, FACE_SIZES.large), palette: pal };
}

/** Printable ASCII without quotes or semicolons (a .def comment or a quoted value can't be broken out of), at most 60 characters. */
export function engineText(s: string): string {
  return s.normalize("NFKD").replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "").replace(/["';\\]/g, "").replace(/ +/g, " ").trim().slice(0, 60);
}

/** A community fighter: who it is, for the character files. `id` is ours (gi-...), never typed by a player. */
export interface CommunityIdentity {
  id: string;
  name: string;
  /** Who made the art, for the character's credits. */
  credit: string;
}

/** A palette of the drawing's colours (or an alternate's), plus the template's projectile colours in their slots, as the fighter's colour `number`. */
function fighterPalette(colors: Uint8Array, number: number): SffPalette {
  const out = colors.slice();
  PROJECTILE_SLOTS.forEach((slot, i) => {
    const hex = PROJECTILE_COLORS[i]!;
    out.set([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)), slot * 3);
  });
  return { group: 1, number, colors: out };
}

/** The other images of a community fighter. */
export interface CommunityImages {
  /** Its portrait, for the lifebar faces (without one they're cut from the fighter's stance). */
  portrait?: PngImage;
  /** Alternate colour sheets: copies of the sprite sheet in other colours, one more palette (outfit) each. */
  alternates?: readonly PngImage[];
}

/** Run `read`, labelling its problems with the image they're in. */
function labelled<T>(label: string, read: () => T): { value?: T; problems: string[] } {
  try {
    return { value: read(), problems: [] };
  } catch (e) {
    if (e instanceof GuideError) return { problems: e.problems.map((p) => `${label}: ${p}`) };
    throw e;
  }
}

/**
 * Every file of a community fighter drawn on `spec`'s guide: the template's
 * code with the new art, collision boxes and reach from the new pixels, its
 * portrait as the lifebar faces and an extra palette per alternate colour
 * sheet. Throws a GuideError listing what to fix, each problem starting with
 * the image it's in ("its sprite sheet", "its portrait", "its alternate colour
 * sheet 2").
 */
export function communityFiles(spec: TemplateSpec, page: PngImage, who: CommunityIdentity, images: CommunityImages = {}): TemplateFiles & { reach: Map<number, number> } {
  if (!/^gi-[a-z0-9-]+$/.test(who.id)) throw new Error(`not a Greed Island character id: ${who.id}`);
  const layout = guideLayout(spec);
  const SHEET = "its sprite sheet";
  const portrait = images.portrait ? labelled("its portrait", () => portraitArt(images.portrait!)) : { problems: [] };
  const sheet = labelled(SHEET, () => readDrawing(spec, page, layout));
  if (!sheet.value) throw new GuideError([...sheet.problems, ...portrait.problems]);
  const drawing = sheet.value;
  const alternates = (images.alternates ?? []).map((alt, i) => labelled(`its alternate colour sheet ${i + 1}`, () => alternateColors(drawing, alt, layout)));
  const problems = [...portrait.problems, ...alternates.flatMap((a) => a.problems)];
  if (problems.length) throw new GuideError(problems);
  const art = drawing.art;
  const palettes = [fighterPalette(art.palette, 1), ...alternates.map((a, i) => fighterPalette(a.value!, i + 2))];
  let built;
  try {
    built = buildTemplateArt(spec, art, { palettes, ...(portrait.value ? { portrait: portrait.value } : {}) });
  } catch (e) {
    // The builder speaks in cells and actions; say which box of the guide it is, and what to draw.
    const message = (e as Error).message;
    const box = (cell: string) => layout.cells.indexOf(Number(cell)) + 1;
    const reach = /^action (\d+) frame \d+ \(cell (\d+)\): nothing reaches out/.exec(message);
    if (reach) {
      const move = [...spec.attacks, ...(spec.throws ?? [])].find((m) => m.state === Number(reach[1]))?.name ?? `move ${reach[1]}`;
      throw new GuideError([`${SHEET}: box ${box(reach[2]!)} (the ${move} as it hits): nothing reaches out past the move's first frame, so it can't hit anything; draw the strike reaching forward`]);
    }
    throw new GuideError([`${SHEET}: ${message.replace(/\(cell (\d+)\)|cell (\d+)/, (_m, a: string | undefined, b: string | undefined) => `(box ${box(a ?? b!)})`)}`]);
  }
  const reach = measureReach(spec, built.actions);
  // Names a player typed end up in the engine's files: keep them to plain, quote-free text.
  const named: TemplateSpec = { ...spec, id: who.id, name: engineText(who.name) || "Community Fighter", art: { ...spec.art, credit: engineText(who.credit) } };
  const files = withHash(built, [
    [`${who.id}.def`, Buffer.from(defFile(named, palettes.length, `a Greed Island community fighter on the ${spec.name} template (${spec.archetype}), built from its own art`), "latin1")],
    ["gi.cns", Buffer.from(constantsFile(named), "latin1")],
    ["gi-states.cns", Buffer.from(statesFile(named), "latin1")],
    ["gi.cmd", Buffer.from(commandsFile(named, reach), "latin1")],
    ["gi.air", Buffer.from(built.air, "latin1")],
    ["gi.sff", built.sff],
    ["card.png", cardImage(spec, art, palettes[0]!.colors)],
    // Its other outfits, for staff to look at.
    ...palettes.slice(1).map((p): [string, Buffer] => [`card-${p.number}.png`, cardImage(spec, art, p.colors)]),
    ["numbers.json", Buffer.from(JSON.stringify(fighterNumbers(named, reach), null, 2) + "\n")],
  ]);
  return { ...files, reach };
}
