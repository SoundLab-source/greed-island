/**
 * House fighter "Slate Falcon" (ZONER): a slight, bald taekwondo master, on
 * the Bad Company sheets' Reinhold model, with Silver Crane's taekwondo (the
 * Sage's numbers, AI and energy palm): the chambered side kick, the
 * roundhouse, a high kick held to win.
 */
import { REINHOLD, onBody } from "./bad-company.ts";
import { SILVER_CRANE } from "./silver-crane.ts";
import type { TemplateSpec } from "./spec.ts";

export const SLATE_FALCON: TemplateSpec = {
  ...onBody(SILVER_CRANE, REINHOLD),
  id: "gi-slate-falcon",
  name: "Slate Falcon",
  // A little more life and punch than Silver Crane: on his slighter body her kicks reach a little less, and won 44% in
  // the balance tool (2026-10-04).
  constants: { ...SILVER_CRANE.constants, life: 1110, attack: 103 },
  // A slate-blue shirt (25-28) over dark slate trousers (29-32).
  colors: { 25: "#5a6a80", 26: "#435063", 27: "#2d3543", 28: "#161b22", 29: "#2a3038", 30: "#1f242a", 31: "#15181c", 32: "#0a0c0e" },
  palettes: [
    { name: "Snow", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#d8d6ce", 30: "#adaba4", 31: "#76756f", 32: "#3b3a37" } },
    { name: "Desert", colors: { 25: "#c8b080", 26: "#a08a60", 27: "#6e5e40", 28: "#372f20", 29: "#6a5a3a", 30: "#50442c", 31: "#362e1d", 32: "#1b170f" } },
    { name: "Peregrine", colors: { 25: "#6a4a2a", 26: "#50381f", 27: "#362515", 28: "#1b120a", 29: "#d8c8a8", 30: "#ada080", 31: "#766d58", 32: "#3b362c" } },
  ],
};
