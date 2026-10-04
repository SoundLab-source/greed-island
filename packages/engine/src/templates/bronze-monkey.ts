/**
 * House fighter "Bronze Monkey" (RUSHDOWN): a spiky-haired capoeirista, on
 * the Bad Company sheets' Kelly model, with Jade Serpent's capoeira (the
 * Striker's numbers and AI): the ginga, the martelo and armada, the rasteira,
 * the cartwheel kick and the parafuso.
 */
import { KELLY, onBody } from "./bad-company.ts";
import { JADE_SERPENT } from "./jade-serpent.ts";
import type { TemplateSpec } from "./spec.ts";

export const BRONZE_MONKEY: TemplateSpec = {
  ...onBody(JADE_SERPENT, KELLY),
  id: "gi-bronze-monkey",
  name: "Bronze Monkey",
  // More life and punch than Jade Serpent: with the Striker's own numbers her capoeira won him 38% in the balance tool
  // (2026-10-04).
  constants: { ...JADE_SERPENT.constants, life: 980, attack: 104 },
  // A bronze shirt (25-28) over white capoeira trousers (29-32).
  colors: { 25: "#b8862e", 26: "#8c6623", 27: "#5e4518", 28: "#2f220c", 29: "#e2e0da", 30: "#b8b6ae", 31: "#807e78", 32: "#403f3c" },
  palettes: [
    { name: "Ivory", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#e2e0da", 30: "#b8b6ae", 31: "#807e78", 32: "#403f3c" } },
    { name: "Night", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b" } },
    { name: "Carnival", colors: { 25: "#2a9a5a", 26: "#1f7444", 27: "#154e2e", 28: "#0b2717", 29: "#e0c020", 30: "#b09818", 31: "#786810", 32: "#3c3408" } },
  ],
};
