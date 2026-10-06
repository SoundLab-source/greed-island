/**
 * "Meany looking alien for fighting games" (Puffolotti, CC0; art/SOURCES.md):
 * 840 frames of a hunched green-and-white alien, published as one animated
 * GIF (347 x 353, one 64-colour palette), laid out 30 to a row so frame n is
 * cell n (art/gif.ts). It isn't on the Universal Prototype layout; the frame
 * catalogue behind the house fighter's choices:
 *
 *   0-7 idle (hunched, breathing) · 8-12 jab · 13-19 lunge punch
 *   30-32 rising swipe · 49-53 low lunge · 61 recoil · 80 arms over head (guard)
 *   82-108 shuffle · 109-113 long low dive · 129-133 high kick · 154-155 pistol
 *   159-160 rifle · 169-177 crouching punches · 197-201 standing tall, arm raised
 *   227-231 summons a gun and fires · 237-239 low gun · 244-246 launcher overhead
 *   252-258 jump up · 265-276 leap forward · 280-290 landing and hop
 *   303-305 claw upward · 311-312 pistol · 327-332 rises to a front-facing flex
 *   334-344 somersault · 354 knocked upright · 355-365 falls flat, bounces, lies
 *   366-367 lifted, upside down · 368-376 rolls over and gets up · 377-384 tumble
 *   392-394 hit low · 395-401 high side kick · 420-425 jumping kick
 *   430-434 front kick · 437-448 low kicks and sweep · 458 slide kick
 *   459-472 air kicks · 508-509 two-handed grab · 525-538 straight then uppercut
 *   563-582 walk · 597-598 flying kick · 603-610 spinning kick · 615-621 flip kick
 *   629-633 bazooka on the shoulder · 641-647 front-facing flex · 708-713 point
 *   714-719 standing upright · 727-734 dash · 742-749 turns to face front
 *   768-777 crouch · 826-839 back turned, wide stance
 *
 * The frames aren't rendered on one ground line (the hunch bobs), so every
 * animation using them anchors each frame's lowest pixel on the ground.
 */
import type { ArtSource } from "./spec.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });

export const ALIEN: ArtSource = {
  id: "alien",
  file: "art/sources/alien/BaGeDo.gif",
  sha256: "9995662a49aac65802dfd37af16741d02adbe997456a487ef9d140cf0be0b88c",
  cellWidth: 347,
  cellHeight: 353,
  columns: 30,
  rows: 28,
  axis: { x: 158, y: 326 },
  stray: [],
  // Hunched, he stands a little lower than the others (176 pixels at 700); upright, as tall. His long limbs reach far:
  // at 600 every move reached 50-80% further than the Sage's and he won 83% in the balance tool.
  localcoord: 700,
  standardSprites: {
    "5000,0": feet(61), "5000,10": feet(61), "5000,20": feet(354),
    "5010,0": feet(393), "5010,10": feet(394), "5010,20": feet(394),
    "5020,0": feet(392), "5020,10": feet(392), "5020,20": feet(393),
    "5030,0": feet(355), "5030,10": feet(356), "5030,20": feet(357), "5030,30": feet(358), "5030,40": feet(370), "5030,50": feet(361),
    "5040,0": feet(357), "5040,10": feet(364), "5040,20": feet(363),
    "5060,0": feet(366), "5060,10": feet(367),
    "5070,0": { cell: 366, rotate: 30 }, "5070,10": { cell: 366, rotate: 60 }, "5070,20": feet(369),
  },
  credit: "Sprites: Meany looking alien for fighting games (stardrinkers style) by Puffolotti (CC0), https://opengameart.org/content/meany-looking-alien-for-fighting-games-stardrinkers-style",
};
