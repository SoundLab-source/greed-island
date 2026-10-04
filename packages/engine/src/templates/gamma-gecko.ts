/**
 * House fighter "Gamma Gecko" (ZONER): a hunched green-and-white alien (the
 * CC0 alien sheet, templates/alien.ts) who summons a gun to shoot. He keeps
 * the Sage's numbers and AI, with every frame his own: claw jabs and lunging
 * swipes, high and spinning kicks, a gun summoned out of thin air for the
 * energy shot, a rising claw against jumps; he turns round from his back to
 * flex at the start, and flexes to win.
 */
import { ALIEN } from "./alien.ts";
import type { AnimSpec, TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

/** Every animation is anchored on its lowest pixel: the alien's frames aren't rendered on one ground line. */
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});

const sage: TemplateSpec = { ...ZONER, art: ALIEN };

export const GAMMA_GECKO: TemplateSpec = {
  ...sage,
  id: "gi-gamma-gecko",
  name: "Gamma Gecko",
  // Less life and punch than the Sage: even drawn smaller, his limbs out-reach the Sage's.
  constants: { ...ZONER.constants, life: 900, attack: 92 },
  anims: [
    a(0, [...range(0, 7), ...range(1, 6).reverse()], 5, "stand: hunched, breathing"),
    a(5, [0], 3, "turn"),
    a(6, [774], 3, "crouch turn"),
    a(10, [768, 769, 770], 2, "stand to crouch"),
    a(11, [772, 773, 774, 775, 774, 773], 8, "crouching"),
    a(12, [770, 769, 768], 2, "crouch to stand"),
    a(20, range(563, 582), 3, "walk forward"),
    a(21, range(563, 582).reverse(), 3, "walk back"),
    a(40, [252], 3, "jump start"),
    a(41, [253, 254, 255, 256], 5, "jump up"),
    a(42, range(265, 270), 5, "jump forward"),
    a(43, [258, 257, 256, 255], 6, "jump back"),
    a(47, [262], 3, "jump land"),
    a(100, range(727, 734), 4, "run"),
    a(105, [280, 281], 6, "hop back"),
    a(120, [79, 80], 2, "guard start"),
    a(121, [774], 2, "crouch guard start"),
    a(122, [256], 2, "air guard start"),
    a(130, [80], 10, "stand guard"),
    a(131, [775], 10, "crouch guard"),
    a(132, [256], 10, "air guard"),
    a(140, [80, 79], 2, "guard end"),
    a(141, [774], 2, "crouch guard end"),
    a(142, [256], 2, "air guard end"),
    a(150, [80, 81], 3, "stand guard hit"),
    a(151, [776], 6, "crouch guard hit"),
    a(152, [256], 6, "air guard hit"),
    a(170, range(714, 719), 6, "lose (time over)", true),
    a(175, range(714, 719), 6, "draw (time over)", true),
    a(5000, [61, 62], 3, "hit high, light"),
    a(5001, [61, 62, 63], 3, "hit high, medium"),
    a(5002, [354, 61, 62], 3, "hit high, hard"),
    a(5005, [62, 63], 3, "recover high, light"),
    a(5006, [63, 64, 65], 3, "recover high, medium"),
    a(5007, [62, 63, 64, 65], 3, "recover high, hard"),
    a(5010, [393, 394], 3, "hit low, light"),
    a(5011, [392, 393, 394], 3, "hit low, medium"),
    a(5012, [393, 394, 394], 3, "hit low, hard"),
    a(5015, [394, 393], 3, "recover low, light"),
    a(5016, [394, 393, 392], 3, "recover low, medium"),
    a(5017, [394, 393, 392, 391], 3, "recover low, hard"),
    a(5020, [392], 6, "crouching hit, light"),
    a(5021, [392], 8, "crouching hit, medium"),
    a(5022, [393], 10, "crouching hit, hard"),
    a(5025, [392], 3, "crouching recover, light"),
    a(5026, [392], 4, "crouching recover, medium"),
    a(5027, [393, 392], 3, "crouching recover, hard"),
    a(5030, [355], 4, "hit in the air"),
    a(5035, [355], 3, "air hit transition"),
    a(5040, [377, 378, 379], 4, "air recover"),
    a(5050, [355, 356], 5, "falling"),
    a(5060, [356], 5, "falling, coming down"),
    a(5070, [355, 356], 4, "tripped"),
    a(5080, [363], 4, "hit while down"),
    a(5090, [359], 4, "hit up while down"),
    a(5100, [357, 358], 3, "hit the ground"),
    a(5101, [359], 4, "bounce"),
    a(5110, [364], 30, "lying down"),
    a(5120, range(369, 376), 4, "getting up"),
    a(5140, [364], 30, "lying defeated", true),
    a(5150, [364], 30, "lying defeated (match over)", true),
    a(5160, [359], 4, "bounce into the air"),
    a(5170, [360, 363], 4, "hit the ground after a bounce"),
    a(5200, [384, 385], 3, "fall recovery near the ground"),
    a(5210, [378, 379, 380, 381], 3, "fall recovery in the air"),
    a(180, range(327, 332), [5, 5, 5, 6, 8, 60], "win: rises and flexes", true),
    a(181, range(641, 646), [5, 5, 5, 6, 8, 60], "win: a front-facing flex", true),
    a(190, [826, 828, 830, 832, 745, 746, 747, 748, 749, 641, 642, 643, 644, 0], [6, 6, 6, 8, 4, 4, 4, 4, 4, 5, 5, 6, 30, 10], "intro: back turned, turns round and flexes"),
    a(195, [711, 712, 713, 712, 711], [5, 6, 20, 6, 5], "taunt: points"),
  ],
  // Kicks hold their fully extended frame while they hit (the next frame already pulls the leg back).
  attacks: [
    redrawMove(sage, 200, "Claw Jab", [7, 8, 9, 10, 11], [2, 3, 3, 3, 3], [1, 2], { anchor: "feet" }),
    redrawMove(sage, 210, "Lunging Swipe", range(11, 16), [3, 3, 4, 4, 4, 4], [2, 3], { anchor: "feet" }),
    redrawMove(sage, 230, "Front Kick", [427, 428, 429, 430, 431, 431, 431, 432, 433], [2, 2, 2, 3, 3, 3, 3, 3, 3], [4, 5, 6], { anchor: "feet" }),
    redrawMove(sage, 240, "High Side Kick", range(394, 401), [3, 3, 3, 4, 4, 4, 4, 4], [3, 4, 5], { anchor: "feet" }),
    redrawMove(sage, 400, "Low Claw", range(168, 172), [2, 3, 3, 3, 3], [1, 2], { anchor: "feet" }),
    redrawMove(sage, 410, "Low Lunge", range(172, 177), [3, 3, 4, 4, 4, 4], [2, 3], { anchor: "feet" }),
    redrawMove(sage, 430, "Low Kick", [437, 438, 439, 439, 441, 442], [2, 3, 4, 4, 3, 3], [2, 3], { anchor: "feet" }),
    redrawMove(sage, 440, "Sweep", range(442, 448), [3, 3, 3, 4, 5, 5, 5], [4, 5], { anchor: "feet" }),
    redrawMove(sage, 600, "Air Kick", range(460, 464), [3, 3, 6, 5, 5], [2, 3], { anchor: "feet" }),
    redrawMove(sage, 630, "Flying Kick", [468, 469, 469, 471, 472], [3, 4, 8, 6, 6], [1, 2], { anchor: "feet" }),
    // The Sage's energy palm: he summons a gun and shoots.
    redrawMove(sage, 1000, "Gamma Blaster", [225, 226, 227, 227, 228, 229, 230, 231], [3, 3, 3, 3, 6, 4, 4, 4], [4], { anchor: "feet" }),
    redrawMove(sage, 1100, "Rising Claw", range(533, 538), [2, 3, 4, 8, 5, 5], [2, 3], { anchor: "feet" }),
    redrawMove(sage, 1200, "Spin Kick", [602, 603, 604, 605, 606, 606, 608, 609], [3, 3, 3, 3, 5, 5, 4, 4], [4, 5], { anchor: "feet" }),
  ],
  // Drawn in green (7-10) and white plates (12-15) with red eyes (2-5).
  colors: {},
  palettes: [
    { name: "Crimson", colors: { 7: "#e02020", 8: "#a81818", 9: "#701010", 10: "#380808", 2: "#ffd800", 3: "#c0a000", 4: "#806b00", 5: "#403500" } },
    { name: "Void", colors: { 12: "#4a4a55", 13: "#383840", 14: "#25252b", 15: "#121215", 7: "#a040ff", 8: "#7830c0", 9: "#502080", 10: "#281040" } },
    { name: "Gold", colors: { 12: "#e0c060", 13: "#b09040", 14: "#786028", 15: "#3c3014", 7: "#00d0e0", 8: "#009ca8", 9: "#006870", 10: "#003438" } },
  ],
  portrait: { cell: 41 },
};
