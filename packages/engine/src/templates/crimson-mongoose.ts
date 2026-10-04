/**
 * House fighter "Crimson Mongoose" (ALL_ROUNDER): a red-haired punk kickboxer,
 * on the Bad Company sheets' Banderas model. He keeps the Brawler's numbers,
 * AI, kicks, crouching and air moves (moved to the new layout by portToUp2),
 * and boxes with the sheet's boxing style: a bobbing guard for a stance, a
 * jab, a stepping cross, an overhand rush and an uppercut against jumps; he
 * raises a fist to win and waves opponents in. Each punch takes the place of
 * a Brawler move with the same job, hit numbers and timing.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { BANDERAS, onBody } from "./bad-company.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const brawler = onBody(portToUp2(ALL_ROUNDER), BANDERAS);

export const CRIMSON_MONGOOSE: TemplateSpec = {
  ...withMoves(brawler, {
    anims: [
      { action: 0, cells: range(4573, 4587), ticks: 4, comment: "stand: a bobbing boxer's guard" },
      { action: 5, cells: [4573], ticks: 3, comment: "turn" },
      { action: 180, cells: range(4640, 4643), ticks: [6, 6, 8, 60], loop: false, comment: "win: a fist raised" },
      { action: 181, cells: range(4625, 4628), ticks: [5, 5, 6, 60], loop: false, comment: "win: arms spread, come on" },
      { action: 190, cells: [...range(4625, 4628), 4627, 4626, 4625, 4573], ticks: [5, 5, 6, 30, 5, 5, 5, 10], comment: "intro: waves the opponent in" },
      { action: 195, cells: [4626, 4627, 4628, 4627, 4626], ticks: [5, 6, 20, 6, 5], comment: "taunt: come on" },
    ],
    attacks: [
      redrawMove(brawler, 200, "Jab", range(4587, 4591), [2, 4, 3, 3, 2], [1]),
      // Hand-made boxes round the fist: the automatic ones took in his stepping legs too.
      redrawMove(brawler, 210, "Cross", [...range(4591, 4596), 4590, 4587], [3, 3, 3, 5, 3, 3, 3, 3], [3], { hit: { box: [50, -134, 90, -106] } }),
      // The Brawler's rushing straight becomes an overhand: wound up behind the head, then a long lunging punch.
      redrawMove(brawler, 1000, "Overhand Rush", range(4598, 4606), [3, 3, 4, 5, 4, 6, 4, 4, 4], [4, 5], { hit: { box: [60, -122, 106, -90] } }),
      redrawMove(brawler, 1100, "Rising Uppercut", [4617, ...range(4619, 4624)], [2, 3, 4, 8, 4, 3, 3], [2, 3]),
    ],
  }),
  id: "gi-crimson-mongoose",
  name: "Crimson Mongoose",
  // His hunched, bobbing guard is a small target and his punches reach a little further than the Brawler's: with the
  // Brawler's numbers he won 66% in the balance tool (2026-10-04), so less life and punch.
  constants: { ...brawler.constants, life: 930, attack: 94 },
  // Red boxing gloves (49-52) and black boots (37-40) on the grey shirt, black trousers and red hair he's drawn with.
  colors: { 49: "#d13a32", 50: "#a02b25", 51: "#6e1d19", 52: "#370e0c", 37: "#505050", 38: "#3a3a3a", 39: "#262626", 40: "#121212" },
  palettes: [
    { name: "Cobalt", colors: { 49: "#3a6fd1", 50: "#2b53a0", 51: "#1d386e", 52: "#0e1c37", 25: "#e8e8e8", 26: "#bdbdbd", 27: "#848484", 28: "#424242", 53: "#e0c060", 54: "#b09040", 55: "#786028", 56: "#3c3014" } },
    { name: "Golden", colors: { 49: "#e0b040", 50: "#b08a30", 51: "#7a5f20", 52: "#3d3010", 25: "#2e2e2e", 26: "#222222", 27: "#171717", 28: "#0b0b0b", 29: "#d8d8d8", 30: "#adadad", 31: "#767676", 32: "#3b3b3b", 53: "#2a2522", 54: "#1f1b19", 55: "#151211", 56: "#0a0908" } },
    { name: "Venom", colors: { 49: "#5ad16a", 50: "#43a050", 51: "#2d6e36", 52: "#16371b", 25: "#6a3fa0", 26: "#50307a", 27: "#362053", 28: "#1b1029", 53: "#e25aa8", 54: "#b04585", 55: "#7a2f5c", 56: "#3d182e" } },
  ],
  portrait: { cell: 4587 },
};
