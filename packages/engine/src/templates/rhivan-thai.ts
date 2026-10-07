/**
 * "Rhivan male thai boxe" from Mustermenschen V1 (Puffolotti, CC0; art/SOURCES.md): 836 frames of a bald,
 * thickset Muay Thai fighter in camo trousers, a white tee and pink gloves, published as one animated GIF
 * (211 x 143, one 64-colour palette in five-step ramps: 1-5 camo green, 6-10 skin, 11-15 the tee and the camo's
 * white, 16-20 the camo's brown and the boots, 37-41 the gloves), laid out 30 to a row so frame n is cell n
 * (art/gif.ts). The frame catalogue behind the house fighter's choices:
 *
 *   0-9 bouncing guard · 10-14 jab · 15-21 cross · 22-29 lunging overhand · 49-57 push kick (teep)
 *   61-66 side kick · 66-72 high roundhouse · 75-83 jumping knee · 86-90 low kick · 96-101 covering up
 *   116-131 walking in guard · 372-378 spinning back fist · 458-466 cartwheel kick · 480-499 bouncing steps
 *   506-521 standing easy · 522-533 beckoning · 534-539 arms wide · 555-558 crouch · 559-561 crouching jab
 *   562-565 crouching straight · 567-571 crouching kick · 590-597 sweep · 618-630 jump · 638-645 forward roll
 *   653-662 hop · 669-674 air knee · 677-682 flying kick · 686-687 tuck · 688-691 hit high · 692-693 hit in the
 *   stomach · 694-696 hit crouching · 697-699 knocked back · 700-704 down · 705-706 launched · 707-709 falls
 *   forward · 710-712 gets up · 778-784 hands on his head · 786-798 flexing · 806-812 pointing
 *
 * About 105 pixels tall, under half the size of the Universal Prototype models, so he's drawn at localcoord
 * 340: a little taller than the Bad Company fighters on screen (at 315 he stood a head over Copper Tiger).
 * Frames aren't all rendered on one ground line, so every animation using them anchors each frame's lowest
 * pixel on the ground.
 */
import type { ArtSource } from "./spec.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

/** MUGEN's standard get-hit sprites in Rhivan's frame numbers (the set's other bodies map their own onto these). */
const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 688, "5000,10": 689, "5000,20": 690,
  "5010,0": 692, "5010,10": 693, "5010,20": 693,
  "5020,0": 694, "5020,10": 695, "5020,20": 696,
  "5030,0": 697, "5030,10": 698, "5030,20": 699, "5030,30": 703, "5030,40": 701, "5030,50": 702,
  "5040,0": 700, "5040,10": 710, "5040,20": 704,
  "5060,0": 705, "5060,10": 706,
  "5070,0": 707, "5070,10": 708, "5070,20": 709,
};
export const thaiStandard = (map: (n: number) => number = (n) => n) => Object.fromEntries(Object.entries(STANDARD).map(([k, n]) => [k, feet(map(n))]));

export const RHIVAN_THAI: ArtSource = {
  id: "rhivan-thai",
  file: "art/sources/mustermenschen/Rhivan male thai boxe 31AAH008.gif",
  sha256: "1b80b6b37f53abf0b912988ec41480e3bdde131400e255598b44423321626f61",
  cellWidth: 211,
  cellHeight: 143,
  columns: 30,
  rows: 28,
  axis: { x: 88, y: 125 },
  stray: [],
  localcoord: 340,
  standardSprites: thaiStandard(),
  credit: "Sprites: Mustermenschen V1 (Rhivan, Thai boxing) by Puffolotti (CC0), https://opengameart.org/content/musternenschen-v1-complete-collection",
};

/** Rhivan's body height in his frames (106 pixels), which his hand-measured boxes were written for. */
export const RHIVAN_HEIGHT = 106;
