/**
 * House fighter "Olive Badger" (GRAPPLER): a grey-haired old soldier who
 * grapples dirty, on the Bad Company sheets' Dundee model, with Neon
 * Gorilla's style (the Wrestler's throws and AI, his numbers): the wide low
 * stance, the open-handed lunge and the charge.
 */
import { DUNDEE, onBody } from "./bad-company.ts";
import { NEON_GORILLA } from "./neon-gorilla.ts";
import type { TemplateSpec } from "./spec.ts";

export const OLIVE_BADGER: TemplateSpec = {
  ...onBody(NEON_GORILLA, DUNDEE),
  id: "gi-olive-badger",
  name: "Olive Badger",
  // More life and punch than Neon Gorilla: on Dundee's smaller body his trimmed numbers won 37% in the balance tool
  // (2026-10-04).
  constants: { ...NEON_GORILLA.constants, life: 950, attack: 98 },
  // Drawn in olive fatigues and cap; his outfits change the shirt (25-28), trousers (29-32) and cap (53-56).
  colors: {},
  palettes: [
    { name: "Honey", colors: { 25: "#c8902a", 26: "#9a6e20", 27: "#684a16", 28: "#34250b", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b", 53: "#2a2a2e", 54: "#1f1f22", 55: "#151517", 56: "#0a0a0b" } },
    { name: "Stripe", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b", 53: "#ecebe6", 54: "#c3c1b8", 55: "#89877f", 56: "#44433f" } },
    { name: "Navy", colors: { 25: "#26306e", 26: "#1c2453", 27: "#131838", 28: "#090c1c", 29: "#3d5a80", 30: "#2e4461", 31: "#1f2e41", 32: "#0f1720", 53: "#26306e", 54: "#1c2453", 55: "#131838", 56: "#090c1c" } },
  ],
};
