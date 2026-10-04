/**
 * House fighter "Thunder Peony" (HEAVY): a sumo wrestler, on the second
 * Universal Prototype model. She keeps the Bruiser's numbers, AI and plain
 * moves (moved to the new model by portToUp2), with the sheet's sumo style:
 * a low crouch for a stance, a pushing shuffle for a walk, tsuppari thrusts,
 * an overhead slap, the shiko leg raise, a low leg sweep, the tachiai charge,
 * a rising palm against jumps and a lunging two-handed push; she stamps the
 * shiko to start and to win. Each move takes the place of a Bruiser move with
 * the same job, hit numbers and about the same timing.
 */
import { HEAVY } from "./heavy.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const bruiser = portToUp2(HEAVY);

export const THUNDER_PEONY: TemplateSpec = {
  ...withMoves(bruiser, {
    anims: [
      { action: 0, cells: range(5247, 5258), ticks: 6, comment: "stand: the sumo crouch" },
      { action: 20, cells: range(5338, 5348), ticks: 4, comment: "walk forward: a pushing shuffle" },
      { action: 21, cells: range(5338, 5348).reverse(), ticks: 4, comment: "walk back" },
      { action: 180, cells: [...range(5372, 5379), 5245], ticks: [5, 5, 6, 8, 20, 4, 4, 6, 60], loop: false, comment: "win: the shiko stamp" },
      { action: 190, cells: [5240, 5242, 5244, 5245, ...range(5372, 5379), 5247], ticks: [6, 6, 6, 8, 5, 5, 6, 8, 20, 4, 4, 6, 10], comment: "intro: stand, then the shiko stamp into the crouch" },
      { action: 195, cells: [5269, 5270, 5271, 5270, 5269], ticks: [5, 6, 20, 6, 5], comment: "taunt: an arm raised" },
    ],
    attacks: [
      redrawMove(bruiser, 200, "Tsuppari", range(5253, 5257), [2, 1, 4, 3, 3], [2, 3]),
      redrawMove(bruiser, 210, "Overhead Slap", range(5268, 5275), [3, 3, 3, 3, 3, 3, 6, 6], [4, 5]),
      redrawMove(bruiser, 240, "Shiko Kick", range(5372, 5378), [2, 2, 5, 4, 4, 4, 4], [2, 3]),
      redrawMove(bruiser, 440, "Leg Sweep", range(5352, 5357), [4, 4, 4, 4, 5, 5], [3, 4]),
      // The Bruiser's shoulder charge becomes the tachiai: a pushing rush with both arms out.
      redrawMove(bruiser, 1000, "Tachiai Charge", [5331, 5332, 5333, 5334, 5335, 5345, 5346, 5347, 5348], [3, 3, 3, 4, 4, 4, 5, 5, 5], [3, 4, 5], { moves: [{ frame: 2, x: 5 }, { frame: 6, x: 0 }] }),
      redrawMove(bruiser, 1100, "Rising Palm", range(5285, 5290), [3, 3, 5, 8, 6, 6], [2, 3]),
      redrawMove(bruiser, 1200, "Double Push", range(5276, 5283), [3, 4, 5, 4, 4, 6, 6, 6], [4, 5], { moves: [{ frame: 3, x: 2 }, { frame: 6, x: 0 }] }),
    ],
  }),
  id: "gi-thunder-peony",
  name: "Thunder Peony",
  // A deep red coat (29-32), as a sumo's belt colour, over the gold trim.
  colors: { 29: "#a32a3a", 30: "#7c1f2c", 31: "#53151d", 32: "#2a0a0f" },
  palettes: [
    { name: "Indigo", colors: { 29: "#3b3f8f", 30: "#2c2f6b", 31: "#1d2047", 32: "#0f1024" } },
    { name: "Plum", colors: { 29: "#7a3a7a", 30: "#5c2b5c", 31: "#3d1d3d", 32: "#1f0e1f" } },
    { name: "Gold", colors: { 29: "#d4a83a", 30: "#a8842c", 31: "#73591d", 32: "#3a2d0f", 33: "#3a2a1c", 34: "#2b1f15", 35: "#1d150e", 36: "#0e0a07" } },
  ],
  portrait: { cell: 5240 },
};
