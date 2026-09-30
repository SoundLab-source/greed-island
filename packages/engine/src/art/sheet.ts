/**
 * Palette sprite sheets on a regular grid (docs/PHASE3.md "Fighter
 * templates"): cutting out one cell, cleaning stray pixels, and trimming it to
 * its drawn pixels. Images stay as palette indices; index 0 is transparent.
 */
import { readFile } from "node:fs/promises";
import { readPng } from "./png.ts";

/** An 8-bit palette image. `palette` holds 256 RGB triples; index 0 is transparent. */
export interface IndexedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface Sheet extends IndexedImage {
  palette: Uint8Array;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
}

export interface Grid {
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
}

/**
 * Load a palette PNG laid out on `grid`. Its transparent colour must be index
 * 0 (IKEMEN draws palette index 0 as transparent).
 */
export async function loadSheet(file: string, grid: Grid): Promise<Sheet> {
  const png = readPng(await readFile(file));
  if (png.colorType !== 3 || !png.palette) throw new Error(`${file}: expected a palette PNG`);
  if (png.width !== grid.cellWidth * grid.columns || png.height !== grid.cellHeight * grid.rows) {
    throw new Error(`${file}: ${png.width}x${png.height} does not match a ${grid.columns}x${grid.rows} grid of ${grid.cellWidth}x${grid.cellHeight} cells`);
  }
  const alpha = png.alpha ?? new Uint8Array(0);
  for (let i = 0; i < alpha.length; i++) {
    if (i > 0 && alpha[i] === 0) throw new Error(`${file}: palette index ${i} is transparent (only index 0 may be)`);
  }
  if ((alpha[0] ?? 255) !== 0) throw new Error(`${file}: palette index 0 must be transparent`);
  const palette = new Uint8Array(768);
  palette.set(png.palette.subarray(0, 768));
  return { width: png.width, height: png.height, pixels: png.pixels, palette, ...grid };
}

/** The cell with this index, counting left to right, then top to bottom. */
export function cell(sheet: Sheet, index: number): IndexedImage {
  if (!Number.isInteger(index) || index < 0 || index >= sheet.columns * sheet.rows) throw new Error(`cell ${index} is outside the sheet`);
  const x0 = (index % sheet.columns) * sheet.cellWidth;
  const y0 = Math.floor(index / sheet.columns) * sheet.cellHeight;
  const out = new Uint8Array(sheet.cellWidth * sheet.cellHeight);
  for (let y = 0; y < sheet.cellHeight; y++) {
    const from = (y0 + y) * sheet.width + x0;
    out.set(sheet.pixels.subarray(from, from + sheet.cellWidth), y * sheet.cellWidth);
  }
  return { width: sheet.cellWidth, height: sheet.cellHeight, pixels: out };
}

/**
 * Repaint stray pixels (colours in `stray`) with the most common colour among
 * their 8 neighbours that isn't stray, or transparent when most neighbours are.
 */
export function cleanStrays(img: IndexedImage, stray: ReadonlySet<number>): IndexedImage {
  if (stray.size === 0) return img;
  const out = img.pixels.slice();
  const counts = new Map<number, number>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!stray.has(img.pixels[y * img.width + x]!)) continue;
      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
          const v = img.pixels[ny * img.width + nx]!;
          if (!stray.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
      let best = 0, bestCount = 0;
      for (const [v, n] of counts) if (n > bestCount || (n === bestCount && v < best)) [best, bestCount] = [v, n];
      out[y * img.width + x] = best;
    }
  }
  return { ...img, pixels: out };
}

export interface Bounds {
  x0: number;
  y0: number;
  /** Exclusive. */
  x1: number;
  y1: number;
}

/** The smallest box around the drawn (non-zero) pixels, or null for an empty image. */
export function bounds(img: IndexedImage): Bounds | null {
  let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
  for (let y = 0; y < img.height; y++) {
    const row = y * img.width;
    for (let x = 0; x < img.width; x++) {
      if (img.pixels[row + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x >= x1) x1 = x + 1;
      if (y < y0) y0 = y;
      y1 = y + 1;
    }
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : null;
}

export function crop(img: IndexedImage, b: Bounds): IndexedImage {
  const width = b.x1 - b.x0, height = b.y1 - b.y0;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const from = (b.y0 + y) * img.width + b.x0;
    out.set(img.pixels.subarray(from, from + width), y * width);
  }
  return { width, height, pixels: out };
}

/** Nearest-neighbour scale (for portraits). */
export function scale(img: IndexedImage, width: number, height: number): IndexedImage {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor(((y + 0.5) * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor(((x + 0.5) * img.width) / width));
      out[y * width + x] = img.pixels[sy * img.width + sx]!;
    }
  }
  return { width, height, pixels: out };
}
