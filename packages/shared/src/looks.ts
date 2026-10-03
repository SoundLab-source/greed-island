/**
 * NFT looks (docs/PHASE3.md "NFTs as fighters"). A verified holder gives
 * their copy of their community's fighter their NFT's look: its image as the
 * portrait, its main colours on the name plate and on the fighter's sprites
 * (a character of its own, orchestrator `look-sprites.ts`). A look is cosmetic only, and
 * stays with the character for good, like its titles. Pure rules.
 */

export interface PlateColors {
  background: string;
  border: string;
  text: string;
}

/** A look as frozen into a fight's cosmetics. */
export interface LookCosmetic {
  id: string;
  /** The NFT's name. */
  name: string;
  /** Name plate colours taken from the image, when they could be read. */
  colors: PlateColors | null;
  /** The look's own character (the fighter's sprites in the NFT's colours), which the fight plays in colour 1; absent when the sprites weren't recoloured. */
  defPath?: string;
}

/** A look character's .def: ours, named after the look (chars/gi-look-<id without dashes>/...). */
const LOOK_DEF = /^chars\/(gi-look-[0-9a-f]{32})\/\1\.def$/;

const HEX = /^#[0-9a-f]{6}$/;

export function parsePlateColors(v: unknown): PlateColors | null {
  if (v === null || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const ok = (x: unknown): x is string => typeof x === "string" && HEX.test(x);
  return ok(c["background"]) && ok(c["border"]) && ok(c["text"]) ? { background: c["background"], border: c["border"], text: c["text"] } : null;
}

export function parseLookCosmetic(v: unknown): LookCosmetic | undefined {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const l = v as Record<string, unknown>;
  if (typeof l["id"] !== "string" || typeof l["name"] !== "string") return undefined;
  const defPath = typeof l["defPath"] === "string" && LOOK_DEF.test(l["defPath"]) ? l["defPath"] : undefined;
  return { id: l["id"], name: l["name"].slice(0, 80), colors: parsePlateColors(l["colors"]), ...(defPath ? { defPath } : {}) };
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Name plate colours from an image's pixels (RGBA, 4 bytes each): the most
 * common colour, darkened, as the background; the most vivid common colour,
 * brightened if needed, as the border; light or dark text for contrast.
 * Transparent pixels are ignored. Null when there's nothing to read.
 */
export function plateColorsFromPixels(rgba: Uint8Array): PlateColors | null {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return null;
  // Sample at most ~40,000 pixels, evenly.
  const step = Math.max(1, Math.floor(pixels / 40_000));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels; i += step) {
    const o = i * 4;
    if (rgba[o + 3]! < 128) continue;
    const [r, g, b] = [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const k = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    k.n++;
    k.r += r;
    k.g += g;
    k.b += b;
    buckets.set(key, k);
  }
  if (buckets.size === 0) return null;
  const colors = [...buckets.entries()]
    .map(([key, k]) => ({ key, n: k.n, r: k.r / k.n, g: k.g / k.n, b: k.b / k.n }))
    .sort((a, b) => b.n - a.n || a.key - b.key);
  const dominant = colors[0]!;
  // The accent: vivid and common, and not the dominant colour.
  const accent =
    colors
      .slice(0, 16)
      .filter((c) => Math.abs(c.r - dominant.r) + Math.abs(c.g - dominant.g) + Math.abs(c.b - dominant.b) > 60)
      .sort((a, b) => saturation(b.r, b.g, b.b) * Math.sqrt(b.n) - saturation(a.r, a.g, a.b) * Math.sqrt(a.n) || a.key - b.key)[0] ?? dominant;
  const bg = { r: dominant.r * 0.35, g: dominant.g * 0.35, b: dominant.b * 0.35 };
  // Brighten the border until it stands out on the dark background.
  let border = { r: accent.r, g: accent.g, b: accent.b };
  for (let i = 0; i < 6 && luminance(border.r, border.g, border.b) < 0.45; i++) {
    border = { r: border.r + (255 - border.r) * 0.3, g: border.g + (255 - border.g) * 0.3, b: border.b + (255 - border.b) * 0.3 };
  }
  return {
    background: hex(bg.r, bg.g, bg.b),
    border: hex(border.r, border.g, border.b),
    text: luminance(bg.r, bg.g, bg.b) > 0.5 ? "#111827" : "#f9fafb",
  };
}

/** Why this look can't go on this character, or null. */
export function lookProblem(input: {
  userId: string;
  ownerUserId: string | null;
  characterFighterId: string;
  collection: { name: string; fighterId: string | null };
  /** Another character already wears this NFT's look. */
  usedElsewhere: boolean;
}): string | null {
  if (input.ownerUserId !== input.userId) return "you can only change the look of a character you own";
  if (input.collection.fighterId === null) return `${input.collection.name} doesn't have a community fighter yet`;
  if (input.collection.fighterId !== input.characterFighterId) return `${input.collection.name} looks are only for that community's fighter`;
  if (input.usedElsewhere) return "this NFT's look is already on another character (each NFT's look goes on one character)";
  return null;
}
