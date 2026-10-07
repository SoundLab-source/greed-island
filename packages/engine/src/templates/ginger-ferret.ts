/**
 * House fighter "Ginger Ferret" (ALL_ROUNDER): a red-haired brawler in olive cargo trousers and knee pads, drawn in a
 * cartoon shade (the Night Club sheets' cartoon Anastasia), with Feral Lynx's feral style (the Brawler's numbers and
 * AI): a bouncing crouch, a claws-out prowl, claw swipes and lunges, a sprinting pounce, a rising claw and a flip kick.
 */
import { ANASTASIA_CARTOON, onNightClub } from "./night-club.ts";
import { FERAL_LYNX } from "./feral-lynx.ts";
import type { TemplateSpec } from "./spec.ts";

export const GINGER_FERRET: TemplateSpec = {
  ...onNightClub(FERAL_LYNX, ANASTASIA_CARTOON),
  id: "gi-ginger-ferret",
  name: "Ginger Ferret",
  // As drawn: olive cargo trousers (hues 45-85). Outfits turn them.
  palettes: [
    { name: "Navy Cargo", colors: {}, shifts: [{ from: 45, to: 85, hue: 220 }] },
    { name: "Desert Cargo", colors: {}, shifts: [{ from: 45, to: 85, hue: 35, sat: 0.9, light: 1.15 }] },
    { name: "Black Cargo", colors: {}, shifts: [{ from: 45, to: 85, hue: null, light: 0.6 }] },
  ],
};
