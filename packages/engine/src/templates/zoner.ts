/**
 * ZONER template, "Sage": keeps the opponent out. Long kicks and a straight
 * to poke from a distance, the Energy Palm projectile, and an uppercut for
 * anyone jumping over it; backs away when crowded. A little less life.
 */
import type { TemplateSpec } from "./spec.ts";
import { sharedAnims, UNIVERSAL_PROTOTYPE } from "./universal-prototype.ts";

export const ZONER: TemplateSpec = {
  id: "gi-tpl-zoner",
  name: "Sage",
  archetype: "ZONER",
  art: UNIVERSAL_PROTOTYPE,
  constants: {
    life: 950,
    attack: 95,
    defence: 100,
    walkFwd: 2.2,
    walkBack: -2.4,
    runFwd: 4.3,
    hopBack: [-5, -4],
    jumpUp: -8.4,
    jumpFwd: 2.4,
    jumpBack: -2.8,
    gravity: 0.44,
    width: [15, 15],
    height: 60,
  },
  anims: [
    ...sharedAnims({ stand: { from: 14, to: 21 }, standTicks: 6 }),
    { action: 180, cells: [212, 213, 214, 215, 216], ticks: [5, 5, 5, 6, 60], loop: false, comment: "win: point" },
    { action: 181, cells: { from: 1158, to: 1162 }, ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: arms wide" },
    { action: 190, cells: [210, 211, 212, 213, 214, 215, 216, 215, 214, 213, 14], ticks: [5, 5, 5, 5, 5, 5, 30, 4, 4, 4, 8], comment: "intro: point at the opponent" },
    { action: 195, cells: [27, 28, 29, 28, 27], ticks: [5, 5, 20, 5, 5], comment: "taunt: point" },
  ],
  attacks: [
    {
      state: 200, name: "Jab", from: "stand", command: "x",
      anim: { action: 200, cells: [224, 225, 226, 227, 228], ticks: [2, 3, 3, 3, 3] },
      hits: [{ frames: [1, 2], damage: 24, height: "high", weight: "light", hitStun: 11, blockStun: 9, push: 5 }],
      ai: { range: 50, weight: 2 },
    },
    {
      state: 210, name: "Straight", from: "stand", command: "y",
      anim: { action: 210, cells: [213, 214, 215, 216, 217, 218], ticks: [3, 3, 4, 4, 4, 4] },
      hits: [{ frames: [2, 3], damage: 50, height: "high", weight: "medium", hitStun: 15, blockStun: 11, push: 7 }],
      ai: { range: 55, weight: 2 },
    },
    {
      state: 230, name: "Front Kick", from: "stand", command: "a",
      anim: { action: 230, cells: [806, 807, 808, 809, 810, 811, 812, 813, 814], ticks: [2, 2, 2, 3, 3, 3, 3, 3, 3] },
      hits: [{ frames: [4, 5, 6], damage: 35, height: "mid", weight: "light", hitStun: 13, blockStun: 10, push: 7 }],
      ai: { range: 75, weight: 3 },
    },
    {
      state: 240, name: "Long Side Kick", from: "stand", command: "b",
      anim: { action: 240, cells: [412, 413, 414, 415, 416, 417, 418, 419], ticks: [3, 3, 3, 4, 4, 4, 4, 4] },
      hits: [{ frames: [3, 4, 5], damage: 60, height: "mid", weight: "heavy", hitStun: 17, blockStun: 13, push: 9 }],
      ai: { range: 85, weight: 3 },
    },
    {
      state: 400, name: "Crouching Jab", from: "crouch", command: "x",
      anim: { action: 400, cells: [2275, 2276, 2277, 2278, 2279], ticks: [2, 3, 3, 3, 3] },
      hits: [{ frames: [1, 2], damage: 20, height: "low", weight: "light", hitStun: 10, blockStun: 8, push: 4 }],
      ai: { range: 45, weight: 1 },
    },
    {
      state: 410, name: "Crouching Straight", from: "crouch", command: "y",
      anim: { action: 410, cells: [2281, 2282, 2283, 2284, 2285, 2286], ticks: [3, 3, 4, 4, 4, 4] },
      hits: [{ frames: [2, 3], damage: 50, height: "high", weight: "medium", hitStun: 15, blockStun: 11, push: 5 }],
      ai: { range: 50, weight: 1, antiAir: true },
    },
    {
      state: 430, name: "Low Kick", from: "crouch", command: "a",
      anim: { action: 430, cells: [726, 727, 728, 729, 730, 731], ticks: [2, 3, 4, 4, 3, 3] },
      hits: [{ frames: [2, 3], damage: 26, height: "low", weight: "light", hitStun: 12, blockStun: 10, push: 5 }],
      ai: { range: 60, weight: 1 },
    },
    {
      state: 440, name: "Sweep", from: "crouch", command: "b",
      anim: { action: 440, cells: [846, 847, 848, 849, 850, 851, 852], ticks: [3, 3, 3, 4, 5, 5, 5] },
      hits: [{ frames: [4, 5], damage: 50, height: "low", weight: "heavy", hitStun: 20, blockStun: 14, push: 5, trip: true, launch: [1.5, -3] }],
      ai: { range: 75, weight: 1 },
    },
    {
      state: 600, name: "Jumping Punch", from: "air", command: "x",
      anim: { action: 600, cells: [601, 602, 603, 604, 605], ticks: [3, 3, 6, 5, 5], anchor: "feet" },
      hits: [{ frames: [2, 3], damage: 32, height: "high", weight: "light", hitStun: 12, blockStun: 10, push: 4 }],
      ai: { range: 50, weight: 2 },
    },
    {
      state: 630, name: "Flying Kick", from: "air", command: "b",
      anim: { action: 630, cells: [659, 660, 661, 662, 663], ticks: [3, 4, 8, 6, 6], anchor: "feet" },
      hits: [{ frames: [1, 2], damage: 55, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 65, weight: 1 },
    },
    {
      state: 1000, name: "Energy Palm", from: "stand", command: "QCF_x", special: true,
      anim: { action: 1000, cells: [2545, 2546, 2547, 2548, 2549, 2550, 2551, 2552], ticks: [3, 3, 3, 3, 8, 6, 5, 5] },
      hits: [{ frames: [4], damage: 50, chip: 5, height: "high", weight: "medium", hitStun: 18, blockStun: 14, push: 6 }],
      projectile: { frame: 4, speed: 5, height: 65 },
      ai: { range: 400, weight: 2 },
    },
    {
      state: 1100, name: "Rising Uppercut", from: "stand", command: "DP_y", special: true,
      anim: { action: 1100, cells: [271, 272, 273, 274, 275, 276], ticks: [2, 3, 4, 8, 5, 5] },
      hits: [{ frames: [2, 3], damage: 85, chip: 8, height: "high", weight: "heavy", hitStun: 20, blockStun: 18, push: 3, knockdown: true, launch: [2, -8] }],
      ai: { range: 45, weight: 1, antiAir: true },
    },
    {
      state: 1200, name: "Spin Kick", from: "stand", command: "QCB_b", special: true,
      anim: { action: 1200, cells: [443, 444, 445, 446, 447, 448, 449, 450], ticks: [3, 3, 3, 3, 5, 5, 4, 4] },
      hits: [{ frames: [4, 5], damage: 75, chip: 7, height: "high", weight: "heavy", hitStun: 20, blockStun: 16, push: 9, knockdown: true, launch: [5, -4] }],
      moves: [{ frame: 2, x: 2 }, { frame: 6, x: 0 }],
      ai: { range: 75, weight: 1 },
    },
  ],
  ai: { range: 110, aggression: 75, block: 580, jump: 3, run: 4, retreat: 450 },
  colors: {
    25: "#2f7f7a", 26: "#23605c", 27: "#17403d", 28: "#0c201f",
    37: "#b8a47a", 38: "#8a7b5c", 39: "#5c523d", 40: "#2e291f",
  },
  palettes: [
    { name: "Flame", colors: { 25: "#c0532a", 26: "#903e20", 27: "#602915", 28: "#30150b", 240: "#fffbe0", 241: "#ffe89a", 242: "#ffc04d", 243: "#ff8a1f", 244: "#e0520f", 245: "#992b08" } },
    { name: "Violet", colors: { 25: "#6f4fa8", 26: "#533b7e", 27: "#382854", 28: "#1c142a", 240: "#ffffff", 241: "#f0dcff", 242: "#d1a3ff", 243: "#a86bff", 244: "#7a3fe0", 245: "#4a1f99" } },
    { name: "Stone", colors: { 25: "#8a8a8a", 26: "#686868", 27: "#454545", 28: "#232323", 37: "#3c3c46", 38: "#2a2a32", 39: "#1c1c22", 40: "#0c0c10" } },
  ],
  portrait: { cell: 14 },
};
