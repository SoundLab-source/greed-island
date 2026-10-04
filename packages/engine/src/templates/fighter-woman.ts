/**
 * "Generic woman for fighting games" (Puffolotti, CC0; art/SOURCES.md): 561
 * frames of a long-haired street fighter in a green top and cargo shorts,
 * published as one animated GIF (246 x 254, one 64-colour palette), laid out
 * 30 to a row so frame n is cell n (art/gif.ts). The frame catalogue behind
 * the house fighter's choices:
 *
 *   0-8 stance · 9-12 jab · 13-17 cross · 18-21 spinning back fist · 22-26 lunging punch
 *   27-31 high kick · 36-41 flying kicks · 48-50 knee · 51-53 side kick · 54-59 high and axe kicks
 *   63-65 hook kick · 90-106 jumps and a diving kick · 120-126 long punch · 127-134 cartwheel kick
 *   142-147, 152-179 facing front · 165-170 arms crossed · 182-186 hit high · 188-199 hair flip
 *   200-221 low stance and lunges · 222-227 dive and slide · 228-236 kip-up and handspring
 *   256 deep crouch · 272-281 jump up · 300-310 air kicks and knee · 315-317 hit in the air
 *   333-338 hit low · 339-349 falls, bounces, lies · 350-353 thrown · 375-381 guard
 *   382-389 sweep · 402-404 crouching kick · 414-427 knocked down, rolls · 428-438 stiff fall
 *   363-374 walk in place · 439-449 walk (across the frame) · 450-454 come on · 471-479 spinning back fist · 526-530 low punches
 *   531-539 jump and flips · 540-544 flying kick · 548-554 punches
 *
 * Her frames aren't all rendered on one ground line, so every animation using
 * them anchors each frame's lowest pixel on the ground.
 */
import type { ArtSource } from "./spec.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const FIGHTER_WOMAN: ArtSource = {
  id: "fighter-woman",
  file: "art/sources/fighter-woman/human fighter.gif",
  sha256: "3dab74bec218bf89f2886068b78bb5308d7148d481f68355618c858f2a5a354b",
  cellWidth: 246,
  cellHeight: 254,
  columns: 30,
  rows: 19,
  axis: { x: 100, y: 232 },
  // Magenta specks (22-25) in some frames.
  stray: [22, 23, 24, 25],
  // Drawn about 8% smaller than the Universal Prototype 2 model: the same height on screen.
  localcoord: 467,
  standardSprites: {
    "5000,0": feet(182), "5000,10": feet(184), "5000,20": feet(186),
    "5010,0": feet(335), "5010,10": feet(336), "5010,20": feet(338), "5011,0": feet(339),
    "5020,0": feet(256), "5020,10": feet(256), "5020,20": feet(256),
    "5030,0": feet(339), "5030,10": feet(340), "5030,20": feet(340), "5030,30": feet(340), "5030,40": feet(341), "5030,50": feet(341),
    "5031,0": feet(339),
    "5040,0": feet(276), "5040,10": feet(277), "5040,20": feet(278),
    "5050,0": feet(340),
    "5060,0": feet(341), "5060,10": feet(341), "5061,0": feet(341),
    "5070,0": feet(414), "5071,0": feet(415), "5071,10": feet(416), "5071,20": feet(417),
    "5080,0": feet(347), "5080,10": feet(347),
    "5100,0": feet(341), "5100,10": feet(342),
    "5110,0": feet(346), "5120,0": feet(228),
  },
  credit: "Sprites: Generic woman for fighting games (stardrinkers style) by Puffolotti (CC0), https://opengameart.org/content/generic-woman-for-fighting-games-stardrinkers-style",
};
