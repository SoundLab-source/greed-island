/**
 * A rig fighter's look (rig/skeleton.ts): its parts, drawn in code from
 * simple shapes, and its materials (skin, hair, jacket...), each a colour that
 * the palette turns into three shades plus a shared outline. Outfits recolour
 * materials, so every outfit keeps the shading.
 *
 * A part is drawn along its bone: `u` runs from the joint (0) to the bone's
 * end (its length), and `v` across it, positive towards the fighter's front
 * whichever way the bone points. So a shape at v > 0 on the torso is on the
 * chest, and on the head it is the face.
 */
import type { BoneId, Proportions } from "./skeleton.ts";

export type Tone = "light" | "mid" | "dark";

/** One shape of a part. Shaded like a rounded surface lit from the front and above, unless `flat`. */
export type Shape =
  /** A rounded bar from u0 to u1 along the bone, radius r0 at u0 and r1 at u1, centred at v. */
  | { kind: "capsule"; u0: number; u1: number; r0: number; r1: number; v?: number; material: string; tone?: Tone; flat?: boolean; outline?: boolean }
  | { kind: "ellipse"; u: number; v: number; ru: number; rv: number; material: string; tone?: Tone; flat?: boolean; outline?: boolean }
  /** A polygon, points as [u, v]. */
  | { kind: "poly"; points: readonly (readonly [number, number])[]; material: string; tone?: Tone; flat?: boolean; outline?: boolean };

/**
 * A part drawn as a picture (by an artist, on the parts guide: rig/parts-sheet.ts) instead of shapes: palette
 * indices from IMAGE_FIRST, 0 transparent. The bone runs from `pivot` along `u` (a unit step in the picture), and
 * the fighter's front is along `v`.
 */
export interface PartImage {
  width: number;
  height: number;
  pixels: Uint8Array;
  pivot: { x: number; y: number };
  u: { x: number; y: number };
  v: { x: number; y: number };
}

/** A part: its shapes, later ones drawn over earlier ones, or a picture. Its outline is drawn round all of it. */
export interface Part {
  shapes: readonly Shape[];
  /** Hands only: the fist (default) and the open hand, when they differ. */
  open?: readonly Shape[];
  /** Drawn instead of the shapes. */
  image?: PartImage;
  openImage?: PartImage;
}

export interface Design {
  /** Material name → base colour "#rrggbb" (palette 1). */
  materials: Readonly<Record<string, string>>;
  /** Part per bone, the far side's usually the same as the near side's. The hip has no part (the torso covers it). */
  parts: Readonly<Partial<Record<BoneId, Part>>>;
  /** The outline colour (default a near-black). */
  outline?: string;
  /** Colours of drawn parts (Part.image), palette IMAGE_FIRST on; each gets a darker copy for the far side. */
  imageColors?: readonly string[];
  proportions?: Partial<Proportions>;
}

/** Palette index of the outline; every material takes the three after the last. Up to 30 materials (indices to 91). */
export const OUTLINE_INDEX = 1;
const FIRST_MATERIAL = 2;
const TONES: readonly Tone[] = ["light", "mid", "dark"];
/** Drawn parts' colours: up to IMAGE_COLORS of them from here, and their far-side shades IMAGE_COLORS after. */
export const IMAGE_FIRST = 100;
export const IMAGE_COLORS = 50;
/** Effect colours (streaks, sparks) go from here up to 239, below the energy ball's slots (templates/projectile.ts). */
export const FX_FIRST = 200;
export const FX_LAST = 239;

export function materialNames(design: Design): string[] {
  return Object.keys(design.materials);
}

/** The palette index of a material's tone. The far side is drawn a shade darker (`back`). */
export function materialIndex(design: Design, material: string, tone: Tone, back = false): number {
  const k = materialNames(design).indexOf(material);
  if (k < 0) throw new Error(`unknown material ${material}`);
  const t = Math.min(2, TONES.indexOf(tone) + (back ? 1 : 0));
  return FIRST_MATERIAL + k * 3 + t;
}

function hexToRgb(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (!m) throw new Error(`bad colour ${c}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

const toHex = (rgb: readonly number[]) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/**
 * The three shades of a colour: lighter and a touch warmer, as given, and
 * darker and a touch cooler (how painters shade, so it doesn't look muddy).
 */
export function shades(color: string): Record<Tone, string> {
  const [r, g, b] = hexToRgb(color);
  const light = [r + (255 - r) * 0.28 + 6, g + (255 - g) * 0.28 + 2, b + (255 - b) * 0.22];
  const dark = [r * 0.62, g * 0.64, b * 0.72 + 8];
  return { light: toHex(light), mid: toHex([r, g, b]), dark: toHex(dark) };
}

/** Palette entries (index → colour) for a set of material colours: what palette 1 or an outfit gives. */
export function materialColors(design: Design, colors: Readonly<Record<string, string>>): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [name, color] of Object.entries(colors)) {
    const s = shades(color);
    for (const t of TONES) out[materialIndex(design, name, t)] = s[t];
  }
  return out;
}

/** The whole 256-colour palette for the design's own colours (index 0 transparent, black where unused). */
export function designPalette(design: Design, fx: Readonly<Record<number, string>> = {}): Uint8Array {
  if (materialNames(design).length > 30) throw new Error("a design has at most 30 materials");
  const pal = new Uint8Array(768);
  const set = (i: number, c: string) => pal.set(hexToRgb(c), i * 3);
  set(OUTLINE_INDEX, design.outline ?? "#1a1420");
  for (const [i, c] of Object.entries(materialColors(design, design.materials))) set(Number(i), c);
  const images = design.imageColors ?? [];
  if (images.length > IMAGE_COLORS) throw new Error(`a design's drawn parts have at most ${IMAGE_COLORS} colours`);
  images.forEach((c, k) => {
    set(IMAGE_FIRST + k, c);
    set(IMAGE_FIRST + IMAGE_COLORS + k, shades(c).dark);
  });
  for (const [i, c] of Object.entries(fx)) {
    if (Number(i) < FX_FIRST || Number(i) > FX_LAST) throw new Error(`effect colour ${i} should be ${FX_FIRST}-${FX_LAST}`);
    set(Number(i), c);
  }
  return pal;
}

/** Problems with a design that would draw wrongly. */
export function checkDesign(design: Design): string[] {
  const problems: string[] = [];
  const names = new Set(materialNames(design));
  for (const [name, c] of Object.entries(design.materials)) if (!/^#[0-9a-f]{6}$/i.test(c)) problems.push(`material ${name}: bad colour ${c}`);
  for (const [bone, part] of Object.entries(design.parts)) {
    for (const s of [...part.shapes, ...(part.open ?? [])]) if (!names.has(s.material)) problems.push(`${bone}: unknown material ${s.material}`);
    if (part.shapes.length === 0 && !part.image) problems.push(`${bone}: no shapes`);
  }
  if (names.size > 30) problems.push("more than 30 materials");
  if ((design.imageColors?.length ?? 0) > IMAGE_COLORS) problems.push(`more than ${IMAGE_COLORS} colours in the drawn parts`);
  return problems;
}
