/**
 * HEAVY template, "Bruiser": slow and hard to knock over. More life and
 * power, a slow walk and a low jump, an overhead hammer smash that must be
 * blocked standing, and a shoulder charge; blocks a lot and waits.
 */
import type { TemplateSpec } from "./spec.ts";
import { sharedAnims, UNIVERSAL_PROTOTYPE } from "./universal-prototype.ts";

export const HEAVY: TemplateSpec = {
  id: "gi-tpl-heavy",
  name: "Bruiser",
  archetype: "HEAVY",
  art: UNIVERSAL_PROTOTYPE,
  constants: {
    life: 1100,
    attack: 105,
    defence: 105,
    walkFwd: 1.9,
    walkBack: -1.7,
    runFwd: 3.8,
    hopBack: [-3.8, -3.2],
    jumpUp: -7.8,
    jumpFwd: 2.2,
    jumpBack: -2.2,
    gravity: 0.44,
    width: [18, 17],
    height: 64,
  },
  anims: [
    ...sharedAnims({ stand: { from: 1855, to: 1866 }, standTicks: 6 }),
    { action: 180, cells: { from: 1158, to: 1162 }, ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: arms wide" },
    { action: 181, cells: { from: 201, to: 205 }, ticks: [6, 6, 6, 8, 60], loop: false, comment: "win: fist pump" },
    { action: 190, cells: [1791, 1792, 1793, 1794, 1795, 1796, 1797, 1798, 1799, 1800, 1801, 1855], ticks: [5, 5, 5, 5, 5, 6, 8, 20, 6, 5, 5, 10], comment: "intro: squat into the stance" },
    { action: 195, cells: { from: 22, to: 26 }, ticks: [5, 5, 5, 20, 6], comment: "taunt" },
  ],
  attacks: [
    {
      state: 200, name: "Heavy Jab", from: "stand", command: "x",
      anim: { action: 200, cells: [1848, 1849, 1850, 1851, 1852, 1853], ticks: [3, 3, 4, 3, 3, 3] },
      hits: [{ frames: [1, 2], damage: 32, height: "high", weight: "light", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 55, weight: 3 },
    },
    {
      state: 210, name: "Hammer Smash", from: "stand", command: "y",
      anim: { action: 210, cells: [1872, 1873, 1874, 1875, 1876, 1877, 1878, 1879, 1880], ticks: [2, 3, 3, 4, 3, 3, 5, 6, 6] },
      hits: [{ frames: [5, 6], damage: 90, height: "overhead", weight: "heavy", hitStun: 22, blockStun: 16, push: 7 }],
      ai: { range: 70, weight: 2 },
    },
    {
      state: 230, name: "Mid Kick", from: "stand", command: "a",
      anim: { action: 230, cells: [389, 390, 391, 392, 393, 394, 395], ticks: [3, 3, 4, 4, 3, 3, 3] },
      hits: [{ frames: [2, 3], damage: 38, height: "mid", weight: "medium", hitStun: 17, blockStun: 13, push: 6 }],
      ai: { range: 60, weight: 2 },
    },
    {
      state: 240, name: "Big Boot", from: "stand", command: "b",
      anim: { action: 240, cells: [377, 378, 379, 380, 381, 382], ticks: [4, 4, 5, 4, 4, 4] },
      hits: [{ frames: [1, 2], damage: 85, height: "high", weight: "heavy", hitStun: 21, blockStun: 15, push: 9 }],
      ai: { range: 70, weight: 2 },
    },
    {
      state: 400, name: "Crouching Jab", from: "crouch", command: "x",
      anim: { action: 400, cells: [2275, 2276, 2277, 2278, 2279], ticks: [3, 3, 3, 3, 3] },
      hits: [{ frames: [1, 2], damage: 26, height: "low", weight: "light", hitStun: 13, blockStun: 10, push: 4 }],
      ai: { range: 45, weight: 1 },
    },
    {
      state: 410, name: "Crouching Straight", from: "crouch", command: "y",
      anim: { action: 410, cells: [2281, 2282, 2283, 2284, 2285, 2286], ticks: [3, 4, 4, 5, 4, 4] },
      hits: [{ frames: [2, 3], damage: 60, height: "high", weight: "medium", hitStun: 17, blockStun: 13, push: 6 }],
      ai: { range: 50, weight: 1, antiAir: true },
    },
    {
      state: 430, name: "Low Kick", from: "crouch", command: "a",
      anim: { action: 430, cells: [726, 727, 728, 729, 730, 731], ticks: [3, 3, 4, 4, 3, 3] },
      hits: [{ frames: [2, 3], damage: 32, height: "low", weight: "light", hitStun: 15, blockStun: 12, push: 5 }],
      ai: { range: 60, weight: 1 },
    },
    {
      state: 440, name: "Sweep", from: "crouch", command: "b",
      anim: { action: 440, cells: [846, 847, 848, 849, 850, 851, 852], ticks: [4, 4, 4, 4, 5, 5, 6] },
      hits: [{ frames: [4, 5], damage: 65, height: "low", weight: "heavy", hitStun: 20, blockStun: 14, push: 5, trip: true, launch: [1.5, -3] }],
      ai: { range: 75, weight: 1 },
    },
    {
      state: 600, name: "Jumping Punch", from: "air", command: "x",
      anim: { action: 600, cells: [601, 602, 603, 604, 605], ticks: [3, 3, 6, 5, 5], anchor: "feet" },
      hits: [{ frames: [2, 3], damage: 40, height: "high", weight: "light", hitStun: 12, blockStun: 10, push: 4 }],
      ai: { range: 50, weight: 2 },
    },
    {
      state: 630, name: "Flying Kick", from: "air", command: "b",
      anim: { action: 630, cells: [659, 660, 661, 662, 663], ticks: [3, 4, 8, 6, 6], anchor: "feet" },
      hits: [{ frames: [1, 2], damage: 70, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 65, weight: 2 },
    },
    {
      state: 1000, name: "Shoulder Charge", from: "stand", command: "QCF_x", special: true, throughProjectiles: true,
      anim: { action: 1000, cells: [884, 885, 886, 887, 888, 889, 890, 891, 892], ticks: [3, 3, 3, 4, 4, 4, 5, 5, 5] },
      hits: [{ frames: [3, 4, 5], damage: 95, chip: 10, height: "mid", weight: "heavy", hitStun: 22, blockStun: 18, push: 9, knockdown: true, launch: [5, -4] }],
      moves: [{ frame: 2, x: 5 }, { frame: 6, x: 0 }],
      ai: { range: 130, weight: 1 },
    },
    {
      state: 1100, name: "Heavy Uppercut", from: "stand", command: "DP_y", special: true,
      anim: { action: 1100, cells: [271, 272, 273, 274, 275, 276], ticks: [3, 3, 5, 8, 6, 6] },
      hits: [{ frames: [2, 3], damage: 100, chip: 10, height: "high", weight: "heavy", hitStun: 22, blockStun: 18, push: 3, knockdown: true, launch: [2, -7] }],
      ai: { range: 45, weight: 1, antiAir: true },
    },
    {
      state: 1200, name: "Hammer Drop", from: "stand", command: "QCB_y", special: true,
      anim: { action: 1200, cells: [1883, 1884, 1885, 1886, 1887, 1888, 1889, 1890], ticks: [3, 4, 5, 4, 4, 6, 6, 6] },
      hits: [{ frames: [4, 5], damage: 100, chip: 10, height: "mid", weight: "heavy", hitStun: 22, blockStun: 18, push: 6, knockdown: true, launch: [2.5, -3] }],
      moves: [{ frame: 3, x: 2 }, { frame: 6, x: 0 }],
      ai: { range: 80, weight: 1 },
    },
  ],
  ai: { range: 65, aggression: 100, block: 620, jump: 4, run: 8 },
  colors: {
    25: "#b83a2e", 26: "#8a2a22", 27: "#5c1c16", 28: "#2e0e0b",
    37: "#7a5a3a", 38: "#5c432b", 39: "#3d2c1c", 40: "#1f160e",
  },
  palettes: [
    { name: "Navy", colors: { 25: "#3c5a8a", 26: "#2c4468", 27: "#1d2d45", 28: "#0f1723" } },
    { name: "Olive", colors: { 25: "#6b7a3a", 26: "#505c2b", 27: "#363d1d", 28: "#1b1f0e", 37: "#3a3a3a", 38: "#2b2b2b", 39: "#1d1d1d", 40: "#0e0e0e" } },
    { name: "White", colors: { 25: "#ededed", 26: "#c2c2c2", 27: "#8a8a8a", 28: "#454545" } },
  ],
  portrait: { cell: 1855 },
};
