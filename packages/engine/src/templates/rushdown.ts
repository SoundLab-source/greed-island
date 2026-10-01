/**
 * RUSHDOWN template, "Striker": a kicker who closes in fast and doesn't stop.
 * Quick walk and run, four kicks on the four buttons,
 * air kicks, and spinning kicks as specials; less life than the others.
 */
import type { TemplateSpec } from "./spec.ts";
import { sharedAnims, UNIVERSAL_PROTOTYPE } from "./universal-prototype.ts";

export const RUSHDOWN: TemplateSpec = {
  id: "gi-tpl-rushdown",
  name: "Striker",
  archetype: "RUSHDOWN",
  art: UNIVERSAL_PROTOTYPE,
  constants: {
    life: 900,
    attack: 100,
    defence: 95,
    walkFwd: 2.9,
    walkBack: -2.5,
    runFwd: 5.8,
    hopBack: [-5, -3.6],
    jumpUp: -8.8,
    jumpFwd: 3,
    jumpBack: -2.8,
    gravity: 0.48,
    width: [15, 14],
    height: 58,
  },
  anims: [
    ...sharedAnims({ stand: [1385, 1386, 1387, 1386], standTicks: 7 }),
    { action: 180, cells: [1344, 1345, 1346, 1347, 1348], ticks: [6, 6, 6, 6, 60], loop: false, comment: "win: arms out" },
    { action: 181, cells: [2830, 2831, 2832, 2833], ticks: [6, 6, 6, 60], loop: false, comment: "win: hands behind the head" },
    { action: 190, cells: [2860, 2861, 2862, 2863, 2862, 2861, 2860, 1385], ticks: [6, 6, 6, 30, 6, 6, 6, 10], comment: "intro: bow" },
    { action: 195, cells: [2868, 2869, 2870, 2871, 2872], ticks: [5, 5, 6, 12, 6], comment: "taunt: show-off kick" },
  ],
  attacks: [
    {
      state: 200, name: "Quick Kick", from: "stand", command: "x",
      anim: { action: 200, cells: [1431, 1432, 1433, 1434, 1435, 1436], ticks: [2, 2, 3, 3, 3, 3] },
      hits: [{ frames: [3, 4], damage: 22, height: "mid", weight: "light", hitStun: 11, blockStun: 9, push: 4 }],
      ai: { range: 55, weight: 3 },
    },
    {
      state: 210, name: "Side Kick", from: "stand", command: "y",
      anim: { action: 210, cells: [1365, 1366, 1367, 1368, 1369, 1370, 1371], ticks: [2, 3, 3, 4, 3, 3, 3] },
      hits: [{ frames: [3, 4], damage: 45, height: "mid", weight: "medium", hitStun: 15, blockStun: 11, push: 6 }],
      ai: { range: 65, weight: 2 },
    },
    {
      state: 230, name: "Snap Kick", from: "stand", command: "a",
      anim: { action: 230, cells: [1353, 1354, 1355, 1356, 1357, 1358], ticks: [2, 2, 3, 3, 3, 3] },
      hits: [{ frames: [2, 3], damage: 28, height: "high", weight: "light", hitStun: 12, blockStun: 9, push: 4 }],
      ai: { range: 60, weight: 3 },
    },
    {
      state: 240, name: "Roundhouse", from: "stand", command: "b",
      anim: { action: 240, cells: [1376, 1377, 1378, 1379, 1380, 1381, 1382, 1383], ticks: [2, 3, 3, 4, 4, 3, 3, 3] },
      hits: [{ frames: [3, 4], damage: 60, height: "high", weight: "heavy", hitStun: 17, blockStun: 13, push: 7 }],
      ai: { range: 70, weight: 2 },
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
      hits: [{ frames: [2, 3], damage: 45, height: "high", weight: "medium", hitStun: 15, blockStun: 11, push: 5 }],
      ai: { range: 50, weight: 1, antiAir: true },
    },
    {
      state: 430, name: "Crouching Kick", from: "crouch", command: "a",
      anim: { action: 430, cells: [726, 727, 728, 729, 730, 731], ticks: [2, 3, 3, 4, 3, 3] },
      hits: [{ frames: [2, 3], damage: 25, height: "low", weight: "light", hitStun: 12, blockStun: 10, push: 5 }],
      ai: { range: 60, weight: 2 },
    },
    {
      state: 440, name: "Sweep", from: "crouch", command: "b",
      anim: { action: 440, cells: [846, 847, 848, 849, 850, 851, 852], ticks: [3, 3, 3, 3, 5, 5, 5] },
      hits: [{ frames: [4, 5], damage: 50, height: "low", weight: "heavy", hitStun: 20, blockStun: 14, push: 5, trip: true, launch: [1.5, -3] }],
      ai: { range: 75, weight: 1 },
    },
    {
      state: 600, name: "Air Kick", from: "air", command: "x",
      anim: { action: 600, cells: [1512, 1513, 1514, 1515, 1516], ticks: [3, 5, 5, 5, 5], anchor: "feet" },
      hits: [{ frames: [1, 2], damage: 32, height: "high", weight: "light", hitStun: 12, blockStun: 10, push: 4 }],
      ai: { range: 55, weight: 2 },
    },
    {
      state: 630, name: "Flying Kick", from: "air", command: "b",
      anim: { action: 630, cells: [1534, 1535, 1536, 1537, 1538], ticks: [3, 3, 8, 6, 6], anchor: "feet" },
      hits: [{ frames: [2, 3], damage: 55, height: "high", weight: "medium", hitStun: 16, blockStun: 12, push: 5 }],
      ai: { range: 75, weight: 3 },
    },
    {
      state: 1000, name: "Spinning Side Kick", from: "stand", command: "QCF_b", special: true,
      anim: { action: 1000, cells: [1388, 1389, 1390, 1391, 1392, 1393, 1394, 1395], ticks: [2, 3, 3, 4, 5, 4, 4, 4] },
      hits: [{ frames: [4, 5], damage: 75, chip: 7, height: "mid", weight: "heavy", hitStun: 20, blockStun: 15, push: 8, knockdown: true, launch: [4.5, -4.5] }],
      moves: [{ frame: 1, x: 5 }, { frame: 5, x: 0 }],
      ai: { range: 120, weight: 1 },
    },
    {
      state: 1100, name: "Rising Kick", from: "stand", command: "DP_a", special: true,
      anim: { action: 1100, cells: [1443, 1444, 1445, 1446, 1447, 1448], ticks: [2, 3, 5, 5, 5, 5] },
      hits: [{ frames: [2, 3, 4], damage: 80, chip: 8, height: "high", weight: "heavy", hitStun: 20, blockStun: 18, push: 3, knockdown: true, launch: [2, -8] }],
      ai: { range: 45, weight: 1, antiAir: true },
    },
    {
      state: 1200, name: "Tornado Kick", from: "stand", command: "QCB_b", special: true,
      anim: { action: 1200, cells: [1400, 1401, 1402, 1403, 1404, 1405, 1406], ticks: [2, 3, 3, 4, 5, 4, 4] },
      hits: [{ frames: [3, 4], damage: 80, chip: 8, height: "high", weight: "heavy", hitStun: 20, blockStun: 16, push: 9, knockdown: true, launch: [5, -4] }],
      moves: [{ frame: 1, x: 2.5 }, { frame: 5, x: 0 }],
      ai: { range: 80, weight: 1 },
    },
  ],
  ai: { range: 45, aggression: 115, block: 560, jump: 14, run: 45 },
  colors: {
    25: "#f0f0ec", 26: "#c9c9c4", 27: "#8f8f8a", 28: "#484845",
    37: "#3c3c46", 38: "#2a2a32", 39: "#1c1c22", 40: "#0c0c10",
  },
  palettes: [
    { name: "Crimson", colors: { 37: "#b8322e", 38: "#8a2522", 39: "#5c1916", 40: "#2e0c0b" } },
    { name: "Sky", colors: { 25: "#9fc6e8", 26: "#7497b8", 27: "#4d6680", 28: "#263340" } },
    { name: "Gold", colors: { 25: "#f2d27a", 26: "#c4a653", 27: "#8a7437", 28: "#453a1b", 37: "#2b2b2b", 38: "#1f1f1f", 39: "#141414", 40: "#0a0a0a" } },
  ],
  portrait: { cell: 1385 },
};
