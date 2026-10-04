/**
 * House fighter "Russet Fox" (ALL_ROUNDER): a ginger karateka, on the Bad
 * Company sheets' Stevenson model. He keeps the Brawler's numbers, AI, kicks
 * and specials (moved to the new layout by portToUp2), from a karate guard,
 * with a long lunging palm thrust; he bows to start and opens his arms to win.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { STEVENSON, onBody } from "./bad-company.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const brawler = onBody(portToUp2(ALL_ROUNDER), STEVENSON);

export const RUSSET_FOX: TemplateSpec = {
  ...withMoves(brawler, {
    anims: [
      { action: 0, cells: [...range(5104, 5108), ...range(5105, 5107).reverse()], ticks: 6, comment: "stand: a karate guard" },
      { action: 5, cells: [5104], ticks: 3, comment: "turn" },
      { action: 180, cells: [5103, 5102, 5101, 5100], ticks: [6, 6, 8, 60], loop: false, comment: "win: arms open" },
      { action: 190, cells: [5126, 5127, 5128, 5129, 5128, 5127, 5126, 5104], ticks: [6, 6, 6, 30, 6, 6, 6, 10], comment: "intro: a bow" },
      { action: 195, cells: [5124, 5125, 5126, 5125, 5124], ticks: [5, 6, 20, 6, 5], comment: "taunt: stands tall" },
    ],
    attacks: [
      // A hand-made box round the palm: the automatic one took in his lunging front foot.
      redrawMove(brawler, 210, "Palm Thrust", range(5115, 5122), [3, 3, 3, 5, 3, 3, 3, 3], [3], { hit: { box: [40, -144, 68, -116] } }),
    ],
  }),
  id: "gi-russet-fox",
  name: "Russet Fox",
  // A white karate gi (shirt 25-28, trousers 29-32) and black gloves (49-52) under his ginger hair.
  colors: {
    25: "#ecebe6", 26: "#c3c1b8", 27: "#89877f", 28: "#44433f",
    29: "#e2e0da", 30: "#b8b6ae", 31: "#807e78", 32: "#403f3c",
    49: "#2a2a2a", 50: "#1f1f1f", 51: "#151515", 52: "#0a0a0a",
  },
  palettes: [
    { name: "Arctic", colors: { 25: "#c8d0dc", 26: "#9ea6b2", 27: "#6a7280", 28: "#353940", 29: "#c8d0dc", 30: "#9ea6b2", 31: "#6a7280", 32: "#353940", 9: "#e8e8ee", 10: "#bcbcc6", 11: "#83838f", 12: "#41414a" } },
    { name: "Black", colors: { 25: "#2e2e34", 26: "#222226", 27: "#17171a", 28: "#0b0b0d", 29: "#2e2e34", 30: "#222226", 31: "#17171a", 32: "#0b0b0d", 49: "#a8322d", 50: "#7f2622", 51: "#561a17", 52: "#2b0d0b" } },
    { name: "Desert", colors: { 25: "#c8b080", 26: "#a08a60", 27: "#6e5e40", 28: "#372f20", 29: "#c8b080", 30: "#a08a60", 31: "#6e5e40", 32: "#372f20" } },
  ],
  portrait: { cell: 5104 },
};
