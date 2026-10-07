/**
 * The heroes and monsters themselves (templates/heroes.ts builds them): one per LuizMelo pack, each on a template's
 * numbers and AI, with a signature move or gag of its own drawn in code.
 */
import type { IndexedImage } from "../art/sheet.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import type { Box } from "../art/air.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { arcs, disc, line, put, star, type PackCanvas } from "./pack-kit.ts";
import { coin, drawnProjectile, effects, flames, FX, heroFighter, pan, SOUNDS, waveArt, type Hero, type HeroCtx } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { AttackSpec, TemplateSpec, ThrowSpec } from "./spec.ts";
import { ZONER } from "./zoner.ts";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** Every hero's own settings, in the order they're made (for the checks). */
export const HERO_CONFIGS: Hero[] = [];
const hero = (h: Hero): TemplateSpec => (HERO_CONFIGS.push(h), heroFighter(h));
/** A hue band turned to another hue (outfits). */
const hue = (from: number, to: number, toHue: number | null, more: { minSat?: number; maxSat?: number; sat?: number; light?: number; tint?: number; lights?: readonly [number, number] } = {}) => ({ from, to, hue: toHue, ...more });
const greys = { from: 0, to: 360, minSat: 0, maxSat: 0.22 } as const;
/** Fire's fully saturated reds, oranges and yellows, to another hue (skin and trims are less saturated). */
const fire = (toHue: number) => hue(0, 65, toHue, { minSat: 0.97 });

// ----- Sir Bonkalot: the Hero Knight, sword in one hand and a frying pan in the other -----

const KNIGHT = "Hero Knight/Hero Knight/Sprites";
export const SIR_BONKALOT = hero({
  id: "gi-sir-bonkalot", name: "Sir Bonkalot", base: ALL_ROUNDER, localcoord: 490,
  pack: { name: "Hero Knight", url: "https://luizmelo.itch.io/hero-knight" },
  strips: {
    idle: [`${KNIGHT}/Idle.png`, 11], run: [`${KNIGHT}/Run.png`, 8], jump: [`${KNIGHT}/Jump.png`, 3], fall: [`${KNIGHT}/Fall.png`, 3],
    hurt: [`${KNIGHT}/Take Hit.png`, 4], death: [`${KNIGHT}/Death.png`, 11], attack1: [`${KNIGHT}/Attack1.png`, 7], attack2: [`${KNIGHT}/Attack2.png`, 7],
  },
  body: { front: 23, back: 24, height: 51 },
  sha256: "25df04da24792a0ead2cbe0c98ee28c30ea5303d2360033fbfa6acfb71126829",
  room: { l: 50, r: 83, u: 80, d: 1 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 10,
  attacks: [{ strip: "attack1", hits: [3, 4] }, { strip: "attack2", hits: [3, 4] }],
  outfits: [
    { name: "Blue Scarf", colors: {}, shifts: [hue(330, 25, 215, { minSat: 0.3 })] },
    { name: "Black Knight", colors: {}, shifts: [{ ...greys, hue: null, light: 0.5 }, hue(330, 25, 280, { minSat: 0.3 })] },
    { name: "Gold", colors: {}, shifts: [{ ...greys, hue: 45, tint: 0.35 }, hue(330, 25, 0, { minSat: 0.3, light: 0.8 })] },
  ],
  words: { cry: "HYAH!", intro: "HUZZAH!", win: "BONKED!", taunt: "EN GARDE!" },
  more: (k) => ({
    attacks: [fryingPan(k)],
    cues: [{ action: 1400, frame: 3, sound: SOUNDS.bonk, effect: k.say("BONK!", k.body.front + 8, 24, FX.yellow) }],
  }),
});

/** The overhead swing with a frying pan in the other hand: BONK. */
function fryingPan(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const at = [
    { x: 2, y: H * 0.9, angle: -100 },
    { x: -2, y: H, angle: -125 },
    { x: -3, y: H, angle: -135 },
    { x: F - 6, y: H * 0.75, angle: 15 },
    { x: F - 4, y: H * 0.55, angle: 40 },
    { x: F - 8, y: H * 0.45, angle: 65 },
    { x: F - 10, y: H * 0.4, angle: 75 },
  ];
  const cells = at.map((p, i) =>
    k.c(`pan ${i}`, {
      s: "attack1",
      f: i,
      fx: [(cv) => pan(cv.img, cv.x + p.x, cv.y - p.y, p.angle), ...(i === 3 ? [(cv: PackCanvas) => star(cv.img, cv.x + F + 16, cv.y - H * 0.6, 9, FX.yellow, FX.white)] : [])],
    }),
  );
  return {
    state: 1400, name: "Frying Pan", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, k.cells.STAND[0]!], ticks: [3, 4, 5, 6, 5, 4, 4, 4] },
    hits: [{ frames: [3, 4], damage: 85, chip: 8, height: "overhead", weight: "heavy", hitStun: 26, blockStun: 16, push: 5, hitSound: SOUNDS.bonk, box: k.bx(F - 2, -H * 1.05, F + 24, -H * 0.2) }],
    ai: { range: 60, weight: 0.8 },
  };
}

// ----- Hot Takes: the Evil Wizard, who only has hot takes -----

const WIZARD = "Evil Wizard/Evil Wizard/Sprites";
const FIRE_BALL = "Fire Worm/Fire Worm/Sprites/Fire Ball";
export const HOT_TAKES = hero({
  id: "gi-hot-takes", name: "Hot Takes", base: ZONER, localcoord: 500,
  pack: { name: "Evil Wizard", url: "https://luizmelo.itch.io/evil-wizard" },
  strips: {
    idle: [`${WIZARD}/Idle.png`, 8], run: [`${WIZARD}/Move.png`, 8], hurt: [`${WIZARD}/Take Hit.png`, 4], death: [`${WIZARD}/Death.png`, 5],
    attack1: [`${WIZARD}/Attack.png`, 8], ball: [`${FIRE_BALL}/Move.png`, 6], blast: [`${FIRE_BALL}/Explosion.png`, 7],
  },
  body: { front: 16, back: 16, height: 55 },
  sha256: "9e62c738b7ff3e8e7638ab781c057933d2d89c5104cc3209d62f012803ce3571",
  room: { l: 27, r: 67, u: 67, d: 2 },
  slash: { colours: ["#bf0000", "#ff9000", "#fffc2e", "#ffffff", "#e93100"] },
  hurt: [0, 2, 3],
  down: 4,
  attacks: [{ strip: "attack1", frames: [0, 1, 2, 3], hits: [0, 1], lead: true }, { strip: "attack1", hits: [1, 2, 3, 4, 5], lead: true }],
  projectile: { fly: { strip: "ball", frames: range(6) }, hit: { strip: "blast", frames: range(7) }, speed: 4.5, sound: SOUNDS.fire },
  outfits: [
    { name: "Ice", colors: {}, shifts: [fire(195), hue(330, 15, 215, { minSat: 0.3 })] },
    { name: "Toxic", colors: {}, shifts: [fire(105), hue(330, 15, 125, { minSat: 0.3, light: 0.8 })] },
    { name: "Royal", colors: {}, shifts: [fire(285), hue(330, 15, 270, { minSat: 0.3 })] },
  ],
  words: { cry: "FWOOSH!", intro: "HOT TAKE!", win: "TOO HOT!", taunt: "S'MORES?" },
  more: (k) => ({
    attacks: [hotTake(k)],
    anims: [{ action: 195, cells: marshmallow(k), ticks: 6, comment: "taunt: roasts a marshmallow" }],
    cues: [
      { action: 1400, frame: 2, sound: SOUNDS.fire, effect: k.say("HOT TAKE!", 0, 30, FX.flameLight) },
      { action: 195, frame: 10, effect: k.say("MMM!", 0, 24) },
    ],
  }),
});

/** A pillar of fire that rises a little way ahead: two hits, gone after half a second. */
function hotTake(k: HeroCtx): AttackSpec {
  const { STAND } = k.cells;
  const raise = [0, 1, 2, 3].map((i) => k.c(`hot take ${i}`, { s: "idle", f: i * 2, rot: i < 2 ? -4 * i : -8, mid: true }));
  const pillar = (state: number) =>
    drawnProjectile(
      state,
      [0, 1, 2, 3].map((t) => (img: IndexedImage) => flames(img, 15, 62, 40 + t * 5, t)),
      [0, 1, 2].map((t) => (img: IndexedImage) => {
        flames(img, 15, 62, 44 - t * 12, t + 4);
        if (t < 2) star(img, 15, 30, 8 + t * 3, FX.flameLight, FX.white);
      }),
      { w: 30, h: 64, box: [-7, -26, 7, 30] },
      3,
    );
  return {
    state: 1400, name: "Hot Take", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...raise, STAND[0]!], ticks: [3, 4, 10, 8, 6] },
    hits: [{ frames: [2], damage: 38, chip: 6, height: "mid", weight: "medium", hitStun: 22, blockStun: 14, push: 2 }],
    projectile: { frame: 2, speed: 0, height: k.units(30), hits: 2, missTime: 10, removeTime: 34, offset: k.units(k.body.front + 46), maxRange: 200, art: pillar },
    ai: { range: 150, weight: 0.6 },
  };
}

/** The taunt: a marshmallow on a stick, toasted in the flame in his hand, golden, then on fire. */
function marshmallow(k: HeroCtx): number[] {
  const H = k.body.height;
  return range(12).map((t) =>
    k.c(`marshmallow ${t}`, {
      s: "idle",
      f: t % 8,
      fx: [
        (cv) => {
          const tipX = cv.x - 9, tipY = cv.y - Math.round(H * 0.72);
          line(cv.img, cv.x + 4, cv.y - Math.round(H * 0.5), tipX, tipY, FX.stick);
          const col = t < 4 ? FX.mallow : t < 8 ? FX.cheese : FX.flameDark;
          disc(cv.img, tipX - 1, tipY - 1, 2.2, col);
          if (t >= 9) flames(cv.img, tipX - 1, tipY - 2, 4 + (t % 2), t);
        },
      ],
    }),
  );
}

// ----- Stabby: the goblin, a knife and a bag of bombs -----

const GOBLIN = "Monsters_Creatures_Fantasy/Monsters_Creatures_Fantasy/Goblin";
const GOBLIN_12 = "Monster_Creatures_Fantasy(Version 1.2)/Monster_Creatures_Fantasy(Version 1.2)/Goblin";
const GOBLIN_13 = "Monster_Creatures_Fantasy(Version 1.3)/Monster_Creatures_Fantasy(Version 1.3)/Goblin";
export const STABBY = hero({
  id: "gi-stabby", name: "Stabby", base: RUSHDOWN, localcoord: 443,
  pack: { name: "Monsters Creatures Fantasy", url: "https://luizmelo.itch.io/monsters-creatures-fantasy" },
  strips: {
    idle: [`${GOBLIN}/Idle.png`, 4], run: [`${GOBLIN}/Run.png`, 8], hurt: [`${GOBLIN}/Take Hit.png`, 4], death: [`${GOBLIN}/Death.png`, 4],
    attack1: [`${GOBLIN}/Attack.png`, 8], attack2: [`${GOBLIN_12}/Attack2.png`, 8], attack3: [`${GOBLIN_13}/Attack3.png`, 12], bomb: [`${GOBLIN_13}/Bomb_sprite.png`, 19],
  },
  body: { front: 16, back: 17, height: 36 },
  sha256: "16539796ddf6c3459a199aa9ffa1318d72d4fb2a7c211d0d21f10d2b7547fa22",
  room: { l: 44, r: 68, u: 46, d: 0 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 3,
  attacks: [{ strip: "attack1", frames: [4, 5, 6, 7], hits: [2] }, { strip: "attack1", frames: [2, 3, 4, 5, 6, 7], hits: [4] }, { strip: "attack2", hits: [6] }, { strip: "attack1", hits: [6] }],
  outfits: [
    { name: "Red Cap", colors: {}, shifts: [hue(60, 170, 0, { minSat: 0.3 })] },
    { name: "Blue", colors: {}, shifts: [hue(60, 170, 210, { minSat: 0.3 })] },
    { name: "Purple", colors: {}, shifts: [hue(60, 170, 280, { minSat: 0.3 })] },
  ],
  words: { cry: "STABBY!", intro: "SHINY?", win: "MINE NOW!", taunt: "HEHEHE!" },
  more: (k) => ({
    attacks: [bombRoll(k)],
    cues: [{ action: 1400, frame: 2, sound: SOUNDS.fire }, { action: 1400, frame: 5, sound: SOUNDS.whoosh }],
  }),
});

/** A lit bomb, rolled along the ground: it blows up on whoever doesn't jump it. */
function bombRoll(k: HeroCtx): AttackSpec {
  const { STAND } = k.cells;
  // The later pack's throw: lights the fuse, winds up, and lets go on frame 10.
  const cells = [5, 6, 7, 8, 9, 10, 11].map((f) => k.c(`bomb throw ${f}`, { s: "attack3", f }));
  return {
    state: 1400, name: "Bomb Roll", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, STAND[0]!], ticks: [3, 3, 4, 4, 4, 6, 5, 4] },
    hits: [{ frames: [5], damage: 60, chip: 8, height: "low", weight: "heavy", hitStun: 24, blockStun: 14, push: 5, knockdown: true, launch: [2, -5], hitSound: SOUNDS.boom }],
    projectile: { frame: 5, speed: 3.2, height: k.units(4), offset: k.units(k.body.front + 6), art: k.stripProjectile({ strip: "bomb", frames: [0, 1, 2] }, { strip: "bomb", frames: [12, 13, 14, 15, 16, 17, 18] }) },
    ai: { range: 300, weight: 0.6 },
  };
}


// ----- Shared drawings for the signature moves -----

function ellipse(img: IndexedImage, cx: number, cy: number, rx: number, ry: number, color: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / (rx + 0.3)) ** 2 + ((y - cy) / (ry + 0.3)) ** 2 <= 1) put(img, x, y, color);
}
/** A coffee mug with steam, its bottom middle at (x, y). */
function mug(img: IndexedImage, x: number, y: number, t: number) {
  for (let v = 0; v < 6; v++) for (let u = -3; u <= 2; u++) put(img, x + u, y - v, v === 5 || u === -3 || u === 2 ? FX.ink : FX.white);
  put(img, x + 3, y - 4, FX.ink), put(img, x + 4, y - 3, FX.ink), put(img, x + 3, y - 2, FX.ink);
  for (let k = 0; k < 5; k++) put(img, x - 1 + Math.round(Math.sin((k + t) * 1.3)), y - 7 - k, FX.grey);
}
/** A milk carton, its bottom middle at (x, y). */
function carton(img: IndexedImage, x: number, y: number) {
  for (let v = 0; v < 8; v++) for (let u = -2; u <= 2; u++) put(img, x + u, y - v, v === 3 || v === 4 ? FX.blue : FX.white);
  put(img, x - 1, y - 8, FX.white), put(img, x, y - 9, FX.white), put(img, x + 1, y - 8, FX.white);
}
/** Sparkles: little four-pointed stars around (x, y). */
function sparkles(img: IndexedImage, x: number, y: number, t: number, color: number = FX.white) {
  for (let i = 0; i < 3; i++) {
    const sx = x + [0, 7, -6][i]! + (t % 2), sy = y + [0, -5, -8][i]! - (t % 3);
    put(img, sx, sy, color), put(img, sx - 1, sy, color), put(img, sx + 1, sy, color), put(img, sx, sy - 1, color), put(img, sx, sy + 1, color);
  }
}
/** A straw hat seen spinning (edge-on to flat). */
function strawHat(img: IndexedImage, x: number, y: number, t: number) {
  const ry = [3.5, 2, 1, 2][t % 4]!;
  ellipse(img, x, y, 10, ry + 0.8, FX.hoop);
  ellipse(img, x, y, 9, ry, FX.barrel);
  ellipse(img, x, y - ry * 0.4, 4, ry * 0.7 + 0.5, FX.hoop);
}
/** A dumbbell turned `t` eighths of a turn. */
function dumbbell(img: IndexedImage, x: number, y: number, t: number) {
  const a = (t * Math.PI) / 4, dx = Math.cos(a) * 7, dy = Math.sin(a) * 7;
  line(img, x - dx, y - dy, x + dx, y + dy, FX.steel);
  for (const s of [-1, 1]) {
    disc(img, x + s * dx, y + s * dy, 3.4, FX.panDark);
    disc(img, x + s * dx - 0.6, y + s * dy - 0.6, 2.2, FX.pan);
  }
}
/** An arrow pointing down, its tip at (x, y). */
function arrowDown(img: IndexedImage, x: number, y: number) {
  line(img, x, y - 10, x, y - 2, FX.stick);
  put(img, x, y, FX.white), put(img, x, y - 1, FX.steel), put(img, x - 1, y - 2, FX.steel), put(img, x + 1, y - 2, FX.steel);
  put(img, x - 1, y - 10, FX.red), put(img, x + 1, y - 10, FX.red), put(img, x - 1, y - 9, FX.red), put(img, x + 1, y - 9, FX.red);
}
/** A burst of white and yellow, for hits. */
const burst = (k: number) => (img: IndexedImage) => {
  const cx = img.width / 2, cy = img.height / 2;
  if (k < 2) star(img, cx, cy, 6 + k * 3, FX.yellow, FX.white);
  else for (let i = 0; i < 6; i++) put(img, cx + Math.cos(i) * 9, cy + Math.sin(i) * 7, FX.white);
};
/** A projectile drawn in code, spinning through `n` frames, with a burst when it hits. */
const spinner = (draw: (img: IndexedImage, x: number, y: number, t: number) => void, n: number, size: { w: number; h: number; box: Box }) => (state: number) =>
  drawnProjectile(state, range(n).map((t) => (img: IndexedImage) => draw(img, size.w / 2, size.h / 2, t)), [0, 1, 2].map(burst), size);

/** A move that throws something: these cells, the projectile leaving on frame `frame`. */
function thrown(k: HeroCtx, o: { state: number; name: string; command: AttackSpec["command"]; cells: number[]; ticks: number[]; frame: number; art: (state: number) => import("./projectile.ts").ProjectileArt; speed: number; height: number; damage: number; low?: boolean; hitSound?: readonly [number, number]; range?: number }): AttackSpec {
  return {
    state: o.state, name: o.name, from: "stand", command: o.command, special: true,
    anim: { action: o.state, cells: o.cells, ticks: o.ticks },
    hits: [{ frames: [o.frame], damage: o.damage, chip: Math.round(o.damage / 8), height: o.low ? "low" : "mid", weight: "medium", hitStun: 20, blockStun: 13, push: 4, ...(o.hitSound ? { hitSound: o.hitSound } : {}) }],
    projectile: { frame: o.frame, speed: o.speed, height: k.units(o.height), offset: k.units(k.body.front + 4), art: o.art },
    ai: { range: o.range ?? 280, weight: 0.6 },
  };
}

// ----- Night Shift: the second Hero Knight, who works nights -----

const KNIGHT_2 = "Hero Knight 2/Hero Knight 2/Sprites";
export const NIGHT_SHIFT = hero({
  id: "gi-night-shift", name: "Night Shift", base: RUSHDOWN, localcoord: 407,
  pack: { name: "Hero Knight 2", url: "https://luizmelo.itch.io/hero-knight-2" },
  strips: {
    idle: [`${KNIGHT_2}/Idle.png`, 11], run: [`${KNIGHT_2}/Run.png`, 8], jump: [`${KNIGHT_2}/Jump.png`, 4], fall: [`${KNIGHT_2}/Fall.png`, 4],
    hurt: [`${KNIGHT_2}/Take Hit.png`, 4], death: [`${KNIGHT_2}/Death.png`, 9], attack1: [`${KNIGHT_2}/Attack.png`, 6], dash: [`${KNIGHT_2}/Dash.png`, 4],
  },
  body: { front: 16, back: 16, height: 39 },
  sha256: "fc1c792d860bb3060dc3cf8553f80c29768e84cb0e183e5af833d2cbb465fc09",
  room: { l: 37, r: 49, u: 61, d: 0 },
  slash: { colours: ["#fcfcfc"] },
  hurt: [0, 2, 3],
  down: 8,
  attacks: [{ strip: "attack1", frames: [2, 3, 4, 5], hits: [2] }, { strip: "attack1", frames: [1, 2, 3, 4, 5], hits: [3] }, { strip: "attack1", hits: [4] }],
  outfits: [
    { name: "Blue Shift", colors: {}, shifts: [hue(225, 300, 205, { minSat: 0.2 })] },
    { name: "Green Shift", colors: {}, shifts: [hue(225, 300, 120, { minSat: 0.2 })] },
    { name: "Graveyard Shift", colors: {}, shifts: [hue(225, 300, null, { minSat: 0.2, light: 0.7 })] },
  ],
  words: { cry: "CLOCK IN!", intro: "ON SHIFT!", win: "CLOCK OUT!", taunt: "COFFEE..." },
  more: (k) => ({
    attacks: [graveyardShift(k)],
    anims: [{ action: 195, cells: range(10).map((t) => k.c(`coffee ${t}`, { s: "idle", f: t, fx: [(cv) => mug(cv.img, cv.x + 6, cv.y - Math.round(k.body.height * 0.45), t)] })), ticks: 6, comment: "taunt: a coffee" }],
    cues: [{ action: 1400, frame: 0, sound: SOUNDS.whoosh, effect: k.say("OVERTIME!", 0, 26, FX.yellow) }],
  }),
});

/** Dashes through the opponent, slashing on the way (projectiles pass through). */
function graveyardShift(k: HeroCtx): AttackSpec {
  const dash = range(8).map((i) => k.c(`shift dash ${i}`, { s: "dash", f: i % 4, fx: [effects.speed] }));
  const end = [3, 4, 5].map((f) => k.c(`attack1 ${f} shift`, { s: "attack1", f }));
  return {
    state: 1400, name: "Graveyard Shift", from: "stand", command: "QCB_x", special: true, throughProjectiles: true,
    anim: { action: 1400, cells: [...dash, ...end, k.cells.STAND[0]!], ticks: [2, 2, 2, 2, 2, 2, 2, 2, 3, 5, 4, 4] },
    hits: [
      { frames: [3, 4, 5], damage: 30, height: "mid", weight: "light", hitStun: 18, blockStun: 10, push: 1, box: k.bx(k.body.front - 4, -k.body.height, k.body.front + 10, 0) },
      { frames: [9], damage: 50, chip: 6, height: "high", weight: "heavy", hitStun: 22, blockStun: 14, push: 6, knockdown: true, launch: [3, -4] },
    ],
    moves: [{ frame: 0, x: 7 }, { frame: 8, x: 0 }],
    ai: { range: 150, weight: 0.5 },
  };
}

// ----- Cape Crusader: the Fantasy Warrior, cape and sword beams -----

const FANTASY = "Fantasy Warrior/Fantasy Warrior/Sprites";
export const CAPE_CRUSADER = hero({
  id: "gi-cape-crusader", name: "Cape Crusader", base: ALL_ROUNDER, localcoord: 432,
  pack: { name: "Fantasy Warrior", url: "https://luizmelo.itch.io/fantasy-warrior" },
  strips: {
    idle: [`${FANTASY}/Idle.png`, 10], run: [`${FANTASY}/Run.png`, 8], jump: [`${FANTASY}/Jump.png`, 3], fall: [`${FANTASY}/Fall.png`, 3],
    hurt: [`${FANTASY}/Take hit.png`, 3], death: [`${FANTASY}/Death.png`, 7], attack1: [`${FANTASY}/Attack1.png`, 7], attack2: [`${FANTASY}/Attack2.png`, 7], attack3: [`${FANTASY}/Attack3.png`, 8],
  },
  body: { front: 19, back: 20, height: 45 },
  sha256: "253d16639f02a34d7a96686040980eddce20df62d53d50a6f8e23439296b7108",
  room: { l: 82, r: 70, u: 100, d: 3 },
  slash: { onlyIn: ["attack1", "attack2", "attack3"] },
  hurt: [0, 1, 2],
  down: 6,
  attacks: [{ strip: "attack1", hits: [4] }, { strip: "attack2", hits: [2] }, { strip: "attack3", hits: [4, 5] }],
  outfits: [
    { name: "Red Cape", colors: {}, shifts: [hue(190, 250, 0, { minSat: 0.12, sat: 1.6 })] },
    { name: "Golden Cape", colors: {}, shifts: [hue(190, 250, 42, { minSat: 0.12, sat: 1.6 })] },
    { name: "Night Cape", colors: {}, shifts: [hue(190, 250, 270, { minSat: 0.12, sat: 1.4 }), hue(70, 170, 260, { minSat: 0.15, light: 0.8 })] },
  ],
  words: { cry: "HYAAA!", intro: "FEAR NOT!", win: "JUSTICE!", taunt: "TA-DA!" },
  more: (k) => {
    const s = k.strike(2, "beam");
    const cells = s.cells.slice(0, Math.min(...s.hits) + 2);
    return {
      attacks: [thrown(k, { state: 1400, name: "Sword Beam", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [...cells.map((_, i) => (i === Math.min(...s.hits) ? 6 : 3)), 6], frame: Math.min(...s.hits), art: waveArt(FX.white, FX.blue), speed: 6, height: k.body.height * 0.55, damage: 55, range: 300 })],
      cues: [{ action: 1400, frame: Math.min(...s.hits), sound: SOUNDS.zap }],
    };
  },
});

// ----- Javelina: the Huntress, a spear to throw and one to vault on -----

const HUNTRESS = "Huntress/Huntress/Sprites";
export const JAVELINA = hero({
  id: "gi-javelina", name: "Javelina", base: ZONER, localcoord: 411,
  pack: { name: "Huntress", url: "https://luizmelo.itch.io/huntress" },
  strips: {
    idle: [`${HUNTRESS}/Idle.png`, 8], run: [`${HUNTRESS}/Run.png`, 8], jump: [`${HUNTRESS}/Jump.png`, 2], fall: [`${HUNTRESS}/Fall.png`, 2],
    hurt: [`${HUNTRESS}/Take hit.png`, 3], death: [`${HUNTRESS}/Death.png`, 8], attack1: [`${HUNTRESS}/Attack1.png`, 5], attack2: [`${HUNTRESS}/Attack2.png`, 5],
    attack3: [`${HUNTRESS}/Attack3.png`, 7], spear: [`${HUNTRESS}/Spear move.png`, 4],
  },
  widths: { spear: 60 },
  body: { front: 16, back: 16, height: 42 },
  sha256: "eaa4ebcecc342ee8d010077183892cc421b60c538c611203e6bbe64325428e7a",
  room: { l: 42, r: 49, u: 66, d: 0 },
  slash: { colours: ["#f0f0f0", "#d6dde1", "#c1cdd5"] },
  hurt: [0, 1, 2],
  down: 7,
  attacks: [{ strip: "attack1", hits: [3] }, { strip: "attack2", hits: [3] }],
  shot: { strip: "attack3", hits: [6] },
  projectile: { name: "Spear Throw", fly: { strip: "spear", frames: [0, 1, 2, 3] }, hit: { strip: "spear", frames: [3] }, speed: 6.5, sound: SOUNDS.whoosh },
  outfits: [
    { name: "Red", colors: {}, shifts: [hue(40, 110, 0, { minSat: 0.25 })] },
    { name: "Blue", colors: {}, shifts: [hue(40, 110, 210, { minSat: 0.25 })] },
    { name: "Purple", colors: {}, shifts: [hue(40, 110, 285, { minSat: 0.25 })] },
  ],
  words: { cry: "HYAH!", intro: "HUNT TIME!", win: "BULLSEYE!", taunt: "COME HERE!" },
  more: (k) => ({ attacks: [poleVault(k)], cues: [{ action: 1400, frame: 2, sound: SOUNDS.whoosh }] }),
});

/** Vaults up on the spear and comes down on them with a slash. */
function poleVault(k: HeroCtx): AttackSpec {
  const cells = [
    k.c("vault 0", { s: "attack2", f: 0 }),
    k.c("vault 1", { s: "attack2", f: 1 }),
    k.c("vault 2", { s: "jump", f: 0, dy: -12, rot: -15, mid: true }),
    k.c("vault 3", { s: "jump", f: 1, dy: -24, rot: -25, mid: true }),
    k.c("vault 4", { s: "fall", f: 0, dy: -24 }),
    k.c("vault 5", { s: "attack2", f: 3, dy: -12 }),
    k.c("vault 6", { s: "attack2", f: 4, fx: [effects.dustUnder] }),
    k.cells.STAND[0]!,
  ];
  return {
    state: 1400, name: "Pole Vault", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells, ticks: [3, 3, 4, 5, 4, 5, 6, 5] },
    hits: [{ frames: [5], damage: 80, chip: 8, height: "overhead", weight: "heavy", hitStun: 24, blockStun: 16, push: 5, knockdown: true, launch: [2, -4] }],
    moves: [{ frame: 2, x: 3.5 }, { frame: 6, x: 0 }],
    ai: { range: 120, weight: 0.6 },
  };
}

// ----- Robin Hoodie: the second Huntress, an archer -----

const ARCHER = "Huntress 2/Huntress 2/Sprites";
export const ROBIN_HOODIE = hero({
  id: "gi-robin-hoodie", name: "Robin Hoodie", base: ZONER, localcoord: 393,
  pack: { name: "Huntress 2", url: "https://luizmelo.itch.io/huntress-2" },
  strips: {
    idle: [`${ARCHER}/Character/Idle.png`, 10], run: [`${ARCHER}/Character/Run.png`, 8], jump: [`${ARCHER}/Character/Jump.png`, 2], fall: [`${ARCHER}/Character/Fall.png`, 2],
    hurt: [`${ARCHER}/Character/Get Hit.png`, 3], death: [`${ARCHER}/Character/Death.png`, 10], attack1: [`${ARCHER}/Character/Attack.png`, 6], arrow: [`${ARCHER}/Arrow/Move.png`, 2],
  },
  widths: { arrow: 24 },
  body: { front: 16, back: 16, height: 36 },
  sha256: "1dd4484b7be6339918e72ca3c3c55308833cd5e70b96c11e87b3aa7f449f72d2",
  room: { l: 18, r: 48, u: 45, d: 0 },
  hurt: [0, 1, 2],
  down: 9,
  attacks: [{ strip: "attack1", frames: [1, 2, 3, 4], hits: [1, 2], box: [12, -30, 31, -20] }, { strip: "attack1", hits: [2, 3], box: [12, -30, 31, -20] }],
  shot: { strip: "attack1", hits: [4] },
  projectile: { name: "Arrow", fly: { strip: "arrow", frames: [0, 1] }, hit: { strip: "arrow", frames: [1] }, speed: 8, sound: SOUNDS.twang },
  outfits: [
    { name: "Red Hood", colors: {}, shifts: [hue(80, 170, 0, { minSat: 0.2 })] },
    { name: "Blue Hood", colors: {}, shifts: [hue(80, 170, 215, { minSat: 0.2 })] },
    { name: "Autumn", colors: {}, shifts: [hue(80, 170, 32, { minSat: 0.2 })] },
  ],
  words: { cry: "TWANG!", intro: "READY, AIM", win: "TOO EASY!", taunt: "MISSED ME?" },
  more: (k) => ({ attacks: [arrowRain(k)], cues: [{ action: 1400, frame: 3, sound: SOUNDS.twang, effect: k.say("ARROW RAIN", 0, 30) }] }),
});

/** Shoots up, and the arrows come down a little way ahead: three hits. */
function arrowRain(k: HeroCtx): AttackSpec {
  const cells = [0, 1, 2, 3, 4, 5].map((f) => k.c(`rain ${f}`, { s: "attack1", f, rot: -35, mid: true }));
  const rain = (state: number) =>
    drawnProjectile(
      state,
      range(4).map((t) => (img: IndexedImage) => {
        for (let i = 0; i < 4; i++) arrowDown(img, 6 + i * 9, ((t * 16 + i * 23) % 64) + 12);
      }),
      [0, 1, 2].map((t) => (img: IndexedImage) => {
        for (let i = 0; i < 4; i++) arrowDown(img, 6 + i * 9, 76 - (i % 2) * 3);
        if (t < 2) star(img, 20, 70, 5 + t * 2, FX.yellow, FX.white);
      }),
      { w: 40, h: 80, box: [-18, 10, 18, 40] },
    );
  return {
    state: 1400, name: "Arrow Rain", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, k.cells.STAND[0]!], ticks: [3, 3, 4, 8, 5, 4, 5] },
    hits: [{ frames: [3], damage: 30, chip: 4, height: "overhead", weight: "light", hitStun: 18, blockStun: 10, push: 1 }],
    projectile: { frame: 3, speed: 0, height: k.units(40), hits: 3, missTime: 8, removeTime: 36, offset: k.units(k.body.front + 70), maxRange: 220, art: rain },
    ai: { range: 170, weight: 0.6 },
  };
}

// ----- Hat Trick: the Martial Hero, and his spare hats -----

const MARTIAL = "Martial Hero/Martial Hero/Sprites";
export const HAT_TRICK = hero({
  id: "gi-hat-trick", name: "Hat Trick", base: RUSHDOWN, localcoord: 480,
  pack: { name: "Martial Hero", url: "https://luizmelo.itch.io/martial-hero" },
  strips: {
    idle: [`${MARTIAL}/Idle.png`, 8], run: [`${MARTIAL}/Run.png`, 8], jump: [`${MARTIAL}/Jump.png`, 2], fall: [`${MARTIAL}/Fall.png`, 2],
    hurt: [`${MARTIAL}/Take Hit.png`, 4], death: [`${MARTIAL}/Death.png`, 6], attack1: [`${MARTIAL}/Attack1.png`, 6], attack2: [`${MARTIAL}/Attack2.png`, 6],
  },
  body: { front: 18, back: 19, height: 52 },
  sha256: "86a382589f5471b29f59f837c2d65ecd1efaa0613df7aa4c7f1d9d3d2d3ed71a",
  room: { l: 29, r: 99, u: 69, d: 0 },
  slash: { colours: ["#ffffff", "#dadada", "#c1c1c1"] },
  hurt: [0, 1, 2],
  down: 5,
  attacks: [{ strip: "attack1", frames: [2, 3, 4, 5], hits: [2] }, { strip: "attack1", hits: [4] }, { strip: "attack2", hits: [4] }],
  outfits: [
    { name: "Blue Scarf", colors: {}, shifts: [hue(330, 20, 215, { minSat: 0.5 })] },
    { name: "Gold Scarf", colors: {}, shifts: [hue(330, 20, 45, { minSat: 0.5 })] },
    { name: "Green Scarf", colors: {}, shifts: [hue(330, 20, 135, { minSat: 0.5 })] },
  ],
  words: { cry: "SLASH!", intro: "HATS OFF!", win: "GOOD DAY.", taunt: "NICE HAT?" },
  more: (k) => {
    const cells = [0, 1, 2, 3].map((f) => k.c(`hat throw ${f}`, { s: "attack1", f }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Hat Trick", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 3, 4, 8, 6], frame: 3, art: spinner(strawHat, 4, { w: 26, h: 14, box: [-10, -4, 10, 4] }), speed: 5.5, height: k.body.height * 0.75, damage: 50 })],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.whoosh, effect: k.say("HAT TRICK!", 0, 26) }],
    };
  },
});

// ----- No Shirt Kurt: Martial Hero 3, who skips shirts but not leg day -----

const MARTIAL_3 = "Martial Hero 3/Martial Hero 3/Sprite";
export const NO_SHIRT_KURT = hero({
  id: "gi-no-shirt-kurt", name: "No Shirt Kurt", base: HEAVY, localcoord: 394,
  pack: { name: "Martial Hero 3", url: "https://luizmelo.itch.io/martial-hero-3" },
  strips: {
    idle: [`${MARTIAL_3}/Idle.png`, 10], run: [`${MARTIAL_3}/Run.png`, 8], jump: [`${MARTIAL_3}/Going Up.png`, 3], fall: [`${MARTIAL_3}/Going Down.png`, 3],
    hurt: [`${MARTIAL_3}/Take Hit.png`, 3], death: [`${MARTIAL_3}/Death.png`, 11], attack1: [`${MARTIAL_3}/Attack1.png`, 7], attack2: [`${MARTIAL_3}/Attack2.png`, 6], attack3: [`${MARTIAL_3}/Attack3.png`, 9],
  },
  body: { front: 22, back: 22, height: 39 },
  sha256: "8d3c03cb607fc2df3b4972cec2db4925b65b856b095c811bb94a5bce906f5265",
  room: { l: 68, r: 57, u: 80, d: 14 },
  slash: { colours: ["#fafaff"] },
  hurt: [0, 1, 2],
  down: 10,
  attacks: [{ strip: "attack1", hits: [4] }, { strip: "attack2", hits: [3] }, { strip: "attack3", hits: [6] }],
  outfits: [
    { name: "Red Pants", colors: {}, shifts: [hue(45, 110, 0, { minSat: 0.15, sat: 1.5 })] },
    { name: "Blue Jeans", colors: {}, shifts: [hue(45, 110, 215, { minSat: 0.15, sat: 1.5 })] },
    { name: "Black Belt", colors: {}, shifts: [hue(45, 110, null, { minSat: 0.15, light: 0.5 })] },
  ],
  words: { cry: "HNNGH!", intro: "LEG DAY!", win: "NO SHIRT!", taunt: "GAINS!" },
  more: (k) => {
    const cells = [0, 1, 2, 3].map((f) => k.c(`dumbbell ${f}`, { s: "attack1", f }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Dumbbell Toss", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [4, 4, 5, 8, 8], frame: 3, art: spinner(dumbbell, 8, { w: 22, h: 22, box: [-7, -7, 7, 7] }), speed: 3.6, height: k.body.height * 0.6, damage: 75, hitSound: SOUNDS.bonk })],
      anims: [{ action: 195, cells: range(10).map((t) => k.c(`flex ${t}`, { s: "idle", f: t, sx: 1.04, fx: [(cv) => sparkles(cv.img, cv.x - 2, cv.y - k.body.height + 6, t, t % 2 ? FX.yellow : FX.white)] })), ticks: 6, comment: "taunt: a flex" }],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.whoosh }],
    };
  },
});

// ----- King Me: the Medieval King, who knights you before he throws you -----

const KING = "Medieval King Pack/Medieval King Pack";
export const KING_ME = hero({
  id: "gi-king-me", name: "King Me", base: GRAPPLER, localcoord: 694,
  pack: { name: "Medieval King Pack", url: "https://luizmelo.itch.io/medieval-king-pack" },
  strips: {
    idle: [`${KING}/Idle.png`, 6], run: [`${KING}/Run.png`, 8], jump: [`${KING}/Jump.png`, 2], fall: [`${KING}/Fall.png`, 2],
    hurt: [`${KING}/Hit.png`, 4], death: [`${KING}/Death.png`, 11], attack1: [`${KING}/Attack_1.png`, 6], attack2: [`${KING}/Attack_2.png`, 6],
  },
  body: { front: 17, back: 18, height: 81 },
  sha256: "97ed95c6f0b29686f760265d0498008bd0db0f1cc412234043d8fdf965247125",
  room: { l: 64, r: 85, u: 110, d: 0 },
  slash: { colours: ["#ffffff", "#b1b1b1", "#787878"] },
  hurt: [0, 1, 2],
  down: 10,
  attacks: [{ strip: "attack2", frames: [2, 3, 4, 5], hits: [1, 2] }, { strip: "attack1", hits: [3] }, { strip: "attack2", hits: [3, 4] }],
  outfits: [
    { name: "Blue Blood", colors: {}, shifts: [hue(340, 15, 215, { minSat: 0.4 })] },
    { name: "Royal Purple", colors: {}, shifts: [hue(340, 15, 280, { minSat: 0.4 })] },
    { name: "Green", colors: {}, shifts: [hue(340, 15, 130, { minSat: 0.4 })] },
  ],
  words: { cry: "BEGONE!", intro: "KNEEL!", win: "KING ME!", taunt: "PEASANT!" },
  more: (k) => {
    const cells = [0, 1, 2].map((f) => k.c(`tax ${f}`, { s: "attack2", f }));
    // Big coins: the king's art is drawn in small units, so code-drawn things come out small on him.
    const coins = (img: IndexedImage, x: number, y: number, t: number) => [-11, 0, 11].forEach((dx, i) => coin(img, x + dx, y + (i % 2 ? -5 : 3), t + i, 5));
    return {
      attacks: [thrown(k, { state: 1400, name: "Tax Collector", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [4, 4, 8, 6], frame: 2, art: spinner(coins, 4, { w: 40, h: 26, box: [-17, -9, 17, 9] }), speed: 5, height: k.body.height * 0.5, damage: 45, hitSound: SOUNDS.coin })],
      throws: [knighting(k)],
      cues: [
        { action: 1400, frame: 2, sound: SOUNDS.coin, effect: k.say("TAXES!", 0, 24, FX.coin) },
        { action: 810, frame: 0, effect: k.say("I DUB THEE", 0, 40) },
        { action: 810, frame: 3, sound: SOUNDS.shing, effect: k.say("SIR LOSER!", 0, 40, FX.yellow) },
      ],
    };
  },
});

/** The throw: taps one shoulder, then the other (I DUB THEE...), then the big swing (SIR LOSER!). */
function knighting(k: HeroCtx): ThrowSpec {
  const { front: F, height: H } = k.body;
  const front = k.units(F + 8);
  const base = GRAPPLER.throws!.find((t) => t.state === 800)!;
  return {
    ...base,
    name: "Knighting",
    box: k.bx(F - 2, -H, F + 14, 0),
    reach: { action: 800, cells: [0, 1, 2].map((f) => k.c(`knight reach ${f}`, { s: "attack2", f })), ticks: [2, 3, 6] },
    catchFrames: [2],
    hold: [
      { cell: k.c("dub left", { s: "attack2", f: 4, dy: -2 }), ticks: 16, victim: [front, 0] },
      { cell: k.c("dub up", { s: "attack2", f: 5, dy: -6 }), ticks: 6, victim: [front, 0] },
      { cell: k.c("dub right", { s: "attack2", f: 4 }), ticks: 16, victim: [front, 0] },
      { cell: k.c("dub swing", { s: "attack1", f: 3 }), ticks: 8, victim: [front + 10, 0] },
      { cell: k.c("dub done", { s: "attack1", f: 5 }), ticks: 10, victim: [front + 20, 0] },
    ],
    release: { frame: 3, x: 4, y: 4 },
    damage: 85,
  };
}

// ----- Arms Dealer: Medieval Warrior 2, a different weapon for every attack -----

const WARRIOR_2 = "Medieval Warrior Pack 2/Medieval Warrior Pack 2/Sprites";
export const ARMS_DEALER = hero({
  id: "gi-arms-dealer", name: "Arms Dealer", base: HEAVY, localcoord: 428,
  pack: { name: "Medieval Warrior Pack 2", url: "https://luizmelo.itch.io/medieval-warrior-pack-2" },
  strips: {
    idle: [`${WARRIOR_2}/Idle.png`, 8], run: [`${WARRIOR_2}/Run.png`, 8], jump: [`${WARRIOR_2}/Jump.png`, 2], fall: [`${WARRIOR_2}/Fall.png`, 2],
    hurt: [`${WARRIOR_2}/Take Hit.png`, 4], death: [`${WARRIOR_2}/Death.png`, 6],
    attack1: [`${WARRIOR_2}/Attack1.png`, 4], attack2: [`${WARRIOR_2}/Attack2.png`, 4], attack3: [`${WARRIOR_2}/Attack3.png`, 4], attack4: [`${WARRIOR_2}/Attack4.png`, 4],
  },
  body: { front: 13, back: 13, height: 41 },
  sha256: "a09111a599851291cae837f95ad4d11d175466fdd4c2ee191747d1f2dd1fbbf8",
  room: { l: 43, r: 73, u: 74, d: 0 },
  slash: { onlyIn: ["attack1", "attack2", "attack3", "attack4"] },
  hurt: [0, 1, 2],
  down: 5,
  attacks: [{ strip: "attack1", hits: [2] }, { strip: "attack3", hits: [2] }, { strip: "attack4", hits: [2] }, { strip: "attack2", hits: [2] }],
  outfits: [
    { name: "Blue", colors: {}, shifts: [hue(330, 15, 215, { minSat: 0.35 })] },
    { name: "Green", colors: {}, shifts: [hue(330, 15, 130, { minSat: 0.35 })] },
    { name: "Black Market", colors: {}, shifts: [hue(330, 15, null, { minSat: 0.35, light: 0.45 })] },
  ],
  words: { cry: "SOLD!", intro: "DEALS!", win: "NO REFUNDS", taunt: "BROWSING?" },
  more: (k) => ({ attacks: [clearanceSale(k)], cues: [{ action: 1400, frame: 0, effect: k.say("CLEARANCE!", 0, 40, FX.yellow) }, ...[2, 6, 10, 14].map((frame) => ({ action: 1400, frame, sound: SOUNDS.swishBig }))] }),
});

/** Everything must go: sword, spear, mace and greatsword, one after another. */
function clearanceSale(k: HeroCtx): AttackSpec {
  const cells = ["attack1", "attack3", "attack4", "attack2"].flatMap((strip) => [0, 1, 2, 3].map((f) => k.c(`${strip} ${f} sale`, { s: strip, f })));
  const hit = (frame: number, damage: number, last = false) => ({ frames: [frame], damage, chip: 4, height: "mid" as const, weight: last ? ("heavy" as const) : ("medium" as const), hitStun: last ? 26 : 22, blockStun: 12, push: last ? 7 : 1, ...(last ? { knockdown: true, launch: [3, -4] as const } : {}) });
  return {
    state: 1400, name: "Everything Must Go", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, k.cells.STAND[0]!], ticks: [...cells.map((_, i) => (i % 4 === 2 ? 4 : 2)), 6] },
    hits: [hit(2, 25), hit(6, 25), hit(10, 25), hit(14, 45, true)],
    moves: [{ frame: 0, x: 1.2 }, { frame: 15, x: 0 }],
    ai: { range: 70, weight: 0.5 },
  };
}

// ----- Blue Steel: Medieval Warrior 3, and his look -----

const WARRIOR_3 = "Medieval Warrior Pack 3/Medieval Warrior Pack 3/Sprites";
export const BLUE_STEEL = hero({
  id: "gi-blue-steel", name: "Blue Steel", base: RUSHDOWN, localcoord: 397,
  pack: { name: "Medieval Warrior Pack 3", url: "https://luizmelo.itch.io/medieval-warrior-pack-3" },
  strips: {
    idle: [`${WARRIOR_3}/Idle.png`, 10], run: [`${WARRIOR_3}/Run.png`, 6], jump: [`${WARRIOR_3}/Jump.png`, 2], fall: [`${WARRIOR_3}/Fall.png`, 2],
    hurt: [`${WARRIOR_3}/Get Hit.png`, 3], death: [`${WARRIOR_3}/Death.png`, 9], attack1: [`${WARRIOR_3}/Attack1.png`, 4], attack2: [`${WARRIOR_3}/Attack2.png`, 4], attack3: [`${WARRIOR_3}/Attack3.png`, 5],
  },
  body: { front: 13, back: 13, height: 38 },
  sha256: "d5115d6837b8430af7070357f586a74bcc2bac2988b056a3d728e11d96fdd594",
  room: { l: 51, r: 66, u: 71, d: 1 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 1, 2],
  down: 8,
  attacks: [{ strip: "attack1", hits: [2] }, { strip: "attack2", hits: [2] }, { strip: "attack3", hits: [3] }],
  outfits: [
    { name: "Red Steel", colors: {}, shifts: [hue(195, 260, 0, { minSat: 0.2 })] },
    { name: "Gold Standard", colors: {}, shifts: [hue(195, 260, 45, { minSat: 0.2 })] },
    { name: "Green Steel", colors: {}, shifts: [hue(195, 260, 130, { minSat: 0.2 })] },
  ],
  words: { cry: "HAH!", intro: "LOOK AT ME", win: "TOO PRETTY", taunt: "SMOLDER..." },
  more: (k) => ({ attacks: [theLook(k)], cues: [{ action: 1400, frame: 1, sound: SOUNDS.zap, effect: k.say("BLUE STEEL", 0, 34, FX.sky) }] }),
});

/** The look: a smoulder so strong it stuns (a long stun, little damage). */
function theLook(k: HeroCtx): AttackSpec {
  const { front: F, height: H } = k.body;
  const glare = (t: number) => (cv: { img: IndexedImage; x: number; y: number }) => {
    sparkles(cv.img, cv.x + F - 2, cv.y - H + 6, t, FX.sky);
    for (let i = 0; i < 3; i++) sparkles(cv.img, cv.x + F + 8 + i * 9 + t * 2, cv.y - Math.round(H * 0.7) + (i % 2) * 4, t + i, i % 2 ? FX.white : FX.sky);
  };
  const cells = range(6).map((t) => k.c(`look ${t}`, { s: "idle", f: 0, dx: -1, fx: t >= 1 && t <= 4 ? [glare(t)] : [] }));
  return {
    state: 1400, name: "Blue Steel", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, k.cells.STAND[0]!], ticks: [6, 5, 5, 5, 5, 6, 4] },
    hits: [{ frames: [2, 3], damage: 25, height: "high", weight: "medium", hitStun: 48, blockStun: 10, push: 0, box: k.bx(F, -H, F + 36, -H * 0.4) }],
    ai: { range: 70, weight: 0.4 },
  };
}

// ----- More drawings -----

/** A wedge of cheese (about 12 x 8) with holes, turned over every other frame. */
function cheese(img: IndexedImage, x: number, y: number, t: number) {
  const flip = t % 2 ? -1 : 1;
  for (let v = 0; v < 8; v++) for (let u = 0; u <= 12 - v * 1.4; u++) put(img, x - 6 + u, y + flip * (3 - v), v === 0 || u >= 11 - v * 1.4 ? FX.cheeseDark : FX.cheese);
  for (const [u, v] of [[2, 1], [6, 2], [3, 4]] as const) put(img, x - 6 + u, y + flip * (3 - v), FX.cheeseDark);
}
/** A green glob with a shine and drips. */
function glob(img: IndexedImage, x: number, y: number, t: number) {
  disc(img, x, y, 5, FX.stinkDark);
  disc(img, x - 0.5, y - 0.5, 4, FX.green);
  put(img, x - 2, y - 2, FX.white), put(img, x - 1, y - 2, FX.white);
  for (let i = 0; i < 3; i++) put(img, x + 5 + i * 2 + (t % 2), y + 1 + (i % 2), FX.green);
}
/** Sound waves. */
function screech(img: IndexedImage, x: number, y: number, t: number) {
  arcs(img, x - 8, y, 5 + (t % 3) * 2, 3, 4, FX.purple, 100);
  arcs(img, x - 8, y, 6 + (t % 3) * 2, 2, 4, FX.white, 60);
}
/** A gold crown spinning. */
function crown(img: IndexedImage, x: number, y: number, t: number) {
  const w = [7, 5, 2, 5][t % 4]!;
  for (let u = -w; u <= w; u++) for (let v = 0; v < 4; v++) put(img, x + u, y + v, v === 3 ? FX.coinDark : FX.coin);
  for (const p of [-1, 0, 1]) for (let v = 1; v <= 3; v++) if (Math.abs(p * w) - v / 2 <= w) put(img, x + Math.round(p * w * 0.8), y - v, FX.coin);
  if (w > 3) put(img, x, y + 1, FX.red);
}
/** A red glare. */
function glare(img: IndexedImage, x: number, y: number, t: number) {
  for (let u = -14; u <= 14; u++) {
    put(img, x + u, y, FX.white);
    put(img, x + u, y - 1, FX.red), put(img, x + u, y + 1, FX.red);
    if ((u + t) % 5 === 0) put(img, x + u, y - 2, FX.red), put(img, x + u, y + 2, FX.red);
  }
}
/** Flames creeping along the ground. */
function floorFire(img: IndexedImage, x: number, y: number, t: number) {
  for (let i = -1; i <= 1; i++) flames(img, x + i * 7, y + 9, 8 + ((i + t) % 3) * 2, t + i);
}

// ----- Royal Pain: the second Medieval King -----

const KING_2 = "Medieval King Pack 2/Medieval King Pack 2/Sprites";
export const ROYAL_PAIN = hero({
  id: "gi-royal-pain", name: "Royal Pain", base: RUSHDOWN, localcoord: 518,
  pack: { name: "Medieval King Pack 2", url: "https://luizmelo.itch.io/medieval-king-pack-2" },
  strips: {
    idle: [`${KING_2}/Idle.png`, 8], run: [`${KING_2}/Run.png`, 8], jump: [`${KING_2}/Jump.png`, 2], fall: [`${KING_2}/Fall.png`, 2],
    hurt: [`${KING_2}/Take Hit.png`, 4], death: [`${KING_2}/Death.png`, 6], attack1: [`${KING_2}/Attack1.png`, 4], attack2: [`${KING_2}/Attack2.png`, 4], attack3: [`${KING_2}/Attack3.png`, 4],
  },
  widths: { idle: 160, run: 160, jump: 160, fall: 160, hurt: 160, death: 160, attack1: 160, attack2: 160, attack3: 160 },
  body: { front: 15, back: 16, height: 54 },
  sha256: "6889943b90a66660dcaf9ba47e2a93ae4d934129e78a240dd33c5bc86d67920a",
  room: { l: 64, r: 79, u: 103, d: 0 },
  slash: { colours: ["#ffffff", "#b4b4b4", "#949292", "#c8c8c8"] },
  hurt: [0, 1, 2],
  down: 5,
  attacks: [{ strip: "attack1", hits: [2] }, { strip: "attack2", hits: [2] }, { strip: "attack3", hits: [2] }],
  outfits: [
    { name: "Red Cape", colors: {}, shifts: [hue(185, 235, 0, { minSat: 0.3 })] },
    { name: "Green Cape", colors: {}, shifts: [hue(185, 235, 130, { minSat: 0.3 })] },
    { name: "Purple Cape", colors: {}, shifts: [hue(185, 235, 280, { minSat: 0.3 })] },
  ],
  words: { cry: "HAH!", intro: "BOW DOWN!", win: "LONG LIVE!", taunt: "HOW RUDE." },
  more: (k) => {
    const cells = [0, 1].map((f) => k.c(`crown toss ${f}`, { s: "attack2", f }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Crown Toss", command: "QCB_x", cells: [...cells, k.c("crown toss 2", { s: "attack2", f: 3 }), k.cells.STAND[0]!], ticks: [4, 5, 8, 6], frame: 2, art: spinner(crown, 4, { w: 22, h: 14, box: [-8, -4, 8, 5] }), speed: 5.5, height: k.body.height * 0.7, damage: 50, hitSound: SOUNDS.coin })],
      cues: [{ action: 1400, frame: 2, sound: SOUNDS.whoosh, effect: k.say("CATCH!", 0, 24, FX.coin) }],
    };
  },
});

// ----- Fun Guy: the mushroom -----

const MUSHROOM = "Monsters_Creatures_Fantasy/Monsters_Creatures_Fantasy/Mushroom";
const MUSHROOM_12 = "Monster_Creatures_Fantasy(Version 1.2)/Monster_Creatures_Fantasy(Version 1.2)/Mushroom";
const MUSHROOM_13 = "Monster_Creatures_Fantasy(Version 1.3)/Monster_Creatures_Fantasy(Version 1.3)/Mushroom";
const MONSTERS = { name: "Monsters Creatures Fantasy", url: "https://luizmelo.itch.io/monsters-creatures-fantasy" };
export const FUN_GUY = hero({
  id: "gi-fun-guy", name: "Fun Guy", base: HEAVY, localcoord: 444,
  pack: MONSTERS,
  strips: {
    idle: [`${MUSHROOM}/Idle.png`, 4], run: [`${MUSHROOM}/Run.png`, 8], hurt: [`${MUSHROOM}/Take Hit.png`, 4], death: [`${MUSHROOM}/Death.png`, 4],
    attack1: [`${MUSHROOM}/Attack.png`, 8], attack2: [`${MUSHROOM_12}/Attack2.png`, 8], attack3: [`${MUSHROOM_13}/Attack3.png`, 11], spore: [`${MUSHROOM_13}/Projectile_sprite.png`, 8],
  },
  body: { front: 11, back: 12, height: 37 },
  sha256: "2480a9bdc19b70c55b7ba33adbc956e5b282b91159652e36cfa622e0ba7fc6a7",
  room: { l: 32, r: 46, u: 52, d: 0 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 3,
  attacks: [{ strip: "attack1", frames: [4, 5, 6, 7], hits: [2] }, { strip: "attack1", hits: [6] }, { strip: "attack2", hits: [6] }],
  outfits: [
    { name: "Blue Cap", colors: {}, shifts: [hue(330, 20, 215, { minSat: 0.3 })] },
    { name: "Green Cap", colors: {}, shifts: [hue(330, 20, 120, { minSat: 0.3 })] },
    { name: "Golden Cap", colors: {}, shifts: [hue(330, 20, 42, { minSat: 0.3, light: 1.3 })] },
  ],
  words: { cry: "SMASH!", intro: "FUN GUY!", win: "FUN TIMES!", taunt: "SHROOM!" },
  more: (k) => {
    const { STAND } = k.cells;
    const throwCells = [3, 4, 5, 6].map((f) => k.c(`spore throw ${f}`, { s: "attack1", f }));
    const burst = range(11).map((f) => k.c(`spore burst ${f}`, { s: "attack3", f }));
    return {
      attacks: [
        thrown(k, { state: 1400, name: "Spore Shot", command: "QCB_x", cells: [...throwCells, STAND[0]!], ticks: [3, 4, 4, 7, 6], frame: 3, art: k.stripProjectile({ strip: "spore", frames: [0, 1, 2, 3] }, { strip: "spore", frames: [4, 5, 6, 7] }), speed: 4, height: k.body.height * 0.55, damage: 45 }),
        {
          state: 1500, name: "Spore Cloud", from: "stand", command: "QCF_a", special: true,
          anim: { action: 1500, cells: [...burst, STAND[0]!], ticks: [3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 4] },
          hits: [{ frames: [7, 8, 9], damage: 60, chip: 10, height: "mid", weight: "medium", hitStun: 26, blockStun: 14, push: 6, box: k.bx(-k.body.back - 16, -k.body.height * 1.2, k.body.front + 18, 0) }],
          ai: { range: 40, weight: 0.5 },
        },
      ],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.splat }, { action: 1500, frame: 7, sound: SOUNDS.fart, effect: k.say("ACHOO!", 0, 26) }],
    };
  },
});

// ----- Calcium Carl: the skeleton, shield up, sword to throw -----

const SKELETON = "Monsters_Creatures_Fantasy/Monsters_Creatures_Fantasy/Skeleton";
const SKELETON_12 = "Monster_Creatures_Fantasy(Version 1.2)/Monster_Creatures_Fantasy(Version 1.2)/Skeleton";
const SKELETON_13 = "Monster_Creatures_Fantasy(Version 1.3)/Monster_Creatures_Fantasy(Version 1.3)/Skeleton";
export const CALCIUM_CARL = hero({
  id: "gi-calcium-carl", name: "Calcium Carl", base: ALL_ROUNDER, localcoord: 470,
  pack: MONSTERS,
  strips: {
    idle: [`${SKELETON}/Idle.png`, 4], run: [`${SKELETON}/Walk.png`, 4], hurt: [`${SKELETON}/Take Hit.png`, 4], death: [`${SKELETON}/Death.png`, 4],
    attack1: [`${SKELETON}/Attack.png`, 8], block: [`${SKELETON}/Shield.png`, 4], attack2: [`${SKELETON_12}/Attack2.png`, 8], attack3: [`${SKELETON_13}/Attack3.png`, 6],
    sword: [`${SKELETON_13}/Sword_sprite.png`, 8],
  },
  widths: { sword: 92 },
  body: { front: 22, back: 23, height: 51 },
  sha256: "3ad5a89ac0da5fb9bffc56683a317cf3344ecee638285aa7406fc3d87d53021e",
  room: { l: 39, r: 65, u: 87, d: 2 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 3,
  attacks: [{ strip: "attack1", frames: [4, 5, 6, 7], hits: [2] }, { strip: "attack1", hits: [6] }, { strip: "attack2", hits: [6] }],
  outfits: [
    { name: "Blue Rust", colors: {}, shifts: [hue(5, 45, 215, { minSat: 0.35 })] },
    { name: "Green Rust", colors: {}, shifts: [hue(5, 45, 120, { minSat: 0.35 })] },
    { name: "Gold", colors: {}, shifts: [hue(5, 45, 48, { minSat: 0.35, light: 1.3, sat: 1.4 })] },
  ],
  words: { cry: "NYEH!", intro: "SPOOKY!", win: "CALCIUM!", taunt: "MILK TIME" },
  more: (k) => {
    const cells = range(6).map((f) => k.c(`sword toss ${f}`, { s: "attack3", f }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Sword Toss", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 4, 4, 8, 5, 5, 5], frame: 3, art: k.stripProjectile({ strip: "sword", frames: [0, 1, 2] }, { strip: "sword", frames: [3, 4, 5, 6, 7] }), speed: 5, height: k.body.height * 0.6, damage: 55, hitSound: SOUNDS.shing })],
      anims: [{ action: 195, cells: range(8).map((t) => k.c(`milk ${t}`, { s: "idle", f: t % 4, fx: [(cv) => carton(cv.img, cv.x + 8, cv.y - Math.round(k.body.height * 0.55) - (t % 2))] })), ticks: 6, comment: "taunt: a carton of milk" }],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.whoosh }],
    };
  },
});

// ----- Eye Spy: the flying eye -----

const EYE = "Monsters_Creatures_Fantasy/Monsters_Creatures_Fantasy/Flying eye";
const EYE_12 = "Monster_Creatures_Fantasy(Version 1.2)/Monster_Creatures_Fantasy(Version 1.2)/Flying eye";
const EYE_13 = "Monster_Creatures_Fantasy(Version 1.3)/Monster_Creatures_Fantasy(Version 1.3)/Flying eye";
export const EYE_SPY = hero({
  id: "gi-eye-spy", name: "Eye Spy", base: ZONER, localcoord: 425,
  pack: MONSTERS,
  strips: {
    idle: [`${EYE}/Flight.png`, 8], hurt: [`${EYE}/Take Hit.png`, 4], death: [`${EYE}/Death.png`, 4], attack1: [`${EYE}/Attack.png`, 8],
    attack2: [`${EYE_12}/Attack2.png`, 8], attack3: [`${EYE_13}/Attack3.png`, 6], blob: [`${EYE_13}/projectile_sprite.png`, 8],
  },
  body: { front: 20, back: 21, height: 31 },
  sha256: "9cdd2f76328a2517663919b2d34b1c6391a11519613a1793ad0a998f5cd87dd8",
  room: { l: 28, r: 28, u: 43, d: 9 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 3,
  hover: 8,
  deathLift: 9,
  attacks: [{ strip: "attack1", frames: [4, 5, 6, 7], hits: [2, 3] }, { strip: "attack1", hits: [6, 7] }, { strip: "attack2", hits: [5] }],
  shot: { strip: "attack3", hits: [3] },
  projectile: { name: "Eye Goo", fly: { strip: "blob", frames: [0, 1, 2] }, hit: { strip: "blob", frames: [3, 4, 5, 6, 7] }, speed: 4.5, sound: SOUNDS.splat },
  outfits: [
    { name: "Green", colors: {}, shifts: [hue(5, 50, 110, { minSat: 0.2 })] },
    { name: "Purple", colors: {}, shifts: [hue(5, 50, 280, { minSat: 0.2 })] },
    { name: "Blue", colors: {}, shifts: [hue(5, 50, 210, { minSat: 0.2 })] },
  ],
  words: { cry: "BLINK!", intro: "I SEE YOU", win: "EYE WIN!", taunt: "STARING..." },
  more: (k) => {
    const cells = [0, 1, 2, 3].map((f) => k.c(`stink eye ${f}`, { s: "idle", f, sx: f === 2 ? 1.1 : 1 }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Stink Eye", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [4, 4, 8, 6, 5], frame: 2, art: spinner(glare, 4, { w: 32, h: 8, box: [-14, -2, 14, 2] }), speed: 9, height: k.body.height * 0.5 + k.lift, damage: 40 })],
      cues: [{ action: 1400, frame: 2, sound: SOUNDS.zap, effect: k.say("STINK EYE!", 0, 26, FX.red) }],
    };
  },
});

// ----- Spicy Noodle: the fire worm -----

const WORM = "Fire Worm/Fire Worm/Sprites";
export const SPICY_NOODLE = hero({
  id: "gi-spicy-noodle", name: "Spicy Noodle", base: ZONER, localcoord: 463,
  pack: { name: "Fire Worm", url: "https://luizmelo.itch.io/fire-worm" },
  strips: {
    idle: [`${WORM}/Worm/Idle.png`, 9], run: [`${WORM}/Worm/Walk.png`, 9], hurt: [`${WORM}/Worm/Get Hit.png`, 3], death: [`${WORM}/Worm/Death.png`, 8],
    attack1: [`${WORM}/Worm/Attack.png`, 16], ball: [`${WORM}/Fire Ball/Move.png`, 6], blast: [`${WORM}/Fire Ball/Explosion.png`, 7],
  },
  body: { front: 25, back: 26, height: 41 },
  sha256: "525d86e7e857417460a20b455f6374637646141358dd673acd4f59ec17b411a8",
  room: { l: 30, r: 47, u: 54, d: 0 },
  hurt: [0, 1, 2],
  down: 7,
  attacks: [{ strip: "attack1", frames: [8, 9, 10, 11], hits: [2] }, { strip: "attack1", frames: [6, 7, 8, 9, 10, 11, 12], hits: [4, 5] }],
  shot: { strip: "attack1", frames: [6, 7, 8, 9, 10, 11, 12, 13], hits: [5] },
  projectile: { name: "Fire Ball", fly: { strip: "ball", frames: range(6) }, hit: { strip: "blast", frames: range(7) }, speed: 4.5, sound: SOUNDS.fire },
  outfits: [
    { name: "Blue Noodle", colors: {}, shifts: [hue(55, 100, 205, { minSat: 0.25 })] },
    { name: "Purple Noodle", colors: {}, shifts: [hue(55, 100, 285, { minSat: 0.25 })] },
    { name: "Red Noodle", colors: {}, shifts: [hue(55, 100, 0, { minSat: 0.25 })] },
  ],
  words: { cry: "HSSS!", intro: "SPICY!", win: "EXTRA HOT", taunt: "MILD?" },
  more: (k) => {
    const cells = [4, 5, 6, 7].map((f) => k.c(`spicy floor ${f}`, { s: "attack1", f, sy: 0.92 }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Spicy Floor", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 4, 5, 8, 6], frame: 3, art: spinner(floorFire, 4, { w: 30, h: 22, box: [-12, -2, 12, 10] }), speed: 2.6, height: 9, damage: 50, low: true })],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.fire, effect: k.say("TOO SPICY", 0, 26, FX.flameLight) }],
    };
  },
});

// ----- Big Cheese: the rat -----

const RAT = "Monsters Creatures Fantasy 2/Monsters Creatures Fantasy 2/Rat";
const MONSTERS_2 = { name: "Monsters Creatures Fantasy 2", url: "https://luizmelo.itch.io/monsters-creatures-fantasy-2" };
export const BIG_CHEESE = hero({
  id: "gi-big-cheese", name: "Big Cheese", base: RUSHDOWN, localcoord: 400,
  pack: MONSTERS_2,
  strips: { idle: [`${RAT}/idle.png`, 10], run: [`${RAT}/run.png`, 8], hurt: [`${RAT}/hurt.png`, 3], death: [`${RAT}/rat-death.png`, 6], attack1: [`${RAT}/attack_bite.png`, 12] },
  body: { front: 20, back: 20, height: 20 },
  sha256: "da76a6896870d30b7b39fbf9a8474b7044954c0232925f96f64b6efa82da1117",
  room: { l: 32, r: 27, u: 22, d: 0 },
  hurt: [0, 1, 2],
  down: 5,
  attacks: [{ strip: "attack1", frames: [6, 7, 8, 9], hits: [2], box: [16, -14, 28, -2] }, { strip: "attack1", hits: [8], box: [16, -14, 28, -2] }],
  outfits: [
    { name: "Brown Rat", colors: {}, shifts: [hue(180, 280, 28, { minSat: 0.05, tint: 0.35 })] },
    { name: "Lab Rat", colors: {}, shifts: [hue(180, 280, null, { minSat: 0.05, light: 2 })] },
    { name: "Black Rat", colors: {}, shifts: [hue(180, 280, null, { minSat: 0.05, light: 0.5 })] },
  ],
  words: { cry: "SQUEAK!", intro: "CHEESE?", win: "BIG CHEESE", taunt: "NOM NOM" },
  more: (k) => {
    const cells = [3, 4, 5, 6].map((f) => k.c(`cheese toss ${f}`, { s: "attack1", f }));
    const H = k.body.height, F = k.body.front;
    return {
      attacks: [thrown(k, { state: 1400, name: "Cheese Wedge", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 4, 4, 7, 5], frame: 3, art: spinner(cheese, 4, { w: 18, h: 14, box: [-6, -4, 6, 4] }), speed: 5, height: H * 0.6, damage: 40, hitSound: SOUNDS.squeak })],
      anims: [{ action: 195, cells: range(8).map((t) => k.c(`nibble ${t}`, { s: "idle", f: t, fx: [(cv) => cheese(cv.img, cv.x + F + 4, cv.y - Math.round(H * 0.45) - (t % 2), 0)] })), ticks: 6, comment: "taunt: nibbles cheese" }],
      cues: [{ action: 1400, frame: 3, sound: SOUNDS.whoosh }, { action: 195, frame: 1, sound: SOUNDS.squeak }],
    };
  },
});

// ----- Snot Rocket: the slime -----

const SLIME = "Monsters Creatures Fantasy 2/Monsters Creatures Fantasy 2/Slime";
export const SNOT_ROCKET = hero({
  id: "gi-snot-rocket", name: "Snot Rocket", base: HEAVY, localcoord: 376,
  pack: MONSTERS_2,
  strips: { idle: [`${SLIME}/idle.png`, 14], run: [`${SLIME}/walk.png`, 6], hurt: [`${SLIME}/hurt.png`, 3], death: [`${SLIME}/death.png`, 11], attack1: [`${SLIME}/attack.png`, 19] },
  body: { front: 22, back: 22, height: 18 },
  sha256: "18555ea166945497a92590864caa5d0fccc2ec487dcb1ca24fd90de575885b82",
  room: { l: 34, r: 77, u: 35, d: 0 },
  hurt: [0, 1, 2],
  down: 10,
  attacks: [{ strip: "attack1", frames: [8, 9, 10, 11, 12], hits: [2, 3] }, { strip: "attack1", hits: [10, 11, 12] }],
  outfits: [
    { name: "Blue Goo", colors: {}, shifts: [hue(60, 160, 200, { minSat: 0.2 })] },
    { name: "Pink Goo", colors: {}, shifts: [hue(60, 160, 320, { minSat: 0.2 })] },
    { name: "Orange Goo", colors: {}, shifts: [hue(60, 160, 28, { minSat: 0.2 })] },
  ],
  words: { cry: "BLORP!", intro: "SQUISH!", win: "GOOD GOO", taunt: "BLEGH!" },
  more: (k) => {
    const cells = [4, 5, 6, 7, 8].map((f) => k.c(`snot ${f}`, { s: "attack1", f }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Snot Rocket", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 3, 4, 5, 8, 6], frame: 4, art: spinner(glob, 2, { w: 22, h: 14, box: [-5, -5, 5, 5] }), speed: 4.5, height: k.body.height * 0.6, damage: 50, hitSound: SOUNDS.splat })],
      cues: [{ action: 1400, frame: 4, sound: SOUNDS.splat, effect: k.say("HONK!", 0, 22, FX.green) }],
    };
  },
});

// ----- Free Loot: the mimic -----

const MIMIC = "Monsters Creatures Fantasy 2/Monsters Creatures Fantasy 2/Mimic";
export const FREE_LOOT = hero({
  id: "gi-free-loot", name: "Free Loot", base: GRAPPLER, localcoord: 436,
  pack: MONSTERS_2,
  strips: {
    idle: [`${MIMIC}/idle_transformed.png`, 9], run: [`${MIMIC}/walk.png`, 6], hurt: [`${MIMIC}/hurt.png`, 3], death: [`${MIMIC}/death.png`, 6],
    attack1: [`${MIMIC}/attack_1.png`, 14], attack2: [`${MIMIC}/attack_2.png`, 13], closed: [`${MIMIC}/Idle_closed.png`, 1], opening: [`${MIMIC}/opening.png`, 6], transform: [`${MIMIC}/transform.png`, 7],
  },
  body: { front: 21, back: 21, height: 30 },
  sha256: "dc12baa4e3feeb80d40179e874d5c6bf9a2e7f3e4e1c4dc696d4457ebe93f2af",
  room: { l: 45, r: 68, u: 44, d: 0 },
  hurt: [0, 1, 2],
  down: 5,
  attacks: [{ strip: "attack1", frames: [10, 11, 12, 13], hits: [3] }, { strip: "attack2", hits: [8, 9] }],
  outfits: [
    { name: "Gold Chest", colors: {}, shifts: [hue(0, 40, 45, { minSat: 0.15, sat: 1.6, light: 1.2 })] },
    { name: "Ice Chest", colors: {}, shifts: [hue(0, 40, 200, { minSat: 0.15 })] },
    { name: "Cursed Chest", colors: {}, shifts: [hue(0, 40, 280, { minSat: 0.15 })] },
  ],
  words: { cry: "CHOMP!", intro: "FREE LOOT?", win: "SUCKER!", taunt: "OPEN ME!" },
  more: (k) => {
    const { STAND } = k.cells;
    const closed = k.c("closed", { s: "closed" }, true);
    const opening = range(6).map((f) => k.c(`opening ${f}`, { s: "opening", f }, true));
    const transform = range(7).map((f) => k.c(`transform ${f}`, { s: "transform", f }, true));
    const spit = [0, 1, 2, 3].map((f) => k.c(`coin spit ${f}`, { s: "attack1", f: 4 + f * 2 }));
    const coins = (img: IndexedImage, x: number, y: number, t: number) => [-5, 0, 5].forEach((dx, i) => coin(img, x + dx, y + (i % 2 ? -2 : 2), t + i));
    return {
      attacks: [thrown(k, { state: 1400, name: "Coin Spit", command: "QCB_x", cells: [...spit, STAND[0]!], ticks: [3, 4, 4, 8, 6], frame: 3, art: spinner(coins, 4, { w: 22, h: 12, box: [-9, -4, 9, 4] }), speed: 5, height: k.body.height * 0.55, damage: 45, hitSound: SOUNDS.coin })],
      anims: [
        { action: 190, cells: [closed, closed, ...opening, ...transform, STAND[0]!], ticks: [40, 20, ...opening.map(() => 4), ...transform.map(() => 4), 10], comment: "intro: just a treasure chest... (FREE LOOT?)" },
        { action: 181, cells: [...[...transform].reverse(), closed], ticks: [...transform.map(() => 4), 60], loop: false, comment: "win: back into a chest (SUCKER!)" },
      ],
      cues: [
        { action: 190, frame: 0, effect: k.say("FREE LOOT?", 0, 50, FX.coin) },
        { action: 190, frame: 2, sound: SOUNDS.chomp },
        { action: 181, frame: 6, sound: SOUNDS.chomp, effect: k.say("SUCKER!", 0, 60, FX.yellow) },
        { action: 1400, frame: 3, sound: SOUNDS.coin },
      ],
    };
  },
});

// ----- Batty: the bat -----

const BAT = "Monsters Creatures Fantasy 2/Monsters Creatures Fantasy 2/Bat";
export const BATTY = hero({
  id: "gi-batty", name: "Batty", base: RUSHDOWN, localcoord: 453,
  pack: MONSTERS_2,
  strips: { idle: [`${BAT}/fly.png`, 11], hurt: [`${BAT}/hurt.png`, 3], death: [`${BAT}/death.png`, 4], attack1: [`${BAT}/attack.png`, 11], hang: [`${BAT}/fall.png`, 5] },
  body: { front: 27, back: 27, height: 33 },
  sha256: "371296f56b62115c468ce4025ce58c85ed72be7038aa9ae2fcb20ccc3d86ecaa",
  room: { l: 33, r: 39, u: 46, d: 10 },
  slash: { colours: ["#f7e4cd"] },
  hurt: [0, 1, 2],
  down: 3,
  hover: 10,
  attacks: [{ strip: "attack1", frames: [6, 7, 8, 9], hits: [2, 3] }, { strip: "attack1", hits: [8, 9] }],
  outfits: [
    { name: "Blue Bat", colors: {}, shifts: [hue(280, 360, 220, { minSat: 0.1, tint: 0.3 })] },
    { name: "Green Bat", colors: {}, shifts: [hue(280, 360, 130, { minSat: 0.1, tint: 0.3 })] },
    { name: "Brown Bat", colors: {}, shifts: [hue(280, 360, 25, { minSat: 0.1, tint: 0.35 })] },
  ],
  words: { cry: "EEEE!", intro: "BAT TIME!", win: "FANGTASTIC", taunt: "HANGING..." },
  more: (k) => {
    const cells = [0, 1, 2].map((f) => k.c(`screech ${f}`, { s: "idle", f, sx: 1.05 }));
    return {
      attacks: [thrown(k, { state: 1400, name: "Screech", command: "QCB_x", cells: [...cells, k.cells.STAND[0]!], ticks: [3, 4, 8, 6], frame: 2, art: spinner(screech, 3, { w: 30, h: 26, box: [-10, -9, 10, 9] }), speed: 5, height: k.body.height * 0.5 + k.lift, damage: 40 })],
      anims: [{ action: 195, cells: range(5).map((f) => k.c(`hang ${f}`, { s: "hang", f, dy: -20 })), ticks: 8, comment: "taunt: hangs upside down" }],
      cues: [{ action: 1400, frame: 2, sound: SOUNDS.zap, effect: k.say("EEEEE!", 0, 22, FX.purple) }],
    };
  },
});

export const HEROES: readonly TemplateSpec[] = [
  SIR_BONKALOT, HOT_TAKES, STABBY, NIGHT_SHIFT, CAPE_CRUSADER, JAVELINA, ROBIN_HOODIE, HAT_TRICK, NO_SHIRT_KURT, KING_ME, ARMS_DEALER, BLUE_STEEL,
  ROYAL_PAIN, FUN_GUY, CALCIUM_CARL, EYE_SPY, SPICY_NOODLE, BIG_CHEESE, SNOT_ROCKET, FREE_LOOT, BATTY,
];
