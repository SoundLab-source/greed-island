/**
 * House fighter "Camo Cobra" (RUSHDOWN): a bald Muay Thai brawler in camo and pink gloves (Rhivan from the CC0
 * Mustermenschen V1, templates/rhivan-thai.ts). He keeps the Striker's numbers and AI, with every frame his own:
 * a jab, a cross, a push kick and a high roundhouse on the four buttons; crouching jab, straight, kick and a
 * sweep; an air knee and a flying kick; and as specials a spinning back fist, a jumping knee and a cartwheel
 * kick. He walks in, arms spread, to start; wins flexing or pointing at whoever's down.
 */
import { RUSHDOWN } from "./rushdown.ts";
import { RHIVAN_THAI } from "./rhivan-thai.ts";
import type { AnimSpec, TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

/** Every animation is anchored on its lowest pixel: his frames aren't all rendered on one ground line. */
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const striker: TemplateSpec = { ...RUSHDOWN, art: RHIVAN_THAI };

export const CAMO_COBRA: TemplateSpec = {
  ...striker,
  id: "gi-camo-cobra",
  name: "Camo Cobra",
  anims: [
    a(0, range(0, 9), 5, "stand: a bouncing Muay Thai guard"),
    a(5, [0], 3, "turn"),
    a(6, [557], 3, "crouch turn"),
    a(10, [555, 556], 3, "stand to crouch"),
    a(11, [556, 557, 558, 557], 8, "crouching"),
    a(12, [556, 555], 3, "crouch to stand"),
    a(20, range(116, 131), 4, "walk forward"),
    a(21, range(116, 131).reverse(), 4, "walk back"),
    a(40, [555], 3, "jump start"),
    a(41, range(619, 628), 5, "jump up"),
    a(42, range(638, 645), 5, "jump forward: a roll"),
    a(43, range(619, 628).reverse(), 5, "jump back"),
    a(47, [555], 3, "jump land"),
    a(100, range(480, 491), 3, "run: bouncing steps"),
    a(105, [653, 654, 655], 6, "hop back"),
    a(120, [97, 98], 2, "guard start"),
    a(121, [557], 2, "crouch guard start"),
    a(122, [686], 2, "air guard start"),
    a(130, [98], 10, "stand guard: covering up"),
    a(131, [557], 10, "crouch guard"),
    a(132, [686], 10, "air guard"),
    a(140, [98, 97], 2, "guard end"),
    a(141, [557], 2, "crouch guard end"),
    a(142, [686], 2, "air guard end"),
    a(150, [99, 98], 3, "stand guard hit"),
    a(151, [558], 6, "crouch guard hit"),
    a(152, [686], 6, "air guard hit"),
    a(170, [778, 780, 782, 784], 6, "lose (time over): hands on his head", true),
    a(175, [778, 780, 782, 784], 6, "draw (time over)", true),
    a(5000, [688, 689], 3, "hit high, light"),
    a(5001, [688, 689, 690], 3, "hit high, medium"),
    a(5002, [689, 690, 691], 3, "hit high, hard"),
    a(5005, [689, 688], 3, "recover high, light"),
    a(5006, [690, 689, 688], 3, "recover high, medium"),
    a(5007, [691, 690, 689, 0], 3, "recover high, hard"),
    a(5010, [692, 693], 3, "hit low, light"),
    a(5011, [692, 693, 693], 3, "hit low, medium"),
    a(5012, [693, 692, 693], 3, "hit low, hard"),
    a(5015, [693, 692], 3, "recover low, light"),
    a(5016, [693, 692, 0], 3, "recover low, medium"),
    a(5017, [693, 693, 692, 0], 3, "recover low, hard"),
    a(5020, [694], 6, "crouching hit, light"),
    a(5021, [695], 8, "crouching hit, medium"),
    a(5022, [696], 10, "crouching hit, hard"),
    a(5025, [694], 3, "crouching recover, light"),
    a(5026, [695], 4, "crouching recover, medium"),
    a(5027, [696], 3, "crouching recover, hard"),
    a(5030, [699], 4, "hit in the air"),
    a(5035, [699], 3, "air hit transition"),
    a(5040, [686, 687], 4, "air recover"),
    a(5050, [698, 699], 5, "falling"),
    a(5060, [699], 5, "falling, coming down"),
    a(5070, [707, 708], 4, "tripped"),
    a(5080, [704], 4, "hit while down"),
    a(5090, [701], 4, "hit up while down"),
    a(5100, [700, 701], 3, "hit the ground"),
    a(5101, [701], 4, "bounce"),
    a(5110, [710], 30, "lying down"),
    a(5120, [710, 711, 712, 555, 0], 5, "getting up"),
    a(5140, [710], 30, "lying defeated", true),
    a(5150, [710], 30, "lying defeated (match over)", true),
    a(5160, [701], 4, "bounce into the air"),
    a(5170, [700, 710], 4, "hit the ground after a bounce"),
    a(5200, [686, 687], 3, "fall recovery near the ground"),
    a(5210, [686, 687, 686], 3, "fall recovery in the air"),
    a(180, [786, 788, 790, 792, 794], [6, 6, 6, 6, 60], "win: flexing", true),
    a(181, [806, 808, 810, 812], [6, 6, 6, 60], "win: points at whoever's down", true),
    a(190, [506, 512, 518, 534, 536, 538, 536, 0], [20, 10, 10, 6, 6, 20, 6, 10], "intro: stands easy, spreads his arms, takes his guard"),
    a(195, range(522, 533), 5, "taunt: beckons"),
  ],
  // Hand-made boxes, measured on the frames: where the fist, foot or knee reaches past his guard, relative to the
  // axis in the cell (anchoring moves them with the frame, so the jumping moves' boxes sit higher than their feet).
  attacks: [
    redrawMove(striker, 200, "Jab", [10, 11, 12, 13, 14], [2, 2, 3, 3, 3], [2], { ...feet, hit: { box: [40, -95, 70, -78] } }),
    redrawMove(striker, 210, "Cross", [15, 16, 17, 18, 19, 20], [2, 3, 4, 3, 3, 3], [1, 2], { ...feet, hit: { box: [40, -98, 79, -80] } }),
    redrawMove(striker, 230, "Teep", range(49, 57), [2, 2, 2, 2, 3, 4, 3, 3, 3], [4, 5], { ...feet, hit: { box: [45, -60, 86, -28] } }),
    redrawMove(striker, 240, "High Roundhouse", range(66, 72), [2, 3, 3, 4, 4, 3, 3], [2, 3], { ...feet, hit: { box: [40, -101, 85, -60] } }),
    redrawMove(striker, 400, "Crouching Jab", [558, 559, 560, 561], [2, 3, 3, 3], [1, 2], { ...feet, hit: { box: [35, -62, 60, -48] } }),
    redrawMove(striker, 410, "Crouching Straight", [562, 563, 564, 565], [3, 4, 4, 4], [1, 2], { ...feet, hit: { box: [35, -70, 57, -50] } }),
    redrawMove(striker, 430, "Crouching Kick", range(567, 571), [2, 3, 3, 4, 3], [1, 2, 3], { ...feet, hit: { box: [35, -28, 55, -5] } }),
    redrawMove(striker, 440, "Sweep", range(590, 597), [3, 3, 3, 3, 5, 5, 5, 5], [2, 3, 4], { ...feet, hit: { box: [35, -36, 68, 6] } }),
    redrawMove(striker, 600, "Air Knee", range(669, 674), [3, 4, 5, 5, 5, 5], [2, 3], { ...feet, hit: { box: [35, -88, 67, -57] } }),
    redrawMove(striker, 630, "Flying Kick", range(677, 682), [3, 3, 4, 8, 6, 6], [3, 4], { ...feet, hit: { box: [35, -105, 67, -50] } }),
    redrawMove(striker, 1000, "Spinning Back Fist", range(372, 378), [2, 3, 3, 4, 5, 4, 4], [3], { ...feet, hit: { box: [50, -95, 106, -75] } }),
    redrawMove(striker, 1100, "Jumping Knee", range(75, 83), [2, 2, 3, 3, 4, 4, 5, 4, 4], [4, 5, 6], { ...feet, hit: { box: [18, -110, 50, -60] } }),
    redrawMove(striker, 1200, "Cartwheel Kick", range(458, 466), [2, 3, 3, 3, 4, 5, 4, 4, 4], [5, 6, 7], { ...feet, hit: { box: [30, -100, 62, -27] } }),
  ],
  // As drawn: camo and pink gloves. Outfits recolour the camo's green (1-5), the tee (11-15) and the gloves (37-41).
  colors: {},
  palettes: [
    { name: "Red Corner", colors: { 1: "#ff5a4a", 2: "#d0302a", 3: "#9c2420", 4: "#681814", 5: "#340c0a", 37: "#c8241e", 38: "#a81c18", 39: "#881612", 40: "#68100e", 41: "#480a08" } },
    { name: "Blue Corner", colors: { 1: "#6aa8ff", 2: "#3a78e0", 3: "#2a5aa8", 4: "#1c3c70", 5: "#0e1e38", 37: "#2a5ad0", 38: "#2248a8", 39: "#1a3880", 40: "#122858", 41: "#0a1830" } },
    { name: "Urban", colors: { 1: "#d8d8d8", 2: "#a8a8a8", 3: "#7c7c7c", 4: "#4c4c4c", 5: "#262626", 11: "#5a5a5a", 12: "#444444", 13: "#323232", 14: "#222222", 15: "#121212", 37: "#e8e8e8", 38: "#c8c8c8", 39: "#a0a0a0", 40: "#787878", 41: "#505050" } },
  ],
  portrait: { cell: 0 },
};
