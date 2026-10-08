/**
 * "Tasen defender for fighting games" (Puffolotti, CC0; art/SOURCES.md): 1,177 frames of a golden-armoured alien
 * (an Iji fan design) as one GIF (139 x 121, a 32-colour palette), laid out 30 to a row so frame n is cell n. The
 * artist made the sequence for two characters, "one focused on strength (first half) and one on martial arts
 * (second half)", so it makes two house fighters, sharing the hit reactions: **Bull Market** (Bruiser) and
 * **Fool's Gold** (Sage), who summons the Tasen gun the artist drew popping into his hand. The frame catalogue:
 *
 *   0-7 points, summoning · 13-21 standing tall · 42-57 stepping in, an arm out · 62-70 guard · 71-72 an arm raised ·
 *   73-74 crouching down · 75-99 shuffling in guard · 100-106 jab · 107-112 front kick · 117-121 high kick ·
 *   122-126 rocked back · 127-129 knocked flat · 130-134 standing tall · 145-152 haymaker · 180-204 kicks and flips ·
 *   207-241 high kicks, a handspring, a flying kick (240) · 242-257 straights · 258-266 a dive · 276-288 tumbling ·
 *   294-302 flexing, facing the camera · 313-330 somersaults · 339-349 a diving tackle · 360-383 broken frames (the
 *   gun teleporting) · 384-399 arms out · 420-424 an overhead punch · 433-437 doubled over · 460-492 a wide stance,
 *   punches · 505-512 a double-fisted smash · 513-519 arms wide · 520-532 straight, side kick · 535-557 crouched ·
 *   558-561 rising uppercut · 562-568 low lunging punch · 573-576 low kick · 585-588 sweep · 600-610 rolling ·
 *   615-620 swinging punch · 638-645 backflip · 661-677 jump · 678-746 air moves and dives · 756-763 knocked back,
 *   lying · 764-778 launched, tumbling, lying · 787-792 getting up · 800-872 punches and kicks (840-846 high kick) ·
 *   873-889 the martial-arts guard (a cyan belt from here on) · 900-903 long side kick · 910-915 high kick ·
 *   920-927 jab, uppercut · 947-950 doubled over · 967-975 straight · 1000-1011 crouched, uppercut, sweep ·
 *   1012-1019 low kick · 1020-1030 crouched · 1031-1043 jump, air punch (1040) · 1053-1057 THE GUN, aimed ·
 *   1058-1061 the gun raised · 1067-1071 the gun, crouching · 1076-1092 the gun in the air · 1100-1109 walking ·
 *   1136-1146 flying kick · 1152-1158 a leap, flexing
 *
 * Frames sit on slightly different ground lines, so every animation anchors each frame's lowest pixel.
 */
import { laserArt } from "./chains.ts";
import { FX, FX_COLORS, heroSounds, heroWords, SOUNDS, WORD_ANIM } from "./heroes.ts";
import { HEAVY } from "./heavy.ts";
import { PROJECTILE_SLOTS } from "./projectile.ts";
import { cellList, type AnimSpec, type ArtSource, type AttackSpec, type Cue, type HueShift, type TemplateSpec } from "./spec.ts";
import { cellRange as range, redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const feet = (cell: number) => ({ cell, anchor: "feet" as const });
const URL = "https://opengameart.org/content/tasen-defender-for-fighting-games";

export const TASEN_DEFENDER: ArtSource = {
  id: "tasen-defender",
  file: "art/sources/tasen-defender/sequence.gif",
  sha256: "6acafa156f182939d4b525644b45ccdf0542b6a31b8d5e5a2e3a00ed0c380cfc",
  cellWidth: 139,
  cellHeight: 121,
  columns: 30,
  rows: 40,
  // The guard (frame 62): feet from x 37 to 75 on row 110.
  axis: { x: 57, y: 109 },
  stray: [],
  // About 84 pixels tall: at 260 a little taller than the Thai boxers, as a Tasen should be.
  localcoord: 260,
  standardSprites: {
    "5000,0": feet(122), "5000,10": feet(123), "5000,20": feet(124),
    "5010,0": feet(433), "5010,10": feet(434), "5010,20": feet(435),
    "5020,0": feet(541), "5020,10": feet(542), "5020,20": feet(543),
    "5030,0": feet(756), "5030,10": feet(757), "5030,20": feet(758), "5030,30": feet(759), "5030,40": feet(760), "5030,50": feet(761),
    "5040,0": feet(762), "5040,10": feet(763), "5040,20": feet(774),
    "5060,0": feet(764), "5060,10": feet(765),
    "5070,0": feet(766), "5070,10": feet(767), "5070,20": feet(768),
  },
  credit: `Sprites: Tasen defender for fighting games by Puffolotti (CC0), ${URL}`,
};

const a = (action: number, cells: number[], ticks: number | number[], comment: string, hold = false): AnimSpec => ({
  action, cells, ticks, anchor: "feet", comment, ...(hold ? { loop: false as const } : {}),
});
const units = (px: number) => Math.round((px * 320) / TASEN_DEFENDER.localcoord);
const TALL = 84;

/** The gold of the armour and skin, the maroon trousers. */
const shift = (from: number, to: number, hue: number | null, more: Partial<HueShift> = {}): HueShift => ({ from, to, hue, minSat: 0.4, ...more });
const GOLD = (hue: number | null, more: Partial<HueShift> = {}) => shift(28, 56, hue, more);
const MAROON = (hue: number | null, more: Partial<HueShift> = {}) => shift(338, 12, hue, { minSat: 0.2, lights: [0.15, 0.5], ...more });
/** The martial-arts half's cyan belt and its light highlights, painted maroon so it doesn't come and go between halves. */
const BELT: Record<number, string> = { 17: "#83484a", 18: "#83484a", 19: "#8b555a", 20: "#8b555a", 21: "#8b555a" };
/** The gun's bolt: magenta, like the muzzle the artist drew. */
const BOLT = ["#ffffff", "#ffe0ff", "#ff8cff", "#f018ff", "#a000b0", "#500058"] as const;

/** The hit reactions, falls and get-ups both fighters share (from the first half). */
function shared(guard: number, crouch: number, low: readonly [number, number, number]): AnimSpec[] {
  return [
    a(5000, [122, 123], 3, "hit high, light"),
    a(5001, [122, 123, 124], 3, "hit high, medium"),
    a(5002, [123, 124, 125], 3, "hit high, hard"),
    a(5005, [123, 122], 3, "recover high, light"),
    a(5006, [124, 123, 122], 3, "recover high, medium"),
    a(5007, [125, 124, 123, guard], 3, "recover high, hard"),
    a(5010, [low[0], low[1]], 3, "hit low, light"),
    a(5011, [...low], 3, "hit low, medium"),
    a(5012, [low[1], low[2], low[2]], 3, "hit low, hard"),
    a(5015, [low[1], low[0]], 3, "recover low, light"),
    a(5016, [low[2], low[1], guard], 3, "recover low, medium"),
    a(5017, [low[2], low[2], low[1], guard], 3, "recover low, hard"),
    a(5020, [541], 6, "crouching hit, light"),
    a(5021, [542], 8, "crouching hit, medium"),
    a(5022, [543], 10, "crouching hit, hard"),
    a(5025, [541], 3, "crouching recover, light"),
    a(5026, [542, crouch], 4, "crouching recover, medium"),
    a(5027, [543, 542], 3, "crouching recover, hard"),
    a(5030, [756], 4, "hit in the air"),
    a(5035, [757], 3, "air hit transition"),
    a(5040, [772, 773, guard], 4, "air recover"),
    a(5050, [757, 758], 5, "falling"),
    a(5060, [759, 760], 5, "falling, coming down"),
    a(5070, [766, 767], 4, "tripped"),
    a(5080, [762], 4, "hit while down"),
    a(5090, [764], 4, "hit up while down"),
    a(5100, [760, 761], 3, "hit the ground"),
    a(5101, [759], 4, "bounce"),
    a(5110, [762], 30, "lying down"),
    a(5120, [...range(787, 792), guard], [6, 5, 5, 4, 4, 4, 5], "getting up"),
    a(5140, [762], 30, "lying defeated", true),
    a(5150, [762], 30, "lying defeated (match over)", true),
    a(5160, [765], 4, "bounce into the air"),
    a(5170, [760, 761], 4, "hit the ground after a bounce"),
    a(5200, [773, guard], 3, "fall recovery near the ground"),
    a(5210, [772, 773, guard], 3, "fall recovery in the air"),
  ];
}

// ----- Bull Market: the strength half -----

/** One of the template's moves on these cells, anchored on the feet, its movement spread over the new length. */
function redrawOn(base: TemplateSpec) {
  return (state: number, name: string, cells: number[], ticks: number[], frames: number[]) => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.some((mv) => mv.frame >= cells.length) ? was.moves.map((mv) => ({ ...mv, frame: Math.min(cells.length - 1, Math.round((mv.frame * cells.length) / len)) })) : undefined;
    return redrawMove(base, state, name, cells, ticks, frames, { anchor: "feet", ...(moves ? { moves } : {}) });
  };
}

const bruiser: TemplateSpec = { ...HEAVY, art: TASEN_DEFENDER };
const heavy = redrawOn(bruiser);
const G = 66;
const goldWords = heroWords([{ text: "MARKET CRASH!", color: FX.yellow }, { text: "BUY GOLD!", color: FX.yellow }], 2);

/** The signature: a double-fisted smash from on high. MARKET CRASH! */
const marketCrash: AttackSpec = {
  state: 1400, name: "Market Crash", from: "stand", command: "QCB_x", special: true,
  // Raises both fists overhead (510-512), then the swing played backwards brings them down to a crouch (509-506).
  anim: { action: 1400, cells: [G, 510, 511, 512, 509, 508, 507, 506, G], ticks: [3, 4, 5, 8, 3, 3, 4, 6, 6], anchor: "feet" },
  hits: [{ frames: [5, 6], damage: 105, chip: 11, height: "overhead", weight: "heavy", hitStun: 26, blockStun: 18, push: 5, knockdown: true, launch: [2, -3], hitSound: SOUNDS.boom }],
  ai: { range: 70, weight: 1.1 },
};

export const BULL_MARKET: TemplateSpec = {
  ...bruiser,
  id: "gi-bull-market",
  name: "Bull Market",
  anims: [
    a(0, [...range(62, 69), ...range(63, 68).reverse()], 5, "stand: guard"),
    a(5, [G], 3, "turn"),
    a(6, [540], 3, "crouch turn"),
    a(10, [73, 74], 2, "stand to crouch"),
    a(11, [535, 536, 537, 538, 537, 536], 8, "crouched"),
    a(12, [74, 73], 2, "crouch to stand"),
    a(20, range(84, 99), 4, "walk forward: shuffling in guard"),
    a(21, range(84, 99).reverse(), 4, "walk back"),
    a(40, [661, 662, 663], 2, "jump start"),
    a(41, range(664, 670), 4, "jump up"),
    a(42, range(664, 670), 4, "jump forward"),
    a(43, range(664, 670).reverse(), 4, "jump back"),
    a(47, [671, 672], 3, "jump land"),
    a(100, range(42, 57), 2, "run: stepping in, an arm out"),
    a(105, [663, 666, 671], 4, "hop back"),
    a(120, [66], 2, "guard start"),
    a(121, [540], 2, "crouch guard start"),
    a(122, [667], 2, "air guard start"),
    a(130, [66], 10, "stand guard"),
    a(131, [540], 10, "crouch guard"),
    a(132, [667], 10, "air guard"),
    a(140, [66], 2, "guard end"),
    a(141, [540], 2, "crouch guard end"),
    a(142, [667], 2, "air guard end"),
    a(150, [123, 66], 3, "stand guard hit"),
    a(151, [541], 6, "crouch guard hit"),
    a(152, [667], 6, "air guard hit"),
    a(170, range(130, 134), 6, "lose (time over): stands tall", true),
    a(175, range(130, 134), 6, "draw (time over)", true),
    ...shared(G, 540, [433, 434, 435]),
    a(180, range(294, 302), [5, 5, 5, 5, 5, 5, 5, 5, 60], "win: flexing, facing the camera", true),
    a(181, [G, 71, 72], [5, 5, 60], "win: an arm raised", true),
    a(190, [...range(0, 7), ...range(13, 21), G], [...Array(8).fill(5), ...Array(9).fill(4), 10], "intro: points, then stands tall (BUY GOLD!)"),
    a(195, range(513, 519), [5, 5, 5, 6, 8, 6, 5], "taunt: arms wide"),
  ],
  attacks: [
    heavy(200, "Jab", range(100, 106), [2, 2, 3, 3, 3, 3, 3], [2, 3]),
    // A flurry: the arms go out on 145, 147 and 149-151, back in between.
    heavy(210, "Flurry", [G, ...range(145, 152)], [2, 3, 2, 3, 2, 3, 4, 3, 3], [3, 5, 6]),
    heavy(230, "Front Kick", range(107, 112), [2, 3, 4, 4, 3, 3], [2, 3]),
    heavy(240, "High Kick", range(117, 121), [3, 3, 5, 4, 4], [2, 3]),
    heavy(400, "Low Lunge", range(562, 568), [2, 2, 2, 3, 4, 4, 4], [4, 5]),
    heavy(410, "Rising Uppercut", range(558, 561), [2, 3, 6, 4], [2]),
    heavy(430, "Low Kick", range(573, 576), [2, 4, 4, 3], [1, 2]),
    heavy(440, "Sweep", [540, ...range(585, 588)], [2, 4, 4, 4, 4], [1, 2]),
    heavy(600, "Jumping Punch", [667, ...range(688, 693)], [2, 3, 3, 4, 4, 4, 4], [1, 2, 3]),
    heavy(630, "Flying Kick", [667, ...range(238, 241)], [2, 3, 3, 6, 4], [3]),
    heavy(1000, "Gold Rush", [G, ...range(339, 349)], [2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5], [3, 4, 5]),
    heavy(1100, "Heavy Uppercut", range(615, 620), [3, 3, 4, 6, 5, 5], [2, 3]),
    heavy(1200, "Hammer Drop", range(420, 424), [3, 4, 6, 6, 5], [3]),
    marketCrash,
  ],
  sounds: () => heroSounds(),
  effectArt: () => goldWords,
  cues: [
    { action: 1400, frame: 6, effect: { anim: WORD_ANIM, x: 0, y: units(TALL + 10), readable: true, ticks: 30 } },
    { action: 190, frame: 2, effect: { anim: WORD_ANIM + 1, x: 0, y: units(TALL + 10), readable: true, ticks: 30 } },
  ] satisfies Cue[],
  colors: { ...BELT, [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Silver Bull", colors: {}, shifts: [GOLD(null, { light: 1.15 }), MAROON(215, { tint: 0.3 })] },
    { name: "Copper Bull", colors: {}, shifts: [GOLD(16, { light: 0.85 }), MAROON(null, { light: 0.6 })] },
    { name: "Jade Bull", colors: {}, shifts: [GOLD(150), MAROON(30, { tint: 0.3 })] },
  ],
  portrait: { cell: G },
};

// ----- Fool's Gold: the martial-arts half, with the gun -----

const sage: TemplateSpec = { ...ZONER, art: TASEN_DEFENDER };
const zoner = redrawOn(sage);
const F = 873;
const foolWords = heroWords([{ text: "PEW PEW!", color: FX.yellow }, { text: "LOWBALL!", color: FX.yellow }, { text: "PEW!", color: FX.yellow }], 2);

/** A shot from the summoned gun: a magenta bolt (chains.ts draws it in the projectile colours). */
const shot = (state: number, name: string, command: AttackSpec["command"], cells: number[], ticks: number[], frame: number, height: number, low = false): AttackSpec => ({
  state, name, from: "stand", command, special: true,
  anim: { action: state, cells, ticks, anchor: "feet" },
  hits: [{ frames: [frame], damage: low ? 55 : 50, chip: 6, height: low ? "low" : "high", weight: "medium", hitStun: 18, blockStun: 12, push: 4, hitSound: SOUNDS.zap }],
  projectile: { frame, speed: 8, height: units(height), offset: units(30), art: laserArt },
  ai: { range: 300, weight: 1 },
});

export const FOOLS_GOLD: TemplateSpec = {
  ...sage,
  id: "gi-fools-gold",
  name: "Fool's Gold",
  anims: [
    a(0, range(873, 889), 4, "stand: the martial-arts guard"),
    a(5, [F], 3, "turn"),
    a(6, [1022], 3, "crouch turn"),
    a(10, [1000, 1001], 2, "stand to crouch"),
    a(11, range(1020, 1025), 8, "crouched"),
    a(12, [1001, 1000], 2, "crouch to stand"),
    a(20, range(1100, 1109), 4, "walk forward"),
    a(21, range(1100, 1109).reverse(), 4, "walk back"),
    a(40, [1031], 2, "jump start"),
    a(41, range(1032, 1039), 4, "jump up"),
    a(42, range(1032, 1039), 4, "jump forward"),
    a(43, range(1032, 1039).reverse(), 4, "jump back"),
    a(47, [1031], 3, "jump land"),
    a(100, range(1100, 1109), 2, "run"),
    a(105, [1031, 1035, 1031], 4, "hop back"),
    a(120, [934], 2, "guard start"),
    a(121, [1022], 2, "crouch guard start"),
    a(122, [1036], 2, "air guard start"),
    a(130, [934], 10, "stand guard: leaning away"),
    a(131, [1022], 10, "crouch guard"),
    a(132, [1036], 10, "air guard"),
    a(140, [934], 2, "guard end"),
    a(141, [1022], 2, "crouch guard end"),
    a(142, [1036], 2, "air guard end"),
    a(150, [123, 934], 3, "stand guard hit"),
    a(151, [541], 6, "crouch guard hit"),
    a(152, [1036], 6, "air guard hit"),
    a(170, range(130, 134), 6, "lose (time over): stands tall", true),
    a(175, range(130, 134), 6, "draw (time over)", true),
    ...shared(F, 1022, [947, 948, 949]),
    a(180, range(1152, 1158), [4, 4, 5, 5, 5, 5, 60], "win: a leap, flexing", true),
    a(181, range(294, 302), [5, 5, 5, 5, 5, 5, 5, 5, 60], "win: flexing, facing the camera", true),
    a(190, [...range(0, 7), F], [5, 5, 5, 5, 5, 5, 5, 8, 10], "intro: points, summoning"),
    a(195, [...range(1056, 1061), F], [4, 4, 4, 6, 10, 6, 6], "taunt: the gun pointed at the sky (PEW!)"),
  ],
  attacks: [
    zoner(200, "Jab", [F, ...range(920, 922)], [2, 3, 3, 3], [1]),
    zoner(210, "Straight", [F, ...range(967, 975)], [2, 2, 3, 4, 4, 3, 3, 3, 3, 3], [2, 3, 4]),
    zoner(230, "High Kick", range(910, 915), [2, 3, 4, 4, 3, 3], [2, 3]),
    zoner(240, "Long Side Kick", [F, ...range(900, 903)], [2, 3, 5, 4, 4], [2, 3]),
    zoner(400, "Low Lunge", range(562, 568), [2, 2, 2, 3, 4, 4, 4], [4, 5]),
    zoner(410, "Rising Uppercut", range(1000, 1005), [2, 2, 3, 5, 4, 4], [3, 4]),
    zoner(430, "Low Kick", range(1012, 1019), [2, 2, 3, 5, 4, 3, 3, 3], [3]),
    zoner(440, "Sweep", [1020, ...range(1008, 1011)], [2, 3, 3, 5, 4], [3]),
    zoner(600, "Jumping Punch", range(1039, 1041), [3, 5, 4], [1]),
    zoner(630, "Flying Kick", range(1136, 1146), [2, 2, 2, 2, 3, 3, 5, 4, 3, 3, 3], [5, 6, 7]),
    shot(1000, "Tasen Blaster", "QCF_x", [F, ...range(1053, 1057)], [3, 3, 8, 4, 4, 4], 2, TALL * 0.62),
    zoner(1100, "Sky Shot", range(1058, 1061), [3, 3, 6, 5], [2, 3]),
    zoner(1200, "Spin Kick", range(840, 846), [3, 3, 3, 5, 5, 4, 4], [3, 4]),
    shot(1400, "Lowball", "QCB_x", [1020, ...range(1066, 1071)], [3, 3, 3, 4, 8, 4, 4], 4, TALL * 0.28, true),
  ],
  sounds: () => heroSounds(),
  effectArt: () => foolWords,
  cues: [
    { action: 1000, frame: 2, sound: SOUNDS.zap, effect: { anim: WORD_ANIM, x: units(30), y: units(TALL + 10), readable: true, ticks: 24 } },
    { action: 1400, frame: 4, sound: SOUNDS.zap, effect: { anim: WORD_ANIM + 1, x: units(30), y: units(TALL + 4), readable: true, ticks: 24 } },
    { action: 195, frame: 3, sound: SOUNDS.zap, effect: { anim: WORD_ANIM + 2, x: 0, y: units(TALL + 16), readable: true, ticks: 24 } },
  ] satisfies Cue[],
  colors: { ...BELT, ...Object.fromEntries(PROJECTILE_SLOTS.map((slot, i) => [slot, BOLT[i]!])), [FX.yellow]: FX_COLORS[FX.yellow]!, [FX.ink]: FX_COLORS[FX.ink]! },
  palettes: [
    { name: "Silver Lining", colors: {}, shifts: [GOLD(null, { light: 1.15 }), MAROON(215, { tint: 0.3 })] },
    { name: "Rose Gold", colors: {}, shifts: [GOLD(345, { sat: 0.8, light: 1.05 }), MAROON(280, { tint: 0.25 })] },
    { name: "Black Gold", colors: {}, shifts: [GOLD(null, { light: 0.45 }), MAROON(48, { tint: 0.5, light: 1.2 })] },
  ],
  portrait: { cell: F },
};

export const TASEN_DEFENDERS: readonly TemplateSpec[] = [BULL_MARKET, FOOLS_GOLD];
