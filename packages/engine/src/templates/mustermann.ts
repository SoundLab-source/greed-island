/**
 * "Fighting character template Mustermann 2 (A001AAAA001) (karate)"
 * (Puffolotti, CC0; art/SOURCES.md): 997 frames of a red-haired karateka in a
 * tank top, gi trousers and a belt, published as one animated GIF (229 x 238,
 * one 64-colour palette; the right-handed file, facing the camera), laid out
 * 30 to a row so frame n is cell n (art/gif.ts). The frame catalogue behind
 * the house fighter's choices:
 *
 *   0-3 standing, turning into guard · 4-15 guard · 16-20 jab · 46-53 lunge punch
 *   113-118 rising punch · 120-129 long lunging punch · 142-148 front kick · 168-173 high kick
 *   180-183 low side kick · 198-205 spinning back kick · 268-271 fist raised · 276-279 horse stance
 *   405-419 walk (in place) · 500-507 dash · 540-548 jumping uppercut · 600-640 jumps
 *   641-645 air punch · 691-695 flying kick · 727-736 crouch · 735-740, 783-787 crouching punches
 *   800-806 sweep · 822-827 low kick · 919-922 hit high · 923-930 guard · 931-938 hit hard
 *   939-944 hit in the stomach · 945-953 falls and lies · 954-955 thrown · 957-965 knocked flat
 *   983-996 rolls back up
 *
 * His frames aren't all rendered on one ground line, so every animation using
 * them anchors each frame's lowest pixel on the ground.
 */
import type { ArtSource } from "./spec.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const MUSTERMANN: ArtSource = {
  id: "mustermann",
  file: "art/sources/mustermann/1_8.gif",
  sha256: "14f224bdd947c12c8f78749713ddce3cf63a2ae7a16d0417c0329595819db625",
  cellWidth: 229,
  cellHeight: 238,
  columns: 30,
  rows: 34,
  axis: { x: 95, y: 221 },
  // Pinks and greys (3-6, 27-30) and magentas (19-22): specks of 1-2 pixels.
  stray: [3, 4, 5, 6, 19, 20, 21, 22, 27, 28, 29, 30],
  // Drawn the Universal Prototype 2 model's size: the same height on screen.
  localcoord: 509,
  standardSprites: {
    "5000,0": feet(919), "5000,10": feet(920), "5000,20": feet(932),
    "5010,0": feet(939), "5010,10": feet(940), "5010,20": feet(942),
    "5020,0": feet(736), "5020,10": feet(736), "5020,20": feet(736),
    "5030,0": feet(946), "5030,10": feet(946), "5030,20": feet(947), "5030,30": feet(948), "5030,40": feet(949), "5030,50": feet(950),
    "5040,0": feet(951), "5040,10": feet(952), "5040,20": feet(953),
    "5060,0": feet(954), "5060,10": feet(955),
    "5070,0": feet(956), "5070,10": feet(957), "5070,20": feet(959),
  },
  credit: "Sprites: Fighting character template Mustermann 2 (karate) by Puffolotti (CC0), https://opengameart.org/content/fighting-character-template-mustermann-2-a001aaaa001-karate",
};
