/**
 * Contact sheets of a template: one row per animation, each frame with its
 * hurtboxes (blue), hitboxes (red) and axis (green). For checking frame
 * choices by eye, and for artists drawing a fighter on the template.
 */
import type { AirAction, Box } from "../art/air.ts";
import { writePng } from "../art/png.ts";
import { cell, type Sheet } from "../art/sheet.ts";

const DIGITS: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
};

export interface PreviewOptions {
  /** Frames per row before wrapping (default 10). */
  perRow?: number;
  /** Rows per page (default 12). */
  rowsPerPage?: number;
  /** Shrink factor (default 2: half size). */
  shrink?: number;
}

/** PNG pages showing every action; `slots` maps sprite group,number to its sheet cell. */
export function previewPages(sheet: Sheet, axis: { x: number; y: number }, actions: readonly AirAction[], slots: ReadonlyMap<string, number>, opts: PreviewOptions = {}): Buffer[] {
  const perRow = opts.perRow ?? 10;
  const rowsPerPage = opts.rowsPerPage ?? 12;
  const k = opts.shrink ?? 2;
  const fw = Math.ceil(sheet.cellWidth / k), fh = Math.ceil(sheet.cellHeight / k);
  const rows: { action: number; frames: AirAction["frames"] }[] = [];
  for (const a of actions) for (let i = 0; i < a.frames.length; i += perRow) rows.push({ action: i === 0 ? a.action : -1, frames: a.frames.slice(i, i + perRow) });
  const pages: Buffer[] = [];
  for (let p = 0; p < rows.length; p += rowsPerPage) {
    const pageRows = rows.slice(p, p + rowsPerPage);
    const W = perRow * fw, H = pageRows.length * fh;
    const out = new Uint8Array(W * H * 4).fill(255);
    const put = (x: number, y: number, rgb: readonly number[]) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      out.set(rgb, (y * W + x) * 4);
    };
    pageRows.forEach((row, r) => {
      row.frames.forEach((f, c) => {
        const ox = c * fw, oy = r * fh;
        const src = cell(sheet, slots.get(`${f.group},${f.number}`)!);
        const dy = f.y ?? 0;
        for (let y = 0; y < fh; y++) {
          for (let x = 0; x < fw; x++) {
            const sy = y * k - dy;
            const v = sy < 0 || sy >= src.height ? 0 : src.pixels[sy * src.width + Math.min(src.width - 1, x * k)]!;
            if (x === 0 || y === 0) put(ox + x, oy + y, [210, 210, 210, 255]);
            else if (v) put(ox + x, oy + y, [sheet.palette[v * 3]!, sheet.palette[v * 3 + 1]!, sheet.palette[v * 3 + 2]!, 255]);
          }
        }
        const rect = (b: Box, rgb: number[]) => {
          const [x0, y0, x1, y1] = b.map((n, i) => Math.round((n + (i % 2 === 0 ? axis.x : axis.y)) / k));
          for (let x = x0!; x <= x1!; x++) { put(ox + x, oy + y0!, rgb); put(ox + x, oy + y1!, rgb); }
          for (let y = y0!; y <= y1!; y++) { put(ox + x0!, oy + y, rgb); put(ox + x1!, oy + y, rgb); }
        };
        for (const b of f.clsn2 ?? []) rect(b, [40, 90, 230, 255]);
        for (const b of f.clsn1 ?? []) rect(b, [230, 30, 30, 255]);
        const ax = ox + Math.round(axis.x / k), ay = oy + Math.round(axis.y / k);
        for (let d = -4; d <= 4; d++) { put(ax + d, ay, [0, 170, 0, 255]); put(ax, ay + d, [0, 170, 0, 255]); }
        const label = c === 0 && row.action >= 0 ? `${row.action}` : "";
        [...(label + (label ? " " : "") + (f.ticks < 0 ? "" : String(f.ticks)))].forEach((d, i) => {
          const g = DIGITS[d];
          if (!g) return;
          const color = label && i < label.length ? [0, 0, 0, 255] : [120, 120, 120, 255];
          for (let j = 0; j < 15; j++) if (g[j] === "1") for (let s = 0; s < 4; s++) put(ox + 3 + i * 8 + (j % 3) * 2 + (s % 2), oy + 3 + Math.floor(j / 3) * 2 + (s >> 1), color);
        });
      });
    });
    pages.push(writePng({ width: W, height: H, colorType: 6, pixels: out }));
  }
  return pages;
}
