/**
 * House fighter "Scarlet Hawk" (ALL_ROUNDER): a red-haired karateka (the CC0
 * Mustermann 2 template, templates/mustermann.ts). He keeps the Brawler's
 * numbers and AI, with every frame his own: a jab and a lunge punch, front
 * and high kicks, crouching punches, a low kick and a sweep, an air punch and
 * a flying kick, a long lunging punch for his rush, a jumping uppercut
 * against jumps and a spinning back kick; he settles into his guard to start
 * and raises a fist to win.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { MUSTERMANN } from "./mustermann.ts";
import type { AnimSpec, TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

/** Every animation is anchored on its lowest pixel: his frames aren't all rendered on one ground line. */
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const brawler: TemplateSpec = { ...ALL_ROUNDER, art: MUSTERMANN };

export const SCARLET_HAWK: TemplateSpec = {
  ...brawler,
  id: "gi-scarlet-hawk",
  name: "Scarlet Hawk",
  // Less life and punch than the Brawler: his hit boxes cover his own limbs as well as the Brawler's zones, so with the
  // Brawler's numbers he won 81% in the balance tool (2026-10-05); with 820 life and attack 88, 62%; with 730 and 83, 42%;
  // with 775 and 85, 53% against the ten earliest fighters but 56% against all 26 others; with these, 47% and 48%.
  constants: { ...ALL_ROUNDER.constants, life: 760, attack: 85 },
  anims: [
    a(0, [...range(4, 15), ...range(5, 14).reverse()], 5, "stand: a karate guard"),
    a(5, [4], 3, "turn"),
    a(6, [730], 3, "crouch turn"),
    a(10, [727, 728], 3, "stand to crouch"),
    a(11, [727, 729, 733, 729], 8, "crouching"),
    a(12, [728, 727], 3, "crouch to stand"),
    a(20, range(405, 419), 4, "walk forward"),
    a(21, range(405, 419).reverse(), 4, "walk back"),
    a(40, [730], 3, "jump start"),
    a(41, range(601, 606), 5, "jump up"),
    a(42, range(601, 607), 5, "jump forward"),
    a(43, range(601, 606).reverse(), 6, "jump back"),
    a(47, [730], 3, "jump land"),
    a(100, range(500, 507), 4, "run"),
    a(105, [604, 605], 6, "hop back"),
    a(120, [923, 924], 2, "guard start"),
    a(121, [733], 2, "crouch guard start"),
    a(122, [604], 2, "air guard start"),
    a(130, [925], 10, "stand guard"),
    a(131, [733], 10, "crouch guard"),
    a(132, [604], 10, "air guard"),
    a(140, [924, 923], 2, "guard end"),
    a(141, [733], 2, "crouch guard end"),
    a(142, [604], 2, "air guard end"),
    a(150, [926, 927], 3, "stand guard hit"),
    a(151, [736], 6, "crouch guard hit"),
    a(152, [604], 6, "air guard hit"),
    a(170, range(939, 944), 6, "lose (time over)", true),
    a(175, range(939, 944), 6, "draw (time over)", true),
    a(5000, [919, 920], 3, "hit high, light"),
    a(5001, [919, 920, 921], 3, "hit high, medium"),
    a(5002, [931, 932, 933], 3, "hit high, hard"),
    a(5005, [920, 919], 3, "recover high, light"),
    a(5006, [921, 920, 919], 3, "recover high, medium"),
    a(5007, [933, 932, 931, 4], 3, "recover high, hard"),
    a(5010, [939, 940], 3, "hit low, light"),
    a(5011, [939, 940, 941], 3, "hit low, medium"),
    a(5012, [941, 942, 943], 3, "hit low, hard"),
    a(5015, [940, 939], 3, "recover low, light"),
    a(5016, [941, 940, 939], 3, "recover low, medium"),
    a(5017, [943, 942, 941, 940], 3, "recover low, hard"),
    a(5020, [736], 6, "crouching hit, light"),
    a(5021, [736], 8, "crouching hit, medium"),
    a(5022, [736], 10, "crouching hit, hard"),
    a(5025, [736], 3, "crouching recover, light"),
    a(5026, [736], 4, "crouching recover, medium"),
    a(5027, [736], 3, "crouching recover, hard"),
    a(5030, [946], 4, "hit in the air"),
    a(5035, [946], 3, "air hit transition"),
    a(5040, [601, 602, 603], 4, "air recover"),
    a(5050, [945, 946], 5, "falling"),
    a(5060, [947], 5, "falling, coming down"),
    a(5070, [957, 958], 4, "tripped"),
    a(5080, [952], 4, "hit while down"),
    a(5090, [949], 4, "hit up while down"),
    a(5100, [947, 948], 3, "hit the ground"),
    a(5101, [949], 4, "bounce"),
    a(5110, [952], 30, "lying down"),
    a(5120, [...range(984, 993), 4], 4, "getting up: rolls back up"),
    a(5140, [952], 30, "lying defeated", true),
    a(5150, [952], 30, "lying defeated (match over)", true),
    a(5160, [949], 4, "bounce into the air"),
    a(5170, [950, 952], 4, "hit the ground after a bounce"),
    a(5200, [602, 603], 3, "fall recovery near the ground"),
    a(5210, [601, 602, 603, 604], 3, "fall recovery in the air"),
    a(180, [268, 269, 270], [6, 6, 60], "win: a fist raised", true),
    a(181, [276, 277, 278], [6, 6, 60], "win: the horse stance", true),
    a(190, [0, 1, 2, 3, 4], [30, 6, 6, 6, 10], "intro: turns from standing into his guard"),
    a(195, [268, 269, 270, 269, 268], [5, 6, 20, 6, 5], "taunt: a fist raised"),
  ],
  // Hand-made boxes for every attack, each covering his striking arm or leg and the space the Brawler's same move
  // covers (Ruby Lioness taught that automatic boxes on art drawn this way take only fingertips and toes). Boxes are
  // where the limb is drawn in its cell: anchoring moves them with the frame (the air moves' frames move a lot).
  attacks: [
    redrawMove(brawler, 200, "Jab", [17, 18, 19, 20, 16, 4], [2, 4, 2, 2, 2, 2], [1], { ...feet, hit: { box: [27, -136, 78, -120] } }),
    redrawMove(brawler, 210, "Lunge Punch", range(46, 53), [3, 3, 3, 5, 3, 3, 3, 3], [3], { ...feet, hit: { box: [39, -150, 87, -120] } }),
    redrawMove(brawler, 230, "Front Kick", range(142, 148), [2, 3, 3, 4, 2, 2, 2], [2, 3], { ...feet, hit: { box: [24, -153, 105, -78] } }),
    redrawMove(brawler, 240, "High Kick", range(168, 173), [4, 4, 5, 4, 3, 3], [1, 2], { ...feet, hit: { box: [15, -160, 94, -96] } }),
    redrawMove(brawler, 400, "Crouching Jab", range(783, 787), [2, 3, 3, 3, 3], [1, 2], { ...feet, hit: { box: [28, -100, 87, -66] } }),
    redrawMove(brawler, 410, "Crouching Punch", range(735, 740), [3, 3, 4, 4, 4, 4], [2, 3], { ...feet, hit: { box: [19, -119, 94, -90] } }),
    redrawMove(brawler, 430, "Low Kick", range(822, 827), [2, 3, 4, 4, 3, 3], [2, 3], { ...feet, hit: { box: [28, -60, 119, -13] } }),
    redrawMove(brawler, 440, "Sweep", range(800, 806), [3, 3, 3, 4, 5, 5, 5], [4, 5], { ...feet, hit: { box: [15, -50, 98, -8] } }),
    redrawMove(brawler, 600, "Air Punch", range(641, 645), [3, 3, 6, 5, 5], [2, 3], { ...feet, hit: { box: [30, -150, 80, -105] } }),
    redrawMove(brawler, 630, "Flying Kick", range(691, 695), [3, 4, 8, 6, 6], [1, 2], { ...feet, hit: { box: [20, -128, 105, -85] } }),
    redrawMove(brawler, 1000, "Lunging Punch", range(120, 129), [3, 3, 3, 3, 3, 4, 6, 4, 4, 4], [5, 6], { ...feet, hit: { box: [39, -140, 108, -100] } }),
    redrawMove(brawler, 1100, "Jumping Uppercut", range(540, 545), [2, 3, 4, 8, 5, 5], [2, 3], { ...feet, hit: { box: [36, -182, 66, -100] } }),
    redrawMove(brawler, 1200, "Spinning Back Kick", range(198, 205), [3, 3, 3, 3, 5, 5, 4, 4], [4, 5], { ...feet, hit: { box: [35, -159, 112, -92] } }),
  ],
  // A scarlet gi (trousers 31-34) and a black belt (15-18), with the grey tank top and red hair he's drawn with.
  colors: { 31: "#b0203a", 32: "#86182c", 33: "#5c101e", 34: "#2e080f", 15: "#2a2a2a", 16: "#1f1f1f", 17: "#151515", 18: "#0a0a0a" },
  palettes: [
    { name: "White", colors: { 31: "#ecebe6", 32: "#c3c1b8", 33: "#89877f", 34: "#44433f", 35: "#e2e0da", 36: "#b8b6ae", 37: "#807e78", 38: "#403f3c", 15: "#2a2a2a", 16: "#1f1f1f", 17: "#151515", 18: "#0a0a0a" } },
    { name: "Saffron", colors: {} },
    { name: "Night", colors: { 31: "#2a2a2e", 32: "#1f1f22", 33: "#151517", 34: "#0a0a0b", 35: "#3a3a3e", 36: "#2b2b2e", 37: "#1c1c1f", 38: "#0e0e10", 15: "#b0203a", 16: "#86182c", 17: "#5c101e", 18: "#2e080f" } },
  ],
  portrait: { cell: 4 },
};
