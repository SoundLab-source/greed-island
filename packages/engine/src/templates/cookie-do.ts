/**
 * Seven house fighters in the Mustermenschen "WrongCookieDo" style (Puffolotti, CC0; art/SOURCES.md, mustermenschen.ts),
 * a karate-like style: jabs, a long straight, side and high kicks, a sliding sweep, flying kicks, a handspring kick,
 * a lunging punch. One move list, in the frame numbers of the style's reference GIF ("Ava Lee WrongCookieDo (Own)",
 * 560 frames); the other bodies number theirs like it through their `map`. The catalogue behind the choices:
 *
 *   0-7 guard · 8-11 jab · 12-15 lunge jab · 16-19 turning · 20-25 straight · 26-29 high front kick · 34-41 flying
 *   side kicks · 49-53 side kick · 54-59 high roundhouse, axe and front kick · 63-64 low kick · 65-79 stepping in
 *   guard · 80-85 standing easy · 86-95 run and leap · 100-111 sliding sweep and back up · 120-125 long straight ·
 *   126-134 handspring kick · 141-146 standing · 147-149 crouch · 165-171 cracking knuckles · 172-179 ready stance ·
 *   183-185 hit high · 190-193 hit in the stomach · 212-219 low lunge · 221-226 sliding kick · 230-235 roll ·
 *   255-269 jump · 285-290 hop · 291-299 somersault · 300-304 air kick · 307-309 air knee · 313-316 knocked back ·
 *   338-348 knocked down · 349-350 launched · 357-361 getting up · 362-373 exhausted · 374-380 covering up ·
 *   381-386 low kick · 390-397 crouching punch · 400-404 crouching front kick · 408-412 low side kick ·
 *   413-414 tripped · 450-453 fist raised · 486-503 palm strikes · 515-529 lunging punch · 537-543 flying kick
 *
 * Every frame is anchored on its lowest pixel (they aren't on one ground line), and the hitboxes are worked out
 * from each body's own pixels.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { HEAVY } from "./heavy.ts";
import { bodyArt, shift, type Body } from "./mustermenschen.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type AttackSpec, type HitSpec, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";

const STYLE = "WrongCookieDo";
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

/** The standard get-hit sprites, in the reference GIF's frame numbers. */
const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 183, "5000,10": 184, "5000,20": 185,
  "5010,0": 190, "5010,10": 191, "5010,20": 192,
  "5020,0": 361, "5020,10": 360, "5020,20": 360,
  "5030,0": 313, "5030,10": 338, "5030,20": 339, "5030,30": 342, "5030,40": 341, "5030,50": 343,
  "5040,0": 340, "5040,10": 346, "5040,20": 347,
  "5060,0": 349, "5060,10": 350,
  "5070,0": 413, "5070,10": 414, "5070,20": 430,
};

export function cookieFighter(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
  const m = o.body.map ?? ((n: number) => n);
  const art = bodyArt(o.body, STYLE, Object.fromEntries(Object.entries(STANDARD).map(([k, n]) => [k, { cell: m(n), anchor: "feet" as const }])));
  const range = (from: number, to: number) => cellRange(from, to).map(m);
  const at = (...cells: number[]) => cells.map(m);
  const base: TemplateSpec = { ...o.base, art };
  // The base's moves on these frames; forward steps spread over the move when they'd fall past its end.
  const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[], extra: Parameters<typeof redrawMove>[6] = {}) => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(base, state, name, cells, ticks, frames, { ...feet, ...extra, ...(moves ? { moves } : {}) });
  };
  // The handspring: a dive onto the hands, then a kick up from them. The kick doesn't reach past the dive, so its box
  // is measured by hand on the reference body (66 pixels tall) and scaled to this one.
  const k = o.body.tall / 66;
  const handspring = (): AttackSpec => {
    const move = redraw(1200, "Handspring Kick", range(126, 134), [3, 3, 3, 3, 3, 5, 4, 4, 4], [1]);
    const kick = [8, -66, 30, -20].map((v) => Math.round(v * k)) as unknown as NonNullable<HitSpec["box"]>;
    return { ...move, hits: [move.hits[0]!, { ...move.hits[0]!, frames: [5], box: kick }] };
  };
  // The lunging punch: a straight, then a long low lunge, two hits; it carries forward.
  const lunge = range(515, 529);
  const hit = (frames: number[], more: Partial<HitSpec>): HitSpec => ({ frames, damage: 40, chip: 5, height: "high", weight: "medium", hitStun: 18, blockStun: 12, push: 3, ...more });
  const lungePunch: AttackSpec = {
    state: 1400, name: "Lunging Punch", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: lunge, ticks: [2, 2, 3, 3, 4, 4, 3, 3, 3, 3, 5, 5, 4, 4, 4], anchor: "feet" },
    hits: [hit([4, 5], {}), hit([10, 11], { damage: 60, chip: 7, weight: "heavy", hitStun: 22, push: 7, knockdown: true, launch: [3, -4] })],
    moves: [{ frame: 8, x: 4 }, { frame: 12, x: 0 }],
    ai: { range: 90, weight: 0.6 },
  };
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(0, 7), 5, "stand: guard"),
      a(5, at(0), 3, "turn"),
      a(6, at(391), 3, "crouch turn"),
      a(10, at(148, 390), 3, "stand to crouch"),
      a(11, at(390, 391, 392, 391), 8, "crouching"),
      a(12, at(148, 0), 3, "crouch to stand"),
      a(20, range(65, 79), 4, "walk forward: stepping in guard"),
      a(21, range(65, 79).reverse(), 4, "walk back"),
      a(40, at(255), 3, "jump start"),
      a(41, range(257, 268), 4, "jump up"),
      a(42, range(291, 299), 5, "jump forward: a somersault"),
      a(43, range(291, 299).reverse(), 5, "jump back"),
      a(47, at(255), 3, "jump land"),
      a(100, at(86, 87, 88, 89), 3, "run"),
      a(105, range(285, 290), 4, "hop back"),
      a(120, at(374, 376), 2, "guard start"),
      a(121, at(391), 2, "crouch guard start"),
      a(122, at(310), 2, "air guard start"),
      a(130, at(376), 10, "stand guard: covering up"),
      a(131, at(391), 10, "crouch guard"),
      a(132, at(310), 10, "air guard"),
      a(140, at(376, 374), 2, "guard end"),
      a(141, at(391), 2, "crouch guard end"),
      a(142, at(310), 2, "air guard end"),
      a(150, at(377, 376), 3, "stand guard hit"),
      a(151, at(392), 6, "crouch guard hit"),
      a(152, at(310), 6, "air guard hit"),
      a(170, at(362, 364, 366, 368), 6, "lose (time over): exhausted", true),
      a(175, at(362, 364, 366, 368), 6, "draw (time over)", true),
      a(5000, at(183, 184), 3, "hit high, light"),
      a(5001, at(183, 184, 185), 3, "hit high, medium"),
      a(5002, at(184, 185, 185), 3, "hit high, hard"),
      a(5005, at(184, 183), 3, "recover high, light"),
      a(5006, at(185, 184, 183), 3, "recover high, medium"),
      a(5007, at(185, 185, 184, 0), 3, "recover high, hard"),
      a(5010, at(190, 191), 3, "hit low, light"),
      a(5011, at(190, 191, 192), 3, "hit low, medium"),
      a(5012, at(191, 192, 193), 3, "hit low, hard"),
      a(5015, at(191, 190), 3, "recover low, light"),
      a(5016, at(192, 191, 0), 3, "recover low, medium"),
      a(5017, at(193, 192, 191, 0), 3, "recover low, hard"),
      a(5020, at(361), 6, "crouching hit, light"),
      a(5021, at(360), 8, "crouching hit, medium"),
      a(5022, at(360), 10, "crouching hit, hard"),
      a(5025, at(361), 3, "crouching recover, light"),
      a(5026, at(360), 4, "crouching recover, medium"),
      a(5027, at(360, 361), 3, "crouching recover, hard"),
      a(5030, at(313), 4, "hit in the air"),
      a(5035, at(314), 3, "air hit transition"),
      a(5040, at(310, 311), 4, "air recover"),
      a(5050, at(338, 339), 5, "falling"),
      a(5060, at(339), 5, "falling, coming down"),
      a(5070, at(413, 414), 4, "tripped"),
      a(5080, at(347), 4, "hit while down"),
      a(5090, at(341), 4, "hit up while down"),
      a(5100, at(340, 345), 3, "hit the ground"),
      a(5101, at(341), 4, "bounce"),
      a(5110, at(346), 30, "lying down"),
      a(5120, at(357, 358, 359, 360, 0), 5, "getting up"),
      a(5140, at(346), 30, "lying defeated", true),
      a(5150, at(346), 30, "lying defeated (match over)", true),
      a(5160, at(341), 4, "bounce into the air"),
      a(5170, at(340, 346), 4, "hit the ground after a bounce"),
      a(5200, at(310, 311), 3, "fall recovery near the ground"),
      a(5210, at(310, 311, 310), 3, "fall recovery in the air"),
      a(180, at(450, 451, 452, 453), [6, 6, 6, 60], "win: a fist raised", true),
      a(181, at(172, 174, 176, 178), [6, 6, 6, 60], "win: a ready stance", true),
      a(190, at(80, 82, 84, 141, 143, 145, 0), [12, 10, 10, 8, 8, 12, 10], "intro: stands easy, takes guard"),
      a(195, range(165, 171), 6, "taunt: cracks knuckles"),
    ],
    attacks: [
      redraw(200, "Jab", at(0, 8, 9, 10, 11), [1, 3, 3, 3, 3], [1]),
      redraw(210, "Straight", range(20, 25), [2, 3, 4, 3, 3, 3], [1, 2]),
      redraw(230, "Side Kick", range(49, 53), [3, 3, 4, 3, 3], [1, 2]),
      redraw(240, "High Kick", range(54, 59), [3, 3, 4, 3, 4, 4], [1, 2, 4]),
      redraw(400, "Crouching Punch", at(390, 393, 394, 395, 396, 397), [2, 2, 3, 3, 3, 3], [1, 2, 3]),
      redraw(410, "Rising Front Kick", range(400, 404), [2, 3, 4, 4, 3], [2, 3]),
      redraw(430, "Low Kick", range(381, 386), [2, 2, 3, 3, 3, 3], [3, 4]),
      redraw(440, "Sliding Sweep", range(101, 108), [3, 3, 3, 4, 4, 4, 4, 4], [2, 3, 4]),
      redraw(600, "Air Kick", range(300, 304), [3, 3, 5, 5, 5], [2, 3]),
      redraw(630, "Flying Kick", range(537, 543), [3, 3, 4, 4, 4, 4, 4], [2, 3, 4]),
      redraw(1000, "Flying Side Kick", range(34, 41), [2, 3, 4, 3, 3, 4, 4, 4], [2, 5]),
      redraw(1100, "Crane Kick", range(24, 29), [2, 2, 3, 3, 5, 5], [4]),
      handspring(),
      lungePunch,
    ],
    colors: {},
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: m(0) },
  };
}

const W = "Ava Lee WrongCookieDo (Own) 05AAH009.gif";

/** Green tee, red and brown camo, a long ponytail: the style's reference GIF. */
export const JUNGLE_PUMA = cookieFighter({
  body: { id: "ava-cookie", file: W, who: "Ava Lee", sha256: "daa72ea8bbbf43b94b23e049607df392baa1907136eb551166e468c62b0e0fb1", width: 109, height: 96, frames: 560, x0: 28, x1: 59, y1: 88, tall: 66, size: 0.95 },
  id: "gi-jungle-puma", name: "Jungle Puma", base: RUSHDOWN,
  // The tee is a muted green (the skin is reddish and more saturated).
  outfits: [
    ["Blue Tee", [shift(95, 120, 215, { minSat: 0.15 })]],
    ["Red Tee", [shift(95, 120, 355, { minSat: 0.15, sat: 1.4 })]],
    ["Black Tee", [shift(95, 120, null, { minSat: 0.15, light: 0.5 })]],
  ],
});

/** White tee, blue and purple camo, blue boots. */
export const SNOW_LEOPARD = cookieFighter({
  body: { id: "adult-ava-cookie", file: "Adult Ava Lee WrongCookieDo 05ABH009.gif", who: "Ava Lee, adult", sha256: "7b0309eacb5382f7536bef74891a6b08e807f313b41ac31078d199f4dd70b563", width: 123, height: 101, frames: 560, x0: 30, x1: 65, y1: 90, tall: 76 },
  id: "gi-snow-leopard", name: "Snow Leopard", base: ALL_ROUNDER,
  outfits: [
    ["Red Camo", [shift(200, 220, 0), shift(260, 285, 30)]],
    ["Green Camo", [shift(200, 220, 120), shift(260, 285, 60)]],
    ["Urban Camo", [shift(200, 220, null, { light: 0.9 }), shift(260, 285, null, { light: 0.6 })]],
  ],
});

/** Ginger hair, a grey tank top and black trousers, purple shoes. */
export const RUST_BOBCAT = cookieFighter({
  body: { id: "antony-cookie", file: "Antony Nagasaki WrongCookieDo 01AAH009.gif", who: "Antony Nagasaki", sha256: "cb7b9996445d5e73157e9fff5910c747c71e5fad803d757158c340b5ec398cd1", width: 128, height: 106, frames: 553, x0: 30, x1: 68, y1: 93, tall: 78, map: (n) => (n < 124 ? n : n < 176 ? n - 2 : n - 7) },
  id: "gi-rust-bobcat", name: "Rust Bobcat", base: RUSHDOWN,
  // His clothes are pure greys (the skin is a little coloured, so a grey band with no saturation leaves it alone).
  outfits: [
    ["Blue", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.06, 0.4], hue: 215, tint: 0.5 }, shift(280, 300, 215)]],
    ["Green", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.06, 0.4], hue: 130, tint: 0.45 }, shift(280, 300, 130)]],
    ["Red", [{ from: 0, to: 360, minSat: 0, maxSat: 0.04, lights: [0.06, 0.4], hue: 0, tint: 0.5 }, shift(280, 300, 0)]],
  ],
});

/** A green jumpsuit and purple hair. */
export const PUNK_SCORPION = cookieFighter({
  body: { id: "byron-cookie", file: "Byron Verlaine WrongCookieDo 04ABH009.gif", who: "Byron Verlaine", sha256: "997016b1e23e643ab0474589b8fd9686c8f554ee0915a512262e5a1ff9ba4247", width: 114, height: 94, frames: 552, x0: 26, x1: 62, y1: 83, tall: 71, map: (n) => (n < 123 ? n + 1 : n < 176 ? n - 2 : n - 8) },
  id: "gi-punk-scorpion", name: "Punk Scorpion", base: ALL_ROUNDER,
  outfits: [
    ["Prison Orange", [shift(95, 120, 28, { minSat: 0.25, sat: 2 })]],
    ["Blue Jumpsuit", [shift(95, 120, 212, { minSat: 0.25, sat: 1.5 })]],
    ["Red Jumpsuit", [shift(95, 120, 0, { minSat: 0.25, sat: 1.8 })]],
  ],
});

/** A green military uniform, a red scarf. */
export const KHAKI_STAG = cookieFighter({
  body: { id: "george-cookie", file: "George Nguyen WrongCookieDo 04AAH009.gif", who: "George Nguyen", sha256: "d1a122db447af33f008edeba0387bca2f4b5321ebd9b7904f246b39af5f1a06c", width: 121, height: 100, frames: 560, x0: 30, x1: 66, y1: 89, tall: 76, size: 1.05 },
  id: "gi-khaki-stag", name: "Khaki Stag", base: HEAVY,
  outfits: [
    ["Desert", [shift(100, 115, 40, { minSat: 0.18, sat: 1.6, light: 1.3 })]],
    ["Navy", [shift(100, 115, 215, { minSat: 0.18, sat: 1.5 })]],
    ["Black Ops", [shift(100, 115, null, { minSat: 0.18, light: 0.55 })]],
  ],
});

/** Hair down to the knees, a green top and grey shorts. One frame more than the reference after the guard. */
export const MANED_WOLF = cookieFighter({
  body: { id: "i-cookie", file: "I wrongcookiedo 02ACH009.gif", who: "I", sha256: "398ad864f660f2bf6d18ab547bdcdd53843efefe82c6988d2216586b3f205cd0", width: 253, height: 190, frames: 561, x0: 89, x1: 128, y1: 165, tall: 85, map: (n) => (n < 7 ? n : n + 1) },
  id: "gi-maned-wolf", name: "Maned Wolf", base: RUSHDOWN,
  outfits: [
    ["Red Top", [shift(100, 120, 355, { minSat: 0.4 })]],
    ["Blue Top", [shift(100, 120, 212, { minSat: 0.4 })]],
    ["Purple Top", [shift(100, 120, 280, { minSat: 0.4 })]],
  ],
});

/** Stars and stripes. */
export const FREEDOM_EAGLE = cookieFighter({
  body: { id: "larissa-cookie", file: "Larissa Disaster Wrongcookiedo 02ABH009.gif", who: "Larissa Disaster", sha256: "3b8093f6214996f419244df4d8c96f91543b5e591cdaac4f145779d5168f36bd", width: 126, height: 113, frames: 554, x0: 33, x1: 69, y1: 101, tall: 77, map: (n) => (n < 177 ? n + 1 : n - 6) },
  id: "gi-freedom-eagle", name: "Freedom Eagle", base: ALL_ROUNDER,
  outfits: [
    ["Flipped Flag", [shift(350, 10, 240), shift(235, 255, 0)]],
    ["Green Flag", [shift(350, 10, 140), shift(235, 255, 50)]],
    ["Black Flag", [shift(350, 10, null, { light: 0.45 }), shift(235, 255, null, { light: 0.3 })]],
  ],
});

export const COOKIE_DO: readonly TemplateSpec[] = [JUNGLE_PUMA, SNOW_LEOPARD, RUST_BOBCAT, PUNK_SCORPION, KHAKI_STAG, MANED_WOLF, FREEDOM_EAGLE];
