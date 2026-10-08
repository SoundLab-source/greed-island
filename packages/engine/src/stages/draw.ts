/**
 * A small drawing kit for stage backgrounds drawn in code (so the art is our
 * own): a palette canvas with dithered gradients, silhouettes that tile
 * seamlessly, skylines with lit windows and tiled floors. Everything is
 * deterministic for a given seed.
 */
import type { IndexedImage } from "../art/sheet.ts";
import { drawText } from "../fx/font.ts";

export type Rgb = readonly [number, number, number];

export function hex(c: string): Rgb {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (!m) throw new Error(`bad colour ${c}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

/** A seeded random generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** An image whose colours are added to its own palette as they're used (index 0 is transparent). */
export class Canvas {
  readonly pixels: Uint8Array;
  private readonly colors: Rgb[] = [[0, 0, 0]];
  private readonly lookup = new Map<string, number>();

  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8Array(width * height);
  }

  index(c: Rgb): number {
    const key = c.join(",");
    let i = this.lookup.get(key);
    if (i === undefined) {
      if (this.colors.length >= 256) throw new Error("a stage layer can use at most 255 colours");
      i = this.colors.length;
      this.colors.push(c);
      this.lookup.set(key, i);
    }
    return i;
  }

  set(x: number, y: number, c: Rgb): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = this.index(c);
  }

  /** Wraps horizontally, so a layer that tiles stays seamless. */
  setWrapped(x: number, y: number, c: Rgb): void {
    x = Math.round(x);
    this.set(((x % this.width) + this.width) % this.width, y, c);
  }

  fill(x0: number, y0: number, x1: number, y1: number, c: Rgb): void {
    [x0, y0, x1, y1] = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
    for (let y = Math.max(0, y0); y < Math.min(this.height, y1); y++) for (let x = x0; x < x1; x++) this.setWrapped(x, y, c);
  }

  /**
   * A vertical gradient through colour stops ([position 0-1, colour]),
   * quantised to `levels` steps with ordered dithering between them.
   */
  gradient(y0: number, y1: number, stops: readonly (readonly [number, Rgb])[], levels = 24, onlyEmpty = false): void {
    const colorAt = (t: number): Rgb => {
      for (let i = 1; i < stops.length; i++) {
        const [p0, c0] = stops[i - 1]!, [p1, c1] = stops[i]!;
        if (t <= p1) return mix(c0, c1, p1 === p0 ? 0 : (t - p0) / (p1 - p0));
      }
      return stops.at(-1)![1];
    };
    const ramp = Array.from({ length: levels }, (_, i) => colorAt(i / (levels - 1)));
    for (let y = y0; y < y1; y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (levels - 1);
      for (let x = 0; x < this.width; x++) {
        if (onlyEmpty && this.pixels[y * this.width + x] !== 0) continue;
        const lo = Math.floor(t);
        const pick = t - lo > BAYER[(y % 4) * 4 + (x % 4)]! ? Math.min(levels - 1, lo + 1) : lo;
        this.set(x, y, ramp[pick]!);
      }
    }
  }

  image(): IndexedImage {
    return { width: this.width, height: this.height, pixels: this.pixels };
  }

  /** RGB triples for the SFF palette. */
  palette(): Uint8Array {
    const out = new Uint8Array(this.colors.length * 3);
    this.colors.forEach((c, i) => out.set(c, i * 3));
    return out;
  }
}

/**
 * A ridge line that repeats exactly every `width` pixels: a sum of sines
 * whose wavelengths divide the width, with seeded phases.
 */
export function ridge(width: number, seed: number, waves: readonly (readonly [number, number])[]): (x: number) => number {
  const r = rng(seed);
  const parts = waves.map(([cycles, amplitude]) => ({ k: (2 * Math.PI * cycles) / width, a: amplitude, p: r() * 2 * Math.PI }));
  return (x) => parts.reduce((sum, w) => sum + w.a * Math.sin(w.k * x + w.p), 0);
}

/** Fill everything below a ridge (top = baseline - ridge(x)) with a colour, with a lighter rim along the top. */
export function silhouette(c: Canvas, baseline: number, line: (x: number) => number, color: Rgb, rim?: Rgb): void {
  for (let x = 0; x < c.width; x++) {
    const top = Math.max(0, Math.round(baseline - line(x)));
    for (let y = top; y < c.height; y++) c.set(x, y, rim && y < top + 2 ? rim : color);
  }
}

/** A city skyline: buildings across the width (tiling), with windows lit at random. */
export function skyline(c: Canvas, seed: number, o: { baseline: number; minH: number; maxH: number; body: Rgb; windows: readonly Rgb[]; lit: number; dark: Rgb }): void {
  const r = rng(seed);
  let x = 0;
  while (x < c.width) {
    const w = 40 + Math.floor(r() * 90);
    const h = o.minH + Math.floor(r() * (o.maxH - o.minH));
    const top = o.baseline - h;
    c.fill(x, top, x + w, c.height, o.body);
    if (r() < 0.3) c.fill(x + Math.floor(w / 2) - 2, top - 18, x + Math.floor(w / 2) + 2, top, o.body); // an antenna
    for (let wy = top + 8; wy < c.height - 6; wy += 14) {
      for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        const lit = r() < o.lit;
        c.fill(wx, wy, wx + 6, wy + 8, lit ? o.windows[Math.floor(r() * o.windows.length)]! : o.dark);
      }
    }
    x += w + Math.floor(r() * 6);
  }
}

/** Floor tiles in rows that get taller towards the viewer, with offset seams and a little shading. */
export function floorTiles(c: Canvas, seed: number, o: { colors: readonly Rgb[]; seam: Rgb; tileWidth: number; rows: readonly number[] }): void {
  const r = rng(seed);
  let y = 0;
  o.rows.forEach((h, row) => {
    const offset = row % 2 ? Math.floor(o.tileWidth / 2) : 0;
    for (let x = -offset; x < c.width; x += o.tileWidth) {
      const color = o.colors[Math.floor(r() * o.colors.length)]!;
      c.fill(x, y, x + o.tileWidth, y + h, color);
      c.fill(x, y, x + 2, y + h, o.seam);
    }
    c.fill(0, y, c.width, y + 2, o.seam);
    y += h;
  });
  if (y < c.height) c.fill(0, y, c.width, c.height, o.seam);
}

/** Fill a polygon (even-odd scanlines through pixel centres), wrapping sideways like `fill`. */
export function polygon(c: Canvas, points: readonly (readonly [number, number])[], color: Rgb | ((x: number, y: number) => Rgb | null)): void {
  const ys = points.map((p) => p[1]);
  const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(c.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = top; y <= bottom; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i]!, [x1, y1] = points[(i + 1) % points.length]!;
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) {
        const col = typeof color === "function" ? color(x, y) : color;
        if (col) c.setWrapped(x, y, col);
      }
    }
  }
}

/** A filled circle (or ellipse with `ry`); `color` may shade by the point's offset from the centre (-1 to 1 each way). */
export function circle(c: Canvas, cx: number, cy: number, r: number, color: Rgb | ((dx: number, dy: number) => Rgb | null), ry = r): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const col = typeof color === "function" ? color(dx, dy) : color;
      if (col) c.setWrapped(x, y, col);
    }
  }
}

/** A straight line `width` pixels thick. */
export function line(c: Canvas, x0: number, y0: number, x1: number, y1: number, color: Rgb, width = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const h = Math.floor(width / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    c.fill(x - h, y - h, x - h + width, y - h + width, color);
  }
}

/** Whether a pixel takes the second of two colours in an ordered-dither blend `t` (0-1) of the way between them. */
export function dithered(x: number, y: number, t: number): boolean {
  return t > BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)]!;
}

/** Fill a box with an ordered-dither blend between two colours, `t` from `at(x, y)`. */
export function blend(c: Canvas, x0: number, y0: number, x1: number, y1: number, a: Rgb, b: Rgb, at: (x: number, y: number) => number): void {
  for (let y = Math.max(0, y0); y < Math.min(c.height, y1); y++) for (let x = x0; x < x1; x++) c.setWrapped(x, y, dithered(x, y, at(x, y)) ? b : a);
}

/** Text in the 5 x 7 pixel font (fx/font.ts), top-left at x, y. */
export function text(c: Canvas, s: string, x: number, y: number, color: Rgb, scale = 1): void {
  drawText(c.image(), s, x, y, c.index(color), scale);
}
