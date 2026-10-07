/**
 * The "Night Club fighters" sprite sheets (Puffolotti, CC0; art/SOURCES.md): women wrestlers on exactly the
 * Universal Prototype 2 sheet's layout, like the Bad Company sheets (the same 30 x 180 grid, the same pose in the
 * same cell; checked by eye on stance, attack, crouch and knockdown cells), so any move set on that sheet goes on
 * these bodies with `onBody`. Each sheet has its own cell size; axis and localcoord are measured on the stance
 * cell (1386) against Universal Prototype 2's (feet 34 pixels left of the axis, lowest pixel 2 below it,
 * 159 pixels tall at localcoord 506), so they stand at the same height on screen. Barbara's sheet doesn't follow
 * the grid and isn't used yet.
 *
 * Their palettes are 3D renders quantised to 100-160 colours, not laid out by part, so outfits recolour by hue
 * (`PaletteSpec.shifts`).
 */
import { onBody } from "./bad-company.ts";
import type { ArtSource, TemplateSpec } from "./spec.ts";
import { UNIVERSAL_PROTOTYPE_2 } from "./universal-prototype-2.ts";

const PAGE = "https://opengameart.org/content/night-club-fighters-assorted-reasonably-skimpy-dressed-female-wrestlers-universal-prototype";

function nightClub(name: string, art: Pick<ArtSource, "file" | "sha256" | "cellWidth" | "cellHeight" | "axis" | "localcoord">): ArtSource {
  return {
    ...UNIVERSAL_PROTOTYPE_2,
    ...art,
    id: `night-club-${name}`,
    file: `art/sources/night-club/${art.file}`,
    stray: [],
    credit: `Sprites: Night Club fighters (Universal Prototype 2 for scrolling beat 'em up or MUGEN) by Puffolotti (CC0), ${PAGE}`,
  };
}

/** Anastasia: short fair hair, a green crop top, camo trousers and yellow laced boots. 166 pixels tall. */
export const ANASTASIA = nightClub("anastasia", {
  file: "anastasia_spritesheet.png",
  sha256: "7a8cf9f0bd852cea2a4b0d99ab5a37ceb2624729477917302102480b0ab40526",
  cellWidth: 339,
  cellHeight: 258,
  axis: { x: 170, y: 233 },
  localcoord: 528,
});

/** Anastasia drawn in a cartoon shade: red hair, a white top and olive cargo trousers with knee pads. 166 pixels tall. */
export const ANASTASIA_CARTOON = nightClub("anastasia-cartoon", {
  file: "anastasia_cartoon_spritesheet.png",
  sha256: "460d50bdef9c1d47f9cc58657ca643361bafcafbd10954bfa9b10161e5eef3b3",
  cellWidth: 339,
  cellHeight: 258,
  axis: { x: 170, y: 233 },
  localcoord: 528,
});

/** Cindy: blonde, in a white and pale blue dress with a purple belt and dark boots. 162 pixels tall. */
export const CINDY = nightClub("cindy", {
  file: "cindy_spritesheet.png",
  sha256: "f71573e61b08b74755a7f0c051bd0cb875abff1d41b9d03434385a2aa095d3d7",
  cellWidth: 334,
  cellHeight: 253,
  axis: { x: 170, y: 229 },
  localcoord: 515,
});

/** Diana: a red crop of hair and a green armoured bodysuit. 174 pixels tall. */
export const DIANA = nightClub("diana", {
  file: "diana_spritesheet.png",
  sha256: "88bfed36c6a93927d6b30a94a1a57525a5274fcee7ab0f07d711d239daeae18c",
  cellWidth: 349,
  cellHeight: 262,
  axis: { x: 176, y: 241 },
  localcoord: 554,
});

/** Erika: an adventurer in a brimmed hat, an olive top, a leather harness and brown leather trousers. 175 pixels tall. */
export const ERIKA = nightClub("erika", {
  file: "erika_spritesheet.png",
  sha256: "f9782cc2e81f660747cf3c5257d99bb537eaf8835c2008e5c37168df073cdc61",
  cellWidth: 360,
  cellHeight: 270,
  axis: { x: 180, y: 244 },
  localcoord: 557,
});

/** A house fighter's move set on a Night Club body (no colours: outfits are hue shifts on the sheet's own palette). */
export const onNightClub = (spec: TemplateSpec, art: ArtSource): TemplateSpec => onBody(spec, art);
