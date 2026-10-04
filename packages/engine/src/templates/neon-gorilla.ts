/**
 * House fighter "Neon Gorilla" (GRAPPLER): a shirtless punk wrestler with a
 * pink mohawk, on the Bad Company sheets' Boston model. He keeps the
 * Wrestler's numbers, AI, throws (the body slam and the dive grab) and plain
 * moves (moved to the new layout by portToUp2), from a wide, knuckles-low
 * stance: an open-handed lunge for his palm strike, a long lunging charge for
 * his rush, and his arms raised to win.
 */
import { BOSTON, onBody } from "./bad-company.ts";
import { GRAPPLER } from "./grappler.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const wrestler = onBody(portToUp2(GRAPPLER), BOSTON);

export const NEON_GORILLA: TemplateSpec = {
  ...withMoves(wrestler, {
    anims: [
      { action: 0, cells: [...range(4766, 4773), ...range(4767, 4772).reverse()], ticks: 6, comment: "stand: wide and low, knuckles down" },
      { action: 5, cells: [4766], ticks: 3, comment: "turn" },
      { action: 180, cells: range(4400, 4405), ticks: [5, 5, 5, 6, 8, 60], loop: false, comment: "win: arms raised" },
      { action: 190, cells: [...range(4400, 4405), 4404, 4403, 4766], ticks: [6, 6, 6, 8, 10, 30, 6, 6, 10], comment: "intro: up from a crouch, arms raised" },
      { action: 195, cells: range(4799, 4803), ticks: [5, 5, 6, 20, 6], comment: "taunt: arms out, come on" },
    ],
    attacks: [
      // A hand-made box round the open hand (the automatic one, against his wide stance, reached half as far).
      redrawMove(wrestler, 210, "Gorilla Palm", [...range(4825, 4829), 4831, 4833], [3, 3, 3, 4, 4, 4, 4], [3, 4], { hit: { box: [40, -112, 70, -86] } }),
      // The Wrestler's bull rush (through projectiles) becomes a long lunge, arm out.
      redrawMove(wrestler, 1000, "Gorilla Charge", [...range(4782, 4787), 4766], [3, 5, 5, 4, 4, 4, 4], [1, 2]),
    ],
  }),
  id: "gi-neon-gorilla",
  name: "Neon Gorilla",
  // His wide, low stance is a small target: with the Wrestler's numbers he won 65% in the balance tool (2026-10-04),
  // so less life and punch.
  constants: { ...wrestler.constants, life: 870, attack: 93 },
  // Neon green gloves (49-52) and black trousers (29-32) with the pink mohawk he's drawn with.
  colors: { 49: "#5ad16a", 50: "#43a050", 51: "#2d6e36", 52: "#16371b", 29: "#2a2a30", 30: "#1f1f24", 31: "#151518", 32: "#0a0a0c" },
  palettes: [
    { name: "Silverback", colors: { 53: "#d0d0d8", 54: "#a0a0a8", 55: "#6a6a72", 56: "#353539", 29: "#5a5a60", 30: "#444448", 31: "#2e2e31", 32: "#171719", 49: "#2a2a2a", 50: "#1f1f1f", 51: "#151515", 52: "#0a0a0a" } },
    { name: "Jungle", colors: { 53: "#4ab04a", 54: "#388538", 55: "#265a26", 56: "#132d13", 49: "#7a5230", 50: "#5c3e24", 51: "#3d2918", 52: "#1f150c" } },
    { name: "Royal", colors: { 53: "#e0c060", 54: "#b09040", 55: "#786028", 56: "#3c3014", 29: "#5a2a8a", 30: "#44206a", 31: "#2e1648", 32: "#170b24", 49: "#e0b040", 50: "#b08a30", 51: "#7a5f20", 52: "#3d3010" } },
  ],
  portrait: { cell: 4766 },
};
