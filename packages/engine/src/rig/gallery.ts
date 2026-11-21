/**
 * A picture of rig fighters for people (not the engine): each design in a row
 * of poses on a dark stage, with its name, at double size. `pnpm rig:gallery`
 * writes one; also used to preview a parts sheet someone drew (rig/import.ts).
 */
import { writePng } from "../art/png.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { drawText } from "../fx/font.ts";
import { RIG_CELL } from "./fighter.ts";
import { designPalette, type Design } from "./parts.ts";
import { renderPose } from "./render.ts";
import type { Pose } from "./skeleton.ts";

export interface GalleryRow {
  name: string;
  /** A short line under the name. */
  style?: string;
  design: Design;
  /** The palette to draw with (default the design's own colours). */
  palette?: Uint8Array;
}

/** The part of each cell shown, and the scale. */
const CROP = { x0: 50, x1: 390, y0: 40, y1: 312 } as const;

export function galleryPng(rows: readonly GalleryRow[], poses: readonly Pose[], scale = 2): Buffer {
  const cw = CROP.x1 - CROP.x0, ch = CROP.y1 - CROP.y0;
  const label = 22;
  const W = cw * poses.length * scale, rowH = (ch + label) * scale, H = rowH * rows.length;
  const rgba = new Uint8Array(W * H * 4);
  rows.forEach((row, r) => {
    const pal = row.palette ?? designPalette(row.design);
    // The name and style, in a strip above the row.
    const text: IndexedImage = { width: cw * poses.length, height: label, pixels: new Uint8Array(cw * poses.length * label) };
    drawText(text, row.name.toUpperCase(), 8, 4, 1, 2);
    if (row.style) drawText(text, row.style.toUpperCase(), 8 + (row.name.length + 2) * 12, 7, 2, 1);
    for (let y = 0; y < label * scale; y++) {
      for (let x = 0; x < W; x++) {
        const v = text.pixels[Math.floor(y / scale) * text.width + Math.floor(x / scale)]!;
        rgba.set(v === 1 ? [255, 226, 140, 255] : v === 2 ? [170, 170, 196, 255] : [18, 16, 26, 255], ((r * rowH + y) * W + x) * 4);
      }
    }
    poses.forEach((p, k) => {
      const img = renderPose(row.design, { ...p, fx: [] }, RIG_CELL).img;
      for (let y = 0; y < ch * scale; y++) {
        for (let x = 0; x < cw * scale; x++) {
          const sx = CROP.x0 + Math.floor(x / scale), sy = CROP.y0 + Math.floor(y / scale);
          const v = img.pixels[sy * RIG_CELL.width + sx]!;
          const o = ((r * rowH + label * scale + y) * W + k * cw * scale + x) * 4;
          if (v) rgba.set([pal[v * 3]!, pal[v * 3 + 1]!, pal[v * 3 + 2]!, 255], o);
          else if (sy >= RIG_CELL.axis.y) rgba.set([44, 38, 50, 255], o);
          else rgba.set([Math.round(32 + y / (6 * scale)), Math.round(34 + y / (7 * scale)), Math.round(56 + y / (5 * scale)), 255], o);
        }
      }
    });
  });
  return writePng({ width: W, height: H, colorType: 6, pixels: rgba });
}
