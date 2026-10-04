/**
 * House fighter "Moss Wolf" (ALL_ROUNDER): a broad, capped soldier gone
 * feral, on the Bad Company sheets' Madeira model, with Feral Lynx's feral
 * style (the Brawler's AI, her numbers): the bouncing crouch, the prowl, claws
 * and the pounce, a roar to start and to win.
 */
import { MADEIRA, onBody } from "./bad-company.ts";
import { FERAL_LYNX } from "./feral-lynx.ts";
import type { TemplateSpec } from "./spec.ts";

export const MOSS_WOLF: TemplateSpec = {
  ...onBody(FERAL_LYNX, MADEIRA),
  id: "gi-moss-wolf",
  name: "Moss Wolf",
  // Drawn in moss-green fatigues and cap; his outfits change the shirt (25-28), trousers (29-32) and cap (53-56).
  colors: {},
  palettes: [
    { name: "Timber", colors: { 25: "#6a4a2a", 26: "#50381f", 27: "#362515", 28: "#1b120a", 29: "#5a5a60", 30: "#444448", 31: "#2e2e31", 32: "#171719", 53: "#6a4a2a", 54: "#50381f", 55: "#362515", 56: "#1b120a" } },
    { name: "Arctic", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#9ea6b2", 30: "#7a828e", 31: "#535962", 32: "#2a2d31", 53: "#ecebe6", 54: "#c3c1b8", 55: "#89877f", 56: "#44433f" } },
    { name: "Dire", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#a8322d", 30: "#7f2622", 31: "#561a17", 32: "#2b0d0b", 53: "#2e2e34", 54: "#222226", 55: "#17171a", 56: "#0b0b0d" } },
  ],
};
