/**
 * Four house fighters in the Mustermenschen "Tasen military combat" style (Puffolotti, CC0; art/SOURCES.md,
 * mustermenschen.ts): kickboxing with a long energy cape that whips out like a matador's (each body's in its own
 * colour), plus a bazooka pulled out and fired (the rocket drawn in code, FIRE! above, a cartoon blast when it
 * hits). One move list, in the frame numbers of the style's reference GIF ("Danny Van Damage Tasen mil. combat",
 * 1,280 frames); the other bodies have one frame more near the start (`steps`, chains.ts). The catalogue behind the
 * choices:
 *
 *   9-16 a cape flourish · 20-21 covering up · 26-30 hook · 31-43 guard · 44-48 side kick · 66-70 high kick ·
 *   93-100 cape thrust · 112-121 the bazooka · 277-279 crouch · 280-281 crouched, covering · 282-285 crouching jab ·
 *   287-291 low straight · 295-298 a fist raised · 303-306 low kick · 309-313 sweep · 360-372 jump and air kick ·
 *   380-383 a hop · 384-387 rocked · 392-395 doubled over · 396-401 knocked down · 402 launched · 408-410 tucked ·
 *   411-417 standing straight · 418-433 bouncing guard · 438-443 jab · 548-553 overhead cape swing · 562-567 cape lash ·
 *   1013-1020 a cartwheel · 1059-1063 arms wide, then raised · 1177-1189 falling back stiff as a plank ·
 *   1193-1194 falling forward · 1203-1222 facing the camera, then turning · 1246-1251 flying kick · 1260-1268 run
 *
 * The front foot is raised in the guard, so bodies are measured on both feet over the lowest rows.
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { steps } from "./chains.ts";
import { HEAVY } from "./heavy.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { bodyArt, shift, type Body } from "./mustermenschen.ts";
import { PROJECTILE_SLOTS, type ProjectileArt } from "./projectile.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const STYLE = "Tasen military combat";
const GUARD = 38;
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 384, "5000,10": 385, "5000,20": 386,
  "5010,0": 393, "5010,10": 394, "5010,20": 395,
  "5020,0": 280, "5020,10": 281, "5020,20": 281,
  "5030,0": 396, "5030,10": 397, "5030,20": 398, "5030,30": 1187, "5030,40": 1188, "5030,50": 1189,
  "5040,0": 1189, "5040,10": 400, "5040,20": 401,
  "5060,0": 402, "5060,10": 407,
  "5070,0": 1193, "5070,10": 1194, "5070,20": 1195,
};

/** The rocket: flame core, flame, flame's edge, the body, its shadow, the red nose. */
const ROCKET = ["#fff6c0", "#ffc83a", "#ff6a1a", "#9aa3a8", "#4c5458", "#d8282a"] as const;

/** A rocket with a flickering flame and a smoke puff behind; a cartoon blast when it hits. */
export function rocketArt(state: number): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const add = (w: number, h: number, draw: (put: (x: number, y: number, shade: number) => void) => void) => {
    const img: IndexedImage = { width: w, height: h, pixels: new Uint8Array(w * h) };
    draw((x, y, shade) => {
      x = Math.round(x), y = Math.round(y);
      if (x >= 0 && y >= 0 && x < w && y < h) img.pixels[y * w + x] = PROJECTILE_SLOTS[shade]!;
    });
    sprites.push({ group: base, number: sprites.length, image: img, axisX: Math.round(w / 2), axisY: Math.floor(h / 2), palette: 0 });
    return sprites.length - 1;
  };
  const rocket = (t: number) =>
    add(40, 11, (put) => {
      // Smoke puffs, then the flame, then the body and its nose.
      for (const [cx, r] of [[3 + (t % 2), 2], [8, 2.5]] as const) for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= r * r) put(cx + x, 5 + y, 4);
      for (let x = 10; x < 18; x++) for (let y = -2; y <= 2; y++) if (Math.abs(y) <= (x - 10) / 3 + (t % 2)) put(x, 5 + y, Math.abs(y) < 1 ? 0 : Math.abs(y) < 2 ? 1 : 2);
      for (let x = 18; x < 34; x++) for (let y = -2; y <= 2; y++) put(x, 5 + y, y === 2 ? 4 : 3);
      for (const [x, y] of [[18, -3], [19, -4], [18, 3], [19, 4]] as const) put(x, 5 + y, 4);
      for (let x = 34; x < 39; x++) for (let y = -2; y <= 2; y++) if (Math.abs(y) <= (39 - x) / 2) put(x, 5 + y, 5);
    });
  const blast = (r: number, ring: boolean) =>
    add(2 * r + 3, 2 * r + 3, (put) => {
      const c = r + 1;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1 || (ring && d < 0.55)) continue;
        put(c + x, c + y, d < 0.35 ? 0 : d < 0.65 ? 1 : d < 0.85 ? 2 : 4);
      }
    });
  const fly = [rocket(0), rocket(1)];
  const hit = [blast(8, false), blast(13, false), blast(17, true), blast(19, true)];
  const box: Box = [-2, -3, 19, 3];
  const actions: AirAction[] = [
    { action: base, comment: "the rocket flies", frames: fly.map((n) => ({ group: base, number: n, ticks: 2, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "the rocket blows up", frames: hit.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "the blast fades", frames: hit.slice(2).map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

export function militaryFighter(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
  const m = o.body.map ?? ((n: number) => n);
  const art = bodyArt(o.body, STYLE, Object.fromEntries(Object.entries(STANDARD).map(([k, n]) => [k, { cell: m(n), anchor: "feet" as const }])));
  const range = (from: number, to: number) => cellRange(from, to).map(m);
  const at = (...cells: number[]) => cells.map(m);
  const base: TemplateSpec = { ...o.base, art };
  const zoner = o.base.archetype === "ZONER";
  const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[], extra: Parameters<typeof redrawMove>[6] = {}) => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(base, state, name, cells, ticks, frames, { ...feet, ...extra, ...(moves ? { moves } : {}) });
  };
  const units = (px: number) => Math.round((px * 320) / art.localcoord);
  const span = o.body.x1 - o.body.x0;
  const bazooka = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: "Bazooka", from: "stand", command, special: true,
    anim: { action: state, cells: range(112, 121), ticks: [3, 3, 3, 3, 8, 4, 4, 4, 4, 4], anchor: "feet" },
    hits: [{ frames: [4], damage: 60, chip: 8, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 6, knockdown: true, launch: [3, -4], hitSound: SOUNDS.boom }],
    projectile: { frame: 4, speed: 5.5, height: units(o.body.tall * 0.62), offset: units(span), art: rocketArt },
    ai: { range: 320, weight: zoner ? 1 : 0.6 },
  });
  const capeThrust = (state: number, command: AttackSpec["command"]): AttackSpec =>
    zoner
      ? {
          state, name: "Cape Thrust", from: "stand", command, special: true,
          anim: { action: state, cells: range(93, 100), ticks: [3, 3, 3, 4, 4, 4, 4, 4], anchor: "feet" },
          hits: [{ frames: [2, 3, 4], damage: 70, chip: 7, height: "high", weight: "heavy", hitStun: 20, blockStun: 15, push: 7, knockdown: true, launch: [3, -4] }],
          ai: { range: 100, weight: 0.6 },
        }
      : redraw(state, "Cape Thrust", range(93, 100), [3, 3, 3, 4, 4, 4, 4, 4], [2, 3, 4]);
  const words = heroWords([{ text: "FIRE!", color: FX.yellow }, { text: "OLE!", color: FX.yellow }], 2);
  const say = (n: number, x: number, ticks: number) => ({ anim: WORD_ANIM + n, x: units(x), y: units(o.body.tall + 8), readable: true, ticks });
  const cues: Cue[] = [
    { action: zoner ? 1000 : 1400, frame: 4, sound: SOUNDS.boom, effect: say(0, span, 22) },
    { action: 195, frame: 6, sound: SOUNDS.whoosh, effect: say(1, 0, 30) },
  ];
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(418, 433), 4, "stand: a bouncing guard"),
      a(5, at(GUARD), 3, "turn"),
      a(6, at(278), 3, "crouch turn"),
      a(10, at(302, 277), 3, "stand to crouch"),
      a(11, at(277, 278, 279, 278), 8, "crouching"),
      a(12, at(302, GUARD), 3, "crouch to stand"),
      a(20, range(418, 433), 3, "walk forward: bouncing in guard"),
      a(21, range(418, 433).reverse(), 3, "walk back"),
      a(40, at(360), 3, "jump start"),
      a(41, [...range(361, 367), ...at(371, 372)], 4, "jump up"),
      a(42, range(1013, 1020), 4, "jump forward: a cartwheel"),
      a(43, range(1013, 1020).reverse(), 4, "jump back: a cartwheel"),
      a(47, at(300), 3, "jump land"),
      a(100, range(1260, 1268), 3, "run"),
      a(105, range(380, 383), 4, "hop back"),
      a(120, at(20, 21), 2, "guard start"),
      a(121, at(281), 2, "crouch guard start"),
      a(122, at(408), 2, "air guard start"),
      a(130, at(21), 10, "stand guard: covering up"),
      a(131, at(281), 10, "crouch guard: crouched, covering"),
      a(132, at(408), 10, "air guard"),
      a(140, at(21, 20), 2, "guard end"),
      a(141, at(281), 2, "crouch guard end"),
      a(142, at(408), 2, "air guard end"),
      a(150, at(31, 21), 3, "stand guard hit"),
      a(151, at(280), 6, "crouch guard hit"),
      a(152, at(408), 6, "air guard hit"),
      a(170, range(411, 417), 6, "lose (time over): stands straight", true),
      a(175, range(411, 417), 6, "draw (time over)", true),
      a(5000, at(384, 385), 3, "hit high, light"),
      a(5001, at(384, 385, 386), 3, "hit high, medium"),
      a(5002, at(385, 386, 387), 3, "hit high, hard"),
      a(5005, at(385, 384), 3, "recover high, light"),
      a(5006, at(386, 385, 384), 3, "recover high, medium"),
      a(5007, at(387, 386, 385, GUARD), 3, "recover high, hard"),
      a(5010, at(393, 394), 3, "hit low, light"),
      a(5011, at(393, 394, 395), 3, "hit low, medium"),
      a(5012, at(394, 395, 395), 3, "hit low, hard"),
      a(5015, at(394, 393), 3, "recover low, light"),
      a(5016, at(395, 394, GUARD), 3, "recover low, medium"),
      a(5017, at(395, 395, 394, GUARD), 3, "recover low, hard"),
      a(5020, at(280), 6, "crouching hit, light"),
      a(5021, at(281), 8, "crouching hit, medium"),
      a(5022, at(281), 10, "crouching hit, hard"),
      a(5025, at(280), 3, "crouching recover, light"),
      a(5026, at(281), 4, "crouching recover, medium"),
      a(5027, at(281, 280), 3, "crouching recover, hard"),
      a(5030, at(396), 4, "hit in the air"),
      a(5035, at(397), 3, "air hit transition"),
      a(5040, at(408, 409), 4, "air recover"),
      a(5050, at(396, 397), 5, "falling"),
      a(5060, at(397, 398), 5, "falling, coming down"),
      a(5070, at(1193, 1194), 4, "tripped"),
      a(5080, at(1188), 4, "hit while down"),
      a(5090, at(402), 4, "hit up while down"),
      a(5100, at(398, 1189), 3, "hit the ground"),
      a(5101, at(402), 4, "bounce"),
      a(5110, at(1189), 30, "lying down"),
      a(5120, at(1189, 1186, 1183, 1180, 1178, 1177, GUARD), [5, 4, 4, 4, 4, 5, 5], "getting up: rises stiff as a plank"),
      a(5140, at(1189), 30, "lying defeated", true),
      a(5150, at(1189), 30, "lying defeated (match over)", true),
      a(5160, at(402), 4, "bounce into the air"),
      a(5170, at(398, 1189), 4, "hit the ground after a bounce"),
      a(5200, at(408, 409), 3, "fall recovery near the ground"),
      a(5210, at(408, 409, 408), 3, "fall recovery in the air"),
      a(180, range(1059, 1063), [6, 6, 6, 6, 60], "win: arms wide, then raised", true),
      a(181, range(295, 298), [5, 5, 5, 60], "win: a fist raised", true),
      a(190, [...range(1203, 1222), ...at(GUARD)], [...Array(20).fill(4), 10], "intro: faces the camera, then turns to fight"),
      a(195, range(9, 17), [4, 4, 4, 4, 4, 4, 5, 8, 6], "taunt: a matador's cape flourish (OLE!)"),
    ],
    attacks: [
      redraw(200, "Jab", range(438, 443), [2, 2, 3, 3, 3, 3], [2, 3]),
      redraw(210, "Hook", range(26, 30), [2, 3, 4, 4, 3], [2, 3]),
      redraw(230, "Side Kick", range(44, 48), [2, 3, 4, 4, 3], [2, 3]),
      redraw(240, "High Kick", range(66, 70), [3, 4, 4, 4, 4], [1, 2]),
      redraw(400, "Crouching Jab", range(282, 285), [2, 3, 3, 3], [1]),
      redraw(410, "Low Straight", range(287, 291), [2, 3, 4, 3, 3], [1, 2]),
      redraw(430, "Low Kick", range(303, 306), [2, 4, 3, 3], [1]),
      redraw(440, "Sweep", range(309, 313), [3, 3, 4, 4, 4], [2, 3]),
      redraw(600, "Air Kick", range(365, 371), [3, 3, 3, 4, 4, 4, 4], [3, 4, 5]),
      redraw(630, "Flying Kick", range(1246, 1251), [3, 3, 5, 3, 5, 4], [2, 4]),
      zoner ? bazooka(1000, "QCF_x") : capeThrust(1000, "QCF_x"),
      redraw(1100, "Cape Swing", range(548, 553), [3, 3, 4, 4, 4, 4], [2, 3, 4]),
      redraw(1200, "Cape Lash", range(562, 567), [3, 3, 3, 4, 4, 4], [3, 4]),
      zoner ? capeThrust(1400, "QCB_x") : bazooka(1400, "QCB_x"),
    ],
    sounds: () => heroSounds(),
    effectArt: () => words,
    cues,
    colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, ROCKET[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: m(GUARD) },
  };
}

const S = (...s: [number, number][]) => steps(s);

/** Shirtless and blond, a red cape: the style's reference GIF. */
export const MATADOR = militaryFighter({
  body: { id: "danny-military", file: "Danny Van Damage Tasen mil. combat 06ABT001.gif", who: "Danny Van Damage", sha256: "80571b2e0537cdec080c6522235d1fce100084255325c4852ec69f8b406e207e", width: 179, height: 150, frames: 1280, x0: 70, x1: 118, y1: 143, tall: 79 },
  id: "gi-matador", name: "Matador", base: RUSHDOWN,
  outfits: [
    ["Blue Cape", [shift(355, 5, 215)]],
    ["Gold Cape", [shift(355, 5, 45, { light: 1.3 })]],
    ["Black Cape", [shift(355, 5, null, { light: 0.45 })]],
  ],
});

/** A purple suit and a grey helmet, a red cape. One frame more than the reference from frame 2. */
export const PURPLE_PROWLER = militaryFighter({
  body: { id: "maeja-military", file: "Maeja tasen military combat 12AAT001.gif", who: "Maeja", sha256: "7fb5f82ae519fd986a3ff608e33e5dbf42c3206ca1dba2f5baf7fc8284cc8364", width: 215, height: 181, frames: 1281, x0: 84, x1: 140, y1: 173, tall: 94, size: 1.05, map: S([0, 0], [2, 1]) },
  id: "gi-purple-prowler", name: "Purple Prowler", base: HEAVY,
  outfits: [
    ["Teal Prowler", [shift(250, 270, 175, { minSat: 0.4 })]],
    ["Crimson Prowler", [shift(250, 270, 350, { minSat: 0.4 }), shift(355, 5, 210, { minSat: 0.6 })]],
    ["Gold Prowler", [shift(250, 270, 42, { minSat: 0.4 })]],
  ],
});

/** A straw hat, a pale blue suit, purple boots and a white cape. */
export const WANDERING_RONIN = militaryFighter({
  body: { id: "susa-military", file: "Susa No Mikoto Tasen mil. combat 06ADT001.gif", who: "Susa No Mikoto", sha256: "a2567850eba0671da48c31bff23c00f9ee33de0d58cca8a2b7c2030ae93ec557", width: 220, height: 186, frames: 1281, x0: 85, x1: 146, y1: 179, tall: 99, size: 1.05, map: S([0, 0], [1, 1]) },
  id: "gi-wandering-ronin", name: "Wandering Ronin", base: ALL_ROUNDER,
  outfits: [
    ["Crimson Ronin", [shift(195, 210, 355, { minSat: 0.2 }), shift(260, 270, 30)]],
    ["Jade Ronin", [shift(195, 210, 140, { minSat: 0.2 }), shift(260, 270, 300)]],
    ["Shadow Ronin", [shift(195, 210, null, { minSat: 0.2, light: 0.5 }), shift(260, 270, 0)]],
  ],
});

/** A tall alien in red and white with a blue cape. One frame more than the reference from frame 7. */
export const RED_COMET = militaryFighter({
  body: { id: "tasen-woman-1-military", file: "Tasen woman 1 Tasen mil. combat 13AAT001.gif", who: "Tasen woman 1", sha256: "99513dba7430875de93bba2e0f01659a3911402090cb0bbbc61f455b792e63c4", width: 251, height: 210, frames: 1281, x0: 100, x1: 170, y1: 205, tall: 116, size: 1.12, map: S([0, 0], [7, 1]) },
  id: "gi-red-comet", name: "Red Comet", base: ZONER,
  outfits: [
    ["Blue Comet", [shift(355, 5, 215), shift(195, 210, 0)]],
    ["Green Comet", [shift(355, 5, 125), shift(195, 210, 45)]],
    ["Black Comet", [shift(355, 5, null, { light: 0.4 }), shift(195, 210, 280)]],
  ],
});

export const MILITARY: readonly TemplateSpec[] = [MATADOR, PURPLE_PROWLER, WANDERING_RONIN, RED_COMET];
