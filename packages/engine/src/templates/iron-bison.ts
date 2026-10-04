/**
 * House fighter "Iron Bison" (HEAVY): a big bare-knuckle bruiser, on the Bad
 * Company sheets' Adler model, who stands a head taller than everyone else.
 * He keeps the Bruiser's numbers, AI and moves (moved to the new layout by
 * portToUp2): the heavy jab, the hammer smash, the big boot, the shoulder
 * charge through projectiles, the heavy uppercut and the hammer drop.
 */
import { ADLER, onBody } from "./bad-company.ts";
import { HEAVY } from "./heavy.ts";
import type { TemplateSpec } from "./spec.ts";
import { portToUp2 } from "./universal-prototype-2.ts";

const bruiser = onBody(portToUp2(HEAVY), ADLER);

export const IRON_BISON: TemplateSpec = {
  ...bruiser,
  id: "gi-iron-bison",
  name: "Iron Bison",
  // Drawn in bison browns (shirt 25-28, trousers 29-32); his outfits change those and his hair (9-12).
  colors: {},
  palettes: [
    { name: "Black", colors: { 25: "#3a3a3e", 26: "#2b2b2e", 27: "#1c1c1f", 28: "#0e0e10", 29: "#4a4f57", 30: "#383c42", 31: "#26292d", 32: "#131416" } },
    { name: "White", colors: { 25: "#e6e4dc", 26: "#bcbab2", 27: "#85837d", 28: "#42413e", 29: "#3d5a80", 30: "#2e4461", 31: "#1f2e41", 32: "#0f1720", 9: "#c9a45c", 10: "#9c7d44", 11: "#6a542d", 12: "#352a16" } },
    { name: "Red", colors: { 25: "#a8322d", 26: "#7f2622", 27: "#561a17", 28: "#2b0d0b", 29: "#2a2a2a", 30: "#1f1f1f", 31: "#151515", 32: "#0a0a0a" } },
  ],
};
