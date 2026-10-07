/**
 * House fighter "Tawny Coyote" (ALL_ROUNDER): an adventurer in a brimmed hat and leather, on the Night Club sheets'
 * Erika model, with Crimson Mongoose's kickboxing (the Brawler's numbers and AI): a bobbing guard, a jab, a stepping
 * cross, an overhand rush and an uppercut against jumps.
 */
import { ERIKA, onNightClub } from "./night-club.ts";
import { CRIMSON_MONGOOSE } from "./crimson-mongoose.ts";
import type { TemplateSpec } from "./spec.ts";

export const TAWNY_COYOTE: TemplateSpec = {
  ...onNightClub(CRIMSON_MONGOOSE, ERIKA),
  id: "gi-tawny-coyote",
  name: "Tawny Coyote",
  // As drawn: brown leather (hues 10-50, dark: her skin is the same hue but lighter, so it stays). Outfits turn the leather.
  palettes: [
    { name: "Shadow", colors: {}, shifts: [{ from: 10, to: 50, lights: [0, 0.32], hue: null, light: 0.6 }] },
    { name: "Oxblood", colors: {}, shifts: [{ from: 10, to: 50, lights: [0, 0.32], hue: 355, sat: 1.1 }] },
    { name: "Forest", colors: {}, shifts: [{ from: 10, to: 50, lights: [0, 0.32], hue: 110 }] },
  ],
};
