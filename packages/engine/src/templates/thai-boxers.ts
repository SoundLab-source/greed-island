/**
 * Six more Muay Thai house fighters: the other bodies of the Mustermenschen V1 Thai-boxing set (Puffolotti, CC0;
 * art/SOURCES.md), each on Camo Cobra's move list (templates/camo-cobra.ts `thaiBoxer`). Each body is its own GIF
 * on its own canvas, smaller than Rhivan's, so each is measured here (canvas, frame count, where its feet are in
 * frame 0, its height) and drawn at a localcoord that makes it about his size on screen. Most have Rhivan's 836
 * frames in the same order; three have a few more or fewer, so their frames are numbered like his through `map`
 * (lined up by comparing every frame's silhouette with his: every move he uses matched best that way). Their
 * colours are fully saturated and their skin isn't, so outfits recolour by hue (or, for Spotted Hyena, whose speckles
 * are the skin's saturation, by the speckles' exact hue).
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { thaiBoxer } from "./camo-cobra.ts";
import { HEAVY } from "./heavy.ts";
import { thaiStandard } from "./rhivan-thai.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { ArtSource, HueShift, TemplateSpec } from "./spec.ts";

const SET = "art/sources/mustermenschen";
const URL = "https://opengameart.org/content/musternenschen-v1-complete-collection";
/** Rhivan's on-screen size: 106 pixels at localcoord 340. */
const SIZE = 340 / 106;

interface Body {
  id: string;
  /** The GIF, and who it is in the set. */
  file: string;
  who: string;
  sha256: string;
  width: number;
  height: number;
  frames: number;
  /** Frame 0's body: its left and right edges and its lowest row (the feet), and how tall it is. */
  x0: number;
  x1: number;
  y1: number;
  tall: number;
  /** On-screen size against Rhivan's (1 = the same). */
  size?: number;
  map?: (n: number) => number;
}

function bodyArt(b: Body): ArtSource {
  return {
    id: b.id,
    file: `${SET}/${b.file}`,
    sha256: b.sha256,
    cellWidth: b.width,
    cellHeight: b.height,
    columns: 30,
    rows: Math.ceil(b.frames / 30),
    // Like Rhivan's (measured by hand at 47% across frame 0's body), on its lowest row.
    axis: { x: Math.round(b.x0 + 0.47 * (b.x1 - b.x0)), y: b.y1 },
    stray: [],
    localcoord: Math.round((SIZE * b.tall) / (b.size ?? 1)),
    standardSprites: thaiStandard(b.map),
    credit: `Sprites: Mustermenschen V1 (${b.who}, Thai boxing) by Puffolotti (CC0), ${URL}`,
  };
}

const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.85, ...more });

function boxer(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
  return thaiBoxer({
    art: bodyArt(o.body),
    base: o.base,
    id: o.id,
    name: o.name,
    ...(o.body.map ? { map: o.body.map } : {}),
    height: o.body.tall,
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
  });
}

/** In white tee and flame-camo trousers (reds, oranges and yellows). */
export const FIRE_ANT = boxer({
  body: { id: "ava-thai", file: "Ava Lee (adult) Thai boxe 05ABH008.gif", who: "Ava Lee", sha256: "df1aeddba3b37e93a1d3ca2d6791147f76a859458e6c3813d04ce0a9820c4304", width: 157, height: 109, frames: 836, x0: 47, x1: 92, y1: 101, tall: 79, size: 0.96 },
  id: "gi-fire-ant", name: "Fire Ant", base: RUSHDOWN,
  outfits: [
    ["Ice Camo", [shift(345, 15, 210), shift(15, 45, 190), shift(45, 70, 170)]],
    ["Toxic Camo", [shift(345, 15, 120), shift(15, 45, 90), shift(45, 70, 65)]],
    ["Royal Camo", [shift(345, 15, 275), shift(15, 45, 300), shift(45, 70, 320)]],
  ],
});

/** A yellow and navy tracksuit, purple hair. One frame fewer than Rhivan's from about 406 on. */
export const KILLER_BEE = boxer({
  body: { id: "byron-thai", file: "Byron Verlaine thai boxe 004ABH008.gif", who: "Byron Verlaine", sha256: "ee341cd8eb2db95ab10b93192ca280da563ccabd516ab839d70ed93d27b312bb", width: 143, height: 101, frames: 835, x0: 41, x1: 84, y1: 92, tall: 72, map: (n) => (n < 406 ? n : n - 1) },
  id: "gi-killer-bee", name: "Killer Bee", base: RUSHDOWN,
  outfits: [
    ["Hornet", [shift(45, 75, 2)]],
    ["Wasp", [shift(45, 75, 28)]],
    ["Mint", [shift(45, 75, 150)]],
  ],
});

/** Shirtless and blond, grey shorts, blue shoes, orange wraps. */
export const TAN_KANGAROO = boxer({
  body: { id: "danny-thai", file: "Danny Van Damage Thai boxe 06ABH008.gif", who: "Danny Van Damage", sha256: "f17908445678e21a925580ef32d7d90d3f320705b538806ec971e38c1c7c7808", width: 164, height: 115, frames: 836, x0: 49, x1: 97, y1: 104, tall: 82 },
  id: "gi-tan-kangaroo", name: "Tan Kangaroo", base: ALL_ROUNDER,
  // The shorts are pure greys (the skin is a little coloured, so a grey band with no saturation leaves it alone).
  outfits: [
    ["Red Shorts", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.08, 0.3], hue: 0, tint: 0.55 }, shift(200, 225, 0)]],
    ["Blue Shorts", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.08, 0.3], hue: 215, tint: 0.55 }, shift(200, 225, 30)]],
    ["Gold Shorts", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.08, 0.3], hue: 45, tint: 0.5 }, shift(200, 225, 45)]],
  ],
});

/** All in red, a white head wrap. */
export const SCARLET_IBIS = boxer({
  body: { id: "kelvin-area-thai", file: "Kelvin Area muai thai 06ACH008.gif", who: "Kelvin Area", sha256: "51faeae072f930b761d0e0e9481f0442ed57f8e83c04ca3664575a0a488cf0dd", width: 157, height: 109, frames: 836, x0: 47, x1: 92, y1: 100, tall: 78 },
  id: "gi-scarlet-ibis", name: "Scarlet Ibis", base: ALL_ROUNDER,
  outfits: [
    ["Blue Ibis", [shift(330, 10, 215)]],
    ["Green Ibis", [shift(330, 10, 130)]],
    ["Gold Ibis", [shift(330, 10, 45, { light: 1.3 })]],
  ],
});

/** A light blue hood and boots, grey and black. Three frames more than Rhivan's after his guard, five after 406. */
export const FROST_OWL = boxer({
  body: { id: "kelvin-zone-thai", file: "Kelvin Zone muai thai 06AAH008.gif", who: "Kelvin Zone", sha256: "55bb025e809fa3c43ba98c54862ac4db1a4d6f40117181e336bf6bd56cee3fb1", width: 164, height: 115, frames: 841, x0: 49, x1: 97, y1: 104, tall: 82, map: (n) => (n < 10 ? n : n < 406 ? n + 3 : n + 5) },
  id: "gi-frost-owl", name: "Frost Owl", base: RUSHDOWN,
  outfits: [
    ["Ember Owl", [shift(190, 215, 5, { minSat: 0.3 })]],
    ["Jade Owl", [shift(190, 215, 140, { minSat: 0.3 })]],
    ["Dusk Owl", [shift(190, 215, 275, { minSat: 0.3 })]],
  ],
});

/** Blond, in red and green speckles; the biggest of them. Two frames more than Rhivan's from about 406 on. */
export const SPOTTED_HYENA = boxer({
  body: { id: "raf-thai", file: "Raf Boulder Thai Boxe 04AEH008.gif", who: "Raf Boulder", sha256: "940e426e5cd514ccd0044867180b68e1ce5bb480eac8598e96455fbd88c656e6", width: 167, height: 117, frames: 838, x0: 49, x1: 99, y1: 108, tall: 86, size: 1.06, map: (n) => (n < 406 ? n : n + 2) },
  id: "gi-spotted-hyena", name: "Spotted Hyena", base: HEAVY,
  // The red speckles are exactly hue 0 and the skin 8-12, both about as saturated: told apart by hue.
  outfits: [
    ["Blue Spots", [{ from: 356, to: 4, minSat: 0.25, hue: 220 }, shift(130, 150, 185)]],
    ["Purple Spots", [{ from: 356, to: 4, minSat: 0.25, hue: 280 }, shift(130, 150, 320)]],
    ["Gold Spots", [{ from: 356, to: 4, minSat: 0.25, hue: 40, light: 1.2 }, shift(130, 150, 85)]],
  ],
});

export const THAI_BOXERS: readonly TemplateSpec[] = [FIRE_ANT, KILLER_BEE, TAN_KANGAROO, SCARLET_IBIS, FROST_OWL, SPOTTED_HYENA];
