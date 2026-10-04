/**
 * House fighter "Sapphire Mantis" (ZONER): a kung fu stylist in blue, on the
 * Bad Company sheets' Fontaine model. He keeps the Sage's numbers, AI,
 * projectile (the energy palm) and plain moves (moved to the new layout by
 * portToUp2), from a loose, swaying kung fu stance, with a spear-hand strike
 * on one leg; he starts with a crane kata and wins with his arms crossed.
 */
import { FONTAINE, onBody } from "./bad-company.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const sage = onBody(portToUp2(ZONER), FONTAINE);

export const SAPPHIRE_MANTIS: TemplateSpec = {
  ...withMoves(sage, {
    anims: [
      { action: 0, cells: [...range(3522, 3533), ...range(3523, 3532).reverse()], ticks: 5, comment: "stand: a loose kung fu sway" },
      { action: 5, cells: [3522], ticks: 3, comment: "turn" },
      { action: 180, cells: [3506, 3507, 3508, 3509], ticks: [5, 6, 6, 60], loop: false, comment: "win: arms crossed" },
      { action: 181, cells: range(3560, 3567), ticks: [5, 5, 5, 5, 6, 6, 8, 60], loop: false, comment: "win: a crane kata" },
      { action: 190, cells: [...range(3558, 3567), 3522], ticks: [5, 5, 5, 5, 5, 5, 6, 6, 8, 30, 10], comment: "intro: a crane kata" },
      { action: 195, cells: [3510, 3511, 3512, 3511, 3510], ticks: [5, 6, 20, 6, 5], comment: "taunt: beckons" },
    ],
    attacks: [
      redrawMove(sage, 210, "Spear Hand", range(3551, 3556), [3, 3, 4, 4, 4, 4], [2, 3]),
    ],
  }),
  id: "gi-sapphire-mantis",
  name: "Sapphire Mantis",
  // A bright sapphire shirt (25-28) over the navy trousers he's drawn with.
  colors: { 25: "#2a52c4", 26: "#1f3e94", 27: "#152a64", 28: "#0b1532" },
  palettes: [
    { name: "Jade", colors: { 25: "#2a9a5a", 26: "#1f7444", 27: "#154e2e", 28: "#0b2717", 29: "#1c1c22", 30: "#151519", 31: "#0e0e11", 32: "#070708" } },
    { name: "Ivory", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#d8d6ce", 30: "#adaba4", 31: "#76756f", 32: "#3b3a37" } },
    { name: "Ember", colors: { 25: "#d0582a", 26: "#a04420", 27: "#6e2e15", 28: "#37170b", 29: "#2a2a2a", 30: "#1f1f1f", 31: "#151515", 32: "#0a0a0a", 9: "#2a2522", 10: "#1f1b19", 11: "#151211", 12: "#0a0908" } },
  ],
  portrait: { cell: 3522 },
};
