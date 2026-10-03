/**
 * Recolouring a fighter in a picture's main colours (NFT looks, docs/PHASE3.md
 * "NFTs as fighters"). The picture's main colours are found with its
 * background left out; the fighter's palette is split into colour groups
 * (the shades of one colour: a shirt, the skin), and each group takes one main
 * colour, keeping its shading. Works in OKLab, where lightness and colour are
 * separate, so outlines stay dark and highlights stay light. Pure.
 */
import { quantize } from "./quantize.ts";

/** OKLab: lightness 0-1, then two colour axes (about -0.4 to 0.4). */
export type Lab = [number, number, number];

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toByte = (c: number) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055)));

/** An RGB number (0xRRGGBB) in OKLab. */
export function oklab(rgb: number): Lab {
  const r = toLinear((rgb >> 16) & 255), g = toLinear((rgb >> 8) & 255), b = toLinear(rgb & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Back to an RGB number, each channel clamped into range. */
export function fromOklab([L, a, b]: Lab): number {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = toByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return (r << 16) | (g << 8) | bl;
}

const distance = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How many of the main colours to find, how far apart (OKLab) they have to be, and how much of the picture each has to cover (smaller accents, like eyes, are left out). */
const MAIN_COLORS = 4;
const MIN_APART = 0.08;
const MIN_SHARE = 0.08;
/** Pictures are looked at no bigger than this a side. */
const SAMPLE_SIDE = 256;
/** The background spreads between neighbouring pixels this close in colour (OKLab), so gradients count too. */
const BACKGROUND_STEP = 0.03;

/**
 * Which pixels are background: flooded from the top edge and the upper two
 * thirds of the sides (where a portrait's subject rarely reaches; its body
 * often fills the bottom edge) through neighbours of nearly the same colour.
 */
function backgroundOf(labs: (Lab | null)[], width: number, height: number): Uint8Array {
  const bg = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (labs[i] && !bg[i]) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) seed(x);
  for (let y = 0; y < Math.ceil((height * 2) / 3); y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width, y = (i - x) / width;
    for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
      if (j < 0 || bg[j] || !labs[j] || distance(labs[i]!, labs[j]!) > BACKGROUND_STEP) continue;
      bg[j] = 1;
      stack.push(j);
    }
  }
  return bg;
}

/**
 * A picture's main colours (RGB numbers, most used first, up to `max`): its
 * opaque pixels without the background (`backgroundOf`, unless that's nearly
 * all of it), reduced to 16 colours; close ones count together, and those
 * covering enough of the picture are kept.
 */
export function mainColors(rgba: Uint8Array, width: number, height: number, max = MAIN_COLORS): number[] {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / SAMPLE_SIDE));
  const w = Math.ceil(width / step), h = Math.ceil(height / step);
  const rgb: number[] = new Array(w * h).fill(-1);
  const labs: (Lab | null)[] = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * step * width + x * step) * 4;
      if (rgba[i + 3]! < 128) continue;
      rgb[y * w + x] = (rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!;
      labs[y * w + x] = oklab(rgb[y * w + x]!);
    }
  }
  const bg = backgroundOf(labs, w, h);
  const tally = (skipBackground: boolean) => {
    const counts = new Map<number, number>();
    rgb.forEach((c, i) => {
      if (c >= 0 && !(skipBackground && bg[i])) counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    return counts;
  };
  const total = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  let counts = tally(true);
  // A picture that's nearly all "background" is all subject.
  if (total(counts) < total(tally(false)) * 0.05) counts = tally(false);
  if (counts.size === 0) return [];
  const { palette, index } = quantize(counts, 16);
  const weight = palette.map(() => 0);
  for (const [c, n] of counts) weight[index.get(c)!]! += n;
  // Close colours count together (shades of one area), then the most used that are far enough apart, each covering enough of the picture.
  const order = palette.map((c, i) => ({ c, w: weight[i]!, lab: oklab(c) })).sort((p, q) => q.w - p.w || p.c - q.c);
  const all = total(counts);
  const picked: { c: number; w: number; lab: Lab }[] = [];
  for (const o of order) {
    const near = picked.find((p) => distance(p.lab, o.lab) < MIN_APART);
    if (near) near.w += o.w;
    else picked.push({ ...o });
  }
  const main = picked.filter((p) => p.w >= all * MIN_SHARE).sort((p, q) => q.w - p.w || p.c - q.c);
  return (main.length ? main : picked.slice(0, 1)).slice(0, max).map((p) => p.c);
}

/** How far a group's lightness moves towards its target's (the rest of the shading is the fighter's own). */
const LIGHTNESS_SHIFT = 0.6;
/** Two colour groups join when at least this share of the smaller one's edge touches the other... */
const MIN_AFFINITY = 0.4;
/** ...and their colours are this close (OKLab colour axes over lightness), or, when both are already areas (AREA_SHADES shades or more each), this close. */
const MAX_JOIN_DISTANCE = 0.3;
const MAX_AREA_JOIN_DISTANCE = 0.05;
const AREA_SHADES = 3;
/** Groups darker than this on average (outlines) keep their colours. */
const MIN_GROUP_LIGHTNESS = 0.2;

/** Pairs of palette indices `i < j`, as one key. */
const pairKey = (i: number, j: number) => (i < j ? i * 256 + j : j * 256 + i);

/**
 * How often two palette indices are drawn side by side in `images` (pixels
 * next to each other across or down, both drawn, different indices), keyed
 * `i * 256 + j` with i < j.
 */
export function paletteAdjacency(images: Iterable<{ width: number; height: number; pixels: Uint8Array }>): Map<number, number> {
  const out = new Map<number, number>();
  const add = (a: number, b: number) => {
    if (a === 0 || b === 0 || a === b) return;
    const k = pairKey(a, b);
    out.set(k, (out.get(k) ?? 0) + 1);
  };
  for (const img of images) {
    const { width: w, height: h, pixels: p } = img;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = p[y * w + x]!;
        if (x + 1 < w) add(v, p[y * w + x + 1]!);
        if (y + 1 < h) add(v, p[(y + 1) * w + x]!);
      }
    }
  }
  return out;
}

export interface Recolor {
  /** The fighter's palette: 256 RGB triples, index 0 transparent. */
  palette: Uint8Array;
  /** How many pixels are drawn with each palette index. */
  usage: ArrayLike<number>;
  /** Which indices are drawn next to each other, and how often (`paletteAdjacency` of its sprites). */
  adjacency: ReadonlyMap<number, number>;
  /** The colours to use, most important first (RGB numbers). */
  targets: readonly number[];
  /** Palette indices left as they are (besides 0, always kept). */
  keep?: ReadonlySet<number>;
}

interface Group {
  members: { i: number; lab: Lab; w: number }[];
  w: number;
  /** Weighted sums of the grouping position, and of lightness. */
  fa: number;
  fb: number;
  L: number;
  /** Edge pixels between its members, and its members' edges with every other drawn index. */
  internal: number;
  edges: number;
}

/**
 * The palette recoloured. Its drawn colours are first grouped into areas
 * (a shirt's shades, the skin): colours join when much of the smaller one's
 * edge in the sprites touches the other and their colours are close enough
 * (OKLab colour axes over lightness, since darker shades are also less
 * colourful; two areas of several shades each only when nearly the same
 * colour, so skin and an orange shirt stay apart). The groups drawn most take the targets in order, one each; the
 * rest, and near-black outlines, keep their colours. Each shade moves part of
 * the way to its target's lightness (less near black and white) and takes
 * the target's colour (fading out towards black and white).
 */
export function recolorPalette(r: Recolor): Uint8Array {
  const out = r.palette.slice();
  const feature = (p: Lab): [number, number] => [p[1] / Math.max(p[0], 0.2), p[2] / Math.max(p[0], 0.2)];
  const edgesOf = new Map<number, number>();
  for (const [k, n] of r.adjacency) for (const i of [Math.floor(k / 256), k % 256]) edgesOf.set(i, (edgesOf.get(i) ?? 0) + n);
  const groups = new Map<number, Group>();
  for (let i = 1; i < 256; i++) {
    if (!(r.usage[i]! > 0) || r.keep?.has(i)) continue;
    const lab = oklab((r.palette[i * 3]! << 16) | (r.palette[i * 3 + 1]! << 8) | r.palette[i * 3 + 2]!);
    const w = r.usage[i]!;
    const [fa, fb] = feature(lab);
    groups.set(i, { members: [{ i, lab, w }], w, fa: fa * w, fb: fb * w, L: lab[0] * w, internal: 0, edges: edgesOf.get(i) ?? 0 });
  }
  if (groups.size === 0 || r.targets.length === 0) return out;
  // Edge pixels between groups (by their first member's index).
  const between = new Map<number, number>();
  for (const [k, n] of r.adjacency) {
    const a = Math.floor(k / 256), b = k % 256;
    if (groups.has(a) && groups.has(b)) between.set(pairKey(a, b), n);
  }
  const centre = (g: Group): [number, number] => [g.fa / g.w, g.fb / g.w];
  for (;;) {
    let best: [number, number] | null = null, bestAffinity = MIN_AFFINITY;
    for (const [k, n] of between) {
      const a = groups.get(Math.floor(k / 256))!, b = groups.get(k % 256)!;
      const border = Math.min(a.edges - 2 * a.internal, b.edges - 2 * b.internal);
      if (border <= 0) continue;
      const affinity = n / border;
      const [ca, cb] = [centre(a), centre(b)];
      const reach = a.members.length >= AREA_SHADES && b.members.length >= AREA_SHADES ? MAX_AREA_JOIN_DISTANCE : MAX_JOIN_DISTANCE;
      if (affinity >= bestAffinity && Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) <= reach) {
        if (affinity > bestAffinity || !best || k < pairKey(...best)) [best, bestAffinity] = [[Math.floor(k / 256), k % 256], affinity];
      }
    }
    if (!best) break;
    // Join the second group into the first, and move its edges over.
    const [ka, kb] = best;
    const a = groups.get(ka)!, b = groups.get(kb)!;
    a.internal += b.internal + between.get(pairKey(ka, kb))!;
    a.members.push(...b.members);
    a.w += b.w;
    a.fa += b.fa;
    a.fb += b.fb;
    a.L += b.L;
    a.edges += b.edges;
    groups.delete(kb);
    between.delete(pairKey(ka, kb));
    for (const [k, n] of [...between]) {
      const x = Math.floor(k / 256), y = k % 256;
      if (x !== kb && y !== kb) continue;
      between.delete(k);
      const other = x === kb ? y : x;
      const nk = pairKey(ka, other);
      between.set(nk, (between.get(nk) ?? 0) + n);
    }
  }
  const ranked = [...groups.values()].filter((g) => g.L / g.w >= MIN_GROUP_LIGHTNESS).sort((p, q) => q.w - p.w || p.members[0]!.i - q.members[0]!.i);
  ranked.slice(0, r.targets.length).forEach((g, n) => {
    const t = oklab(r.targets[n]!);
    const gL = g.L / g.w;
    for (const it of g.members) {
      const L = it.lab[0];
      const L2 = clamp01(L + (t[0] - gL) * LIGHTNESS_SHIFT * clamp01(Math.min(L / 0.3, (1 - L) / 0.1)));
      const fade = clamp01(Math.min(L2 / 0.25, (1 - L2) / 0.12));
      const rgb = fromOklab([L2, t[1] * fade, t[2] * fade]);
      out.set([(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255], it.i * 3);
    }
  });
  return out;
}

/**
 * A palette as an ACT file for a character's .def (`pal1 = look.act`): 256
 * RGB triples, last index first, which is how the engine reads them
 * (`readActPalette`, src/image.go:613; index 0 drawn transparent).
 */
export function actFile(palette: Uint8Array): Buffer {
  const out = Buffer.alloc(768);
  for (let i = 0; i < 256; i++) out.set(palette.subarray(i * 3, i * 3 + 3), (255 - i) * 3);
  return out;
}
