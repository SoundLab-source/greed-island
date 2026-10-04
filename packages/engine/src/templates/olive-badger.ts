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
  // (2026-10-04); among 24, 970 and 99 won 42%, and 1000 and 101, 60%.
  constants: { ...NEON_GORILLA.constants, life: 985, attack: 100 },
  // A badger's charcoal shirt (25-28) and black cap (53-56) over the olive trousers he's drawn with (so he doesn't look
  // like Moss Wolf, drawn all in olive).
  colors: { 25: "#3a3a3e", 26: "#2b2b2e", 27: "#1c1c1f", 28: "#0e0e10", 53: "#2a2a2e", 54: "#1f1f22", 55: "#151517", 56: "#0a0a0b" },
  palettes: [
    { name: "Honey", colors: { 25: "#c8902a", 26: "#9a6e20", 27: "#684a16", 28: "#34250b", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b", 53: "#2a2a2e", 54: "#1f1f22", 55: "#151517", 56: "#0a0a0b" } },
    { name: "Stripe", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b", 53: "#ecebe6", 54: "#c3c1b8", 55: "#89877f", 56: "#44433f" } },
    { name: "Navy", colors: { 25: "#26306e", 26: "#1c2453", 27: "#131838", 28: "#090c1c", 29: "#3d5a80", 30: "#2e4461", 31: "#1f2e41", 32: "#0f1720", 53: "#26306e", 54: "#1c2453", 55: "#131838", 56: "#090c1c" } },
  ],
};
