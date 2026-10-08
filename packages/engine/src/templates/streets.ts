/**
 * Street toughs from two more small pixel packs, built like the heroes (templates/heroes.ts, the pixel-pack kit):
 *
 * - **Bandits** by Sven Thole (art/SOURCES.md; his licence: any game, credit him): a light and a heavy bandit, the
 *   same body and moves in two colours, a file per frame, facing left (mirrored). One big sword swing with its trail,
 *   a running lunge, a guard stance, a lying-down death and a get-up ("Recover") that plants the sword to rise.
 *   **Sticky Fingers** (Striker, the light one) steals coins; **Daylight Robbery** (Bruiser, the heavy one) charges
 *   tolls with a sword planted into the ground.
 * - **Streets of Fight** by ansimuz (free for any use): a Streets of Rage-style brawler girl (jab, cross, high kick,
 *   jump kick, dive kick) and a punk. **Side Scroller** (Brawler) is the heroine, beat-'em-up jokes and all; she has
 *   no death strip, so she falls back onto the floor on her hurt frame. **Cheap Shot** (Wrestler) is the punk, facing
 *   left (mirrored), whose hurt strip ends knocked down: that's his fall, and his get-up backwards.
 */
import { ALL_ROUNDER } from "./all-rounder.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import type { IndexedImage } from "../art/sheet.ts";
import { thrown } from "./hero-fighters.ts";
import { coin, coinSpray, drawnProjectile, effects, FX, heroFighter, SOUNDS, type Hero, type HeroCtx } from "./heroes.ts";
import { disc, dust, line, put, star, type PackCanvas } from "./pack-kit.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { AnimSpec, AttackSpec, TemplateSpec } from "./spec.ts";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Every street tough's own settings, in the order they're made (for the checks). */
export const STREET_CONFIGS: Hero[] = [];
const tough = (h: Hero): TemplateSpec => (STREET_CONFIGS.push(h), heroFighter(h));
/** A hue band turned to another hue (outfits). */
const hue = (from: number, to: number, toHue: number | null, more: { minSat?: number; maxSat?: number; sat?: number; light?: number; tint?: number; lights?: readonly [number, number] } = {}) => ({ from, to, hue: toHue, ...more });

// ----- The Bandits -----

const SVEN = "art/sources/sven-thole/extracted";
const BANDITS_URL = "https://sventhole.itch.io/bandits";
/** A bandit's animation, a file per frame (`Bandits/Sprites/<who> Bandit/<dir>/<who>Bandit_<name>_<n>.png`). */
const frames = (who: "Light" | "Heavy", dir: string, name: string, n: number) => range(n).map((i) => `Bandits/Sprites/${who} Bandit/${dir}/${who}Bandit_${name}_${i}.png`);
const banditStrips = (who: "Light" | "Heavy") =>
  ({
    idle: [frames(who, "Idle", "Idle", 4), 4],
    block: [frames(who, "Combat Idle", who === "Light" ? "Combat Idle" : "CombatIdle", 4), 4],
    run: [frames(who, "Run", "Run", 8), 8],
    attack: [frames(who, "Attack", "Attack", 8), 8],
    hurt: [frames(who, "Hurt", "Hurt", 2), 2],
    death: [frames(who, "Death", "Death", 1), 1],
    jump: [frames(who, "Jump", "Jump", 1), 1],
    recover: [frames(who, "Recover", "Recover", 8), 8],
  }) as const;
const banditCredit = (who: string) => `Sprites: Bandits (${who} Bandit) by Sven Thole, ${BANDITS_URL} (credit required; art/SOURCES.md); moves, effects and sounds by Greed Island`;

/**
 * The running lunge (its blade is too thin for the automatic hitbox: a box along it, at the waist, in art pixels from
 * the feet) and the big swing with its trail.
 */
const BANDIT_ATTACKS = [{ strip: "run", frames: [4, 5, 6, 7], hits: [1, 2], box: [10, -23, 25, -13] }, { strip: "attack", hits: [4, 5] }] as const;

/** Getting up: the pack's own, pushing up off the floor and leaning on the planted sword. */
const recoverAnim = (k: HeroCtx): AnimSpec => ({ action: 5120, cells: range(8).map((f) => k.c(`recover ${f}`, { s: "recover", f })), ticks: [6, 5, 5, 4, 4, 4, 4, 5], comment: "getting up: pushes up and leans on the sword" });

// Sticky Fingers: the light bandit, who's after your money.
export const STICKY_FINGERS = tough({
  id: "gi-sticky-fingers", name: "Sticky Fingers", base: RUSHDOWN, localcoord: 380,
  pack: { name: "Bandits", url: BANDITS_URL },
  root: SVEN,
  credit: banditCredit("Light"),
  mirror: true,
  strips: banditStrips("Light"),
  body: { front: 13, back: 13, height: 37 },
  sha256: "057894de8ac4ea41b735b38795c5091a0274c0f74b4574c21b1312b8bb366b6e",
  room: { l: 17, r: 27, u: 46, d: 1 },
  hurt: [1],
  down: 0,
  attacks: BANDIT_ATTACKS,
  outfits: [
    { name: "Red-Handed", colors: {}, shifts: [hue(55, 85, 355, { minSat: 0.2, tint: 0.5, light: 0.8 })] },
    { name: "Desert Rat", colors: {}, shifts: [hue(10, 30, 42, { minSat: 0.15, lights: [0, 0.5], light: 1.25 })] },
    { name: "Cat Burglar", colors: {}, shifts: [hue(55, 85, 225, { minSat: 0.2, tint: 0.35, light: 0.45 }), hue(10, 30, null, { minSat: 0.15, lights: [0, 0.5], light: 0.6 })] },
  ],
  names: { 200: "Poke", 210: "Lunge", 240: "Big Swing", 400: "Low Poke", 410: "Rising Swing", 430: "Ankle Cut", 600: "Air Poke", 630: "Diving Swing", 1000: "Dash Swing", 1100: "Rising Cut", 1200: "Whirlwind" },
  words: { cry: "MINE!", intro: "HAND IT OVER!", win: "MINE NOW!", taunt: "HEADS!" },
  more: (k) => ({
    attacks: [fiveFingerDiscount(k)],
    anims: [recoverAnim(k), coinFlip(k)],
    cues: [
      { action: 1400, frame: 6, sound: SOUNDS.coin, effect: k.say("YOINK!", k.body.front, 26, FX.yellow) },
      { action: 195, frame: 7, sound: SOUNDS.coin },
    ],
  }),
});

/** A dash in, a hand in your pocket (YOINK!, coins everywhere), and a hop back out. */
function fiveFingerDiscount(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const dash = range(6).map((i) => k.c(`yoink dash ${i}`, { s: "run", f: i % 4, fx: [effects.speed, effects.dustBehind(10)] }));
  const grab = k.c("yoink grab", { s: "run", f: 2, dx: 2, fx: [effects.hitStar(F + 6, H * 0.55, 5), coinSpray(F + 4, H * 0.6, 0)] });
  const spill = [1, 2].map((t) => k.c(`yoink spill ${t}`, { s: "run", f: 3, fx: [coinSpray(F + 4, H * 0.6, t)] }));
  const hop = k.c("yoink hop", { s: "jump", dy: -8, dx: -3, fx: [coinSpray(F, H * 0.6, 3)] });
  return {
    state: 1400, name: "Five-Finger Discount", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...dash, grab, ...spill, hop, k.cells.STAND[0]!], ticks: [2, 2, 2, 2, 2, 2, 6, 4, 4, 6, 4] },
    hits: [{ frames: [6], damage: 70, chip: 7, height: "mid", weight: "medium", hitStun: 22, blockStun: 12, push: 3, hitSound: SOUNDS.coin, box: k.bx(F - 4, -H * 0.85, F + 12, -H * 0.25) }],
    moves: [{ frame: 0, x: 7 }, { frame: 6, x: 0 }, { frame: 9, x: -3 }, { frame: 10, x: 0 }],
    ai: { range: 140, weight: 0.6 },
  };
}

/** Taunt: flips a coin, watches it, catches it (HEADS!). */
function coinFlip(k: HeroCtx): AnimSpec {
  const { front: F, height: H } = k.body;
  const ys = [0.55, 0.8, 1.1, 1.3, 1.4, 1.3, 1.1, 0.8, 0.55];
  const cells = ys.map((y, t) => k.c(`coin flip ${t}`, { s: "idle", f: t % 4, fx: [(c) => coin(c.img, c.x + F - 3, c.y - Math.round(H * y), t, 2)] }));
  return { action: 195, cells: [...cells, k.cells.STAND[0]!], ticks: [4, 3, 3, 3, 4, 3, 3, 3, 4, 20], comment: "taunt: flips a coin (HEADS!)" };
}

// Daylight Robbery: the heavy bandit, hooded and masked, who charges tolls.
export const DAYLIGHT_ROBBERY = tough({
  id: "gi-daylight-robbery", name: "Daylight Robbery", base: HEAVY, localcoord: 350,
  pack: { name: "Bandits", url: BANDITS_URL },
  root: SVEN,
  credit: banditCredit("Heavy"),
  mirror: true,
  strips: banditStrips("Heavy"),
  body: { front: 13, back: 13, height: 38 },
  sha256: "0a253812c3d62390d91e1c0a2b60dbf01e2b7ef58d96bd4eb68d2d4bfe77ee98",
  room: { l: 18, r: 27, u: 46, d: 1 },
  hurt: [1],
  down: 0,
  attacks: BANDIT_ATTACKS,
  outfits: [
    // The hood and cloak (the sword is lighter, so it stays steel).
    { name: "Highway Red", colors: {}, shifts: [hue(205, 216, 0, { minSat: 0.15, lights: [0, 0.45], tint: 0.35 })] },
    { name: "Robin Hoodlum", colors: {}, shifts: [hue(205, 216, 120, { minSat: 0.15, lights: [0, 0.45], tint: 0.3 })] },
    { name: "Night Robbery", colors: {}, shifts: [hue(205, 216, null, { minSat: 0.15, lights: [0, 0.45], light: 0.55 })] },
  ],
  names: { 200: "Poke", 210: "Lunge", 230: "Shove", 240: "Big Swing", 400: "Low Poke", 410: "Rising Swing", 430: "Ankle Cut", 600: "Air Poke", 630: "Diving Swing", 1000: "Highway Charge", 1100: "Rising Cut", 1200: "Hammer Drop" },
  words: { cry: "HRAAH!", intro: "STICK 'EM UP!", win: "NO REFUNDS!", taunt: "PAY UP!" },
  more: (k) => ({
    attacks: [payTheToll(k)],
    anims: [recoverAnim(k), { action: 195, cells: [...range(4), ...range(4)].map((f) => k.c(`block ${f}`, { s: "block", f })), ticks: 5, comment: "taunt: points the sword (PAY UP!)" }],
    cues: [{ action: 1400, frame: 4, sound: SOUNDS.boom, effect: k.say("PAY THE TOLL!", 0, 30, FX.yellow) }],
  }),
});

/** Raises the sword and drives it into the ground: a quake runs along the floor (a low hit). */
function payTheToll(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const raise = range(4).map((f) => k.c(`toll raise ${f}`, { s: "attack", f }));
  const plant = k.c("toll plant", { s: "recover", f: 3, fx: [effects.dustUnder, (c) => star(c.img, c.x + 8, c.y - 1, 7, FX.yellow, FX.white)] });
  const kneel = k.c("toll kneel", { s: "recover", f: 4 });
  const rise = [6, 7].map((f) => k.c(`toll rise ${f}`, { s: "recover", f }));
  return {
    ...thrown(k, {
      state: 1400, name: "Pay the Toll", command: "QCB_x", cells: [...raise, plant, kneel, ...rise, k.cells.STAND[0]!], ticks: [3, 3, 4, 6, 8, 10, 5, 5, 4], frame: 4,
      art: quakeArt, speed: 5, height: 4, damage: 75, low: true, hitSound: SOUNDS.thud, range: 260,
    }),
  };
}

/** The quake: dust and broken ground rolling along the floor. */
function quakeArt(state: number) {
  const W = 36, Hh = 22;
  const fly = range(4).map((t) => (img: IndexedImage) => {
    dust(img, 2, W - 2, Hh - 3, FX.dust, t + 1);
    for (let i = 0; i < 4; i++) disc(img, 6 + i * 8 + ((t + i) % 3), Hh - 7 - ((i + t) % 3) * 3, 1.6, FX.grey);
    line(img, 4, Hh - 2, W - 4, Hh - 2, FX.ink);
    for (let x = 6; x < W - 4; x += 5) put(img, x + (t % 2), Hh - 3, FX.ink);
  });
  const hit = [0, 1, 2].map((t) => (img: IndexedImage) => {
    if (t < 2) star(img, W / 2, Hh - 8, 7 + t * 3, FX.yellow, FX.white);
    dust(img, 2, W - 2, Hh - 3, FX.dust, 7 + t);
  });
  return drawnProjectile(state, fly, hit, { w: W, h: Hh, box: [-15, -9, 15, 9] });
}

// ----- Streets of Fight -----

const ANSIMUZ = "art/sources/ansimuz/extracted/Streets of Fight files/Assets/Spritesheets";
const STREETS_URL = "https://ansimuz.itch.io/streets-of-fight";
const streetsCredit = (who: string) => `Sprites: Streets of Fight (${who}) by ansimuz, ${STREETS_URL} (free for any use; art/SOURCES.md); moves, effects and sounds by Greed Island`;
const GIRL_STRIPS = ["idle", "walk", "jab", "punch", "kick", "jump", "jump_kick", "dive_kick", "hurt"] as const;

// Side Scroller: the brawler girl, straight out of a beat-'em-up.
export const SIDE_SCROLLER = tough({
  id: "gi-side-scroller", name: "Side Scroller", base: ALL_ROUNDER, localcoord: 450,
  pack: { name: "Streets of Fight", url: STREETS_URL },
  root: ANSIMUZ,
  credit: streetsCredit("Brawler Girl"),
  strips: {
    idle: ["Brawler Girl/idle.png", 4], walk: ["Brawler Girl/walk.png", 10], run: ["Brawler Girl/walk.png", 10],
    jab: ["Brawler Girl/jab.png", 3], punch: ["Brawler Girl/punch.png", 3], kick: ["Brawler Girl/kick.png", 5],
    jump: ["Brawler Girl/jump.png", 4], jump_kick: ["Brawler Girl/jump_kick.png", 3], dive_kick: ["Brawler Girl/dive_kick.png", 5], hurt: ["Brawler Girl/hurt.png", 2],
  },
  widths: { ...Object.fromEntries(GIRL_STRIPS.map((s) => [s, 96])), run: 96 },
  body: { front: 12, back: 12, height: 46 },
  sha256: "325de351cb8ebe978a1c0a02ad96db66e7691b08536e19768e093c7a14195bcb",
  room: { l: 23, r: 40, u: 53, d: 0 },
  hurt: [0, 1],
  down: 2,
  attacks: [{ strip: "jab", hits: [1, 2] }, { strip: "punch", hits: [1, 2] }, { strip: "kick", hits: [3, 4] }],
  outfits: [
    { name: "Blue Streak", colors: {}, shifts: [hue(330, 15, 215, { minSat: 0.6 })] },
    { name: "Green Light", colors: {}, shifts: [hue(330, 15, 130, { minSat: 0.6 })] },
    { name: "Purple Haze", colors: {}, shifts: [hue(330, 15, 280, { minSat: 0.6 })] },
  ],
  names: { 200: "Jab", 210: "Cross", 230: "Front Kick", 240: "High Kick", 400: "Low Jab", 410: "Uppercut", 430: "Low Punch", 440: "Sweep", 1000: "Running Kick", 1100: "Rising Uppercut", 1200: "Spinning Kick" },
  words: { cry: "HYAH!", intro: "INSERT COIN", win: "STAGE CLEAR!", taunt: "GO! GO!" },
  more: (k) => ({
    attacks: [beatEmUp(k), jumpKick(k), diveKick(k)],
    cues: [
      { action: 1400, frame: 6, sound: SOUNDS.thud, effect: k.say("COMBO!", k.body.front, 26, FX.yellow) },
      { action: 600, frame: 1, sound: SOUNDS.swishBig },
      { action: 630, frame: 1, sound: SOUNDS.whoosh },
    ],
  }),
});

/** Her signature: the arcade combo, jab, cross and high kick in one go. */
function beatEmUp(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const cells = [
    k.c("combo jab 0", { s: "jab", f: 0 }), k.c("combo jab 1", { s: "jab", f: 1 }), k.c("combo jab 2", { s: "jab", f: 2 }),
    k.c("combo punch 1", { s: "punch", f: 1 }), k.c("combo punch 2", { s: "punch", f: 2 }),
    k.c("combo kick 2", { s: "kick", f: 2 }), k.c("combo kick 3", { s: "kick", f: 3, fx: [effects.hitStar(F + 26, H * 0.75, 6)] }), k.c("combo kick 4", { s: "kick", f: 4 }),
    k.cells.STAND[0]!,
  ];
  return {
    state: 1400, name: "Beat 'Em Up", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells, ticks: [2, 3, 3, 3, 4, 3, 5, 5, 4] },
    hits: [
      { frames: [1], damage: 25, height: "high", weight: "light", hitStun: 16, blockStun: 9, push: 1 },
      { frames: [3], damage: 30, height: "high", weight: "medium", hitStun: 18, blockStun: 10, push: 1 },
      { frames: [6], damage: 45, chip: 6, height: "high", weight: "heavy", hitStun: 22, blockStun: 13, push: 5, knockdown: true, launch: [3, -3] },
    ],
    moves: [{ frame: 0, x: 2 }, { frame: 3, x: 2 }, { frame: 5, x: 2 }, { frame: 7, x: 0 }],
    ai: { range: 70, weight: 0.7 },
  };
}

/** In the air: the pack's own jump kick, a spinning crescent then a kick up. */
function jumpKick(k: HeroCtx): AttackSpec {
  const cells = range(3).map((f) => k.c(`jump kick ${f}`, { s: "jump_kick", f }));
  return k.move(600, "Jump Kick", cells, [3, 4, 6], [1, 2], undefined, { anchor: "feet" });
}

/** And the pack's dive kick: a flip, then straight down and forward. */
function diveKick(k: HeroCtx): AttackSpec {
  const cells = [1, 2, 3, 4].map((f) => k.c(`dive kick ${f}`, { s: "dive_kick", f }));
  return k.move(630, "Dive Kick", cells, [4, 3, 8, 6], [2], undefined, { anchor: "feet" });
}

// Cheap Shot: the punk, a beat-'em-up mook who fights dirty.
export const CHEAP_SHOT = tough({
  id: "gi-cheap-shot", name: "Cheap Shot", base: GRAPPLER, localcoord: 460,
  pack: { name: "Streets of Fight", url: STREETS_URL },
  root: ANSIMUZ,
  credit: streetsCredit("Enemy Punk"),
  mirror: true,
  strips: {
    idle: ["Enemy Punk/idle.png", 4], walk: ["Enemy Punk/walk.png", 4], run: ["Enemy Punk/walk.png", 4],
    punch: ["Enemy Punk/punch.png", 3], hurt: ["Enemy Punk/hurt.png", 4], death: ["Enemy Punk/hurt.png", 4],
  },
  widths: { idle: 96, walk: 96, run: 96, punch: 96, hurt: 96, death: 96 },
  body: { front: 14, back: 14, height: 50 },
  sha256: "91826e0398af04541592a08f913fa93ae4d643b7b5b07ff31f9ff6c4da7729a0",
  room: { l: 29, r: 34, u: 52, d: 0 },
  hurt: [1],
  down: 3,
  attacks: [{ strip: "punch", frames: [1, 2], hits: [1] }, { strip: "punch", hits: [2] }],
  outfits: [
    { name: "Low Blow", colors: {}, shifts: [hue(330, 15, 120, { minSat: 0.6 })] },
    { name: "Sucker Punch", colors: {}, shifts: [hue(330, 15, 200, { minSat: 0.6 }), hue(215, 245, null, { minSat: 0.3, light: 0.6 })] },
    { name: "Pink Slip", colors: {}, shifts: [hue(330, 15, 318, { minSat: 0.6 })] },
  ],
  names: { 200: "Jab", 210: "Right Hook", 240: "Haymaker", 400: "Low Jab", 410: "Uppercut", 430: "Gut Punch", 440: "Sweep", 600: "Air Punch", 630: "Diving Punch", 1000: "Shoulder Charge" },
  words: { cry: "HRAH!", intro: "WHO'S NEXT?", win: "TOO EASY!", taunt: "COME ON!" },
  more: (k) => ({
    attacks: [cheapShot(k)],
    cues: [
      { action: 1400, frame: 0, effect: k.say("HEY, LOOK!", 0, 22) },
      { action: 1400, frame: 3, sound: SOUNDS.bonk, effect: k.say("CHEAP SHOT!", k.body.front, 28, FX.yellow) },
    ],
  }),
});

/** "Hey, look!" (points behind you), then a low blow. */
function cheapShot(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const look = [0, 1].map((t) => k.c(`look ${t}`, { s: "idle", f: t, fx: [effects.sayAbove("!", FX.yellow)] }));
  const cock = k.c("low blow cock", { s: "punch", f: 1, sy: 0.88, sx: 1.04 });
  const blow = k.c("low blow", { s: "punch", f: 2, sy: 0.72, sx: 1.06, rot: 10, mid: true, fx: [effects.hitStar(F + 22, H * 0.25, 6)] });
  const back = k.c("low blow back", { s: "punch", f: 1, sy: 0.86 });
  return {
    state: 1400, name: "Cheap Shot", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...look, cock, blow, back, k.cells.STAND[0]!], ticks: [10, 8, 3, 6, 5, 4] },
    hits: [{ frames: [3], damage: 80, chip: 8, height: "low", weight: "heavy", hitStun: 30, blockStun: 14, push: 3, hitSound: SOUNDS.bonk, box: k.bx(F, -H * 0.5, F + 26, -H * 0.05) }],
    moves: [{ frame: 2, x: 3 }, { frame: 4, x: 0 }],
    ai: { range: 70, weight: 0.6 },
  };
}

/** The street toughs, in the order they're made. */
export const STREET_TOUGHS: readonly TemplateSpec[] = [STICKY_FINGERS, DAYLIGHT_ROBBERY, SIDE_SCROLLER, CHEAP_SHOT];
