/**
 * House fighter "Amethyst Jaguar" (GRAPPLER): a purple-haired luchador, on
 * the Bad Company sheets' Jones model, with Hurricane Orchid's lucha libre
 * (the Wrestler's numbers, AI and throws): the flying tope, playing to the
 * crowd, arms raised to win.
 */
import { JONES, onBody } from "./bad-company.ts";
import { HURRICANE_ORCHID } from "./hurricane-orchid.ts";
import type { TemplateSpec } from "./spec.ts";

export const AMETHYST_JAGUAR: TemplateSpec = {
  ...onBody(HURRICANE_ORCHID, JONES),
  id: "gi-amethyst-jaguar",
  name: "Amethyst Jaguar",
  // Less than the Wrestler's life and punch: Hurricane Orchid's extra (which makes up for her coat, a wider target) won
  // him 68% in the balance tool (2026-10-04).
  constants: { ...HURRICANE_ORCHID.constants, life: 930, attack: 97 },
  // An amethyst shirt (25-28), black trousers (29-32) and gold gloves (49-52) with his purple hair.
  colors: {
    25: "#8a4fc4", 26: "#693c96", 27: "#482966", 28: "#241433",
    29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b",
    49: "#e0b040", 50: "#b08a30", 51: "#7a5f20", 52: "#3d3010",
  },
  palettes: [
    { name: "Obsidian", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#8a4fc4", 30: "#693c96", 31: "#482966", 32: "#241433" } },
    { name: "Gilded", colors: { 25: "#e0b040", 26: "#b08a30", 27: "#7a5f20", 28: "#3d3010", 53: "#2a2522", 54: "#1f1b19", 55: "#151211", 56: "#0a0908", 49: "#2a2a2a", 50: "#1f1f1f", 51: "#151515", 52: "#0a0a0a" } },
    { name: "Emerald", colors: { 25: "#2a9a5a", 26: "#1f7444", 27: "#154e2e", 28: "#0b2717", 29: "#e2e0da", 30: "#b8b6ae", 31: "#807e78", 32: "#403f3c" } },
  ],
};
