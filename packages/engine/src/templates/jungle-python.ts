/**
 * House fighter "Jungle Python" (GRAPPLER): a wrestler in a green crop top and camo trousers, on the Night Club
 * sheets' Anastasia model, with Neon Gorilla's punk wrestling (the Wrestler's numbers, AI and throws: the body slam
 * and the dive grab) from a wide, knuckles-low stance.
 */
import { ANASTASIA, onNightClub } from "./night-club.ts";
import { NEON_GORILLA } from "./neon-gorilla.ts";
import type { TemplateSpec } from "./spec.ts";

export const JUNGLE_PYTHON: TemplateSpec = {
  ...onNightClub(NEON_GORILLA, ANASTASIA),
  id: "gi-jungle-python",
  name: "Jungle Python",
  // As drawn: camo greens and yellow boots. Outfits turn the camo's greens (hues 70-140).
  palettes: [
    { name: "Desert", colors: {}, shifts: [{ from: 70, to: 140, hue: 38, sat: 0.8 }] },
    { name: "Arctic", colors: {}, shifts: [{ from: 70, to: 140, hue: null, light: 1.5 }] },
    { name: "Midnight", colors: {}, shifts: [{ from: 70, to: 140, hue: 225, light: 0.9 }] },
  ],
};
