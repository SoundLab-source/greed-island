/**
 * The Tasen commanders' "military combat" GIFs (Puffolotti, CC0; art/SOURCES.md): Maeja (1,737 frames, 135 x 127) and
 * Ukall (1,740 frames, 142 x 133), giant Tasen soldiers (Iji fan designs) fighting with twin shield-claws and a pistol,
 * plus bare-handed punches and kicks. Their chains GIFs are Sky Marshal and Star Sergeant (chains.ts); these are
 * arranged differently from the collection's military style, so they get their own move list, in Maeja's frame
 * numbers. Ukall's GIF has the same moves with a frame more from 228 on and two more from 1701 (found by lining up
 * every frame's silhouette). Two house fighters: **Claw Enforcement** (Sage, Maeja) and **Martial Law** (Brawler,
 * Ukall). The catalogue, laid out 30 to a row so frame n is cell n:
 *
 *   0-12 guard, pistol and claw-shield · 98-104 standing, the pistol raised · 150-162 a pistol shot (156-158) ·
 *   175-196 an overhead claw swing (183-186) into a thrust (194-196) · 236-248 a lunging claw (241-242) ·
 *   270-281 shots forward (272-273), then up · 350-358 side kick (353-355) · 359-366 high kick (363-364) ·
 *   367-380 a knee, front kick (374-376) · 410-418 pistol jabs (412, 416) · 500-520 claws spread, then raised ·
 *   536-540 crouched · 562-575 shots and claw thrusts · 600-610 crouched, shooting up · 665-685 crouched, a low
 *   sweep (679-681) · 686-707 crouched, aiming, a low shot (697-698) · 708-724 crouched, a claw up (711-714), low
 *   shots · 741-756 jump · 757-774 air kicks (763-765), landing · 776-778 claws up · 790-796 knocked down, lying ·
 *   797-802 launched, upside down · 803-805 righting in the air · 860-870 high kick (866-867) · 900-912 kicks ·
 *   930-937 a huge lunging claw (934) · 957-962 an overhead claw slam (961) · 1001-1010 rocked back, doubled over ·
 *   1200-1210 a spinning claw (1204-1206) · 1513-1515 doubled over · 1518-1523 knocked down · 1524-1529 lying ·
 *   1530-1536 getting up · 1606-1611 cartwheel · 1612-1620 run · 1625-1640 crouched, shooting · 1686-1688 hit
 *   crouching · 1689-1700 knocked back, rolling up · 1715-1736 standing tall
 *
 * Every animation anchors each frame's lowest pixel on the ground.
 */
import { laserArt } from "./chains.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { PROJECTILE_SLOTS } from "./projectile.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const MAEJA_URL = "https://opengameart.org/content/tasen-soldiercommander-maeja-for-fighting-games";
const UKALL_URL = "https://opengameart.org/content/tasen-soldiercommander-ukall-for-fighting-games";
/** The standard get-hit sprites, in Maeja's numbers. */
const STANDARD: Readonly<Record<string, number>> = {
  "5000,0": 1001, "5000,10": 1002, "5000,20": 1003,
  "5010,0": 1513, "5010,10": 1514, "5010,20": 1515,
  "5020,0": 1686, "5020,10": 1687, "5020,20": 1688,
  "5030,0": 790, "5030,10": 791, "5030,20": 792, "5030,30": 793, "5030,40": 794, "5030,50": 797,
  "5040,0": 795, "5040,10": 1525, "5040,20": 796,
  "5060,0": 801, "5060,10": 802,
  "5070,0": 1519, "5070,10": 1520, "5070,20": 1521,
};

interface Commander {
  id: string;
  name: string;
  base: TemplateSpec;
  file: string;
  sha256: string;
  width: number;
  height: number;
  frames: number;
  axis: { x: number; y: number };
  localcoord: number;
  tall: number;
  /** Its frame number for each of Maeja's. */
  map: (n: number) => number;
  credit: string;
  outfits: [string, HueShift[]][];
  /** The signature (QCB + x) and its shout; the other shouts: intro, win, the pistol. */
  signature: string;
  shout: string;
  intro: string;
  win: string;
}

const PISTOL = ["#ffffff", "#e0fff8", "#80ffe0", "#20e0c0", "#008a78", "#00403a"] as const;

function commander(o: Commander): TemplateSpec {
  const m = o.map;
  const at = (...cells: number[]) => cells.map(m);
  const range = (from: number, to: number) => cellRange(from, to).map(m);
  const art: ArtSource = {
    id: o.id.replace(/^gi-/, ""),
    file: o.file,
    sha256: o.sha256,
    cellWidth: o.width,
    cellHeight: o.height,
    columns: 30,
    rows: Math.ceil(o.frames / 30),
    axis: o.axis,
    stray: [],
    localcoord: o.localcoord,
    standardSprites: Object.fromEntries(Object.entries(STANDARD).map(([k, n]) => [k, { cell: m(n), anchor: "feet" as const }])),
    credit: o.credit,
  };
  const base: TemplateSpec = { ...o.base, art };
  const zoner = o.base.archetype === "ZONER";
  const redraw = (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(base, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
  };
  const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
    action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
  });
  const units = (px: number) => Math.round((px * 320) / art.localcoord);
  const G = m(0);
  // The pistol: a teal bolt (chains.ts draws it in the projectile colours).
  const pistol = (state: number, command: AttackSpec["command"]): AttackSpec => ({
    state, name: zoner ? "Freeze!" : "Warning Shot", from: "stand", command, special: true,
    anim: { action: state, cells: range(150, 160), ticks: [2, 2, 2, 2, 2, 3, 6, 4, 3, 3, 3], anchor: "feet" },
    hits: [{ frames: [6], damage: 50, chip: 6, height: "high", weight: "medium", hitStun: 18, blockStun: 12, push: 4, hitSound: SOUNDS.zap }],
    projectile: { frame: 6, speed: 8, height: units(o.tall * 0.62), offset: units(36), art: laserArt },
    ai: { range: 300, weight: zoner ? 1 : 0.6 },
  });
  // The signature: the huge lunging claw.
  const signature: AttackSpec = {
    state: 1400, name: o.signature, from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [G, ...range(930, 937), G], ticks: [3, 3, 3, 3, 3, 6, 5, 4, 4, 5], anchor: "feet" },
    hits: [{ frames: [5, 6], damage: 95, chip: 10, height: "high", weight: "heavy", hitStun: 24, blockStun: 16, push: 7, knockdown: true, launch: [4, -3], hitSound: SOUNDS.clang }],
    moves: [{ frame: 3, x: 2.5 }, { frame: 7, x: 0 }],
    ai: { range: 110, weight: 1 },
  };
  // Words drawn at the art's own pixel size: these sprites are drawn small (localcoord under 200), so pixels are big.
  const words = heroWords([{ text: o.shout, color: FX.yellow }, { text: o.intro, color: FX.white }, { text: o.win, color: FX.yellow }, { text: zoner ? "FREEZE!" : "BANG!", color: FX.yellow }], 1);
  const say = (n: number, x: number, ticks: number, up = 12) => ({ anim: WORD_ANIM + n, x: units(x), y: units(o.tall + up), readable: true, ticks });
  const cues: Cue[] = [
    { action: 1400, frame: 5, effect: say(0, 60, 30) },
    { action: 190, frame: 4, effect: say(1, 0, 40, 18) },
    { action: 180, frame: 3, effect: say(2, 0, 70, 18) },
    { action: zoner ? 1000 : 1200, frame: 6, sound: SOUNDS.zap, effect: say(3, 40, 24) },
    { action: 210, frame: 4, sound: SOUNDS.shing },
  ];
  return {
    ...base,
    id: o.id,
    name: o.name,
    anims: [
      a(0, range(0, 12), 4, "stand: guard, pistol and claw-shield"),
      a(5, [G], 3, "turn"),
      a(6, at(538), 3, "crouch turn"),
      a(10, at(536, 537), 2, "stand to crouch"),
      a(11, at(538, 539, 540, 539), 8, "crouched"),
      a(12, at(537, 536), 2, "crouch to stand"),
      a(20, range(0, 12), 3, "walk forward: bouncing in guard"),
      a(21, range(0, 12).reverse(), 3, "walk back"),
      a(40, at(741), 2, "jump start"),
      a(41, range(742, 750), 4, "jump up"),
      a(42, range(742, 756), 3, "jump forward"),
      a(43, range(742, 750).reverse(), 4, "jump back"),
      a(47, at(771, 772), 3, "jump land"),
      a(100, range(1612, 1620), 2, "run"),
      a(105, at(741, 746, 772), 4, "hop back"),
      a(120, at(776, 777), 2, "guard start: claws up"),
      a(121, at(538), 2, "crouch guard start"),
      a(122, at(747), 2, "air guard start"),
      a(130, at(777), 10, "stand guard"),
      a(131, at(538), 10, "crouch guard"),
      a(132, at(747), 10, "air guard"),
      a(140, at(777, 776), 2, "guard end"),
      a(141, at(538), 2, "crouch guard end"),
      a(142, at(747), 2, "air guard end"),
      a(150, at(1002, 777), 3, "stand guard hit"),
      a(151, at(1686), 6, "crouch guard hit"),
      a(152, at(747), 6, "air guard hit"),
      a(170, range(1715, 1720), 6, "lose (time over): stands tall", true),
      a(175, range(1715, 1720), 6, "draw (time over)", true),
      a(5000, at(1001, 1002), 3, "hit high, light"),
      a(5001, at(1001, 1002, 1003), 3, "hit high, medium"),
      a(5002, at(1002, 1003, 1004), 3, "hit high, hard"),
      a(5005, at(1002, 1001), 3, "recover high, light"),
      a(5006, [...at(1003, 1002), G], 3, "recover high, medium"),
      a(5007, [...at(1004, 1003, 1002), G], 3, "recover high, hard"),
      a(5010, at(1513, 1514), 3, "hit low, light"),
      a(5011, at(1513, 1514, 1515), 3, "hit low, medium"),
      a(5012, at(1514, 1515, 1515), 3, "hit low, hard"),
      a(5015, at(1514, 1513), 3, "recover low, light"),
      a(5016, [...at(1515, 1514), G], 3, "recover low, medium"),
      a(5017, [...at(1515, 1515, 1514), G], 3, "recover low, hard"),
      a(5020, at(1686), 6, "crouching hit, light"),
      a(5021, at(1687), 8, "crouching hit, medium"),
      a(5022, at(1688), 10, "crouching hit, hard"),
      a(5025, at(1686), 3, "crouching recover, light"),
      a(5026, at(1687), 4, "crouching recover, medium"),
      a(5027, at(1688, 1687), 3, "crouching recover, hard"),
      a(5030, at(790), 4, "hit in the air"),
      a(5035, at(791), 3, "air hit transition"),
      a(5040, [...at(803, 804, 805), G], 4, "air recover: rights itself"),
      a(5050, at(791, 792), 5, "falling"),
      a(5060, at(793, 794), 5, "falling, coming down"),
      a(5070, at(1519, 1520), 4, "tripped"),
      a(5080, at(796), 4, "hit while down"),
      a(5090, at(797), 4, "hit up while down"),
      a(5100, at(794, 795), 3, "hit the ground"),
      a(5101, at(797), 4, "bounce"),
      a(5110, at(1525), 30, "lying down"),
      a(5120, [...range(1529, 1536), G], [6, 5, 5, 4, 4, 4, 4, 5, 5], "getting up"),
      a(5140, at(1525), 30, "lying defeated", true),
      a(5150, at(1525), 30, "lying defeated (match over)", true),
      a(5160, at(797), 4, "bounce into the air"),
      a(5170, at(794, 795), 4, "hit the ground after a bounce"),
      a(5200, [...at(805), G], 3, "fall recovery near the ground"),
      a(5210, [...at(803, 805), G], 3, "fall recovery in the air"),
      a(180, range(509, 518), [4, 4, 4, 4, 4, 4, 5, 6, 8, 60], `win: claws spread, then raised (${o.win})`, true),
      a(181, range(1716, 1722), [5, 5, 5, 5, 6, 8, 60], "win: stands tall, a claw raised", true),
      a(190, [...range(1715, 1736), G], [...Array(22).fill(4), 10], `intro: stands tall (${o.intro}), then into the guard`),
      a(195, [...range(98, 104), G], [5, 5, 5, 5, 8, 10, 6, 6], "taunt: the pistol raised"),
    ],
    attacks: [
      redraw(200, "Pistol Jab", [G, ...range(411, 414)], [2, 2, 4, 3, 3], [2]),
      redraw(210, "Claw Lunge", [G, ...range(238, 245)], [2, 2, 2, 2, 4, 4, 3, 3, 3], [4, 5]),
      redraw(230, "Side Kick", range(350, 358), [2, 2, 2, 4, 4, 3, 3, 3, 3], [3, 4, 5]),
      redraw(240, "High Kick", range(359, 366), [2, 2, 2, 2, 4, 5, 4, 4], [4, 5]),
      redraw(400, "Low Shot", [...at(690), ...range(694, 699)], [2, 2, 2, 2, 4, 4, 3], [4, 5]),
      redraw(410, "Rising Claw", [...at(708), ...range(710, 714)], [2, 2, 3, 4, 5, 4], [3, 4]),
      redraw(430, "Low Sweep", range(676, 682), [2, 2, 2, 4, 4, 4, 3], [3, 4, 5]),
      redraw(440, "Low Kick", range(636, 645), [2, 2, 2, 2, 2, 3, 4, 4, 3, 3], [5, 6, 7]),
      redraw(600, "Air Kick", range(757, 766), [2, 2, 2, 2, 2, 2, 4, 4, 3, 3], [6, 7]),
      redraw(630, "Flying Kick", range(760, 770), [2, 2, 2, 4, 4, 4, 3, 3, 3, 3, 3], [3, 4, 5]),
      zoner ? pistol(1000, "QCF_x") : redraw(1000, "Claw Rush", [G, ...range(236, 248)], [2, 2, 2, 2, 2, 3, 4, 4, 3, 3, 3, 3, 3, 3], [6, 7]),
      redraw(1100, "Claw Uppercut", range(178, 188), [2, 2, 2, 2, 2, 3, 4, 4, 4, 3, 3], [5, 6, 7]),
      zoner ? redraw(1200, "Claw Spin", range(1200, 1210), [2, 2, 2, 2, 4, 4, 4, 3, 3, 3, 3], [4, 5, 6]) : pistol(1200, "QCB_b"),
      signature,
    ],
    sounds: () => heroSounds(),
    effectArt: () => words,
    cues,
    colors: { ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, PISTOL[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.white]: FX_COLORS[FX.white]!, [FX.ink]: FX_COLORS[FX.ink]! },
    palettes: o.outfits.map(([name, shifts]) => ({ name, colors: {}, shifts })),
    portrait: { cell: G },
  };
}

const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.15, ...more });

export const CLAW_ENFORCEMENT = commander({
  id: "gi-claw-enforcement", name: "Claw Enforcement", base: ZONER,
  file: "art/sources/tasen-maeja/military.gif", sha256: "c8f2700d0e330972cdc0f4a2daf2c051a8d6fad66f58e060cb97b20845c25af8",
  width: 135, height: 127, frames: 1737, axis: { x: 62, y: 116 }, localcoord: 184, tall: 66,
  map: (n) => n,
  credit: `Sprites: Tasen soldier/commander Maeja for fighting games (military combat) by Puffolotti (CC0), ${MAEJA_URL}`,
  outfits: [
    // Her teal skin (h164-201) and the claws' maroon (h330-360).
    ["Riot Squad", [shift(160, 205, 215, { minSat: 0.2 }), shift(325, 5, 45, { tint: 0.4 })]],
    ["Night Watch", [shift(160, 205, 270, { minSat: 0.2, light: 0.85 }), shift(325, 5, 0, { tint: 0.5 })]],
    ["Parking Patrol", [shift(160, 205, 95, { minSat: 0.2 }), shift(325, 5, 30, { tint: 0.6, light: 1.2 })]],
  ],
  signature: "Claw and Order", shout: "CLAW AND ORDER!", intro: "HALT!", win: "CASE CLOSED!",
});

export const MARTIAL_LAW = commander({
  id: "gi-martial-law", name: "Martial Law", base: ALL_ROUNDER,
  file: "art/sources/tasen-ukall/military.gif", sha256: "6d915100b14ff6b890f154d3ab9a97f360fecd66aed9289b1e7e689378372e43",
  width: 142, height: 133, frames: 1740, axis: { x: 66, y: 122 }, localcoord: 188, tall: 69,
  map: (n) => (n < 228 ? n : n < 1701 ? n + 1 : n + 2),
  credit: `Sprites: Tasen soldier/commander Ukall for fighting games (military combat) by Puffolotti (CC0), ${UKALL_URL}`,
  outfits: [
    // His navy suit (h214-240) and the claws' red (h340-360, h0-5).
    ["Field Marshal", [shift(210, 245, 30, { tint: 0.35, light: 1.2 }), shift(335, 8, 210, { tint: 0.4 })]],
    ["Desert Command", [shift(210, 245, 40, { tint: 0.3, light: 1.5 }), shift(335, 8, 20, { tint: 0.5 })]],
    ["Red Alert", [shift(210, 245, 355, { tint: 0.45 }), shift(335, 8, 50, { tint: 0.6, light: 1.2 })]],
  ],
  signature: "Curfew", shout: "CURFEW!", intro: "AT EASE!", win: "DISMISSED!",
});

export const TASEN_COMMANDERS: readonly TemplateSpec[] = [CLAW_ENFORCEMENT, MARTIAL_LAW];
