/**
 * House fighter "Emerald Viper" (RUSHDOWN): a red-haired acrobat in a green armoured bodysuit, on the Night Club
 * sheets' Diana model, with Jade Serpent's capoeira (the Striker's numbers and AI): the ginga, the martelo and armada,
 * the rasteira sweep, a cartwheel kick, a rising handstand kick and the parafuso.
 */
import { DIANA, onNightClub } from "./night-club.ts";
import { JADE_SERPENT } from "./jade-serpent.ts";
import type { TemplateSpec } from "./spec.ts";

export const EMERALD_VIPER: TemplateSpec = {
  ...onNightClub(JADE_SERPENT, DIANA),
  id: "gi-emerald-viper",
  name: "Emerald Viper",
  // As drawn: a green bodysuit (hues 90-145). Outfits turn it.
  palettes: [
    { name: "Violet", colors: {}, shifts: [{ from: 90, to: 145, hue: 275 }] },
    { name: "Garnet", colors: {}, shifts: [{ from: 90, to: 145, hue: 352 }] },
    { name: "Cobalt", colors: {}, shifts: [{ from: 90, to: 145, hue: 215 }] },
  ],
};
