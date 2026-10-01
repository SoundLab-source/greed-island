/**
 * ALL_ROUNDER template, "Brawler": punches and kicks of every range, one
 * anti-air, one rushing move, no weaknesses and no standout strength. The
 * reference other archetypes are balanced against.
 */
import type { TemplateSpec } from "./spec.ts";
import { sharedAnims, UNIVERSAL_PROTOTYPE } from "./universal-prototype.ts";

export const ALL_ROUNDER: TemplateSpec = {
  id: "gi-tpl-all-rounder",
  name: "Brawler",
  archetype: "ALL_ROUNDER",
  art: UNIVERSAL_PROTOTYPE,
  constants: {
    life: 1000,
    attack: 100,
    defence: 100,
    walkFwd: 2.4,
    walkBack: -2.2,
    runFwd: 4.6,
    hopBack: [-4.5, -3.8],
    jumpUp: -8.4,
    jumpFwd: 2.5,
    jumpBack: -2.55,
    gravity: 0.44,
    width: [16, 15],
    height: 60,
  },
  anims: [
    ...sharedAnims({ stand: { from: 240, to: 251 } }),
    { action: 180, cells: { from: 201, to: 205 }, ticks: [6, 6, 6, 8, 60], loop: false, comment: "win: fist pump" },
    { action: 181, cells: { from: 1158, to: 1162 }, ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: arms wide" },
    { action: 190, cells: [1684, 1685, 1686, 1687, 1688, 1687, 1686, 1685, 1684, 240], ticks: [6, 6, 6, 6, 40, 5, 5, 5, 5, 10], comment: "intro: point at the opponent" },
    { action: 195, cells: { from: 22, to: 26 }, ticks: [5, 5, 5, 20, 6], comment: "taunt" },
  ],
  attacks: [
    {
      state: 200, name: "Jab", from: "stand", command: "x",
      anim: { action: 200, cells: [251, 252, 253, 254, 255, 256], ticks: [2, 4, 3, 3, 3, 3] },
      hits: [{ frames: [1], damage: 25, height: "high", weight: "light", hitStun: 11, blockStun: 9, push: 4 }],
      ai: { range: 45, weight: 3 },
    },
    {
      state: 210, name: "Lunge Punch", from: "stand", command: "y",
      anim: { action: 210, cells: [280, 281, 282, 283, 284, 285, 286, 287], ticks: [3, 3, 3, 5, 4, 4, 4, 4] },
      hits: [{ frames: [3], damage: 60, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 6 }],
      moves: [{ frame: 2, x: 2 }, { frame: 5, x: 0 }],
      ai: { range: 70, weight: 2 },
    },
    {
      state: 230, name: "Mid Kick", from: "stand", command: "a",
      anim: { action: 230, cells: [389, 390, 391, 392, 393, 394, 395], ticks: [2, 3, 3, 4, 3, 3, 3] },
      hits: [{ frames: [2, 3], damage: 30, height: "mid", weight: "light", hitStun: 12, blockStun: 10, push: 5 }],
      ai: { range: 60, weight: 3 },
    },
    {
      state: 240, name: "High Kick", from: "stand", command: "b",
      anim: { action: 240, cells: [377, 378, 379, 380, 381, 382], ticks: [4, 4, 5, 5, 4, 4] },
      hits: [{ frames: [1, 2], damage: 70, height: "high", weight: "heavy", hitStun: 18, blockStun: 14, push: 7 }],
      ai: { range: 70, weight: 2 },
    },
    {
      state: 400, name: "Crouching Jab", from: "crouch", command: "x",
      anim: { action: 400, cells: [2275, 2276, 2277, 2278, 2279], ticks: [2, 3, 3, 3, 3] },
      hits: [{ frames: [1, 2], damage: 22, height: "low", weight: "light", hitStun: 10, blockStun: 8, push: 4 }],
      ai: { range: 45, weight: 2 },
    },
    {
      state: 410, name: "Crouching Straight", from: "crouch", command: "y",
      anim: { action: 410, cells: [2281, 2282, 2283, 2284, 2285, 2286], ticks: [3, 3, 4, 4, 4, 4] },
      hits: [{ frames: [2, 3], damage: 55, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 50, weight: 1, antiAir: true },
    },
    {
      state: 430, name: "Low Kick", from: "crouch", command: "a",
      anim: { action: 430, cells: [726, 727, 728, 729, 730, 731], ticks: [2, 3, 4, 4, 3, 3] },
      hits: [{ frames: [2, 3], damage: 28, height: "low", weight: "light", hitStun: 12, blockStun: 10, push: 5 }],
      ai: { range: 60, weight: 2 },
    },
    {
      state: 440, name: "Sweep", from: "crouch", command: "b",
      anim: { action: 440, cells: [846, 847, 848, 849, 850, 851, 852], ticks: [3, 3, 3, 4, 5, 5, 5] },
      hits: [{ frames: [4, 5], damage: 55, height: "low", weight: "heavy", hitStun: 20, blockStun: 14, push: 5, trip: true, launch: [1.5, -3] }],
      ai: { range: 75, weight: 1 },
    },
    {
      state: 600, name: "Jumping Punch", from: "air", command: "x",
      anim: { action: 600, cells: [601, 602, 603, 604, 605], ticks: [3, 3, 6, 5, 5], anchor: "feet" },
      hits: [{ frames: [2, 3], damage: 35, height: "high", weight: "light", hitStun: 12, blockStun: 10, push: 4 }],
      ai: { range: 50, weight: 2 },
    },
    {
      state: 630, name: "Flying Kick", from: "air", command: "b",
      anim: { action: 630, cells: [659, 660, 661, 662, 663], ticks: [3, 4, 8, 6, 6], anchor: "feet" },
      hits: [{ frames: [1, 2], damage: 60, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 65, weight: 2 },
    },
    {
      state: 1000, name: "Rushing Straight", from: "stand", command: "QCF_x", special: true,
      anim: { action: 1000, cells: [864, 866, 868, 869, 870, 871, 872, 873, 874, 875], ticks: [3, 3, 3, 3, 3, 4, 6, 4, 4, 4] },
      hits: [{ frames: [5, 6], damage: 80, chip: 8, height: "high", weight: "heavy", hitStun: 20, blockStun: 16, push: 8, knockdown: true, launch: [4, -5] }],
      moves: [{ frame: 1, x: 6 }, { frame: 7, x: 0 }],
      ai: { range: 130, weight: 1 },
    },
    {
      state: 1100, name: "Rising Uppercut", from: "stand", command: "DP_y", special: true,
      anim: { action: 1100, cells: [271, 272, 273, 274, 275, 276], ticks: [2, 3, 4, 8, 5, 5] },
      hits: [{ frames: [2, 3], damage: 90, chip: 9, height: "high", weight: "heavy", hitStun: 20, blockStun: 18, push: 3, knockdown: true, launch: [2, -8] }],
      ai: { range: 45, weight: 1, antiAir: true },
    },
    {
      state: 1200, name: "Spin Kick", from: "stand", command: "QCB_b", special: true,
      anim: { action: 1200, cells: [443, 444, 445, 446, 447, 448, 449, 450], ticks: [3, 3, 3, 3, 5, 5, 4, 4] },
      hits: [{ frames: [4, 5], damage: 85, chip: 8, height: "high", weight: "heavy", hitStun: 20, blockStun: 16, push: 9, knockdown: true, launch: [5, -4] }],
      moves: [{ frame: 2, x: 2.5 }, { frame: 6, x: 0 }],
      ai: { range: 80, weight: 1 },
    },
  ],
  ai: { range: 60, aggression: 110, block: 620, jump: 8, run: 15 },
  palettes: [
    { name: "Red", colors: { 37: "#c24545", 38: "#8f2f2f", 39: "#5e1f1f", 40: "#2f0f0f", 25: "#e0e0e0", 26: "#b0b0b0", 27: "#7a7a7a", 28: "#3d3d3d" } },
    { name: "Black", colors: { 37: "#3a3a44", 38: "#2a2a32", 39: "#1c1c22", 40: "#0e0e11", 25: "#d8c9a0", 26: "#a8996f", 27: "#76694a", 28: "#3b3425" } },
    { name: "Green", colors: { 37: "#4f8f4a", 38: "#3a6b37", 39: "#264724", 40: "#132412", 25: "#f2eed8", 26: "#c9c3a3", 27: "#8f8a70", 28: "#474538" } },
  ],
  portrait: { cell: 240 },
};
