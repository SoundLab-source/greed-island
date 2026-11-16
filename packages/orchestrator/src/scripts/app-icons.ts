// `npx tsx src/scripts/app-icons.ts` (from packages/orchestrator) redraws the site's app icons in apps/web/icons/:
// "GI" in our pixel font, gold on night, with a gold frame, at each size the browsers and phones ask for.
import { writeFileSync } from "node:fs";
import { drawText, textWidth, writePng } from "@greed-island/engine";

for (const size of [32, 180, 192, 512]) {
  const px = new Uint8Array(size * size * 3);
  const set = (x: number, y: number, c: number[]) => { const i = (y * size + x) * 3; px[i] = c[0]!; px[i + 1] = c[1]!; px[i + 2] = c[2]!; };
  const NIGHT = [11, 12, 20], GOLD = [246, 201, 69], DEEP = [40, 30, 8];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2, y - size / 2) / (size * 0.7);
    const k = Math.max(0, 1 - d) * 0.35;
    set(x, y, NIGHT.map((v, j) => Math.round(v + (GOLD[j]! - v) * k * 0.4)));
  }
  const f = Math.max(1, Math.round(size / 24));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (x < f || y < f || x >= size - f || y >= size - f) set(x, y, GOLD);
  const scale = Math.max(1, Math.floor((size * 0.62) / textWidth("GI", 1)));
  const w = textWidth("GI", scale), h = 7 * scale;
  const img = { width: w, height: h, pixels: new Uint8Array(w * h) };
  drawText(img, "GI", 0, 0, 1, scale);
  const ox = Math.round((size - w) / 2), oy = Math.round((size - h) / 2);
  const drop = Math.max(1, Math.round(scale / 2));
  for (const [dx, c] of [[drop, DEEP], [0, GOLD]] as const)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (img.pixels[y * w + x]) set(ox + x + dx, oy + y + dx, c as number[]);
  writeFileSync(new URL(`../../../../apps/web/icons/icon-${size}.png`, import.meta.url), writePng({ width: size, height: size, colorType: 2, pixels: px }));
}
