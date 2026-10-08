/**
 * Fighters from small pixel-art packs: one PNG strip per animation, square frames side by side (LuizMelo's CC0
 * packs and the like, art/SOURCES.md). Such packs have a handful of animations (idle, walk, run, an attack or two,
 * hurt, death), not the eighty a fighter plays, so every cell is a pose: one frame moved, turned and squashed
 * about its feet (or the middle of its body), mirrored, with effects drawn on top, the way Nyan Cat's cells are
 * made. Cells are drawn at the art's own size and then scaled up whole, so the effects come out in the same chunky
 * pixels as the art. The strips' colours are gathered into one palette (1 up); effects use their own slots.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Box } from "../art/air.ts";
import { readPng, toRgba } from "../art/png.ts";
import type { IndexedImage, Sheet } from "../art/sheet.ts";
import { drawText, textWidth } from "../fx/font.ts";
import type { ArtSource } from "./spec.ts";
import type { StandardSprite } from "./standard.ts";

export interface PackPose {
  /** The strip and its frame. */
  s: string;
  f?: number;
  /** Moved (art pixels; down is positive), turned (degrees, clockwise as it faces right), squashed, mirrored. */
  dx?: number;
  dy?: number;
  rot?: number;
  sx?: number;
  sy?: number;
  flip?: boolean;
  /** Turn and squash about the middle of the body instead of the feet. */
  mid?: boolean;
  fx?: readonly Effect[];
}

/** Where to draw an effect: the cell, its feet after the pose's move, and the body's size (from the first idle frame). */
export interface PackCanvas {
  img: IndexedImage;
  x: number;
  y: number;
  body: Body;
}
export type Effect = (c: PackCanvas) => void;

/** The body in the first idle frame, from the feet: how far it reaches forward and back, and how tall it is. */
export interface Body {
  front: number;
  back: number;
  height: number;
}

export interface PackArt {
  id: string;
  /**
   * Strip name → file (relative to the repo root): square frames side by side, unless `widths` says otherwise; or a
   * list of files, one frame each (packs published a file per frame).
   */
  strips: Readonly<Record<string, StripFiles>>;
  /** The art faces left: every frame is mirrored as it's read, so the fighter faces right like every other. */
  mirror?: boolean;
  /** Frame width of strips whose frames aren't square (strip name → pixels). */
  widths?: Readonly<Record<string, number>>;
  /** How many frames each strip has, as the moves were written for (checked when the sheet is made). */
  counts?: Readonly<Record<string, number>>;
  /**
   * Sword trails and the like drawn into the strips: these colours, and (with `onlyIn`) every colour found only in
   * those strips, take palette slots from SLASH_FIRST up, so hurtboxes leave them out (ArtSource.effects).
   */
  slash?: { colours?: readonly string[]; onlyIn?: readonly string[] };
  /** The strip whose first frame gives the feet and the body's size. */
  idle: string;
  /** That body, as measured: the moves' boxes are written from it, so the build refuses art that differs. */
  body?: Body;
  /** sha256 over the strips' own sha256 digests, in name order (`packHash`): the build refuses other files. */
  sha256: string;
  /** The cell at the art's own size, and where the feet go in it. */
  cell: { width: number; height: number; feet: { x: number; y: number } };
  /** How many times bigger each art pixel is drawn in the sheet. */
  scale: number;
  localcoord: number;
  /** Effect colours: palette slot → "#rrggbb", in slots above the art's own colours. */
  fx: Readonly<Record<number, string>>;
  credit: string;
}

/** A strip: one file of frames side by side, or a file per frame. */
export type StripFiles = string | readonly string[];

/** A strip's first file (for messages and the art source). */
export const firstFile = (s: StripFiles): string => (typeof s === "string" ? s : s[0]!);

/**
 * The strips' digest, as `PackArt.sha256` records it: sha256 over each strip's own digest, in name order. A strip
 * given as a file per frame is digested as the sha256 of its files' digests, in order.
 */
export async function packHash(repoRoot: string, strips: Readonly<Record<string, StripFiles>>): Promise<string> {
  const sha = async (file: string) => createHash("sha256").update(await readFile(path.join(repoRoot, file))).digest("hex");
  const h = createHash("sha256");
  for (const name of Object.keys(strips).sort()) {
    const s = strips[name]!;
    h.update(typeof s === "string" ? await sha(s) : createHash("sha256").update((await Promise.all(s.map(sha))).join("")).digest("hex"));
  }
  return h.digest("hex");
}

export function put(img: IndexedImage, x: number, y: number, color: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.pixels[y * img.width + x] = color;
}

export function disc(img: IndexedImage, cx: number, cy: number, r: number, color: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(img, x, y, color);
}

/** Text in the 5 x 7 font with a dark outline, its left end at x and its top at y. */
export function shout(img: IndexedImage, text: string, x: number, y: number, color: number, outline: number): void {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) drawText(img, text, x + ox, y + oy, outline);
  drawText(img, text, x, y, color);
}
export const shoutWidth = (text: string) => textWidth(text);

/** Arcs opening forward (or backward), like sound or a gust: `n` of them from radius r0, `gap` apart, each `span` degrees. */
export function arcs(img: IndexedImage, cx: number, cy: number, r0: number, n: number, gap: number, color: number, span = 70, backward = false): void {
  const turn = backward ? 180 : 0;
  for (let k = 0; k < n; k++) {
    const r = Math.max(1, Math.abs(r0) + k * gap);
    for (let a = -span / 2; a <= span / 2; a += 30 / r) put(img, cx + Math.cos(((a + turn) * Math.PI) / 180) * r, cy + Math.sin(((a + turn) * Math.PI) / 180) * r, color);
  }
}

/** A small pixel heart (7 x 6), its middle at (cx, cy). */
export function heart(img: IndexedImage, cx: number, cy: number, color: number): void {
  const rows = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && put(img, cx - 3 + x, cy - 3 + y, color)));
}

/** An impact star: points out from (cx, cy), a bright middle. */
export function star(img: IndexedImage, cx: number, cy: number, size: number, color: number, core: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI, len = i % 2 ? size * 0.55 : size;
    for (let t = 0; t <= len; t += 0.5) put(img, cx + Math.cos(a) * t, cy + Math.sin(a) * t, color);
  }
  disc(img, cx, cy, Math.max(1, size / 4), core);
}

/** Dust puffs along the ground from x0 to x1 (in either direction). */
export function dust(img: IndexedImage, x0: number, x1: number, y: number, color: number, seed = 1): void {
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 5));
  for (let i = 0; i < n; i++) disc(img, x0 + ((x1 - x0) * i) / n + rnd() * 2, y - 1 - rnd() * 3, 1 + rnd() * 1.5, color);
}

/** Speed lines trailing behind, from x0 back to x1, at a few heights above the feet. */
export function speedLines(img: IndexedImage, x0: number, x1: number, ys: readonly number[], color: number): void {
  for (const y of ys) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if ((x + y) % 7 < 5) put(img, x, y, color);
}

/** A line from (x0, y0) to (x1, y1). */
export function line(img: IndexedImage, x0: number, y0: number, x1: number, y1: number, color: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) put(img, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, color);
}

/** Palette slots of slash colours (PackArt.slash), below the effect colours (200 up). */
export const SLASH_FIRST = 150;
const SLASH_LAST = 199;

interface Loaded {
  frames: Record<string, IndexedImage[]>;
  palette: Uint8Array;
  /** The feet in a frame (bottom middle of the first idle frame's body). */
  pivot: { x: number; y: number };
  body: Body;
}

export class PackKit {
  readonly poses: PackPose[] = [];
  private readonly names = new Map<string, number>();
  /** What `sheet` read, for art made after the sheet (a projectile from the pack's own strip). */
  private last?: Loaded;

  constructor(readonly art: PackArt) {}

  /** A cell for this pose, by name (the same name gives the same cell). */
  cell(name: string, pose: PackPose): number {
    const known = this.names.get(name);
    if (known !== undefined) return known;
    this.poses.push(pose);
    this.names.set(name, this.poses.length - 1);
    return this.poses.length - 1;
  }

  /** A box given in art pixels from the feet (forward and down positive), in sheet pixels from the axis. */
  box(x0: number, y0: number, x1: number, y1: number): Box {
    const s = this.art.scale;
    return [x0 * s, y0 * s, x1 * s, y1 * s];
  }

  /** The art source for these cells (call it once every cell is made). */
  source(standardSprites: Readonly<Record<string, StandardSprite>>): ArtSource {
    const { art } = this;
    return {
      id: art.id,
      file: firstFile(art.strips[art.idle]!),
      sha256: art.sha256,
      cellWidth: art.cell.width * art.scale,
      cellHeight: art.cell.height * art.scale,
      columns: 10,
      rows: Math.ceil(this.poses.length / 10),
      axis: { x: art.cell.feet.x * art.scale, y: art.cell.feet.y * art.scale },
      stray: [],
      localcoord: art.localcoord,
      standardSprites,
      pixel: art.scale,
      ...(art.slash ? { effectHits: true } : {}),
      effects: [...(art.slash ? Array.from({ length: SLASH_LAST - SLASH_FIRST + 1 }, (_, i) => SLASH_FIRST + i) : []), ...Object.keys(art.fx).map(Number)],
      sheet: (ctx) => this.sheet(ctx.repoRoot),
      credit: art.credit,
    };
  }

  /** Read the strips (checked by their digest) and gather their colours into one palette. */
  async load(repoRoot: string): Promise<Loaded> {
    const { art } = this;
    const sum = await packHash(repoRoot, art.strips);
    if (sum !== art.sha256) throw new Error(`${art.id}: the strips' digest ${sum} does not match ${art.sha256}`);
    // First every strip as RGB (0 = clear), and where each colour is found.
    const rgbFrames: Record<string, { width: number; height: number; px: Int32Array }[]> = {};
    const foundIn = new Map<number, Set<string>>();
    for (const [name, files] of Object.entries(art.strips)) {
      // A strip file's frames side by side (a file per frame is a strip of one frame of its own width).
      const pngs = await Promise.all((typeof files === "string" ? [files] : files).map(async (f) => readPng(await readFile(path.join(repoRoot, f)))));
      const list: { width: number; height: number; px: Int32Array }[] = [];
      for (const png of pngs) {
        const rgba = toRgba(png);
        const h = png.height, w = typeof files === "string" ? (art.widths?.[name] ?? h) : png.width, n = Math.floor(png.width / w);
        for (let k = 0; k < n; k++) {
          const px = new Int32Array(w * h).fill(-1);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const o = (y * png.width + k * w + x) * 4;
              if (rgba[o + 3]! < 128) continue;
              const rgb = (rgba[o]! << 16) | (rgba[o + 1]! << 8) | rgba[o + 2]!;
              px[y * w + (art.mirror ? w - 1 - x : x)] = rgb;
              let set = foundIn.get(rgb);
              if (!set) foundIn.set(rgb, (set = new Set()));
              set.add(name);
            }
          }
          list.push({ width: w, height: h, px });
        }
      }
      if (art.counts?.[name] !== undefined && art.counts[name] !== list.length) throw new Error(`${art.id}: strip ${name} has ${list.length} frames, not ${art.counts[name]}`);
      rgbFrames[name] = list;
    }
    // Slash colours get their own slots; the rest number from 1 in the order they're first found.
    const slash = new Set((art.slash?.colours ?? []).map((c) => parseInt(c.slice(1), 16)));
    const onlyIn = new Set(art.slash?.onlyIn ?? []);
    if (onlyIn.size) for (const [rgb, where] of foundIn) if ([...where].every((s) => onlyIn.has(s))) slash.add(rgb);
    const colours = new Map<number, number>();
    let nextSlash = SLASH_FIRST;
    for (const rgb of foundIn.keys()) {
      if (!slash.has(rgb)) continue;
      if (nextSlash > SLASH_LAST) throw new Error(`${art.id}: more than ${SLASH_LAST - SLASH_FIRST + 1} slash colours`);
      colours.set(rgb, nextSlash++);
    }
    let nextArt = 1;
    for (const rgb of foundIn.keys()) if (!colours.has(rgb)) colours.set(rgb, nextArt++);
    if (nextArt > SLASH_FIRST) throw new Error(`${art.id}: ${nextArt - 1} colours reach the slash slots (${SLASH_FIRST} up)`);
    const frames: Record<string, IndexedImage[]> = {};
    for (const [name, list] of Object.entries(rgbFrames)) {
      frames[name] = list.map(({ width, height, px }) => ({ width, height, pixels: Uint8Array.from(px, (rgb) => (rgb < 0 ? 0 : colours.get(rgb)!)) }));
    }
    const firstFx = Math.min(...Object.keys(art.fx).map(Number));
    if (firstFx <= SLASH_LAST && (nextArt > firstFx || nextSlash > firstFx)) throw new Error(`${art.id}: the strips' colours reach the effect slots (${firstFx} up)`);
    const palette = new Uint8Array(768);
    for (const [rgb, i] of colours) palette.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255], i * 3);
    for (const [i, c] of Object.entries(art.fx)) palette.set([1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)), Number(i) * 3);
    const idle = frames[art.idle]?.[0];
    if (!idle) throw new Error(`${art.id}: no idle strip ${art.idle}`);
    let x0 = idle.width, x1 = -1, y0 = idle.height, y1 = -1;
    idle.pixels.forEach((p, i) => {
      if (!p) return;
      const x = i % idle.width, y = Math.floor(i / idle.width);
      x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y);
    });
    const pivot = { x: Math.round((x0 + x1 + 1) / 2), y: y1 + 1 };
    const body = { front: x1 + 1 - pivot.x, back: pivot.x - x0, height: y1 + 1 - y0 };
    if (art.body && JSON.stringify(art.body) !== JSON.stringify(body)) throw new Error(`${art.id}: the idle frame's body is ${JSON.stringify(body)}, not ${JSON.stringify(art.body)}`);
    return { frames, palette, pivot, body };
  }

  /** Draw one pose at the art's own size. */
  draw(loaded: Loaded, pose: PackPose): IndexedImage {
    const { width: W, height: H, feet } = this.art.cell;
    const img: IndexedImage = { width: W, height: H, pixels: new Uint8Array(W * H) };
    const strip = loaded.frames[pose.s];
    if (!strip) throw new Error(`${this.art.id}: no strip ${pose.s}`);
    const fr = strip[Math.min(pose.f ?? 0, strip.length - 1)]!;
    const lift = pose.mid ? loaded.body.height / 2 : 0;
    const cx = feet.x + (pose.dx ?? 0), cy = feet.y + (pose.dy ?? 0) - lift;
    const t = ((pose.rot ?? 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t), sx = pose.sx ?? 1, sy = pose.sy ?? 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x + 0.5 - cx, v = y + 0.5 - cy;
        let fu = (u * cos + v * sin) / sx;
        const fv = (-u * sin + v * cos) / sy;
        if (pose.flip) fu = -fu;
        const px = Math.floor(loaded.pivot.x + fu), py = Math.floor(loaded.pivot.y - lift + fv);
        if (px < 0 || py < 0 || px >= fr.width || py >= fr.height) continue;
        const p = fr.pixels[py * fr.width + px]!;
        if (p) img.pixels[y * W + x] = p;
      }
    }
    const canvas: PackCanvas = { img, x: feet.x + (pose.dx ?? 0), y: feet.y + (pose.dy ?? 0), body: loaded.body };
    for (const e of pose.fx ?? []) e(canvas);
    return img;
  }

  /** A strip's frames as read by `sheet` (which the build calls before it makes projectiles and effects). */
  frames(strip: string): IndexedImage[] {
    const f = this.last?.frames[strip];
    if (!f) throw new Error(`${this.art.id}: strip ${strip} isn't loaded (make the sheet first)`);
    return f;
  }

  /** Every cell, scaled up, as a sheet (cell n at column n % 10, row n / 10). */
  async sheet(repoRoot: string): Promise<Sheet> {
    const loaded = await this.load(repoRoot);
    this.last = loaded;
    const { width: W, height: H } = this.art.cell, k = this.art.scale;
    const cw = W * k, ch = H * k, columns = 10, rows = Math.ceil(this.poses.length / columns);
    const sheet: Sheet = { width: cw * columns, height: ch * rows, pixels: new Uint8Array(cw * columns * ch * rows), palette: loaded.palette, cellWidth: cw, cellHeight: ch, columns, rows };
    this.poses.forEach((pose, n) => {
      const img = this.draw(loaded, pose);
      const x0 = (n % columns) * cw, y0 = Math.floor(n / columns) * ch;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) sheet.pixels[(y0 + y) * sheet.width + x0 + x] = img.pixels[Math.floor(y / k) * W + Math.floor(x / k)]!;
    });
    return sheet;
  }
}
