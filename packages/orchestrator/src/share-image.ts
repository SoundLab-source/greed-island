/**
 * The picture a shared card link shows in chats and social posts (og:image, 1200 x 630, the size link previews use).
 * Previews don't show SVG, so this is a PNG drawn here: the fighter big on its style's colours, its name and numbers in
 * our pixel font (engine fx/font.ts), and the Greed Island mark, with a gold frame for rare fighters. Pure: `shareImage`
 * takes the card's data (cards.ts).
 */
import { drawText, GLYPH_HEIGHT, hasGlyph, readPng, textWidth, toRgba, writePng } from "@greed-island/engine";
import { STYLE_COLORS, type CardData } from "./cards.ts";
import { STYLE_NAME } from "./story.ts";

export const SHARE_W = 1200;
export const SHARE_H = 630;

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const NIGHT: Rgb = [11, 12, 20];
const WHITE: Rgb = [255, 255, 255];
const DIM: Rgb = [154, 160, 184];
const GOLD: Rgb = [246, 201, 69];

/** Text the pixel font can draw: accents dropped, dashes made plain, anything else left out. */
export function fontSafe(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[–—]/g, "-")
    .split("")
    .filter(hasGlyph)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

class Canvas {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h * 3);
  }
  /** Paint colour `c` over pixel x, y at opacity `a`. */
  blend(x: number, y: number, c: Rgb, a = 1): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 3;
    const k = Math.min(1, a);
    for (let j = 0; j < 3; j++) this.px[i + j] = Math.round(this.px[i + j]! + (c[j]! - this.px[i + j]!) * k);
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 1): void {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) this.blend(x, y, c, a);
  }
  /** Text in the pixel font, top-left at x, y, with a soft shadow; returns how wide it was. */
  text(text: string, x: number, y: number, scale: number, c: Rgb): number {
    const t = fontSafe(text);
    if (!t) return 0;
    const img = { width: textWidth(t, scale), height: GLYPH_HEIGHT * scale, pixels: new Uint8Array(textWidth(t, scale) * GLYPH_HEIGHT * scale) };
    drawText(img, t, 0, 0, 1, scale);
    const drop = Math.max(1, Math.round(scale / 2));
    for (const [dx, dy, colour, a] of [[drop, drop, NIGHT, 0.7], [0, 0, c, 1]] as const) {
      for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) if (img.pixels[py * img.width + px]) this.blend(x + px + dx, y + py + dy, colour, a);
    }
    return img.width;
  }
}

/** The largest font scale (from `max` down to `min`) at which `text` fits in `width` pixels. */
function scaleToFit(text: string, width: number, max: number, min: number): number {
  for (let s = max; s > min; s--) if (textWidth(fontSafe(text), s) <= width) return s;
  return min;
}

/** Cut text to what fits in `width` at `scale`. */
function clip(text: string, width: number, scale: number): string {
  let t = fontSafe(text);
  while (t.length > 1 && textWidth(t, scale) > width) t = t.slice(0, -1);
  return t;
}

/**
 * How to set a name in `width` pixels: one line as big as fits, or, when one line would be small (under 6) or cut,
 * two lines split at a space if that's bigger (at most 7, so the block stays clear of the footer). Cut only as a
 * last resort (one long word).
 */
export function nameLayout(text: string, width: number, max = 10, min = 4): { lines: string[]; scale: number } {
  const one = scaleToFit(text, width, max, min);
  const fitsOne = textWidth(fontSafe(text), one) <= width;
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && (!fitsOne || one < 6)) {
    let best: { lines: string[]; scale: number } | null = null;
    for (let i = 1; i < words.length; i++) {
      const lines = [fontSafe(words.slice(0, i).join(" ")), fontSafe(words.slice(i).join(" "))];
      const scale = Math.min(...lines.map((l) => scaleToFit(l, width, 7, min)));
      if (lines.every((l) => textWidth(fontSafe(l), scale) <= width) && (!best || scale > best.scale)) best = { lines, scale };
    }
    if (best && (!fitsOne || best.scale > one)) return best;
  }
  return { lines: [clip(text, width, one)], scale: one };
}

export function shareImage(c: CardData): Buffer {
  const W = SHARE_W, H = SHARE_H;
  const col = STYLE_COLORS[c.style];
  const main = hex(col.main), dark = hex(col.dark), light = hex(col.light);
  const rare = c.rarity !== "COMMON";
  const cv = new Canvas(W, H);

  // The background: the style's dark colour fading to night, lit from behind the fighter.
  const glow = { x: 330, y: 400, r: 430 };
  for (let y = 0; y < H; y++) {
    const base = mix(mix(dark, NIGHT, 0.45), NIGHT, y / H);
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - glow.x, (y - glow.y) * 1.15) / glow.r;
      const lit = d < 1 ? (1 - d) ** 2 * 0.6 : 0;
      const i = (y * W + x) * 3;
      const px = mix(base, main, lit);
      cv.px[i] = Math.round(px[0]);
      cv.px[i + 1] = Math.round(px[1]);
      cv.px[i + 2] = Math.round(px[2]);
    }
  }

  // The floor shadow and the fighter, as big as fits (whole-number scales when close: crisper pixels).
  const floor = 568;
  for (let y = floor - 26; y < floor + 26; y++) {
    for (let x = 330 - 210; x < 330 + 210; x++) {
      const e = ((x - 330) / 210) ** 2 + ((y - floor) / 24) ** 2;
      if (e < 1) cv.blend(x, y, NIGHT, 0.5 * (1 - e));
    }
  }
  if (c.art) {
    try {
      const png = readPng(c.art);
      const rgba = toRgba(png);
      const fit = Math.min(470 / png.width, 480 / png.height);
      const k = Math.floor(fit) >= 1 && Math.floor(fit) >= 0.8 * fit ? Math.floor(fit) : fit;
      const w = Math.round(png.width * k), h = Math.round(png.height * k);
      const left = Math.round(330 - w / 2), top = floor - h;
      for (let y = 0; y < h; y++) {
        const sy = Math.min(png.height - 1, Math.floor(y / k));
        for (let x = 0; x < w; x++) {
          const sx = Math.min(png.width - 1, Math.floor(x / k));
          const i = (sy * png.width + sx) * 4;
          cv.blend(left + x, top + y, [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!], rgba[i + 3]! / 255);
        }
      }
    } catch {
      cv.text("?", 330 - 30, 300, 14, main);
    }
  } else {
    cv.text("?", 330 - 30, 300, 14, main);
  }

  // The words, on the right.
  const x0 = 660, room = W - x0 - 56;
  let y = 64;
  cv.text(STYLE_NAME[c.style], x0, y, 4, light);
  if (rare) {
    const label = c.rarity === "LEGENDARY" ? "LEGENDARY" : "RARE";
    cv.text(label, W - 56 - textWidth(label, 4), y, 4, GOLD);
  }
  y += 50;
  const name = nameLayout(c.name, room);
  name.lines.forEach((line, i) => {
    if (i > 0) y += GLYPH_HEIGHT * name.scale + 10;
    cv.text(line, x0, y, name.scale, WHITE);
  });
  y += GLYPH_HEIGHT * name.scale + 16;
  if (c.fighterName) {
    cv.text(clip(c.fighterName, room, 3), x0, y, 3, DIM);
    y += 34;
  }
  y += 18;
  const facts = [c.tier ? `TIER ${c.tier}` : "", c.rating !== null ? `RATING ${c.rating}` : ""].filter(Boolean).join("   ");
  if (facts) {
    cv.text(clip(facts, room, 4), x0, y, 4, WHITE);
    y += 46;
  }
  if (c.record) {
    cv.text(clip(`${c.record.wins} WINS  ${c.record.losses} LOSSES`, room, 4), x0, y, 4, WHITE);
    y += 46;
  }
  if (c.title) {
    cv.text(clip(c.title, room, 4), x0, y, 4, GOLD);
    y += 46;
  }
  if (c.firstEdition && c.serial) {
    cv.text(`FIRST EDITION ${String(c.serial).padStart(3, "0")}`, x0, y, 3, GOLD);
    y += 34;
  }
  if (c.owner) cv.text(clip(`OWNED BY ${c.owner}`, room, 3), x0, y, 3, DIM);
  else if (c.kind === "character") cv.text("HOUSE FIGHTER", x0, y, 3, DIM);

  // The mark.
  cv.text("GREED ISLAND", x0, H - 120, 6, GOLD);
  cv.text("AI FIGHTERS, LIVE ON STREAM", x0, H - 66, 3, DIM);

  // The frame: the style's colour, or gold for rare fighters.
  const frame = rare ? GOLD : main;
  const edge = rare ? mix(GOLD, WHITE, 0.45) : light;
  cv.rect(0, 0, W, 14, frame);
  cv.rect(0, H - 14, W, H, frame);
  cv.rect(0, 0, 14, H, frame);
  cv.rect(W - 14, 0, W, H, frame);
  for (const [a, b, c2, d] of [[14, 14, W - 14, 16], [14, H - 16, W - 14, H - 14], [14, 14, 16, H - 14], [W - 16, 14, W - 14, H - 14]] as const) cv.rect(a, b, c2, d, edge, 0.8);

  return writePng({ width: W, height: H, colorType: 2, pixels: cv.px });
}
