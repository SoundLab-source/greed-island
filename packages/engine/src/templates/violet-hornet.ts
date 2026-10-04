/**
 * House fighter "Violet Hornet" (RUSHDOWN): a fast street kicker in a tank
 * top, on the Bad Company sheets' Rourke model. He keeps the Striker's
 * numbers, AI and kicks (moved to the new layout by portToUp2), with a
 * flying side kick for his rushing special; he crosses his arms to start and
 * spreads them to win.
 */
import { ROURKE, onBody } from "./bad-company.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const striker = onBody(portToUp2(RUSHDOWN), ROURKE);
const stance = (striker.anims.find((a) => a.action === 0)!.cells as number[])[0]!;

export const VIOLET_HORNET: TemplateSpec = {
  ...withMoves(striker, {
    anims: [
      { action: 180, cells: range(4413, 4416), ticks: [5, 5, 6, 60], loop: false, comment: "win: arms spread" },
      { action: 190, cells: [3507, 3508, 3509, 3508, 3507, stance], ticks: [6, 6, 30, 6, 6, 10], comment: "intro: arms crossed" },
      { action: 195, cells: [4414, 4415, 4416, 4415, 4414], ticks: [5, 6, 20, 6, 5], comment: "taunt: come on" },
    ],
    attacks: [
      // The Striker's spinning side kick (rushes in) becomes a flying side kick.
      // A hand-made box round the foot: the kick is drawn in the air, so the automatic box found nothing reaching out.
      redrawMove(striker, 1000, "Hornet Kick", [...range(4419, 4425), stance], [2, 3, 3, 4, 5, 4, 4, 4], [4, 5], { hit: { box: [40, -126, 94, -100] } }),
    ],
  }),
  id: "gi-violet-hornet",
  name: "Violet Hornet",
  // A little more life and punch than the Striker: with his numbers he won 45% in the balance tool (2026-10-04).
  constants: { ...striker.constants, life: Math.round(striker.constants.life * 1.03), attack: striker.constants.attack + 1 },
  // A hornet: violet hair (53-56), a yellow tank top (25-28) and black trousers (29-32).
  colors: {
    53: "#8a3ad1", 54: "#6a2ca0", 55: "#481e6e", 56: "#240f37",
    25: "#e0c020", 26: "#b09818", 27: "#786810", 28: "#3c3408",
    29: "#2a2a2a", 30: "#1f1f1f", 31: "#151515", 32: "#0a0a0a",
  },
  palettes: [
    { name: "Wasp", colors: { 53: "#2a2522", 54: "#1f1b19", 55: "#151211", 56: "#0a0908", 25: "#e07020", 26: "#b05818", 27: "#783c10", 28: "#3c1e08", 29: "#3a2a1c", 30: "#2b1f15", 31: "#1d150e", 32: "#0e0a07" } },
    { name: "Ghost", colors: { 53: "#e8e8ee", 54: "#bcbcc6", 55: "#83838f", 56: "#41414a", 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#6a6a72", 30: "#505056", 31: "#36363a", 32: "#1b1b1d" } },
    { name: "Night", colors: { 53: "#8a3ad1", 54: "#6a2ca0", 55: "#481e6e", 56: "#240f37", 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#1c1c22", 30: "#151519", 31: "#0e0e11", 32: "#070708" } },
  ],
};
