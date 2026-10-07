/**
 * House fighter "Camo Cobra" (RUSHDOWN): a bald Muay Thai brawler in camo and pink gloves (Rhivan from the CC0
 * Mustermenschen V1, templates/rhivan-thai.ts). He keeps the Striker's numbers and AI, with every frame his own:
 * a jab, a cross, a push kick and a high roundhouse on the four buttons; crouching jab, straight, kick and a
 * sweep; an air knee and a flying kick; and as specials a spinning back fist, a jumping knee and a cartwheel
 * kick. He walks in, arms spread, to start; wins flexing or pointing at whoever's down.
 */
import type { Box } from "../art/air.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { RHIVAN_HEIGHT, RHIVAN_THAI } from "./rhivan-thai.ts";
import { cellList, type AnimSpec, type ArtSource, type PaletteSpec, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";

/** Every animation is anchored on its lowest pixel: his frames aren't all rendered on one ground line. */
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

/**
 * A Muay Thai fighter from the Mustermenschen Thai-boxing set: Rhivan's move list on any body in the set, its
 * frames numbered like his through `map` (a body with a frame more or less here and there), and his hand-measured
 * boxes scaled to its height (`height`, pixels in its own frames).
 */
export function thaiBoxer(o: { art: ArtSource; base: TemplateSpec; id: string; name: string; map?: (n: number) => number; height?: number; palettes: PaletteSpec[] }): TemplateSpec {
  const m = o.map ?? ((n: number) => n);
  const range = (from: number, to: number) => cellRange(from, to).map(m);
  const at = (...cells: number[]) => cells.map(m);
  const k = (o.height ?? RHIVAN_HEIGHT) / RHIVAN_HEIGHT;
  const box = (b: Box): Box => (k === 1 ? b : (b.map((v) => Math.round(v * k)) as unknown as Box));
  const striker: TemplateSpec = { ...o.base, art: o.art };
  // The base's moves, on these frames; its forward steps are spread over the move when they'd fall past its end
  // (another archetype's moves have their own lengths).
  const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[], extra: Parameters<typeof redrawMove>[6]) => {
    const was = striker.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(striker, state, name, cells, ticks, frames, { ...extra, ...(moves ? { moves } : {}) });
  };
  return {
    ...striker,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(0, 9), 5, "stand: a bouncing Muay Thai guard"),
      a(5, at(0), 3, "turn"),
      a(6, at(557), 3, "crouch turn"),
      a(10, at(555, 556), 3, "stand to crouch"),
      a(11, at(556, 557, 558, 557), 8, "crouching"),
      a(12, at(556, 555), 3, "crouch to stand"),
      a(20, range(116, 131), 4, "walk forward"),
      a(21, range(116, 131).reverse(), 4, "walk back"),
      a(40, at(555), 3, "jump start"),
      a(41, range(619, 628), 5, "jump up"),
      a(42, range(638, 645), 5, "jump forward: a roll"),
      a(43, range(619, 628).reverse(), 5, "jump back"),
      a(47, at(555), 3, "jump land"),
      a(100, range(480, 491), 3, "run: bouncing steps"),
      a(105, at(653, 654, 655), 6, "hop back"),
      a(120, at(97, 98), 2, "guard start"),
      a(121, at(557), 2, "crouch guard start"),
      a(122, at(686), 2, "air guard start"),
      a(130, at(98), 10, "stand guard: covering up"),
      a(131, at(557), 10, "crouch guard"),
      a(132, at(686), 10, "air guard"),
      a(140, at(98, 97), 2, "guard end"),
      a(141, at(557), 2, "crouch guard end"),
      a(142, at(686), 2, "air guard end"),
      a(150, at(99, 98), 3, "stand guard hit"),
      a(151, at(558), 6, "crouch guard hit"),
      a(152, at(686), 6, "air guard hit"),
      a(170, at(778, 780, 782, 784), 6, "lose (time over): hands on his head", true),
      a(175, at(778, 780, 782, 784), 6, "draw (time over)", true),
      a(5000, at(688, 689), 3, "hit high, light"),
      a(5001, at(688, 689, 690), 3, "hit high, medium"),
      a(5002, at(689, 690, 691), 3, "hit high, hard"),
      a(5005, at(689, 688), 3, "recover high, light"),
      a(5006, at(690, 689, 688), 3, "recover high, medium"),
      a(5007, at(691, 690, 689, 0), 3, "recover high, hard"),
      a(5010, at(692, 693), 3, "hit low, light"),
      a(5011, at(692, 693, 693), 3, "hit low, medium"),
      a(5012, at(693, 692, 693), 3, "hit low, hard"),
      a(5015, at(693, 692), 3, "recover low, light"),
      a(5016, at(693, 692, 0), 3, "recover low, medium"),
      a(5017, at(693, 693, 692, 0), 3, "recover low, hard"),
      a(5020, at(694), 6, "crouching hit, light"),
      a(5021, at(695), 8, "crouching hit, medium"),
      a(5022, at(696), 10, "crouching hit, hard"),
      a(5025, at(694), 3, "crouching recover, light"),
      a(5026, at(695), 4, "crouching recover, medium"),
      a(5027, at(696), 3, "crouching recover, hard"),
      a(5030, at(699), 4, "hit in the air"),
      a(5035, at(699), 3, "air hit transition"),
      a(5040, at(686, 687), 4, "air recover"),
      a(5050, at(698, 699), 5, "falling"),
      a(5060, at(699), 5, "falling, coming down"),
      a(5070, at(707, 708), 4, "tripped"),
      a(5080, at(704), 4, "hit while down"),
      a(5090, at(701), 4, "hit up while down"),
      a(5100, at(700, 701), 3, "hit the ground"),
      a(5101, at(701), 4, "bounce"),
      a(5110, at(710), 30, "lying down"),
      a(5120, at(710, 711, 712, 555, 0), 5, "getting up"),
      a(5140, at(710), 30, "lying defeated", true),
      a(5150, at(710), 30, "lying defeated (match over)", true),
      a(5160, at(701), 4, "bounce into the air"),
      a(5170, at(700, 710), 4, "hit the ground after a bounce"),
      a(5200, at(686, 687), 3, "fall recovery near the ground"),
      a(5210, at(686, 687, 686), 3, "fall recovery in the air"),
      a(180, at(786, 788, 790, 792, 794), [6, 6, 6, 6, 60], "win: flexing", true),
      a(181, at(806, 808, 810, 812), [6, 6, 6, 60], "win: points at whoever's down", true),
      a(190, at(506, 512, 518, 534, 536, 538, 536, 0), [20, 10, 10, 6, 6, 20, 6, 10], "intro: stands easy, spreads his arms, takes his guard"),
      a(195, range(522, 533), 5, "taunt: beckons"),
    ],
    // Hand-made boxes, measured on Rhivan's frames: where the fist, foot or knee reaches past his guard, relative to
    // the axis in the cell (anchoring moves them with the frame, so the jumping moves' boxes sit higher than their feet).
    attacks: [
      redraw(200, "Jab", at(10, 11, 12, 13, 14), [2, 2, 3, 3, 3], [2], { ...feet, hit: { box: box([40, -95, 70, -78]) } }),
      redraw(210, "Cross", at(15, 16, 17, 18, 19, 20), [2, 3, 4, 3, 3, 3], [1, 2], { ...feet, hit: { box: box([40, -98, 79, -80]) } }),
      redraw(230, "Teep", range(49, 57), [2, 2, 2, 2, 3, 4, 3, 3, 3], [4, 5], { ...feet, hit: { box: box([45, -60, 86, -28]) } }),
      redraw(240, "High Roundhouse", range(66, 72), [2, 3, 3, 4, 4, 3, 3], [2, 3], { ...feet, hit: { box: box([40, -101, 85, -60]) } }),
      redraw(400, "Crouching Jab", at(558, 559, 560, 561), [2, 3, 3, 3], [1, 2], { ...feet, hit: { box: box([35, -62, 60, -48]) } }),
      redraw(410, "Crouching Straight", at(562, 563, 564, 565), [3, 4, 4, 4], [1, 2], { ...feet, hit: { box: box([35, -70, 57, -50]) } }),
      redraw(430, "Crouching Kick", range(567, 571), [2, 3, 3, 4, 3], [1, 2, 3], { ...feet, hit: { box: box([35, -28, 55, -5]) } }),
      redraw(440, "Sweep", range(590, 597), [3, 3, 3, 3, 5, 5, 5, 5], [2, 3, 4], { ...feet, hit: { box: box([35, -36, 68, 6]) } }),
      redraw(600, "Air Knee", range(669, 674), [3, 4, 5, 5, 5, 5], [2, 3], { ...feet, hit: { box: box([35, -88, 67, -57]) } }),
      redraw(630, "Flying Kick", range(677, 682), [3, 3, 4, 8, 6, 6], [3, 4], { ...feet, hit: { box: box([35, -105, 67, -50]) } }),
      redraw(1000, "Spinning Back Fist", range(372, 378), [2, 3, 3, 4, 5, 4, 4], [3], { ...feet, hit: { box: box([50, -95, 106, -75]) } }),
      redraw(1100, "Jumping Knee", range(75, 83), [2, 2, 3, 3, 4, 4, 5, 4, 4], [4, 5, 6], { ...feet, hit: { box: box([18, -110, 50, -60]) } }),
      redraw(1200, "Cartwheel Kick", range(458, 466), [2, 3, 3, 3, 4, 5, 4, 4, 4], [5, 6, 7], { ...feet, hit: { box: box([30, -100, 62, -27]) } }),
    ],
    colors: {},
    palettes: o.palettes,
    portrait: { cell: m(0) },
  };
}

export const CAMO_COBRA: TemplateSpec = thaiBoxer({
  art: RHIVAN_THAI,
  base: RUSHDOWN,
  id: "gi-camo-cobra",
  name: "Camo Cobra",
  // As drawn: camo and pink gloves. Outfits recolour the camo's green (1-5), the tee (11-15) and the gloves (37-41).
  palettes: [
    { name: "Red Corner", colors: { 1: "#ff5a4a", 2: "#d0302a", 3: "#9c2420", 4: "#681814", 5: "#340c0a", 37: "#c8241e", 38: "#a81c18", 39: "#881612", 40: "#68100e", 41: "#480a08" } },
    { name: "Blue Corner", colors: { 1: "#6aa8ff", 2: "#3a78e0", 3: "#2a5aa8", 4: "#1c3c70", 5: "#0e1e38", 37: "#2a5ad0", 38: "#2248a8", 39: "#1a3880", 40: "#122858", 41: "#0a1830" } },
    { name: "Urban", colors: { 1: "#d8d8d8", 2: "#a8a8a8", 3: "#7c7c7c", 4: "#4c4c4c", 5: "#262626", 11: "#5a5a5a", 12: "#444444", 13: "#323232", 14: "#222222", 15: "#121212", 37: "#e8e8e8", 38: "#c8c8c8", 39: "#a0a0a0", 40: "#787878", 41: "#505050" } },
  ],
});
