/**
 * House fighter "Hurricane Orchid" (GRAPPLER): a luchadora, on the second
 * Universal Prototype model. She keeps the Wrestler's numbers, AI, throws
 * (the body slam and the dive grab) and plain moves (moved to the new model
 * by portToUp2), with a showwoman's flair: a flying tope (a dive with both
 * arms out) for her rush, the crowd for her taunt, and her arms raised to win.
 */
import { GRAPPLER } from "./grappler.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const wrestler = portToUp2(GRAPPLER);

export const HURRICANE_ORCHID: TemplateSpec = {
  ...withMoves(wrestler, {
    anims: [
      { action: 180, cells: [4400, 4401, 4402, 4403, 4404, 4405], ticks: [5, 5, 5, 6, 8, 60], loop: false, comment: "win: arms raised to the crowd" },
      { action: 190, cells: [...range(4406, 4409), 4408, 4407, 4406, ...onWrestlerStance()], ticks: [6, 6, 8, 25, 6, 6, 6, 10], comment: "intro: arms spread to the crowd" },
      { action: 195, cells: [4406, 4407, 4408, 4409, 4408], ticks: [5, 5, 6, 20, 6], comment: "taunt: to the crowd" },
    ],
    attacks: [
      // The Wrestler's bull rush (through projectiles) becomes the tope: a flying dive, both arms out.
      // Timed like the bull rush: out in 4 ticks, a short glide (the first version came out in 9 and lost her 5 points).
      redrawMove(wrestler, 1000, "Tope", range(4425, 4435), [1, 1, 2, 5, 5, 3, 3, 3, 2, 2, 2], [3, 4], { moves: [{ frame: 0, x: 5 }, { frame: 5, x: 0 }] }),
    ],
  }),
  id: "gi-hurricane-orchid",
  name: "Hurricane Orchid",
  // A little more life and punch than the Wrestler, for the new model (her coat makes a wider target): the Wrestler's
  // own moves won 42% on it (balance tool, 2026-10-03).
  constants: { ...wrestler.constants, life: Math.round(wrestler.constants.life * 1.08), attack: wrestler.constants.attack + 3 },
  // A magenta coat (29-32) over the gold trim, as a luchadora's.
  colors: { 29: "#c0307a", 30: "#94245e", 31: "#651840", 32: "#330c20" },
  palettes: [
    { name: "Midnight", colors: { 29: "#26306e", 30: "#1c2453", 31: "#131838", 32: "#090c1c", 33: "#d0d8e8", 34: "#a0a8bc", 35: "#6a7286", 36: "#353943" } },
    { name: "Jade", colors: { 29: "#2a8a5a", 30: "#1f6844", 31: "#15462e", 32: "#0a2317" } },
    { name: "White", colors: { 29: "#ecebe6", 30: "#c3c1b8", 31: "#89877f", 32: "#44433f", 33: "#c0307a", 34: "#94245e", 35: "#651840", 36: "#330c20" } },
  ],
  portrait: { cell: 4411 },
};

/** The ported Wrestler's stance's first cell, to end the intro on. */
function onWrestlerStance(): number[] {
  const stand = GRAPPLER.anims.find((a) => a.action === 0)!.cells;
  return [(Array.isArray(stand) ? (stand as number[])[0]! : (stand as { from: number }).from) + 1];
}
