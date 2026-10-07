/**
 * Seven house fighters in the Mustermenschen "Chains of compassion" style (Puffolotti, CC0; art/SOURCES.md,
 * mustermenschen.ts): a kung-fu-like style in a deep, wide stance, with huge side kicks, a long lunging palm, a
 * rising kick and a spinning kick, and, near the end of the GIF, a blaster pulled out and fired standing, crouching
 * and jumping: every one of them shoots it (PEW PEW), with a red laser bolt drawn in code. One move list, in the
 * frame numbers of the style's reference GIF ("Ava Lee chains of compassion", 1,126 frames); the other bodies
 * number theirs like it through `steps` (lined up by a sequence alignment of every frame's silhouette: some have up to
 * 21 frames fewer, dropped in a few places). The catalogue behind the choices:
 *
 *   0-29 seen from behind, posing · 30-32 turning round · 96-112 stepping in guard · 113-118 high side kick ·
 *   150-158 jabs · 209-215 side kick · 280-286 arms spread wide · 376-378 a high block · 465-477 hands on the head ·
 *   489-495 spinning kick · 622-626 arms wide · 643-652 a tucked somersault · 708-710 hit high · 711-713 hit in the
 *   stomach · 714-716 hit crouching · 717-731 knocked back, launched, tumbling · 732-748 down · 749-754 getting up ·
 *   755-759 straight · 780-789 lunging palms · 834-843 guard · 852-856 beckoning · 878-882 jab · 944-952 kneeling ·
 *   952-955 kneeling punch · 961-966 rising punch · 968-972 sweep · 974-977 kneeling kick · 983-985 kneeling cover ·
 *   1000-1007 rising kick · 1009-1016 the blaster, standing · 1055-1064 jump · 1081 tucked in the air ·
 *   1100-1104 air kick · 1105-1110 flying kick
 *
 * Frame 0 shows the fighter from behind, so bodies are measured on the guard (834) and the portrait is taken there.
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { HEAVY } from "./heavy.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { bodyArt, shift, type Body } from "./mustermenschen.ts";
import { PROJECTILE_SLOTS, type ProjectileArt } from "./projectile.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const STYLE = "Chains of compassion";
const GUARD = 834;
const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const feet = { anchor: "feet" as const };

/** Frame numbers through offsets that change at these reference frames: [[from, offset], ...]. */
export const steps = (s: readonly (readonly [number, number])[]) => (n: number) => {
  let o = 0;
  for (const [k, v] of s) if (n >= k) o = v;
  return n + o;
};

/** The standard get-hit sprites, in the reference GIF's frame numbers. */
const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 708, "5000,10": 709, "5000,20": 710,
  "5010,0": 711, "5010,10": 712, "5010,20": 713,
  "5020,0": 714, "5020,10": 715, "5020,20": 716,
  "5030,0": 717, "5030,10": 727, "5030,20": 728, "5030,30": 729, "5030,40": 730, "5030,50": 731,
  "5040,0": 736, "5040,10": 737, "5040,20": 738,
  "5060,0": 725, "5060,10": 726,
  "5070,0": 704, "5070,10": 705, "5070,20": 706,
};

/** Laser red, bright core to dark edge, in the projectile slots (every outfit keeps it). */
const LASER = ["#ffffff", "#ffe0e0", "#ff8080", "#ff3030", "#c00000", "#600000"] as const;

/** The blaster's bolt: a glowing capsule with a short trail, and a burst when it hits (native pixels, like the art). */
export function laserArt(state: number): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const add = (w: number, h: number, draw: (put: (x: number, y: number, shade: number) => void) => void) => {
    const img: IndexedImage = { width: w, height: h, pixels: new Uint8Array(w * h) };
    draw((x, y, shade) => {
      x = Math.round(x), y = Math.round(y);
      if (x >= 0 && y >= 0 && x < w && y < h) img.pixels[y * w + x] = PROJECTILE_SLOTS[Math.max(0, Math.min(5, shade))]!;
    });
    sprites.push({ group: base, number: sprites.length, image: img, axisX: Math.round(w / 2), axisY: Math.round(h / 2), palette: 0 });
    return sprites.length - 1;
  };
  const bolt = (len: number) =>
    add(len + 8, 9, (put) => {
      for (let x = 0; x < len + 8; x++) for (let y = 0; y < 9; y++) {
        const dy = Math.abs(y - 4), dx = x < 8 ? (8 - x) / 2 : 0;
        const d = dy + dx;
        if (d <= 3.5) put(x, y, d < 1 ? 0 : d < 2 ? 2 : d < 3 ? 3 : 5);
      }
    });
  const burst = (r: number) =>
    add(2 * r + 3, 2 * r + 3, (put) => {
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * 2 * Math.PI;
        for (let k = r * 0.4; k <= r; k++) put(r + 1 + Math.cos(t) * k, r + 1 + Math.sin(t) * k, k < r * 0.6 ? 1 : 3);
      }
      put(r + 1, r + 1, 0);
    });
  const fly = [bolt(18), bolt(20)];
  const hit = [burst(5), burst(8), burst(11)];
  const box: Box = [-8, -3, 12, 3];
  const actions: AirAction[] = [
    { action: base, comment: "the laser bolt", frames: fly.map((n) => ({ group: base, number: n, ticks: 2, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "the bolt hits", frames: hit.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "the bolt fades", frames: hit.slice(1).map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

export function chainsFighter(o: { body: Body; id: string; name: string; base: TemplateSpec; outfits: [string, HueShift[]][] }): TemplateSpec {
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
  /** Art pixels (this body's) to 320-wide units. */
  const units = (px: number) => Math.round((px * 320) / art.localcoord);
  // The blaster: drawn, aimed, three bolts' worth of recoil; one bolt.
  const blaster = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: "Pew Pew", from: "stand", command, special: true,
    anim: { action: state, cells: range(1009, 1016), ticks: [3, 3, 3, 3, 6, 4, 4, 4], anchor: "feet" },
    hits: [{ frames: [4], damage: 48, chip: 6, height: "high", weight: "medium", hitStun: 18, blockStun: 12, push: 4 }],
    projectile: { frame: 4, speed: 8, height: units(o.body.tall * 0.62), offset: units(o.body.x1 - o.body.x0), art: laserArt },
    ai: { range: 300, weight: zoner ? 1 : 0.6 },
  });
  // The lunging palms: two strikes as it drives forward.
  const lunge = (state: number, command: AttackSpec["command"]): AttackSpec => {
    const cells = range(780, 789);
    if (!zoner) return redraw(state, "Lunging Palms", cells, [3, 3, 3, 4, 3, 3, 3, 5, 4, 4], [3, 7]);
    return {
      state, name: "Lunging Palms", from: "stand", command, special: true,
      anim: { action: state, cells, ticks: [3, 3, 3, 4, 3, 3, 3, 5, 4, 4], anchor: "feet" },
      hits: [{ frames: [3, 7], damage: 70, chip: 7, height: "high", weight: "heavy", hitStun: 20, blockStun: 15, push: 7, knockdown: true, launch: [3, -4] }],
      moves: [{ frame: 1, x: 3.5 }, { frame: 8, x: 0 }],
      ai: { range: 110, weight: 0.6 },
    };
  };
  // PEW PEW!, in the font the dogs and heroes use.
  const words = heroWords([{ text: "PEW PEW!", color: FX.yellow }], 2);
  const cues: Cue[] = [{ action: zoner ? 1000 : 1400, frame: 4, sound: SOUNDS.zap, effect: { anim: WORD_ANIM, x: units(o.body.x1 - o.body.x0), y: units(o.body.tall + 8), readable: true, ticks: 24 } }];
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(834, 843), 5, "stand: a deep guard"),
      a(5, at(834), 3, "turn"),
      a(6, at(947), 3, "crouch turn"),
      a(10, at(942, 944), 3, "stand to crouch: kneels"),
      a(11, range(945, 952), 6, "kneeling"),
      a(12, at(944, 942), 3, "crouch to stand"),
      a(20, range(96, 112), 4, "walk forward: stepping in guard"),
      a(21, range(96, 112).reverse(), 4, "walk back"),
      a(40, at(1055), 3, "jump start"),
      a(41, range(1056, 1064), 5, "jump up"),
      a(42, range(643, 652), 4, "jump forward: a tucked somersault"),
      a(43, range(643, 652).reverse(), 4, "jump back"),
      a(47, at(1055), 3, "jump land"),
      a(100, range(761, 774), 3, "run: driving low"),
      a(105, range(1065, 1070), 5, "hop back"),
      a(120, at(376, 377), 2, "guard start"),
      a(121, at(983), 2, "crouch guard start"),
      a(122, at(1081), 2, "air guard start"),
      a(130, at(377), 10, "stand guard: a high block"),
      a(131, at(984), 10, "crouch guard: covering"),
      a(132, at(1081), 10, "air guard"),
      a(140, at(377, 376), 2, "guard end"),
      a(141, at(983), 2, "crouch guard end"),
      a(142, at(1081), 2, "air guard end"),
      a(150, at(378, 377), 3, "stand guard hit"),
      a(151, at(985), 6, "crouch guard hit"),
      a(152, at(1081), 6, "air guard hit"),
      a(170, at(465, 467, 469, 471), 6, "lose (time over): hands on the head", true),
      a(175, at(465, 467, 469, 471), 6, "draw (time over)", true),
      a(5000, at(708, 709), 3, "hit high, light"),
      a(5001, at(708, 709, 710), 3, "hit high, medium"),
      a(5002, at(709, 710, 710), 3, "hit high, hard"),
      a(5005, at(709, 708), 3, "recover high, light"),
      a(5006, at(710, 709, 708), 3, "recover high, medium"),
      a(5007, at(710, 710, 709, GUARD), 3, "recover high, hard"),
      a(5010, at(711, 712), 3, "hit low, light"),
      a(5011, at(711, 712, 713), 3, "hit low, medium"),
      a(5012, at(712, 713, 713), 3, "hit low, hard"),
      a(5015, at(712, 711), 3, "recover low, light"),
      a(5016, at(713, 712, GUARD), 3, "recover low, medium"),
      a(5017, at(713, 713, 712, GUARD), 3, "recover low, hard"),
      a(5020, at(714), 6, "crouching hit, light"),
      a(5021, at(715), 8, "crouching hit, medium"),
      a(5022, at(716), 10, "crouching hit, hard"),
      a(5025, at(714), 3, "crouching recover, light"),
      a(5026, at(715), 4, "crouching recover, medium"),
      a(5027, at(716, 714), 3, "crouching recover, hard"),
      a(5030, at(717), 4, "hit in the air"),
      a(5035, at(718), 3, "air hit transition"),
      a(5040, at(1081, 1082), 4, "air recover"),
      a(5050, at(727, 728), 5, "falling"),
      a(5060, at(729, 730), 5, "falling, coming down"),
      a(5070, at(704, 705), 4, "tripped"),
      a(5080, at(737), 4, "hit while down"),
      a(5090, at(733), 4, "hit up while down"),
      a(5100, at(731, 732), 3, "hit the ground"),
      a(5101, at(733), 4, "bounce"),
      a(5110, at(736), 30, "lying down"),
      a(5120, range(749, 754), 5, "getting up"),
      a(5140, at(736), 30, "lying defeated", true),
      a(5150, at(736), 30, "lying defeated (match over)", true),
      a(5160, at(733), 4, "bounce into the air"),
      a(5170, at(731, 736), 4, "hit the ground after a bounce"),
      a(5200, at(1081, 1082), 3, "fall recovery near the ground"),
      a(5210, at(1081, 1082, 1081), 3, "fall recovery in the air"),
      a(180, at(280, 281, 282, 283, 284, 285), [5, 5, 5, 5, 5, 60], "win: arms spread wide", true),
      a(181, at(622, 623, 624, 625, 626), [6, 6, 6, 6, 60], "win: arms wide", true),
      a(190, [...range(15, 29), ...at(30, 31, 32, GUARD)], [...Array(15).fill(5), 5, 5, 5, 10], "intro: seen from behind, posing, then turns round"),
      a(195, range(852, 856), 6, "taunt: beckons"),
    ],
    attacks: [
      redraw(200, "Jab", range(878, 882), [2, 2, 3, 3, 3], [2]),
      redraw(210, "Straight", range(755, 759), [2, 3, 4, 3, 3], [1, 2]),
      redraw(230, "Side Kick", range(209, 215), [2, 3, 4, 4, 3, 3, 3], [2, 3]),
      redraw(240, "High Side Kick", range(113, 118), [3, 3, 3, 4, 4, 3], [3, 4]),
      redraw(400, "Kneeling Punch", range(952, 955), [2, 3, 3, 3], [1]),
      redraw(410, "Rising Punch", range(961, 966), [2, 3, 4, 4, 3, 3], [2, 3]),
      redraw(430, "Kneeling Kick", range(974, 977), [2, 4, 3, 3], [1]),
      redraw(440, "Sweep", range(968, 972), [3, 3, 5, 4, 4], [2]),
      redraw(600, "Air Kick", range(1100, 1104), [3, 3, 5, 5, 4], [2, 3]),
      redraw(630, "Flying Kick", range(1105, 1110), [3, 3, 3, 3, 6, 4], [4]),
      zoner ? blaster(1000, "QCF_x") : lunge(1000, "QCF_x"),
      redraw(1100, "Rising Kick", range(1000, 1007), [2, 2, 2, 3, 4, 5, 4, 4], [4, 5]),
      redraw(1200, "Spinning Kick", range(489, 495), [2, 3, 3, 3, 4, 4, 4], [4, 5]),
      zoner ? lunge(1400, "QCB_x") : blaster(1400, "QCB_x"),
    ],
    sounds: () => heroSounds(),
    effectArt: () => words,
    cues,
    // The laser's colours, and the word's (yellow letters, a dark outline: the GIF's own palette is 64 colours).
    colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, LASER[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: m(GUARD) },
  };
}

const S = (...s: [number, number][]) => steps(s);

/** Bald, a black tee, orange and black camo: the style's reference GIF. */
export const LAVA_LIZARD = chainsFighter({
  body: { id: "ava-chains", file: "Ava Lee chains of compassion 05ABT003.gif", who: "Ava Lee", sha256: "2e47545f057eef6cde32c4a4e980739d12a4d2e98fb1eee6ee050657e3d1d526", width: 137, height: 120, frames: 1126, x0: 33, x1: 76, y1: 110, tall: 77 },
  id: "gi-lava-lizard", name: "Lava Lizard", base: ALL_ROUNDER,
  outfits: [
    ["Ice Camo", [shift(25, 40, 200)]],
    ["Toxic Camo", [shift(25, 40, 100)]],
    ["Plasma Camo", [shift(25, 40, 285)]],
  ],
});

/** A blue and yellow tracksuit, pink hair. */
export const BLUE_JAY = chainsFighter({
  body: { id: "byron-chains", file: "Byron V. chain of compassion 04ABH009.gif", who: "Byron Verlaine", sha256: "89fdb4863ca4221c86b5ca148ec9b027501f48fd38d16c21a06f2d51ad89375a", width: 121, height: 109, frames: 1118, x0: 29, x1: 67, y1: 99, tall: 69, map: S([0, 0], [476, -9], [756, -8]) },
  id: "gi-blue-jay", name: "Blue Jay", base: RUSHDOWN,
  outfits: [
    ["Cardinal", [shift(230, 250, 0), shift(55, 70, 45)]],
    ["Parrot", [shift(230, 250, 130), shift(55, 70, 0)]],
    ["Raven", [shift(230, 250, null, { light: 0.4 }), shift(55, 70, null, { light: 1.6 })]],
  ],
});

/** Blond, a green tee and green camo. */
export const SWAMP_CROC = chainsFighter({
  body: {
    id: "nick-chains", file: "Nick Adler Chains of compassion 03AAT003.gif", who: "Nick Adler", sha256: "9e9cb36c6d215adaca745da4049fbb0fb27201f9889e2fd7c9146e805c09be35", width: 144, height: 128, frames: 1119, x0: 35, x1: 81, y1: 117, tall: 82,
    map: S([0, 0], [7, -1], [67, -2], [477, -12], [760, -11], [831, -12], [845, -14], [847, -15], [1005, -14], [1014, -13], [1020, -12], [1028, -11], [1043, -9], [1051, -8], [1115, -7]),
  },
  id: "gi-swamp-croc", name: "Swamp Croc", base: HEAVY,
  outfits: [
    ["Desert Croc", [shift(85, 100, 38, { minSat: 0.5 })]],
    ["Blue Croc", [shift(85, 100, 210, { minSat: 0.5 })]],
    ["Red Croc", [shift(85, 100, 0, { minSat: 0.5 })]],
  ],
});

/** A green tank top, red and green camo. */
export const JUNGLE_BOAR = chainsFighter({
  body: { id: "raf-chains", file: "Raf Boulder Chains of compassion 04AET003.gif", who: "Raf Boulder", sha256: "d2f83795e2c61d9a4ad9a6c1b92ae754c712e2feb4c16f2bb4cd05e645c87b1b", width: 142, height: 127, frames: 1125, x0: 35, x1: 79, y1: 116, tall: 82, size: 1.05, map: S([0, 0], [7, -1], [67, -2], [760, -1]) },
  id: "gi-jungle-boar", name: "Jungle Boar", base: HEAVY,
  // The camo's red is exactly hue 0 like the skin's shadows are not (8-12): told apart by hue.
  outfits: [
    ["Blue Boar", [{ from: 356, to: 4, minSat: 0.9, hue: 220 }, shift(85, 95, 200, { minSat: 0.25 })]],
    ["Purple Boar", [{ from: 356, to: 4, minSat: 0.9, hue: 280 }, shift(85, 95, 300, { minSat: 0.25 })]],
    ["Desert Boar", [{ from: 356, to: 4, minSat: 0.9, hue: 30 }, shift(85, 95, 45, { minSat: 0.25 })]],
  ],
});

/** Bald, a black tee, white and grey camo: Camo Cobra's body in this style. */
export const SNOW_RHINO = chainsFighter({
  body: { id: "rhivan-chains", file: "Rhivan male chains of compassion 31AAT003.gif", who: "Rhivan", sha256: "f80cba39bba4ca115fb3a07110fb1c2940cdc87de90031b995601c9a098d580d", width: 191, height: 161, frames: 1126, x0: 48, x1: 108, y1: 147, tall: 100, map: S([0, 0], [67, -1], [400, 0], [756, 1], [1060, 0]) },
  id: "gi-snow-rhino", name: "Snow Rhino", base: ALL_ROUNDER,
  // The camo is pure greys and whites (light ones; the black tee and dark greys stay).
  outfits: [
    ["Desert Rhino", [{ from: 0, to: 360, minSat: 0, maxSat: 0.03, lights: [0.55, 0.85], hue: 38, tint: 0.45 }]],
    ["Jungle Rhino", [{ from: 0, to: 360, minSat: 0, maxSat: 0.03, lights: [0.55, 0.85], hue: 110, tint: 0.35, light: 0.8 }]],
    ["Night Rhino", [{ from: 0, to: 360, minSat: 0, maxSat: 0.03, lights: [0.55, 0.85], hue: 230, tint: 0.35, light: 0.6 }]],
  ],
});

/** A tall white alien with red stripes. */
export const GHOST_MANTIS = chainsFighter({
  body: { id: "tasen-woman-1-chains", file: "Tasen woman 1 Chains of compassion 13AAT003.gif", who: "Tasen woman 1", sha256: "4b3638c795751bd0a630867be4c310078ce2ee698b65b75ac0460da426f03809", width: 199, height: 173, frames: 1116, x0: 47, x1: 111, y1: 159, tall: 117, size: 1.12, map: S([0, 0], [66, -1], [477, -11], [760, -10]) },
  id: "gi-ghost-mantis", name: "Ghost Mantis", base: ZONER,
  outfits: [
    ["Blue Stripes", [shift(350, 10, 215)]],
    ["Green Stripes", [shift(350, 10, 125)]],
    ["Gold Stripes", [shift(350, 10, 45, { light: 1.3 })]],
  ],
});

/** A tall pink and lavender alien. */
export const NEON_MOTH = chainsFighter({
  body: { id: "tasen-woman-2-chains", file: "Tasen woman 2 Chains of compassion 13ABT003.gif", who: "Tasen woman 2", sha256: "14f99e28b2ee97e342518e4137386ad57450842784762d457170167ebaf5095b", width: 183, height: 159, frames: 1105, x0: 43, x1: 102, y1: 146, tall: 108, size: 1.1, map: S([0, 0], [20, -7], [66, -8], [477, -18], [760, -17], [836, -18], [839, -20], [843, -21]) },
  id: "gi-neon-moth", name: "Neon Moth", base: ZONER,
  outfits: [
    ["Lime Moth", [shift(300, 315, 95, { minSat: 0.4 }), shift(260, 270, 140)]],
    ["Ocean Moth", [shift(300, 315, 195, { minSat: 0.4 }), shift(260, 270, 230)]],
    ["Ember Moth", [shift(300, 315, 20, { minSat: 0.4 }), shift(260, 270, 0)]],
  ],
});

/** A tall dark-grey alien with purple trims and red eyes (its GIF has a palette per frame: art/gif.ts gathers them). */
export const IRON_RAVEN = chainsFighter({
  body: { id: "tasen-man-1-chains", file: "Tasen man 1 chains of compassion 14AAT003.gif", who: "Tasen man 1", sha256: "c0b715e5874712bb48a57614d4ec21ae375d8256ea9661f5d7981da80df1b107", width: 206, height: 179, frames: 1116, x0: 48, x1: 115, y1: 165, tall: 122, size: 1.14, map: S([0, 0], [66, -1], [477, -11], [760, -10]) },
  id: "gi-iron-raven", name: "Iron Raven", base: RUSHDOWN,
  outfits: [
    ["Green Raven", [shift(275, 290, 130)]],
    ["Blue Raven", [shift(275, 290, 205)]],
    ["Ember Raven", [shift(275, 290, 25)]],
  ],
});

export const CHAINS: readonly TemplateSpec[] = [LAVA_LIZARD, BLUE_JAY, SWAMP_CROC, JUNGLE_BOAR, SNOW_RHINO, GHOST_MANTIS, NEON_MOTH, IRON_RAVEN];
