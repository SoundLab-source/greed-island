/**
 * The Mustermenschen V1 collection (Puffolotti, CC0; art/SOURCES.md): about twenty people, each in one or more of
 * six fighting styles, every style one animated GIF per person with the same moves in the same order. Each GIF is
 * its own canvas, small (people 66-106 pixels tall), so each body is measured here (canvas, frame count, where its
 * feet are in frame 0, its height) and drawn at a localcoord that makes it about the first one's (Rhivan's) size on
 * screen. Bodies with a few frames more or fewer than their style's reference number their frames like it through
 * `map` (lined up by comparing every frame's silhouette).
 */
import type { ArtSource, HueShift } from "./spec.ts";
import type { StandardSprite } from "./standard.ts";

export const MUSTERMENSCHEN = "art/sources/mustermenschen";
export const MUSTERMENSCHEN_URL = "https://opengameart.org/content/musternenschen-v1-complete-collection";
/** Rhivan's on-screen size: 106 pixels at localcoord 340. */
const SIZE = 340 / 106;

export interface Body {
  id: string;
  /** The GIF (in art/sources/mustermenschen, or a path from there to another folder), and who it is. */
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
  /** Its frame number for each of the style's reference frame numbers (default: the same). */
  map?: (n: number) => number;
}

/** A body's art source: its GIF laid out 30 to a row, its standard get-hit sprites, credited to its style. */
export function bodyArt(b: Body, style: string, standardSprites: Readonly<Record<string, StandardSprite>>, source?: string): ArtSource {
  return {
    id: b.id,
    file: `${MUSTERMENSCHEN}/${b.file}`,
    sha256: b.sha256,
    cellWidth: b.width,
    cellHeight: b.height,
    columns: 30,
    rows: Math.ceil(b.frames / 30),
    // Like Rhivan's (measured by hand at 47% across frame 0's body), on its lowest row.
    axis: { x: Math.round(b.x0 + 0.47 * (b.x1 - b.x0)), y: b.y1 },
    stray: [],
    localcoord: Math.round((SIZE * b.tall) / (b.size ?? 1)),
    standardSprites,
    // `source`: a body published on its own page rather than in the collection.
    credit: source ? `Sprites: ${b.who} (${style}) by Puffolotti (CC0), ${source}` : `Sprites: Mustermenschen V1 (${b.who}, ${style}) by Puffolotti (CC0), ${MUSTERMENSCHEN_URL}`,
  };
}

/** Clothes in a hue band, to another hue: only well-saturated colours by default (skin rarely is). */
export const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.85, ...more });
