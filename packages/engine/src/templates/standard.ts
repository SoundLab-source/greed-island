/**
 * MUGEN's standard get-hit sprites: the sprite numbers other characters'
 * throws borrow from whoever they throw (a throw's animation is the thrower's,
 * drawn with the victim's sprites: ChangeAnim2). The convention is Kung Fu
 * Man's (IKEMEN's chars/kfm/kfm.sff), and Fighter Factory checks for it:
 *
 *   5000 hit high, 5010 hit low, 5020 hit crouching (0, 10, 20: light to hard)
 *   5030 knocked back into the air, turning backwards: 0 and 10 leaning back,
 *        20 and 30 flat on the back, 40 and 50 head down
 *   5040 lying on the back (0 hitting the ground, 10 lying, 20 hit while down)
 *   5060 launched: 0 upright, 10 upside down
 *   5070 tripped forward: 0 and 10 tilting forward, 20 flat, head forward
 *
 * For the first six of those groups G, G+1 is the same picture with its axis
 * on the waist and G+2 with its axis on the head, so a throw can hold its
 * victim by the body or by the head. A missing sprite isn't drawn at all
 * (IKEMEN anim.go:684 and :473), so a fighter without these vanishes during
 * other characters' throws: the engine logged 5031,10, 5011,10 and 5062,0
 * missing on Midlife Crisis in our first fights against MUGEN characters.
 *
 * Several of Kung Fu Man's are one pose rotated (the tripped fall is his
 * upright pose turned 30, 60 and 90 degrees), and that's how the video
 * tutorials fill gaps too, so an art source may give a cell turned by a
 * number of degrees instead of a frame of its own.
 */
import type { SffSprite } from "../art/sff.ts";
import { bounds, crop, type IndexedImage } from "../art/sheet.ts";

/** A cell of the sheet, re-grounded on its lowest pixel (`feet`), or turned clockwise (as the fighter faces right) by `rotate` degrees, which also re-grounds it. */
export type StandardSprite = number | { cell: number; anchor?: "feet"; rotate?: number };

/** The groups that come in threes: G (feet), G+1 (waist), G+2 (head). */
export const STANDARD_FAMILIES = [5000, 5010, 5030, 5040, 5060, 5070] as const;

/** Every standard sprite a fighter needs (Kung Fu Man's base set); the waist and head copies are made from these. */
export const REQUIRED_STANDARD: readonly string[] = [
  ...[0, 10, 20].map((n) => `5000,${n}`),
  ...[0, 10, 20].map((n) => `5010,${n}`),
  ...[0, 10, 20].map((n) => `5020,${n}`),
  ...[0, 10, 20, 30, 40, 50].map((n) => `5030,${n}`),
  ...[0, 10, 20].map((n) => `5040,${n}`),
  ...[0, 10].map((n) => `5060,${n}`),
  ...[0, 10, 20].map((n) => `5070,${n}`),
];

/** Sprite groups a fighter's own animations must leave alone: the standard ones and their waist and head copies. */
export function reservedGroups(standard: Readonly<Record<string, StandardSprite>>): Set<number> {
  const set = new Set<number>([5020]);
  for (const g of STANDARD_FAMILIES) [g, g + 1, g + 2].forEach((x) => set.add(x));
  for (const key of Object.keys(standard)) set.add(Number(key.split(",")[0]));
  return set;
}

/** Which way the head points in the standard pose `group,number` (the fighter faces right, so back is left). */
export function headDirection(group: number, number: number): "up" | "down" | "left" | "right" {
  const base = group - ((group % 10) % 3);
  if (base === 5030) return number === 0 ? "up" : number <= 40 ? "left" : "down";
  if (base === 5040) return "left";
  if (base === 5060) return number >= 10 ? "down" : "up";
  if (base === 5070) return number === 0 ? "up" : "right";
  return "up";
}

/** Turn an image clockwise by `degrees` about its centre (nearest pixel), on a canvas big enough to hold it. */
export function rotateImage(img: IndexedImage, degrees: number): IndexedImage {
  // Rounded so quarter and half turns move every pixel exactly.
  const t = (degrees * Math.PI) / 180, cos = Math.round(Math.cos(t) * 1e9) / 1e9, sin = Math.round(Math.sin(t) * 1e9) / 1e9;
  const size = Math.ceil(Math.hypot(img.width, img.height)) + 2;
  const out = new Uint8Array(size * size);
  const cx = img.width / 2, cy = img.height / 2, c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Inverse rotation: where in the source this output pixel comes from (y points down, so clockwise is +).
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const sx = Math.floor(cx + dx * cos + dy * sin), sy = Math.floor(cy - dx * sin + dy * cos);
      if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) out[y * size + x] = img.pixels[sy * img.width + sx]!;
    }
  }
  return { width: size, height: size, pixels: out };
}

/** The middle of the drawn pixels: the body's centre, where a throw holds it by the waist. */
export function waistPoint(img: IndexedImage): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.pixels[y * img.width + x]) { sx += x; sy += y; n++; }
  if (n === 0) throw new Error("empty image");
  return { x: Math.round(sx / n), y: Math.round(sy / n) };
}

/**
 * The middle of the head: across the figure, the middle of its drawn pixels
 * in the last 12% towards `direction`; along it, 18% of the figure's length
 * in from that end (Kung Fu Man's head axes sit there).
 */
export function headPoint(img: IndexedImage, direction: "up" | "down" | "left" | "right"): { x: number; y: number } {
  const b = bounds(img);
  if (!b) throw new Error("empty image");
  const vertical = direction === "up" || direction === "down";
  const length = vertical ? b.y1 - b.y0 : b.x1 - b.x0;
  const band = Math.max(3, Math.round(length * 0.12)), inset = Math.round(length * 0.18);
  let sum = 0, n = 0;
  for (let y = b.y0; y < b.y1; y++) {
    for (let x = b.x0; x < b.x1; x++) {
      if (!img.pixels[y * img.width + x]) continue;
      const inBand = direction === "up" ? y < b.y0 + band : direction === "down" ? y >= b.y1 - band : direction === "left" ? x < b.x0 + band : x >= b.x1 - band;
      if (inBand) { sum += vertical ? x : y; n++; }
    }
  }
  const across = Math.round(sum / n);
  if (direction === "up") return { x: across, y: b.y0 + inset };
  if (direction === "down") return { x: across, y: b.y1 - 1 - inset };
  if (direction === "left") return { x: b.x0 + inset, y: across };
  return { x: b.x1 - 1 - inset, y: across };
}

/**
 * The standard sprites from an art source's table: each base pose (from its
 * cell, re-grounded or turned as the table says) and, for the families, its
 * waist and head copies. `cell` gives a cell's picture; `axis` is the sheet's
 * ground point in every cell.
 */
export function standardSprites(
  table: Readonly<Record<string, StandardSprite>>,
  cell: (index: number) => IndexedImage,
  axis: { x: number; y: number },
): SffSprite[] {
  const out: SffSprite[] = [];
  const families = new Set<number>(STANDARD_FAMILIES);
  for (const [key, entry] of Object.entries(table)) {
    const [group, number] = key.split(",").map(Number) as [number, number];
    const e = typeof entry === "number" ? { cell: entry } : entry;
    let image: IndexedImage, axisX: number, axisY: number;
    if (e.rotate) {
      const turned = rotateImage(cell(e.cell), e.rotate);
      const b = bounds(turned)!;
      image = crop(turned, b);
      axisX = Math.round(image.width / 2);
      axisY = image.height;
    } else {
      const img = cell(e.cell);
      const b = bounds(img)!;
      image = crop(img, b);
      axisX = axis.x - b.x0;
      axisY = e.anchor === "feet" ? b.y1 - b.y0 : axis.y - b.y0;
    }
    out.push({ group, number, image, axisX, axisY, palette: 0 });
    if (!families.has(group)) continue;
    const waist = waistPoint(image), head = headPoint(image, headDirection(group, number));
    out.push({ group: group + 1, number, image, axisX: waist.x, axisY: waist.y, palette: 0 });
    out.push({ group: group + 2, number, image, axisX: head.x, axisY: head.y, palette: 0 });
  }
  return out;
}

/** The required standard sprites an art source's table leaves out. */
export function missingStandard(table: Readonly<Record<string, StandardSprite>>): string[] {
  return REQUIRED_STANDARD.filter((k) => !(k in table));
}
