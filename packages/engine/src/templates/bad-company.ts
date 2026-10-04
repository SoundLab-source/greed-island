/**
 * The "Bad Company" sprite sheets (Puffolotti, CC0; art/SOURCES.md): about
 * twenty more fighter models (soldiers, punks, a big bruiser) on exactly the
 * Universal Prototype 2 sheet's layout: the same 30 x 180 grid of the same
 * animations, the same pose in the same cell (checked by eye on a sample of
 * moves). Each model has its own cell size, ground point and palette, so any
 * move set on that sheet (portToUp2 and the house fighters' moves) goes on
 * these bodies by swapping the art source and the colours (`onBody`).
 *
 * Their palettes keep Universal Prototype 2's slots for the same parts (skin
 * 5-8, shirt 25-28, trousers 29-32, boots from 37), with each model's own
 * extras; a model's colours are listed with it.
 */
import type { ArtSource, TemplateSpec } from "./spec.ts";
import { UNIVERSAL_PROTOTYPE_2 } from "./universal-prototype-2.ts";

const PAGE = "https://opengameart.org/content/bad-company-assorted-military-thugs-universal-prototype-2-for-scrolling-beat-em-up-or-mugen";

function badCompany(name: string, art: Pick<ArtSource, "file" | "sha256" | "cellWidth" | "cellHeight" | "axis" | "stray" | "localcoord">): ArtSource {
  return {
    ...UNIVERSAL_PROTOTYPE_2,
    ...art,
    id: `bad-company-${name}`,
    file: `art/sources/bad-company/${art.file}`,
    credit: `Sprites: Bad Company assorted military thugs (Universal Prototype 2 for scrolling beat 'em up or MUGEN) by Puffolotti (CC0), ${PAGE}`,
  };
}

/**
 * Banderas: a red-haired punk in a grey shirt, black trousers, green gloves
 * and green boots. Drawn about 5% bigger than the Universal Prototype 2 model,
 * so a localcoord 5% wider stands him at the same height on screen. Colours:
 * skin 5-8, eyes and brows 16, shirt 25-28, trousers 29-32, boots 37-48,
 * gloves 49-52, hair 53-56. Specks of 1-2 pixels a cell: browns (9-12), cyans
 * (17-20), greys (21-24), dark blues (68, 70, 72).
 */
export const BANDERAS = badCompany("banderas", {
  file: "banderas_big_spritesheet_0.png",
  sha256: "50d7962707ba510018cb87ab70415f1aa77361caa0757f1ab8ebb88fa2a31acc",
  cellWidth: 339,
  cellHeight: 258,
  axis: { x: 174, y: 234 },
  stray: [9, 10, 11, 12, 17, 18, 19, 20, 21, 22, 23, 24, 68, 70, 72],
  localcoord: 531,
});

/**
 * Adler: a big bruiser in a brown shirt and trousers, bare-handed. Drawn about
 * 28% bigger than the Universal Prototype 2 model; his localcoord stands him
 * about 5% taller than the others on screen (a heavyweight; at 12% taller his
 * longer reach won him 69% of his fights in the balance tool). Colours: skin
 * 5-8, hair 9-12, eyes and brows 16, shirt 25-28, trousers 29-32, boots 37-52.
 * Specks: cyans and greens (17-20), greys (21-24), dark blues (68, 70, 72).
 */
export const ADLER = badCompany("adler", {
  file: "adler_big_spritesheet_0.png",
  sha256: "f2874b205ae80e0a6ec2cb26836b1b3acbbb3c17702d569d5453992b23673fc1",
  cellWidth: 348,
  cellHeight: 305,
  axis: { x: 145, y: 277 },
  stray: [17, 18, 19, 20, 21, 22, 23, 24, 68, 70, 72],
  localcoord: 617,
});

/**
 * Boston: a shirtless punk with a pink mohawk, olive trousers, dark green
 * fingerless gloves and brown boots. Drawn about 6% bigger than the Universal
 * Prototype 2 model. Colours: skin 5-8, eyes and brows 16, trousers 29-32,
 * boots 37-48, gloves 49-52, hair 53-56. Specks: browns (9-12), blues
 * (17-20), greys (21-24), the shirt he doesn't wear (25-28), dark blues (68,
 * 70, 72).
 */
export const BOSTON = badCompany("boston", {
  file: "boston_big_spritesheet_0.png",
  sha256: "7f6c99b4466c54eeb0975187b08ca0513d4d6b484e2535dc2d32d135f8c6eff0",
  cellWidth: 341,
  cellHeight: 258,
  axis: { x: 175, y: 234 },
  stray: [9, 10, 11, 12, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 68, 70, 72],
  localcoord: 535,
});

/**
 * Fontaine: brown-haired, in a navy shirt and trousers, with dark gloves and
 * boots. Drawn the Universal Prototype 2 model's size. Colours: skin 5-8, hair
 * 9-12, eyes and brows 16, shirt 25-28, trousers 29-32, boots 37-48, gloves
 * 49-52. Specks: cyans (17-20), greys (21-24), dark blues (68, 70, 72).
 */
export const FONTAINE = badCompany("fontaine", {
  file: "fontaine_big_spritesheet_0.png",
  sha256: "997452d2dbe567abf55f171fef3c6d6d888109f125db3beea0cddde8c16000b9",
  cellWidth: 320,
  cellHeight: 251,
  axis: { x: 164, y: 229 },
  stray: [17, 18, 19, 20, 21, 22, 23, 24, 68, 70, 72],
  localcoord: 504,
});

/**
 * Rourke: blue-black hair, a grey tank top, olive trousers, dark green gloves
 * and brown boots. Drawn the Universal Prototype 2 model's size. Colours: skin
 * 5-8, eyes and brows 16, tank top 25-28, trousers 29-32, boots 37-48, gloves
 * 49-52, hair 53-56. Specks: greens (17-20), greys (21-24), dark blues (68, 72).
 */
export const ROURKE = badCompany("rourke", {
  file: "rourke_big_spritesheet_0.png",
  sha256: "3b7fa0d0e5b44b4d41548ef3db5fe1059d1da2ad8ef292e7d5cded26456e50c4",
  cellWidth: 324,
  cellHeight: 252,
  axis: { x: 166, y: 230 },
  stray: [17, 18, 19, 20, 21, 22, 23, 24, 68, 70, 72],
  localcoord: 509,
});

/** A move set on the Universal Prototype 2 layout, on another body: its own art, and no colours yet (each model's palette is its own). */
export function onBody(spec: TemplateSpec, art: ArtSource): TemplateSpec {
  return { ...spec, art, colors: {}, palettes: [] };
}
