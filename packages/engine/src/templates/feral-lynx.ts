/**
 * House fighter "Feral Lynx" (ALL_ROUNDER): a wild, crouching fighter on the
 * second Universal Prototype model. She keeps the Brawler's numbers, AI and
 * crouching and air moves (moved to the new model by portToUp2), with the
 * sheet's feral style: a bouncing crouch for a stance, a claws-out prowl for a
 * walk, claw swipes and lunges for her punches, two wild kicks, and three
 * specials (a sprinting pounce, a rising claw against jumps and a flip kick);
 * she roars to start and to win. Each move takes the place of a Brawler move
 * with the same job, hit numbers and about the same timing.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import type { TemplateSpec } from "./spec.ts";
import { cellRange as range, portToUp2, redrawMove, withMoves } from "./universal-prototype-2.ts";

const brawler = portToUp2(ALL_ROUNDER);

export const FERAL_LYNX: TemplateSpec = {
  ...withMoves(brawler, {
    anims: [
      { action: 0, cells: range(3907, 3916), ticks: 5, comment: "stand: a bouncing crouch" },
      { action: 20, cells: range(4066, 4080), ticks: 4, comment: "walk forward: prowling, claws out" },
      { action: 21, cells: range(4066, 4080).reverse(), ticks: 4, comment: "walk back" },
      { action: 180, cells: [4155, 4156, 4157, 4158, 4159], ticks: [5, 5, 5, 6, 60], loop: false, comment: "win: a roar" },
      { action: 181, cells: [...range(4178, 4192)], ticks: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 6, 60], loop: false, comment: "win: a leap and a somersault" },
      { action: 190, cells: [4148, 4149, 4150, 4157, 4158, 4159, 4158, 3907], ticks: [5, 5, 5, 8, 10, 30, 8, 8], comment: "intro: crouch and roar" },
      { action: 195, cells: [4156, 4157, 4158, 4159, 4158], ticks: [4, 5, 6, 20, 6], comment: "taunt: a roar" },
    ],
    attacks: [
      redrawMove(brawler, 200, "Swipe", [4060, 4062, 4063, 4064], [2, 4, 3, 3], [1]),
      redrawMove(brawler, 210, "Lunging Claw", range(4150, 4156), [2, 2, 2, 3, 5, 3, 3], [4], { moves: [{ frame: 2, x: 2 }, { frame: 5, x: 0 }] }),
      redrawMove(brawler, 230, "Snap Kick", range(3929, 3935), [1, 2, 2, 4, 3, 2, 2], [3, 4]),
      redrawMove(brawler, 240, "Long Kick", range(3922, 3928), [2, 1, 2, 4, 4, 3, 3], [3, 4]),
      // The Brawler's rushing straight becomes a sprint into a two-handed claw.
      redrawMove(brawler, 1000, "Pounce", [...range(3878, 3883), 4062, 4063, 4064, 4065], [2, 2, 2, 3, 3, 3, 4, 6, 4, 4], [6, 7], { moves: [{ frame: 1, x: 6 }, { frame: 7, x: 0 }] }),
      redrawMove(brawler, 1100, "Rising Claw", range(4114, 4121), [1, 2, 2, 4, 5, 4, 4, 4], [3, 4]),
      redrawMove(brawler, 1200, "Flip Kick", range(3937, 3946), [2, 2, 2, 2, 2, 2, 5, 3, 3, 3], [6], { moves: [{ frame: 2, x: 2.5 }, { frame: 7, x: 0 }] }),
    ],
  }),
  id: "gi-feral-lynx",
  name: "Feral Lynx",
  // Her low crouch is a small target (high attacks pass over her), so she has less life and punch than the
  // Brawler: with his numbers she won 67% in the balance tool; with these, 49% against the templates and 55% in an
  // eight-fighter round robin before a last trim (2026-10-03).
  constants: { ...brawler.constants, life: 890, attack: 92 },
  // A tawny coat (29-32) and darker trim (33-36).
  colors: {
    29: "#c08a3e", 30: "#96692c", 31: "#66461c", 32: "#33230e",
    33: "#3a2a1c", 34: "#2b1f15", 35: "#1d150e", 36: "#0e0a07",
  },
  palettes: [
    { name: "Snow", colors: { 29: "#e8e8ee", 30: "#bcbcc6", 31: "#83838f", 32: "#41414a", 33: "#5a6a80", 34: "#435063", 35: "#2d3543", 36: "#161b22" } },
    { name: "Shadow", colors: { 29: "#3a3a42", 30: "#2a2a31", 31: "#1c1c21", 32: "#0e0e11", 33: "#c9a24a", 34: "#9c7c34", 35: "#6a5422", 36: "#352a11" } },
    { name: "Rust", colors: { 29: "#b5482a", 30: "#8a361f", 31: "#5c2415", 32: "#2e120a", 33: "#e0c070", 34: "#b09450", 35: "#786434", 36: "#3c321a" } },
  ],
  portrait: { cell: 4137 },
};
