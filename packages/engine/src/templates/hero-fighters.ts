/**
 * The heroes and monsters themselves (templates/heroes.ts builds them): one per LuizMelo pack, each on a template's
 * numbers and AI, with a signature move or gag of its own drawn in code.
 */
import type { IndexedImage } from "../art/sheet.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { disc, line, star, type PackCanvas } from "./pack-kit.ts";
import { drawnProjectile, flames, FX, heroFighter, pan, SOUNDS, type HeroCtx } from "./heroes.ts";
import { RUSHDOWN } from "./rushdown.ts";
import type { AttackSpec, TemplateSpec } from "./spec.ts";
import { ZONER } from "./zoner.ts";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** A hue band turned to another hue (outfits). */
const hue = (from: number, to: number, toHue: number | null, more: { minSat?: number; maxSat?: number; sat?: number; light?: number; tint?: number; lights?: readonly [number, number] } = {}) => ({ from, to, hue: toHue, ...more });
const greys = { from: 0, to: 360, minSat: 0, maxSat: 0.22 } as const;
/** Fire's fully saturated reds, oranges and yellows, to another hue (skin and trims are less saturated). */
const fire = (toHue: number) => hue(0, 65, toHue, { minSat: 0.97 });

// ----- Sir Bonkalot: the Hero Knight, sword in one hand and a frying pan in the other -----

const KNIGHT = "Hero Knight/Hero Knight/Sprites";
export const SIR_BONKALOT = heroFighter({
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
export const HOT_TAKES = heroFighter({
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
const GOBLIN_13 = "Monster_Creatures_Fantasy(Version 1.3)/Monster_Creatures_Fantasy(Version 1.3)/Goblin";
export const STABBY = heroFighter({
  id: "gi-stabby", name: "Stabby", base: RUSHDOWN, localcoord: 443,
  pack: { name: "Monsters Creatures Fantasy", url: "https://luizmelo.itch.io/monsters-creatures-fantasy" },
  strips: {
    idle: [`${GOBLIN}/Idle.png`, 4], run: [`${GOBLIN}/Run.png`, 8], hurt: [`${GOBLIN}/Take Hit.png`, 4], death: [`${GOBLIN}/Death.png`, 4],
    attack1: [`${GOBLIN}/Attack.png`, 8], bomb: [`${GOBLIN_13}/Bomb_sprite.png`, 19],
  },
  body: { front: 16, back: 17, height: 36 },
  sha256: "3c1d2f9fde66589eb7b38068403952bb5d45c3904b2955e84c22cf9fec22bd2f",
  room: { l: 44, r: 44, u: 46, d: 0 },
  slash: { colours: ["#ffffff"] },
  hurt: [0, 2, 3],
  down: 3,
  attacks: [{ strip: "attack1", frames: [4, 5, 6, 7], hits: [2] }, { strip: "attack1", frames: [2, 3, 4, 5, 6, 7], hits: [4] }, { strip: "attack1", hits: [6] }],
  outfits: [
    { name: "Red Cap", colors: {}, shifts: [hue(60, 170, 0, { minSat: 0.3 })] },
    { name: "Blue", colors: {}, shifts: [hue(60, 170, 210, { minSat: 0.3 })] },
    { name: "Purple", colors: {}, shifts: [hue(60, 170, 280, { minSat: 0.3 })] },
  ],
  words: { cry: "STABBY!", intro: "SHINY?", win: "MINE NOW!", taunt: "HEHEHE!" },
  more: (k) => ({
    attacks: [bombRoll(k)],
    cues: [{ action: 1400, frame: 3, sound: SOUNDS.whoosh }],
  }),
});

/** A lit bomb, rolled along the ground: it blows up on whoever doesn't jump it. */
function bombRoll(k: HeroCtx): AttackSpec {
  const { STAND } = k.cells;
  const cells = [2, 3, 4, 5].map((f) => k.c(`bomb throw ${f}`, { s: "attack1", f, sy: f === 5 ? 0.92 : 1 }));
  return {
    state: 1400, name: "Bomb Roll", from: "stand", command: "QCB_x", special: true,
    anim: { action: 1400, cells: [...cells, STAND[0]!], ticks: [3, 4, 4, 6, 5] },
    hits: [{ frames: [3], damage: 60, chip: 8, height: "low", weight: "heavy", hitStun: 24, blockStun: 14, push: 5, knockdown: true, launch: [2, -5], hitSound: SOUNDS.boom }],
    projectile: { frame: 3, speed: 3.2, height: k.units(4), offset: k.units(k.body.front + 6), art: k.stripProjectile({ strip: "bomb", frames: [0, 1, 2] }, { strip: "bomb", frames: [12, 13, 14, 15, 16, 17, 18] }) },
    ai: { range: 300, weight: 0.6 },
  };
}

export const HEROES: readonly TemplateSpec[] = [SIR_BONKALOT, HOT_TAKES, STABBY];
