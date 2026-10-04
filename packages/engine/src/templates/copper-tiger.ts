/**
 * House fighter "Copper Tiger" (RUSHDOWN): a Muay Thai fighter, on the Bad
 * Company sheets' Alvarez model. He keeps the Striker's numbers, AI and kicks
 * (moved to the new layout by portToUp2), and fights up close with the
 * sheet's Muay Thai: a stepping knee (in place of the side kick), a
 * clinch-and-knee rush and a flying knee against jumps; he raises an elbow
 * to win.
 */
import { ALVAREZ, onBody } from "./bad-company.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { TemplateSpec } from "./spec.ts";
import { portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const striker = onBody(portToUp2(RUSHDOWN), ALVAREZ);
const stance = (striker.anims.find((a) => a.action === 0)!.cells as number[])[0]!;

export const COPPER_TIGER: TemplateSpec = {
  ...withMoves(striker, {
    anims: [
      { action: 180, cells: [4495, 4496, 4497, 4498], ticks: [5, 6, 8, 60], loop: false, comment: "win: an elbow raised" },
      { action: 190, cells: [4490, 4491, 4492, 4493, 4494, 4495, 4496, 4497, 4498, 4497, 4496, stance], ticks: [5, 5, 6, 5, 5, 5, 5, 6, 30, 5, 5, 10], comment: "intro: knee and elbow, then the elbow raised" },
      { action: 195, cells: [4496, 4497, 4498, 4497, 4496], ticks: [5, 6, 20, 6, 5], comment: "taunt: an elbow raised" },
    ],
    // Hand-made boxes round the knee (and the reaching hands for the clinch): his raised guard reaches further
    // forward than his knees, so the automatic boxes missed them.
    attacks: [
      // A stepping knee in place of the side kick (the knee itself reaches no further than his guard, so he steps in with it).
      redrawMove(striker, 210, "Stepping Knee", [4481, 4482, 4483, 4484, 4485, 4486, stance], [2, 3, 3, 4, 3, 3, 3], [3, 4], { moves: [{ frame: 0, x: 4 }, { frame: 4, x: 0 }], hit: { box: [5, -112, 40, -70] } }),
      // The Striker's spinning side kick (rushes in) becomes a clinch: hands reaching out, then the knee.
      redrawMove(striker, 1000, "Clinch Knee", [4467, 4468, 4461, 4462, 4463, 4464, 4465, stance], [2, 3, 3, 4, 5, 4, 4, 4], [4, 5], { moves: [{ frame: 1, x: 6 }, { frame: 5, x: 0 }], hit: { box: [10, -130, 66, -62] } }),
      redrawMove(striker, 1100, "Flying Knee", [4477, 4478, 4479, 4480, 4480, 4481], [2, 3, 5, 5, 5, 5], [2, 3, 4], { hit: { box: [10, -160, 58, -88] } }),
    ],
  }),
  id: "gi-copper-tiger",
  name: "Copper Tiger",
  // More life and punch than the Striker: with his numbers he won 45% in the balance tool (2026-10-04).
  constants: { ...striker.constants, life: Math.round(striker.constants.life * 1.06), attack: striker.constants.attack + 2 },
  // A copper-orange shirt (25-28) and black trousers (29-32) under his blond hair.
  colors: { 25: "#c46a2a", 26: "#96501f", 27: "#643515", 28: "#321a0a", 29: "#2a2a2a", 30: "#1f1f1f", 31: "#151515", 32: "#0a0a0a" },
  palettes: [
    { name: "Snow", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#2a2a2a", 30: "#1f1f1f", 31: "#151515", 32: "#0a0a0a", 9: "#e8e8ee", 10: "#bcbcc6", 11: "#83838f", 12: "#41414a" } },
    { name: "Shadow", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#a8322d", 30: "#7f2622", 31: "#561a17", 32: "#2b0d0b" } },
    { name: "Jade", colors: { 25: "#2a9a5a", 26: "#1f7444", 27: "#154e2e", 28: "#0b2717", 29: "#e0c060", 30: "#b09040", 31: "#786028", 32: "#3c3014" } },
  ],
};
