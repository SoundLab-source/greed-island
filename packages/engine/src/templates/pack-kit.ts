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
  /** Strip name → file (relative to the repo root): square frames side by side. */
  strips: Readonly<Record<string, string>>;
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

/** The strips' digest, as `PackArt.sha256` records it. */
export async function packHash(repoRoot: string, strips: Readonly<Record<string, string>>): Promise<string> {
  const h = createHash("sha256");
  for (const name of Object.keys(strips).sort()) h.update(createHash("sha256").update(await readFile(path.join(repoRoot, strips[name]!))).digest("hex"));
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
      file: art.strips[art.idle]!,
      sha256: art.sha256,
      cellWidth: art.cell.width * art.scale,
      cellHeight: art.cell.height * art.scale,
      columns: 10,
      rows: Math.ceil(this.poses.length / 10),
      axis: { x: art.cell.feet.x * art.scale, y: art.cell.feet.y * art.scale },
      stray: [],
      localcoord: art.localcoord,
      standardSprites,
      effects: Object.keys(art.fx).map(Number),
      sheet: (ctx) => this.sheet(ctx.repoRoot),
      credit: art.credit,
    };
  }

  /** Read the strips (checked by their digest) and gather their colours into one palette. */
  async load(repoRoot: string): Promise<Loaded> {
    const { art } = this;
    const sum = await packHash(repoRoot, art.strips);
    if (sum !== art.sha256) throw new Error(`${art.id}: the strips' digest ${sum} does not match ${art.sha256}`);
    const colours = new Map<number, number>();
    const frames: Record<string, IndexedImage[]> = {};
    for (const [name, file] of Object.entries(art.strips)) {
      const png = readPng(await readFile(path.join(repoRoot, file)));
      const rgba = toRgba(png);
      const size = png.height, n = Math.floor(png.width / size);
      frames[name] = Array.from({ length: n }, (_, k) => {
        const img: IndexedImage = { width: size, height: size, pixels: new Uint8Array(size * size) };
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const o = (y * png.width + k * size + x) * 4;
            if (rgba[o + 3]! < 128) continue;
            const rgb = (rgba[o]! << 16) | (rgba[o + 1]! << 8) | rgba[o + 2]!;
            let index = colours.get(rgb);
            if (index === undefined) colours.set(rgb, (index = colours.size + 1));
            img.pixels[y * size + x] = index;
          }
        }
        return img;
      });
    }
    const firstFx = Math.min(...Object.keys(art.fx).map(Number));
    if (colours.size >= firstFx) throw new Error(`${art.id}: ${colours.size} colours reach the effect slots (${firstFx} up)`);
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

  /** Every cell, scaled up, as a sheet (cell n at column n % 10, row n / 10). */
  async sheet(repoRoot: string): Promise<Sheet> {
    const loaded = await this.load(repoRoot);
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
