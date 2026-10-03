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
import { allAnims, buildTemplateArt, cardImage } from "./art.ts";
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

/** RGBA samples of any PNG with transparency; null when it has none. */
function rgbaOf(png: PngImage): Uint8Array | null {
  const n = png.width * png.height;
  const out = new Uint8Array(n * 4);
  const p = png.pixels;
  switch (png.colorType) {
    case 6:
      return p;
    case 4:
      for (let i = 0; i < n; i++) out.set([p[i * 2]!, p[i * 2]!, p[i * 2]!, p[i * 2 + 1]!], i * 4);
      return out;
    case 3: {
      if (!png.palette || !png.alpha || ![...png.alpha].some((a) => a < 128)) return null;
      for (let i = 0; i < n; i++) {
        const v = p[i]!;
        out.set([png.palette[v * 3] ?? 0, png.palette[v * 3 + 1] ?? 0, png.palette[v * 3 + 2] ?? 0, png.alpha[v] ?? 255], i * 4);
      }
      return out;
    }
    default:
      return null;
  }
}

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

/**
 * Read a drawn sheet back into frames for the template builder. Throws a
 * GuideError listing what to fix: the wrong size, no transparent background,
 * an empty box, or a drawing cut off at the edge of its box.
 */
export function artFromGuide(spec: TemplateSpec, page: PngImage, layout: GuideLayout = guideLayout(spec)): CellSource {
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
    const c = (rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]!;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const { palette, index } = quantize(counts, MAX_ART_COLORS);
  const pal = new Uint8Array(768);
  palette.forEach((c, i) => pal.set([(c >> 16) & 255, (c >> 8) & 255, c & 255], (i + 1) * 3));

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
        pixels[y * GUIDE_BOX.width + x] = index.get((rgba[i * 4]! << 16) | (rgba[i * 4 + 1]! << 8) | rgba[i * 4 + 2]!)! + 1;
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
  return {
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

/** The drawing's palette, plus the template's projectile colours in their slots. */
function fighterPalette(art: CellSource): SffPalette {
  const colors = art.palette.slice();
  PROJECTILE_SLOTS.forEach((slot, i) => {
    const hex = PROJECTILE_COLORS[i]!;
    colors.set([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)), slot * 3);
  });
  return { group: 1, number: 1, colors };
}

/**
 * Every file of a community fighter drawn on `spec`'s guide: the template's
 * code with the new art, collision boxes and reach from the new pixels.
 * Throws a GuideError for problems with the drawing.
 */
export function communityFiles(spec: TemplateSpec, page: PngImage, who: CommunityIdentity): TemplateFiles & { reach: Map<number, number> } {
  if (!/^gi-[a-z0-9-]+$/.test(who.id)) throw new Error(`not a Greed Island character id: ${who.id}`);
  const art = artFromGuide(spec, page);
  const palette = fighterPalette(art);
  let built;
  try {
    built = buildTemplateArt(spec, art, { palettes: [palette] });
  } catch (e) {
    // The builder speaks in cells and actions; say which box of the guide it is, and what to draw.
    const layout = guideLayout(spec);
    const message = (e as Error).message;
    const box = (cell: string) => layout.cells.indexOf(Number(cell)) + 1;
    const reach = /^action (\d+) frame \d+ \(cell (\d+)\): nothing reaches out/.exec(message);
    if (reach) {
      const move = [...spec.attacks, ...(spec.throws ?? [])].find((m) => m.state === Number(reach[1]))?.name ?? `move ${reach[1]}`;
      throw new GuideError([`box ${box(reach[2]!)} (the ${move} as it hits): nothing reaches out past the move's first frame, so it can't hit anything; draw the strike reaching forward`]);
    }
    throw new GuideError([message.replace(/\(cell (\d+)\)|cell (\d+)/, (_m, a: string | undefined, b: string | undefined) => `(box ${box(a ?? b!)})`)]);
  }
  const reach = measureReach(spec, built.actions);
  // Names a player typed end up in the engine's files: keep them to plain, quote-free text.
  const named: TemplateSpec = { ...spec, id: who.id, name: engineText(who.name) || "Community Fighter", art: { ...spec.art, credit: engineText(who.credit) } };
  const files = withHash(built, [
    [`${who.id}.def`, Buffer.from(defFile(named, 1, `a Greed Island community fighter on the ${spec.name} template (${spec.archetype}), built from its own art`), "latin1")],
    ["gi.cns", Buffer.from(constantsFile(named), "latin1")],
    ["gi-states.cns", Buffer.from(statesFile(named), "latin1")],
    ["gi.cmd", Buffer.from(commandsFile(named, reach), "latin1")],
    ["gi.air", Buffer.from(built.air, "latin1")],
    ["gi.sff", built.sff],
    ["card.png", cardImage(spec, art, palette.colors)],
    ["numbers.json", Buffer.from(JSON.stringify(fighterNumbers(named, reach), null, 2) + "\n")],
  ]);
  return { ...files, reach };
}
