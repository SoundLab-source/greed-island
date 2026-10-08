/**
 * The pieces stages are made of (stages.ts): IKEMEN's 1280 x 720 stage space, layers and the common ones (a sky, a
 * band of scenery that tiles, the floor).
 */
import { Canvas, hex, mix, rng } from "./draw.ts";

export const WIDTH = 1280;
export const HEIGHT = 720;
/** Where fighters stand, from the top of the screen. */
export const GROUND = 610;
/** Scenery layers are twice the screen wide and tile, so the camera can pan. */
export const WIDE = 2560;

export interface Layer {
  canvas: Canvas;
  /** An animation: the frames after the first (the canvas), the same size, each shown `ticks` ticks (default 8). */
  frames?: readonly Canvas[];
  ticks?: number;
  /** Top of the layer on screen (stage units). */
  y: number;
  /** Where the layer's middle is, from the middle of the stage (default 0). */
  x?: number;
  /** How far it moves with the camera (0: fixed, 1: with the floor). */
  delta: readonly [number, number];
  /** Repeats sideways. */
  tile: boolean;
  /** Repeats up and down too (something falling for ever). */
  tileY?: boolean;
  /** For an animation that repeats: the distance from one copy to the next (it only comes round now and then). */
  tileSpacing?: number;
  /** Drifts on its own, in stage units a tick (IKEMEN stage.go "velocity"). */
  velocity?: readonly [number, number];
  /** Bobs up and down: how far and how many ticks a bob takes ("sin.y"). */
  bob?: readonly [number, number];
  /** Light: added onto what's behind ("trans = add"). */
  light?: boolean;
}

export interface StageDesign {
  /** Folder-free file name and roster id: gi-<name>. */
  id: string;
  name: string;
  draw: () => Layer[];
}

export function sky(stops: readonly (readonly [number, string])[], extra?: (c: Canvas) => void): Layer {
  const c = new Canvas(WIDTH, HEIGHT);
  if (extra) extra(c);
  c.gradient(0, HEIGHT, stops.map(([p, col]) => [p, hex(col)] as const), 28, true);
  return { canvas: c, y: 0, delta: [0, 0], tile: false };
}

export function stars(c: Canvas, seed: number, n: number, color: string, maxY: number): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * c.width), y = Math.floor(r() * maxY);
    c.set(x, y, hex(color));
    if (r() < 0.15) c.set(x + 1, y, hex(color));
  }
}

export function disc(c: Canvas, cx: number, cy: number, radius: number, inner: string, outer: string): void {
  cx = Math.round(cx);
  cy = Math.round(cy);
  radius = Math.round(radius);
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d <= 1) c.set(x, y, mix(hex(inner), hex(outer), Math.min(1, Math.round(d * 4) / 4)));
    }
  }
}

export function scenery(height: number, y: number, delta: readonly [number, number], draw: (c: Canvas) => void): Layer {
  const c = new Canvas(WIDE, height);
  draw(c);
  return { canvas: c, y, delta, tile: true };
}

export function floor(draw: (c: Canvas) => void): Layer {
  const c = new Canvas(WIDE, HEIGHT - GROUND + 20);
  draw(c);
  return { canvas: c, y: GROUND, delta: [1, 1], tile: true };
}
