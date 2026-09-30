/**
 * Collision boxes worked out from a frame's pixels, so a fighter's boxes
 * always match its art (docs/PHASE3.md "Fighter templates"):
 * - hurtboxes (Clsn2): the drawn pixels, cut into horizontal bands, one box each;
 * - hitboxes (Clsn1): the part of an attack frame that reaches out past the
 *   fighter's starting pose, in front of it (the fist or foot).
 * Boxes are relative to the axis (the point on the ground under the fighter),
 * with y negative upwards, as .air files expect.
 */
import type { Box } from "./air.ts";
import { bounds, type IndexedImage } from "./sheet.ts";

export interface Axis {
  x: number;
  y: number;
}

/** Hurtboxes: the frame's drawn pixels in `bands` horizontal slices (fewer for short frames). */
export function hurtboxes(img: IndexedImage, axis: Axis, bands = 3, minBand = 24): Box[] {
  const b = bounds(img);
  if (!b) return [];
  const height = b.y1 - b.y0;
  const n = Math.max(1, Math.min(bands, Math.floor(height / minBand)));
  const out: Box[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = b.y0 + Math.round((height * i) / n);
    const y1 = b.y0 + Math.round((height * (i + 1)) / n);
    let x0 = img.width, x1 = -1;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < img.width; x++) {
        if (img.pixels[y * img.width + x] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
    if (x1 >= x0) out.push([x0 - axis.x, y0 - axis.y, x1 + 1 - axis.x, y1 - axis.y]);
  }
  return out;
}

/**
 * Hitbox of an attack frame: pixels in front of the axis that lie past the
 * reference pose's front edge (row by row, with `margin` pixels of slack),
 * keeping the connected part that reaches furthest forward. Null when
 * nothing reaches out (the frame isn't an active attack frame).
 */
export function hitbox(frame: IndexedImage, reference: IndexedImage, axis: Axis, opts: { margin?: number; minPixels?: number } = {}): Box | null {
  const margin = opts.margin ?? 6;
  const minPixels = opts.minPixels ?? 20;
  const { width, height } = frame;
  // The reference pose's front edge per row, widened by a couple of rows so
  // small vertical shifts don't count as reach.
  const front = new Int32Array(height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = reference.width - 1; x >= 0; x--) {
      if (reference.pixels[y * reference.width + x] !== 0) {
        front[y] = x;
        break;
      }
    }
  }
  const edge = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let e = axis.x;
    for (let d = -2; d <= 2; d++) e = Math.max(e, front[Math.min(height - 1, Math.max(0, y + d))]!);
    edge[y] = e + margin;
  }
  const reach = new Uint8Array(width * height);
  let far = -1;
  for (let y = 0; y < height; y++) {
    for (let x = edge[y]! + 1; x < width; x++) {
      if (frame.pixels[y * width + x] === 0) continue;
      reach[y * width + x] = 1;
      if (far < 0 || x > far % width) far = y * width + x;
    }
  }
  if (far < 0) return null;
  // Flood fill from the furthest-forward pixel (8-connected).
  const stack = [far];
  reach[far] = 2;
  let count = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width, y = (p - x) / width;
    count++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (reach[q] === 1) {
          reach[q] = 2;
          stack.push(q);
        }
      }
    }
  }
  if (count < minPixels) return null;
  return [x0 - axis.x, y0 - axis.y, x1 + 1 - axis.x, y1 + 1 - axis.y];
}
