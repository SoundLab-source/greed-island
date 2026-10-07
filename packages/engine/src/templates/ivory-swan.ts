/**
 * House fighter "Ivory Swan" (ZONER): a blonde taekwondo kicker in a white and pale blue dress, on the Night Club
 * sheets' Cindy model, with Silver Crane's taekwondo (the Sage's numbers, AI and energy palm): long chambered kicks
 * that keep opponents out.
 */
import { CINDY, onNightClub } from "./night-club.ts";
import { SILVER_CRANE } from "./silver-crane.ts";
import type { TemplateSpec } from "./spec.ts";

export const IVORY_SWAN: TemplateSpec = {
  ...onNightClub(SILVER_CRANE, CINDY),
  id: "gi-ivory-swan",
  name: "Ivory Swan",
  // As drawn: white with pale blue (hues 175-220) and a purple belt (255-290). Outfits turn the blue, and the belt.
  palettes: [
    { name: "Rose", colors: {}, shifts: [{ from: 175, to: 220, hue: 335 }, { from: 255, to: 290, hue: 200 }] },
    { name: "Jade", colors: {}, shifts: [{ from: 175, to: 220, hue: 150 }, { from: 255, to: 290, hue: 45 }] },
    { name: "Sunset", colors: {}, shifts: [{ from: 175, to: 220, hue: 28, sat: 1.2 }, { from: 255, to: 290, hue: 350 }] },
  ],
};
