/**
 * House fighter "Elder Tortoise" (ZONER): an old kung fu master in khaki, on
 * the Bad Company sheets' Callaghan model, with Sapphire Mantis's kung fu
 * (the Sage's numbers, AI and energy palm): the swaying stance, the spear
 * hand, the crane kata.
 */
import { CALLAGHAN, onBody } from "./bad-company.ts";
import { SAPPHIRE_MANTIS } from "./sapphire-mantis.ts";
import type { TemplateSpec } from "./spec.ts";

export const ELDER_TORTOISE: TemplateSpec = {
  ...onBody(SAPPHIRE_MANTIS, CALLAGHAN),
  id: "gi-elder-tortoise",
  name: "Elder Tortoise",
  // A little more life and punch than Sapphire Mantis (the Sage's): with them he won 45% in the balance tool (2026-10-04).
  constants: { ...SAPPHIRE_MANTIS.constants, life: 1082, attack: 101 },
  // Drawn in khaki with a cap; his outfits change the shirt (25-28), trousers (29-32) and cap (53-56).
  colors: {},
  palettes: [
    { name: "Shell", colors: { 25: "#2a6a4a", 26: "#1f5038", 27: "#153626", 28: "#0b1b13", 29: "#6a4a2a", 30: "#50381f", 31: "#362515", 32: "#1b120a", 53: "#2a6a4a", 54: "#1f5038", 55: "#153626", 56: "#0b1b13" } },
    { name: "Temple", colors: { 25: "#c8582a", 26: "#9a4320", 27: "#682d15", 28: "#34170b", 29: "#e0b040", 30: "#b08a30", 31: "#7a5f20", 32: "#3d3010", 53: "#c8582a", 54: "#9a4320", 55: "#682d15", 56: "#34170b" } },
    { name: "Ink", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#2e2e34", 30: "#222226", 31: "#17171a", 32: "#0b0b0d", 53: "#ecebe6", 54: "#c3c1b8", 55: "#89877f", 56: "#44433f" } },
  ],
};
