/**
 * House fighter "Granite Rhino" (HEAVY): a big bald sumo, on the Bad Company
 * sheets' Wayne model, with Thunder Peony's sumo (the Bruiser's numbers and
 * AI): the sumo crouch, tsuppari thrusts, the shiko, the tachiai charge.
 */
import { WAYNE, onBody } from "./bad-company.ts";
import type { TemplateSpec } from "./spec.ts";
import { THUNDER_PEONY } from "./thunder-peony.ts";

export const GRANITE_RHINO: TemplateSpec = {
  ...onBody(THUNDER_PEONY, WAYNE),
  id: "gi-granite-rhino",
  name: "Granite Rhino",
  // A little less life and punch than Thunder Peony: on his broader body her sumo won 56% in the balance tool (2026-10-04).
  constants: { ...THUNDER_PEONY.constants, life: 1060, attack: 103 },
  // A granite-grey shirt (25-28) over near-black trousers (29-32).
  colors: { 25: "#7a7d82", 26: "#5c5f63", 27: "#3e4043", 28: "#1f2022", 29: "#2a2a2e", 30: "#1f1f22", 31: "#151517", 32: "#0a0a0b" },
  palettes: [
    { name: "Basalt", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#a8322d", 30: "#7f2622", 31: "#561a17", 32: "#2b0d0b" } },
    { name: "Marble", colors: { 25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f", 29: "#7a7d82", 30: "#5c5f63", 31: "#3e4043", 32: "#1f2022" } },
    { name: "Sandstone", colors: { 25: "#c8a46a", 26: "#a0824f", 27: "#6e5935", 28: "#372c1a", 29: "#6a4a2a", 30: "#50381f", 31: "#362515", 32: "#1b120a" } },
  ],
};
