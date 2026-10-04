/**
 * House fighter "Ruby Lioness" (RUSHDOWN): a long-haired street kickboxer
 * (the CC0 fighting woman, templates/fighter-woman.ts). She keeps the
 * Striker's numbers and AI, with every frame her own: a jab and a straight, a
 * side kick and a lunging punch (her longest reaches: her high kicks are
 * drawn compact and lost the Striker's range), a leaping kick for her rush, a
 * kick straight up against jumps, a hook kick and air kicks; she flips her
 * hair to start and folds her arms to win.
 */
import { FIGHTER_WOMAN } from "./fighter-woman.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { AnimSpec, TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";

/** Every animation is anchored on its lowest pixel: her frames aren't all rendered on one ground line. */
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const striker: TemplateSpec = { ...RUSHDOWN, art: FIGHTER_WOMAN };

export const RUBY_LIONESS: TemplateSpec = {
  ...striker,
  id: "gi-ruby-lioness",
  name: "Ruby Lioness",
  // Less life and punch than the Striker: her hit boxes cover her own limbs as well as his moves' reach (below), so
  // with his numbers she won 67% in the balance tool (2026-10-04).
  constants: { ...RUSHDOWN.constants, life: 800, attack: 94 },
  anims: [
    a(0, range(0, 8), 5, "stand: a bouncing guard"),
    a(5, [0], 3, "turn"),
    a(6, [256], 3, "crouch turn"),
    a(10, [255, 256], 3, "stand to crouch"),
    a(11, [256], 10, "crouching"),
    a(12, [255], 3, "crouch to stand"),
    // Walks in place: in her other walk (439-449) she walks across the frame, so her body (and her hurtboxes) ran
    // ahead of where she stands and she won 14% in the balance tool.
    a(20, range(363, 374), 5, "walk forward"),
    a(21, range(363, 374).reverse(), 5, "walk back"),
    a(40, [272], 3, "jump start"),
    a(41, range(273, 280), 4, "jump up"),
    a(42, range(273, 280), 4, "jump forward (the same tuck as straight up: her own forward jump moves across the frame)"),
    a(43, range(273, 280), 4, "jump back"),
    a(47, [281], 3, "jump land"),
    a(100, range(200, 207), 4, "run"),
    a(105, [278, 279], 6, "hop back"),
    a(120, [375, 376], 2, "guard start"),
    a(121, [256], 2, "crouch guard start"),
    a(122, [276], 2, "air guard start"),
    a(130, [377], 10, "stand guard"),
    a(131, [256], 10, "crouch guard"),
    a(132, [276], 10, "air guard"),
    a(140, [376, 375], 2, "guard end"),
    a(141, [256], 2, "crouch guard end"),
    a(142, [276], 2, "air guard end"),
    a(150, [378, 379], 3, "stand guard hit"),
    a(151, [256], 6, "crouch guard hit"),
    a(152, [276], 6, "air guard hit"),
    a(170, range(326, 332), 6, "lose (time over)", true),
    a(175, range(326, 332), 6, "draw (time over)", true),
    a(5000, [182, 183], 3, "hit high, light"),
    a(5001, [182, 183, 184], 3, "hit high, medium"),
    a(5002, [184, 185, 186], 3, "hit high, hard"),
    a(5005, [183, 182], 3, "recover high, light"),
    a(5006, [184, 183, 182], 3, "recover high, medium"),
    a(5007, [186, 185, 184, 187], 3, "recover high, hard"),
    a(5010, [335, 336], 3, "hit low, light"),
    a(5011, [335, 336, 337], 3, "hit low, medium"),
    a(5012, [336, 337, 338], 3, "hit low, hard"),
    a(5015, [336, 335], 3, "recover low, light"),
    a(5016, [337, 336, 335], 3, "recover low, medium"),
    a(5017, [338, 337, 336, 335], 3, "recover low, hard"),
    a(5020, [256], 6, "crouching hit, light"),
    a(5021, [256], 8, "crouching hit, medium"),
    a(5022, [256], 10, "crouching hit, hard"),
    a(5025, [256], 3, "crouching recover, light"),
    a(5026, [256], 4, "crouching recover, medium"),
    a(5027, [256], 3, "crouching recover, hard"),
    // Knocked into the air she keeps compact (her own air-hit frames, 315-317, throw her hair up into a target half again
    // as tall, which let opponents juggle her).
    a(5030, [339], 4, "hit in the air"),
    a(5035, [340], 3, "air hit transition"),
    a(5040, [276, 277, 278], 4, "air recover"),
    a(5050, [339, 340], 5, "falling"),
    a(5060, [341], 5, "falling, coming down"),
    a(5070, [414, 415], 4, "tripped"),
    a(5080, [347], 4, "hit while down"),
    a(5090, [343], 4, "hit up while down"),
    a(5100, [341, 342], 3, "hit the ground"),
    a(5101, [343], 4, "bounce"),
    a(5110, [346], 30, "lying down"),
    a(5120, range(228, 237), 4, "getting up: a kip-up"),
    a(5140, [346], 30, "lying defeated", true),
    a(5150, [346], 30, "lying defeated (match over)", true),
    a(5160, [343], 4, "bounce into the air"),
    a(5170, [344, 347], 4, "hit the ground after a bounce"),
    a(5200, [277, 278], 3, "fall recovery near the ground"),
    a(5210, [276, 277, 278, 279], 3, "fall recovery in the air"),
    a(180, range(165, 170), [5, 5, 5, 6, 8, 60], "win: arms folded", true),
    a(181, range(450, 454), [5, 5, 6, 8, 60], "win: come on", true),
    a(190, [...range(188, 199), 0], [4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 8, 20, 10], "intro: a hair flip"),
    a(195, [450, 451, 452, 453, 452, 451], [5, 5, 6, 20, 6, 5], "taunt: come on"),
  ],
  // Hand-made boxes: each covers her own striking arm or leg and the space the Striker's same move covers (his quick
  // kick lands at waist height, her jab at head height, so her own boxes alone went over crouching opponents and she
  // won 15-25% in the balance tool). The leaping kick keeps its drawn height (anchored on its feet, the kick in mid-air
  // dropped to her shins).
  attacks: [
    redrawMove(striker, 200, "Jab", [7, 8, 9, 548, 549, 0], [2, 2, 3, 3, 3, 3], [3, 4], { ...feet, hit: { box: [15, -128, 86, -38] } }),
    redrawMove(striker, 210, "Side Kick", [...range(48, 53), 0], [2, 3, 3, 4, 3, 3, 3], [3, 4], { ...feet, hit: { box: [15, -114, 99, -72] } }),
    redrawMove(striker, 230, "Straight", [551, 552, 553, 554, 555, 0], [2, 2, 3, 3, 3, 3], [2, 3], { ...feet, hit: { box: [15, -143, 86, -86] } }),
    redrawMove(striker, 240, "Lunging Punch", [...range(215, 221), 0], [2, 3, 3, 4, 4, 3, 3, 3], [3, 4], { ...feet, hit: { box: [20, -161, 98, -60] } }),
    redrawMove(striker, 400, "Low Punch", range(392, 396), [2, 3, 3, 3, 3], [1, 2], { ...feet, hit: { box: [20, -104, 64, -64] } }),
    redrawMove(striker, 410, "Low Lunge", range(396, 401), [3, 3, 4, 4, 4, 4], [2, 3], { ...feet, hit: { box: [18, -107, 64, -74] } }),
    redrawMove(striker, 430, "Crouching Kick", range(401, 406), [2, 3, 3, 4, 3, 3], [2, 3], { ...feet, hit: { box: [12, -82, 95, -18] } }),
    redrawMove(striker, 440, "Sweep", range(381, 387), [3, 3, 3, 3, 5, 5, 5], [4, 5], { ...feet, hit: { box: [10, -70, 89, -9] } }),
    redrawMove(striker, 600, "Air Kick", range(302, 306), [3, 5, 5, 5, 5], [1, 2], feet),
    redrawMove(striker, 630, "Flying Kick", range(539, 543), [3, 3, 8, 6, 6], [2, 3], feet),
    // The Striker's spinning side kick (rushes in) becomes a leaping side kick.
    redrawMove(striker, 1000, "Leaping Kick", [34, 35, 36, 36, 37, 37, 38, 41], [2, 3, 3, 4, 5, 4, 4, 4], [4, 5], { hit: { box: [15, -110, 93, -80] } }),
    // A hand-made box over the leg kicked straight up: it reaches up rather than forward.
    redrawMove(striker, 1100, "Rising Kick", [55, 56, 57, 58, 58, 59], [2, 3, 5, 5, 5, 5], [2, 3, 4], { ...feet, hit: { box: [0, -175, 66, -95] } }),
    // The spin swings her leg behind her first; it hits once it comes round (65).
    redrawMove(striker, 1200, "Hook Kick", [62, 63, 64, 65, 65, 66, 0], [2, 3, 3, 4, 5, 4, 4], [3, 4], { ...feet, hit: { box: [10, -152, 89, -72] } }),
  ],
  // A ruby top (43-46) over the grey shorts and auburn hair she's drawn with.
  colors: { 43: "#b0203a", 44: "#86182c", 45: "#5c101e", 46: "#2e080f" },
  palettes: [
    { name: "Emerald", colors: {} },
    { name: "Sapphire", colors: { 43: "#2a52c4", 44: "#1f3e94", 45: "#152a64", 46: "#0b1532", 38: "#2a2a2e", 39: "#1f1f22", 40: "#151517", 41: "#0a0a0b" } },
    { name: "Onyx", colors: { 43: "#2e2e34", 44: "#222226", 45: "#17171a", 46: "#0b0b0d", 38: "#a8322d", 39: "#7f2622", 40: "#561a17", 41: "#2b0d0b", 27: "#2a2522", 28: "#1f1b19", 29: "#151211", 30: "#0a0908" } },
  ],
  portrait: { cell: 180 },
};
