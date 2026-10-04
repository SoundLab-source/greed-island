/**
 * The Universal Prototype 2 sprite sheet (Puffolotti, CC0; art/SOURCES.md): a
 * second fighter model, a woman in a long coat with gold trim, on a 30 x 180
 * grid (5,400 cells). Its first 3,195 cells are the first sheet's animations
 * redrawn with this model, one cell later: cell n of the first sheet is cell
 * n + 1 here (checked by outline: 446 of the 454 cells the templates use
 * match at 0.8 or better, the rest at 0.76-0.8). The rest is new: fighting
 * styles the first sheet doesn't have.
 *
 *   3165-3194 handstand and compass kicks · 3195-3232 ginga (capoeira sway)
 *   3233-3246 cartwheel · 3247-3299 low moves, sweeps, a backflip at 3281-3287
 *   3300-3310 spinning kick · 3330-3374 flying and aerial kicks · 3375-3389 armada, handstand kick
 *   3435-3456 cartwheel kicks · 3466-3479 front kicks
 *   3878-4216 feral crouch: prowl, pounce, claws · 5246-5379 sumo: squat, shiko stomp, slaps, charge
 *
 * Its drawings are about 7% smaller than the first sheet's, so its localcoord
 * is 506 rather than 544: on screen the two models stand the same height,
 * and speeds and reach (in 320-wide units) mean the same.
 */
import type { AnimSpec, ArtSource, Cells, TemplateSpec } from "./spec.ts";
import { UNIVERSAL_PROTOTYPE } from "./universal-prototype.ts";

/** A first-sheet cell's place on this sheet. */
export const UP2_SHIFT = 1;

/** Cells of the first sheet, moved to this one. */
export function onUp2(cells: Cells): Cells {
  return Array.isArray(cells) ? (cells as number[]).map((c) => c + UP2_SHIFT) : { from: (cells as { from: number }).from + UP2_SHIFT, to: (cells as { to: number }).to + UP2_SHIFT };
}

export const UNIVERSAL_PROTOTYPE_2: ArtSource = {
  id: "universal-prototype-2",
  file: "art/sources/universal-prototype-2/big_spritesheet.png",
  sha256: "1c29ac38e8b863e969207bc29717b80525a6cbc4ad9c3fbcba95ded8e1998819",
  cellWidth: 324,
  cellHeight: 251,
  columns: 30,
  rows: 180,
  axis: { x: 166, y: 229 },
  // Specks of 1-2 pixels a cell: greys (3, 21-24), cyans (17-20) and blues (70, 72).
  stray: [3, 17, 18, 19, 20, 21, 22, 23, 24, 70, 72],
  localcoord: 506,
  // The first sheet's standard get-hit sprites, one cell later.
  standardSprites: Object.fromEntries(
    Object.entries(UNIVERSAL_PROTOTYPE.standardSprites).map(([slot, e]) => [slot, typeof e === "number" ? e + UP2_SHIFT : { ...e, cell: e.cell + UP2_SHIFT }]),
  ),
  credit: "Sprites: Universal Prototype 2 for scrolling beat 'em up or MUGEN by Puffolotti (CC0), https://opengameart.org/content/universal-prototype-2-for-scrolling-beat-em-up-or-mugen",
};

const shiftAnim = (a: AnimSpec): AnimSpec => ({ ...a, cells: onUp2(a.cells) });

/**
 * A template's moves on this sheet's model: every cell moved over, the
 * portrait found again from the pixels, and no colours yet (the first
 * sheet's palette indices mean other things here).
 */
export function portToUp2(spec: TemplateSpec): TemplateSpec {
  return {
    ...spec,
    art: UNIVERSAL_PROTOTYPE_2,
    anims: spec.anims.map(shiftAnim),
    attacks: spec.attacks.map((a) => ({ ...a, anim: shiftAnim(a.anim) })),
    ...(spec.throws ? { throws: spec.throws.map((t) => ({ ...t, reach: shiftAnim(t.reach), hold: t.hold.map((h) => ({ ...h, cell: h.cell + UP2_SHIFT })) })) } : {}),
    colors: {},
    palettes: [],
    portrait: { cell: spec.portrait.cell + UP2_SHIFT },
  };
}

/** Override a ported spec's animations by action and attacks by state (same numbers replace, new ones are added). */
export function withMoves(spec: TemplateSpec, over: { anims?: readonly AnimSpec[]; attacks?: TemplateSpec["attacks"] }): TemplateSpec {
  const anims = new Map(spec.anims.map((a) => [a.action, a]));
  for (const a of over.anims ?? []) anims.set(a.action, a);
  const attacks = new Map(spec.attacks.map((a) => [a.state, a]));
  for (const a of over.attacks ?? []) attacks.set(a.state, a);
  return { ...spec, anims: [...anims.values()], attacks: [...attacks.values()] };
}
