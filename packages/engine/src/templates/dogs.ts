/**
 * The dogs: six joke house fighters from LuizMelo's CC0 Pet Dogs Pack (art/SOURCES.md), one per breed, each on a
 * template's numbers and AI (`Breed.base`). The pack has a dog's life, not a fighter's (idle, walk, run, bark,
 * licks, itching, lying down, stretching, sitting, sleeping), so every move is a pose of those frames with effects
 * drawn on top in the art's own chunky pixels (templates/pack-kit.ts): a nip, a headbutt, a tail whip, a big bark
 * that says so, a lick, a flea kick, a belly slide, zoomies, a play-bow leap, a tail-chasing spin, and per breed a
 * butt-drop sit, an avalanche-rescue charge, chew-toy and fetch throws, or a howl that flies. They wake up and
 * stretch to start, and win sitting pretty in hearts. Barks, growls and the howl are made in code, pitched per breed.
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";
import type { SndSound } from "../art/snd.ts";
import { mix, normalize, seeded, synth, WAVES, writeWav, type Samples } from "../art/wav.ts";
import { ALL_ROUNDER } from "./all-rounder.ts";
import { GRAPPLER } from "./grappler.ts";
import { HEAVY } from "./heavy.ts";
import { arcs, disc, dust, heart, line, PackKit, put, shout, shoutWidth, speedLines, star, type Body, type Effect, type PackCanvas } from "./pack-kit.ts";
import type { ProjectileArt } from "./projectile.ts";
import { RUSHDOWN } from "./rushdown.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type PaletteSpec, type TemplateSpec, type ThrowSpec } from "./spec.ts";
import { redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

const PACK = "art/sources/luizmelo/Pet Dogs Pack/Pet Dogs Pack";
const CREDIT = "Sprites: Pet Dogs Pack by LuizMelo (CC0), https://luizmelo.itch.io/pet-dogs-pack; moves, effects and sounds by Greed Island";

/** Effect colours, above the pack's own (each dog has under 15). */
export const FX = {
  white: 200, yellow: 201, ink: 202, pink: 203, tongue: 204, dust: 205, blue: 206, sky: 207, gold: 208, snow: 209, barrel: 210, hoop: 211, grey: 212,
  poop: 213, poopDark: 214, poopLight: 215, stink: 216, stinkLight: 217, stinkDark: 218, ball: 219, ballDark: 220, squirrel: 221, squirrelDark: 222, cone: 223,
} as const;
export const FX_COLORS: Record<number, string> = {
  [FX.white]: "#ffffff", [FX.yellow]: "#ffe14a", [FX.ink]: "#1a1a1a", [FX.pink]: "#ff5c9e", [FX.tongue]: "#ff7a8a", [FX.dust]: "#c9b79a", [FX.blue]: "#6fb4ff",
  [FX.sky]: "#bfe6ff", [FX.gold]: "#ffb22e", [FX.snow]: "#f2f8ff", [FX.barrel]: "#8a5a2b", [FX.hoop]: "#4a3018", [FX.grey]: "#8c8c8c",
  [FX.poop]: "#7a4a1e", [FX.poopDark]: "#4a2a0e", [FX.poopLight]: "#a8703a", [FX.stink]: "#9fd05a", [FX.stinkLight]: "#d2f0a0", [FX.stinkDark]: "#5f9a30",
  [FX.ball]: "#d6f03a", [FX.ballDark]: "#9bb81e", [FX.squirrel]: "#9a5a2a", [FX.squirrelDark]: "#5e3414", [FX.cone]: "#e8eef2",
};

/** Art pixels are drawn 3 times bigger in the sheet; cells have room ahead of the dog for barks and behind for tails. */
const SCALE = 3;
const CELL = { width: 150, height: 96, feet: { x: 50, y: 86 } } as const;

/** Sound numbers. */
export const SOUNDS = { bark: [1, 0], yip: [1, 1], growl: [2, 0], howl: [3, 0], slurp: [4, 0], whimper: [5, 0], thud: [6, 0], squeak: [7, 0], fart: [8, 0], splat: [9, 0] } as const;

export interface Breed {
  id: string;
  name: string;
  /** The breed's folder and file prefix in the pack, and how its idle strip is spelt. */
  folder: string;
  prefix: string;
  idle: "idle" | "Idle";
  base: TemplateSpec;
  localcoord: number;
  /** What its bark says, and its voice (1 = a retriever's). */
  word: string;
  pitch: number;
  /** Its body in the first idle frame (checked when the sheet is made). */
  body: Body;
  sha256: string;
  outfits: PaletteSpec[];
}

const STRIPS = ["bark", "itching", "licking1", "licking2", "lying-down", "run", "sitting", "sleeping", "stretching", "walk"] as const;

// ----- Effects, from the feet (x forward, y down); h = the body's height -----

const mouth = (c: PackCanvas) => ({ x: c.x + c.body.front, y: c.y - Math.round(c.body.height * 0.68) });
/** Teeth closing just ahead of the mouth. */
const chomp: Effect = (c) => {
  const m = mouth(c);
  for (let i = 0; i < 3; i++) {
    put(c.img, m.x + 2 + i * 2, m.y - 2, FX.white);
    put(c.img, m.x + 3 + i * 2, m.y - 1, FX.white);
    put(c.img, m.x + 2 + i * 2, m.y + 2, FX.white);
    put(c.img, m.x + 3 + i * 2, m.y + 1, FX.white);
  }
};
const lowChomp: Effect = (c) => chomp({ ...c, y: c.y + Math.round(c.body.height * 0.35) });
/** The bark: rings out of the mouth (its word is a separate effect, `WORDS`, so it reads the right way round). */
const woof = (k: number): Effect => (c) => {
  const m = mouth(c);
  arcs(c.img, m.x + 1, m.y, 4 + k * 3, 3, 4, k % 2 ? FX.yellow : FX.white);
};
const tongue = (len: number): Effect => (c) => {
  const m = mouth(c);
  for (let x = 0; x < len; x++) for (let y = 0; y < 3; y++) put(c.img, m.x + x, m.y + 1 + y + (x > len - 3 ? 1 : 0), y === 2 ? FX.pink : FX.tongue);
};
const hearts = (t: number, n = 3): Effect => (c) => {
  for (let i = 0; i < n; i++) heart(c.img, c.x - 8 + i * 9 + (t % 2), c.y - c.body.height - 6 - t * 3 - (i % 2) * 4, FX.pink);
};
const fleas = (t: number): Effect => (c) => {
  for (let i = 0; i < 4; i++) put(c.img, c.x - c.body.back + 4 + i * 6 + t, c.y - c.body.height - 2 - ((i + t) % 3) * 2, FX.ink);
};
const hit = (fx: number, fy: number, size = 6): Effect => (c) => star(c.img, c.x + fx, c.y - fy, size, FX.yellow, FX.white);
const dustBehind = (len = 16, snow = false): Effect => (c) => dust(c.img, c.x - c.body.back, c.x - c.body.back - len, c.y, snow ? FX.snow : FX.dust, len);
const dustUnder: Effect = (c) => dust(c.img, c.x - c.body.back - 4, c.x + c.body.front + 4, c.y, FX.dust, 3);
const speed = (snow = false): Effect => (c) => speedLines(c.img, c.x - c.body.back - 2, c.x - c.body.back - 26, [c.y - 4, c.y - Math.round(c.body.height * 0.5), c.y - c.body.height + 2], snow ? FX.snow : FX.white);
/** A swish around the body (the tail whip, the spin). */
const swish = (k: number, both = false): Effect => (c) => {
  arcs(c.img, c.x, c.y - Math.round(c.body.height * 0.5), c.body.front + 3 + k, 2, 3, FX.white, 120);
  if (both) arcs(c.img, c.x - 1, c.y - Math.round(c.body.height * 0.5), c.body.back + 3 + k, 2, 3, FX.white, 120, true);
};
/** Text in a cell: only for what reads the same mirrored ("..."); words are effects (`WORDS`). */
const sayAbove = (text: string, color: number = FX.white): Effect => (c) => shout(c.img, text, c.x - Math.round(shoutWidth(text) / 2), c.y - c.body.height - 14, color, FX.ink);
/** The Saint Bernard's brandy barrel, under its chin. */
const barrel: Effect = (c) => {
  const bx = c.x + c.body.front - 9, by = c.y - Math.round(c.body.height * 0.42);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) put(c.img, bx + x, by + y, x === 1 || x === 4 ? FX.hoop : FX.barrel);
};

// ----- Gag drawings -----

/** A cartoon poop (about 11 x 10), its bottom middle at (x, y): three swirls and a curl, outlined. */
export function poop(img: IndexedImage, x: number, y: number) {
  const tiers: [number, number, number][] = [[0, 5.5, 2.6], [-3.6, 4.2, 2.2], [-6.6, 2.8, 1.8]];
  for (const [dy, rx, ry] of tiers) {
    for (let v = -ry - 1; v <= ry + 1; v++) for (let u = -rx - 1; u <= rx + 1; u++) {
      const d = (u / (rx + 0.6)) ** 2 + (v / (ry + 0.6)) ** 2;
      if (d <= 1) put(img, x + u, y - ry + dy + v - 0.5, d > 0.62 ? FX.poopDark : v < -ry * 0.3 && u < 0 ? FX.poopLight : FX.poop);
    }
  }
  put(img, x + 1, y - 10, FX.poopDark), put(img, x + 2, y - 11, FX.poopDark), put(img, x + 1, y - 11, FX.poop);
}
/** Wavy stink lines rising from (x, y), and a fly. */
export function stink(img: IndexedImage, x: number, y: number, t: number) {
  for (let i = -1; i <= 1; i++) for (let k = 0; k < 6; k++) put(img, x + i * 4 + Math.round(Math.sin((k + t) * 1.1) * 1.2), y - 2 - k - (i === 0 ? 2 : 0), FX.stink);
  const fx = x + Math.round(Math.cos(t * 1.7) * 7), fy = y - 10 + Math.round(Math.sin(t * 1.7) * 3);
  put(img, fx, fy, FX.ink), put(img, fx - 1, fy - 1, FX.white), put(img, fx + 1, fy - 1, FX.white);
}
/** A green cloud of puffs around (x, y), `r` across. */
export function cloud(img: IndexedImage, x: number, y: number, r: number, seed: number) {
  let s = seed * 7919;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 9; i++) {
    const px = x + (rnd() - 0.5) * r * 1.6, py = y + (rnd() - 0.5) * r * 0.9, pr = r * (0.28 + rnd() * 0.22);
    disc(img, px, py, pr + 1, FX.stinkDark);
    disc(img, px, py, pr, i % 3 ? FX.stink : FX.stinkLight);
  }
  for (let i = 0; i < 5; i++) put(img, x + (rnd() - 0.5) * r * 1.4, y + (rnd() - 0.5) * r * 0.7, FX.stinkDark);
}
/** A tennis ball, radius 3.5, with its seam. */
export function ball(img: IndexedImage, x: number, y: number, t: number) {
  disc(img, x, y, 3.6, FX.ballDark);
  disc(img, x - 0.3, y - 0.3, 3, FX.ball);
  for (let a = 0; a < 6; a++) put(img, x - 2 + a * 0.8, y + Math.round(Math.sin(a + t) * 1.5), FX.white);
}
/** A squirrel (about 9 x 7) running, facing left, its feet's middle at (x, y). */
export function squirrel(img: IndexedImage, x: number, y: number, t: number) {
  for (let u = -2; u <= 2; u++) for (let v = -2; v <= 0; v++) put(img, x + u, y - 2 + v, FX.squirrel);
  put(img, x - 3, y - 4, FX.squirrel), put(img, x - 3, y - 3, FX.squirrel), put(img, x - 4, y - 3, FX.squirrelDark), put(img, x - 3, y - 5, FX.squirrelDark);
  put(img, x - 4, y - 4, FX.ink);
  const tail = [[3, -3], [4, -4], [4, -5], [5, -6], [5, -7], [4, -8], [3, -8], [3, -7]];
  for (const [u, v] of tail) put(img, x + u!, y + v!, FX.squirrelDark), put(img, x + u! - 1, y + v!, FX.squirrel);
  put(img, x - 2 + (t % 2), y, FX.squirrelDark), put(img, x + 1 - (t % 2), y, FX.squirrelDark);
}
/** The cone of shame around the head: a lampshade opening forward. */
const cone: Effect = (c) => {
  const neckX = c.x + c.body.front - 7, top = c.y - c.body.height - 2, bottom = c.y - Math.round(c.body.height * 0.4);
  const mx = (top + bottom) / 2, half = (bottom - top) / 2;
  for (let s = 0; s <= 9; s++) {
    const xx = neckX + s, h = half * 0.55 + (half * 0.75 * s) / 9;
    put(c.img, xx, mx - h, FX.cone), put(c.img, xx, mx + h, FX.cone);
    if (s % 3 === 0) for (let v = -h; v <= h; v += 3) put(c.img, xx, mx + v, FX.cone);
  }
  line(c.img, neckX + 9, mx - half * 1.3, neckX + 9, mx + half * 1.3, FX.cone);
};

// ----- The fighter -----

const a = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => ({ action, cells, ticks, comment, ...more });
const air = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => a(action, cells, ticks, comment, { anchor: "feet", ...more });
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function dogFighter(b: Breed): TemplateSpec {
  const strips = Object.fromEntries([...STRIPS.map((s) => [s, `${PACK}/${b.folder}/${b.prefix}-${s}.png`] as const), ["idle", `${PACK}/${b.folder}/${b.prefix}-${b.idle}.png`] as const]);
  const kit = new PackKit({ id: b.id.replace(/^gi-/, ""), strips, idle: "idle", body: b.body, sha256: b.sha256, cell: CELL, scale: SCALE, localcoord: b.localcoord, fx: FX_COLORS, credit: CREDIT });
  const c = (name: string, pose: Parameters<typeof kit.cell>[1]) => kit.cell(name, pose);
  const { front: F, back: B, height: H } = b.body;
  const word = b.word;
  /** Art pixels to 320-wide units. */
  const units = (px: number) => Math.round((px * SCALE * 320) / b.localcoord);

  // Moving about.
  const STAND = range(10).map((f) => c(`stand ${f}`, { s: "idle", f }));
  const WALK = range(8).map((f) => c(`walk ${f}`, { s: "walk", f }));
  const RUN = range(8).map((f) => c(`run ${f}`, { s: "run", f, fx: f % 4 === 1 ? [dustBehind(8)] : [] }));
  const CROUCH = [c("crouch 3", { s: "lying-down", f: 3 }), c("crouch 4", { s: "lying-down", f: 4 })];
  const JUMP_START = c("jump start", { s: "idle", sx: 1.1, sy: 0.82 });
  const JUMP_UP = [c("rising 1", { s: "run", f: 2, rot: -22, mid: true }), c("rising 2", { s: "run", f: 3, rot: -12, mid: true }), c("top", { s: "run", f: 4, rot: -2, mid: true })];
  const JUMP_DOWN = [c("falling 1", { s: "run", f: 6, rot: 12, mid: true }), c("falling 2", { s: "run", f: 7, rot: 18, mid: true })];
  const FLIP = range(8).map((i) => c(`flip ${i}`, { s: "run", f: 4, rot: -45 * i, mid: true }));
  const LAND = c("land", { s: "idle", sx: 1.12, sy: 0.8 });
  // Blocking: the cone of shame.
  const GUARD = c("guard", { s: "idle", dx: -2, fx: [cone] });
  const GUARD_HIT = c("guard hit", { s: "idle", dx: -4, rot: -6, mid: true, fx: [cone, hit(F + 2, H * 0.75, 4)] });
  const CROUCH_GUARD = c("crouch guard", { s: "lying-down", f: 4, dx: -2 });
  // Getting hit and falling.
  const HIT_HIGH = [-12, -20, -28].map((r, i) => c(`hit high ${i}`, { s: "idle", f: i, rot: r, dx: -2 - i, mid: true }));
  const HIT_LOW = [0.9, 0.84, 0.78].map((sy, i) => c(`hit low ${i}`, { s: "idle", f: i, sy, sx: 1.05, rot: 8 + 4 * i, mid: true }));
  const CROUCH_HIT = [c("crouch hit 0", { s: "lying-down", f: 4, rot: -10, mid: true }), c("crouch hit 1", { s: "lying-down", f: 4, rot: -16, dx: -2, mid: true })];
  const TUMBLE = [-45, -90, -135, -180, -225, -270].map((r) => c(`tumble ${r}`, { s: "idle", rot: r, mid: true }));
  const LYING = c("lying: paws up", { s: "idle", rot: 180, mid: true });
  const LYING_HIT = c("lying hit", { s: "idle", f: 1, rot: 172, sy: 0.9, mid: true, fx: [hit(0, H * 0.4, 4)] });
  const GET_UP = [150, 110, 70, 30].map((r) => c(`get up ${r}`, { s: "idle", rot: r, mid: true }));
  const TRIPPED = [30, 60, 90].map((r) => c(`tripped ${r}`, { s: "idle", rot: r, mid: true }));
  const UPRIGHT = c("launched upright", { s: "idle", rot: -90, mid: true });
  const HEAD_DOWN = c("launched head down", { s: "idle", rot: 90, mid: true });
  const SAD = c("sad", { s: "sitting", fx: [sayAbove("...", FX.grey)] });
  // Intro, wins, taunt.
  const SLEEP = range(3).map((t) => c(`sleep ${t}`, { s: "sleeping", dy: t === 1 ? -1 : 0 }));
  const STRETCH = range(10).map((f) => c(`stretch ${f}`, { s: "stretching", f }));
  const SIT_HEARTS = range(4).map((t) => c(`sit hearts ${t}`, { s: "sitting", fx: [hearts(t)] }));
  const BARK = range(3).map((f) => c(`bark ${f}`, { s: "bark", f }));
  const BARK_WORD = [1, 2].map((f) => c(`bark rings ${f}`, { s: "bark", f, fx: [woof(f - 1)] }));
  // SQUIRREL!: it freezes, a squirrel darts past, it barks at it and gives chase.
  const SQUIRREL = range(12).map((t) => {
    const sx = F + 70 - t * 7;
    const dog = t < 3 ? { s: "idle", f: 0 } : t < 8 ? { s: "bark", f: t % 3 } : { s: "run", f: t % 8 };
    return c(`squirrel ${t}`, { ...dog, fx: [(cv: PackCanvas) => squirrel(cv.img, cv.x + sx, cv.y, t)] });
  });

  // Moves. Boxes are in art pixels from the feet (x forward, y down), including the pose's own move.
  const NIP = [c("nip 0", { s: "run", f: 1 }), c("nip 1", { s: "run", f: 2, dx: 3 }), c("nip 2", { s: "run", f: 3, dx: 6, fx: [chomp] }), c("nip 3", { s: "run", f: 4, dx: 4 }), STAND[0]!];
  const HEADBUTT = [
    c("headbutt 0", { s: "idle", dx: -2, rot: 6, mid: true }),
    c("headbutt 1", { s: "run", f: 5, dx: 4, rot: -6, mid: true }),
    c("headbutt 2", { s: "run", f: 5, dx: 9, rot: -10, mid: true, fx: [hit(F + 12, H * 0.6)] }),
    c("headbutt 3", { s: "run", f: 5, dx: 6, mid: true }),
    STAND[0]!,
  ];
  const TAIL_WHIP = [
    STAND[0]!,
    c("tail whip 1", { s: "idle", flip: true }),
    c("tail whip 2", { s: "idle", f: 3, flip: true, rot: -12, mid: true, fx: [swish(0)] }),
    c("tail whip 3", { s: "idle", f: 5, flip: true, rot: 10, mid: true, fx: [swish(3)] }),
    c("tail whip 4", { s: "idle", flip: true }),
    STAND[0]!,
  ];
  const BIG_BARK = [BARK[0]!, BARK_WORD[0]!, BARK_WORD[1]!, c("bark rings 3", { s: "bark", f: 1, fx: [woof(2)] }), STAND[0]!];
  const LOW_NIP = [CROUCH[0]!, c("low nip 1", { s: "lying-down", f: 4, dx: 3, fx: [lowChomp] }), c("low nip 2", { s: "lying-down", f: 4, dx: 1 }), CROUCH[0]!];
  const LICK = [c("lick 0", { s: "licking1" }), c("lick 1", { s: "licking1", f: 1, fx: [tongue(6)] }), c("lick 2", { s: "licking1", f: 2, fx: [tongue(10), hearts(0, 1)] }), c("lick 3", { s: "licking1", f: 3, fx: [tongue(6)] }), c("lick 0", { s: "licking1" })];
  const FLEA_KICK = [c("flea kick 0", { s: "itching" }), c("flea kick 1", { s: "itching", f: 1, fx: [dustUnder, fleas(1)] }), c("flea kick 2", { s: "itching", fx: [fleas(2)] }), c("flea kick 3", { s: "itching", f: 1, fx: [dustUnder, fleas(3)] }), CROUCH[0]!];
  const SLIDE = [0, 4, 8, 8, 6, 3].map((dx, i) => c(`belly slide ${i}`, { s: "lying-down", f: i < 1 ? 5 : 6, dx, fx: i >= 1 && i <= 3 ? [dustBehind(10)] : [] }));
  const AIR_NIP = [c("air nip 0", { s: "run", f: 2, rot: -15, mid: true }), c("air nip 1", { s: "run", f: 3, rot: -20, mid: true, fx: [chomp] }), c("air nip 2", { s: "run", f: 3, rot: -20, mid: true }), c("air nip 3", { s: "run", f: 4, rot: -10, mid: true })];
  const FLOP = [c("flop 0", { s: "lying-down", f: 6, rot: -10, mid: true }), c("flop 1", { s: "lying-down", f: 6, fx: [dustUnder, hit(0, -2, 5)] }), c("flop 2", { s: "lying-down", f: 6 })];
  const ZOOMIES = range(12).map((i) => c(`zoomies ${i % 8}`, { s: "run", f: i % 8, fx: [speed(), dustBehind(12)] }));
  const PLAY_BOW = [
    ...[0, 2, 3, 4, 4].map((f, i) => c(`bow ${i}`, { s: "stretching", f })),
    c("leap 0", { s: "run", f: 2, rot: -40, dy: -6, mid: true, fx: [hit(F, H * 1.1, 5)] }),
    c("leap 1", { s: "run", f: 3, rot: -55, dy: -16, mid: true, fx: [hit(F - 2, H * 1.6, 6)] }),
    c("leap 2", { s: "run", f: 4, rot: -30, dy: -22, mid: true }),
    c("leap 3", { s: "run", f: 5, rot: -8, dy: -14, mid: true }),
    c("leap 4", { s: "idle", dy: -4 }),
    STAND[0]!,
  ];
  const CHASE = range(10).map((i) => c(`tail chase ${i}`, { s: "idle", f: i % 10, flip: i % 2 === 1, rot: i % 2 ? 8 : -8, mid: true, fx: i >= 2 && i <= 8 ? [swish(i % 3, true)] : [] }));

  const striker = { ...b.base };
  /** One of the base's moves on the dog's cells; its forward steps land on the same share of the dog's frames. */
  const move = (state: number, name: string, cells: number[], ticks: number[], frames: number[], box: Box, extra: Parameters<typeof redrawMove>[6] = {}): AttackSpec => {
    const base = striker.attacks.find((x) => x.state === state);
    const len = base ? cellList(base.anim.cells).length : cells.length;
    const moves = base?.moves?.map((m) => ({ ...m, frame: Math.min(cells.length - 1, Math.round((m.frame * cells.length) / len)) }));
    return redrawMove(striker, state, name, cells, ticks, frames, { ...(moves ? { moves } : {}), ...extra, hit: { ...extra.hit, box } });
  };
  const bx = (x0: number, y0: number, x1: number, y1: number) => kit.box(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));

  const attacks: AttackSpec[] = [
    move(200, "Nip", NIP, [2, 2, 3, 3, 3], [2], bx(F + 3, -H, F + 14, -H * 0.3), { hit: { hitSound: SOUNDS.squeak } }),
    move(210, "Headbutt", HEADBUTT, [3, 2, 4, 4, 3], [2], bx(F + 4, -H * 1.05, F + 16, -H * 0.25)),
    move(230, "Tail Whip", TAIL_WHIP, [2, 2, 3, 3, 3, 3], [2, 3], bx(2, -H * 0.95, B + 12, -H * 0.2)),
    move(240, `Big Bark: ${word}`, BIG_BARK, [3, 3, 4, 4, 4], [1, 2], bx(F + 1, -H * 1.15, F + 28, -H * 0.15)),
    move(400, "Low Nip", LOW_NIP, [2, 3, 3, 3], [1], bx(F + 2, -H * 0.6, F + 12, 0), { hit: { hitSound: SOUNDS.squeak } }),
    move(410, "Big Lick", LICK, [3, 3, 4, 4, 3], [2], bx(F, -H * 0.85, F + 14, -H * 0.35)),
    move(430, "Flea Kick", FLEA_KICK, [2, 3, 3, 3, 3], [1, 2, 3], bx(F - 6, -H * 0.5, F + 8, 0)),
    move(440, "Belly Slide", SLIDE, [3, 3, 3, 4, 5, 5], [2, 3], bx(F + 2, -H * 0.45, F + 16, 0)),
    move(600, "Air Nip", AIR_NIP, [3, 4, 5, 5], [1, 2], bx(F - 2, -H * 0.95, F + 12, -H * 0.1), { anchor: "feet", hit: { hitSound: SOUNDS.squeak } }),
    move(630, "Belly Flop", FLOP, [3, 3, 8], [1, 2], bx(-B, -H * 0.5, F + 4, H * 0.15), { anchor: "feet" }),
    ...specials(),
    b.id === "gi-good-boy" ? tennisBall() : poopBomb(),
    stinkCloud(),
  ];

  /** Turns its back, squats, and kicks what it left at the opponent: it slides along the ground (a low hit: jump it). */
  function poopBomb(): AttackSpec {
    const behind = (cv: PackCanvas) => ({ x: cv.x + cv.body.back + 4, y: cv.y });
    const cells = [
      c("poop 0", { s: "idle", flip: true }),
      c("poop 1", { s: "sitting", flip: true, sy: 0.92 }),
      c("poop 2", { s: "sitting", flip: true, sy: 0.88, fx: [(cv) => (poop(cv.img, behind(cv).x, behind(cv).y), stink(cv.img, behind(cv).x, behind(cv).y - 11, 0))] }),
      c("poop 3", { s: "sitting", flip: true, sy: 0.92, fx: [(cv) => (poop(cv.img, behind(cv).x, behind(cv).y), stink(cv.img, behind(cv).x, behind(cv).y - 11, 2))] }),
      c("poop 4", { s: "itching", f: 1, flip: true, fx: [dustUnder] }),
      c("poop 5", { s: "idle", flip: true }),
      STAND[0]!,
    ];
    return {
      state: 1400, name: "Poop Bomb", from: "stand", command: "QCB_x", special: true,
      anim: { action: 1400, cells, ticks: [3, 4, 5, 8, 4, 4, 4] },
      hits: [{ frames: [4], damage: 50, chip: 8, height: "low", weight: "medium", hitStun: 20, blockStun: 12, push: 4, hitSound: SOUNDS.splat }],
      projectile: { frame: 4, speed: 3.5, height: units(5), offset: units(B + 4), art: poopArt },
      ai: { range: 320, weight: 0.7 },
    };
  }

  /** Good Boy fetches for you: a squeaky tennis ball, flung. */
  function tennisBall(): AttackSpec {
    const inMouth = (cv: PackCanvas) => ball(cv.img, mouth(cv).x + 2, mouth(cv).y + 1, 0);
    const cells = [
      c("ball 0", { s: "bark", f: 0, fx: [inMouth] }),
      c("ball 1", { s: "bark", f: 0, rot: 14, mid: true, fx: [inMouth] }),
      c("ball 2", { s: "bark", f: 2, rot: -18, mid: true }),
      c("ball 3", { s: "bark", f: 1, rot: -8, mid: true }),
      STAND[0]!,
    ];
    return {
      state: 1400, name: "Tennis Ball", from: "stand", command: "QCB_x", special: true,
      anim: { action: 1400, cells, ticks: [4, 5, 4, 5, 4] },
      hits: [{ frames: [2], damage: 44, chip: 6, height: "high", weight: "light", hitStun: 16, blockStun: 12, push: 4, hitSound: SOUNDS.squeak }],
      projectile: { frame: 2, speed: 5.5, height: units(H * 0.8), offset: units(F + 2), art: ballArt },
      ai: { range: 340, weight: 0.8 },
    };
  }

  /** Turns its rear, tail up: a green cloud. */
  function stinkCloud(): AttackSpec {
    const gas = (r: number, seed: number) => (cv: PackCanvas) => cloud(cv.img, cv.x + cv.body.back + 4 + r * 0.6, cv.y - Math.round(cv.body.height * 0.55), r, seed);
    const cells = [
      c("stink 0", { s: "idle", flip: true }),
      c("stink 1", { s: "idle", f: 2, flip: true, rot: 6, mid: true }),
      c("stink 2", { s: "idle", f: 4, flip: true, rot: 8, mid: true, fx: [gas(8, 1)] }),
      c("stink 3", { s: "idle", f: 4, flip: true, rot: 8, mid: true, fx: [gas(14, 2)] }),
      c("stink 4", { s: "idle", f: 6, flip: true, rot: 6, mid: true, fx: [gas(19, 3)] }),
      c("stink 5", { s: "idle", f: 8, flip: true, fx: [gas(22, 4)] }),
      c("stink 6", { s: "idle", flip: true }),
      STAND[0]!,
    ];
    return {
      state: 1500, name: "Silent but Deadly", from: "stand", command: "QCF_a", special: true,
      anim: { action: 1500, cells, ticks: [3, 4, 4, 4, 5, 6, 4, 4] },
      hits: [{ frames: [3, 4, 5], damage: 55, chip: 10, height: "mid", weight: "medium", hitStun: 26, blockStun: 14, push: 6, box: bx(B - 2, -H * 1.3, B + 28, 0) }],
      ai: { range: 50, weight: 0.5 },
    };
  }

  function specials(): AttackSpec[] {
    const zoomies = (name: string, snow: boolean) =>
      move(1000, name, snow ? range(12).map((i) => c(`avalanche ${i % 8}`, { s: "run", f: i % 8, fx: [speed(true), dustBehind(14, true), barrel] })) : ZOOMIES, Array(12).fill(2), [3, 4, 5, 6], bx(F - 4, -H, F + 8, 0));
    const playBow = () => move(1100, "Play Bow Leap", PLAY_BOW, [2, 2, 2, 2, 2, 3, 4, 5, 4, 3, 3], [5, 6, 7], bx(F - 6, -H * 2.3, F + 10, -H * 0.3));
    const chase = () => move(1200, "Tail Chase", CHASE, Array(10).fill(2), [3, 4, 5, 6, 7], bx(-B - 6, -H, F + 6, 0));
    switch (b.base.archetype) {
      case "GRAPPLER": {
        const flop = [
          c("big flop 0", { s: "run", f: 2, rot: -25, dy: -8, mid: true }),
          c("big flop 1", { s: "run", f: 3, rot: -15, dy: -20, mid: true }),
          c("big flop 2", { s: "lying-down", f: 6, dy: -16 }),
          c("big flop 3", { s: "lying-down", f: 6, dy: -4 }),
          c("big flop 4", { s: "lying-down", f: 6, fx: [hit(0, -2, 8), dustUnder] }),
          c("big flop 5", { s: "lying-down", f: 6 }),
          CROUCH[1]!,
          STAND[0]!,
        ];
        return [zoomies("Avalanche Rescue", true), move(1100, "Belly Flop Supreme", flop, [3, 3, 4, 2, 6, 6, 5, 4], [3, 4], bx(-B - 2, -H * 0.8, F + 6, H * 0.15))];
      }
      case "HEAVY": {
        const sit = [
          c("big sit 0", { s: "run", f: 2, rot: -20, dy: -12, mid: true }),
          c("big sit 1", { s: "run", f: 3, rot: -10, dy: -24, mid: true }),
          c("big sit 2", { s: "sitting", dy: -18 }),
          c("big sit 3", { s: "sitting", dy: -6 }),
          c("big sit 4", { s: "sitting", fx: [hit(F - 4, -1, 9), dustUnder] }),
          c("big sit 5", { s: "sitting" }),
          STAND[0]!,
        ];
        return [zoomies("Zoomies", false), playBow(), move(1200, "Big Sit", sit, [3, 3, 3, 2, 6, 6, 4], [3, 4], bx(-B, -H * 0.9, F + 10, H * 0.1))];
      }
      case "ZONER":
        return [howl(), playBow(), chase()];
      default:
        return [zoomies("Zoomies", false), playBow(), chase()];
    }
  }

  /** The howl (the Sage's energy palm): head up, then the word flies. */
  function howl(): AttackSpec {
    const cells = [BARK[0]!, c("howl 1", { s: "bark", f: 1, rot: -18, mid: true }), c("howl 2", { s: "bark", f: 2, rot: -22, mid: true, fx: [woof(1)] }), c("howl 3", { s: "bark", f: 1, rot: -18, mid: true }), STAND[0]!];
    const base = ZONER.attacks.find((x) => x.state === 1000)!;
    return { ...move(1000, "Awooo", cells, [3, 4, 6, 5, 4], [2], bx(F, -H, F + 4, -H * 0.5)), projectile: { ...base.projectile!, frame: 2, height: units(H * 0.75), offset: units(F), art: howlArt() } };
  }

  // Throws (the grappler): a chew-toy shake up close, and fetch from a run.
  const throws: ThrowSpec[] | undefined = b.base.throws
    ? (() => {
        const front = Math.round(((F + 6) * SCALE * 320) / b.localcoord);
        const shake = range(6).map((i) => c(`shake ${i}`, { s: "bark", f: i % 3, rot: i % 2 ? 8 : -8, mid: true }));
        const chewToy: ThrowSpec = {
          ...b.base.throws!.find((t) => t.state === 800)!,
          name: "Chew Toy",
          box: bx(F, -H, F + 10, 0),
          reach: { action: 800, cells: [BARK[0]!, c("grab 1", { s: "bark", f: 1, dx: 3, fx: [chomp] }), c("grab 2", { s: "bark", f: 1, dx: 4, fx: [chomp] })], ticks: [2, 3, 6] },
          hold: [...shake.map((cell) => ({ cell, ticks: 4, victim: [front, 0] as const })), { cell: BARK_WORD[0]!, ticks: 5, victim: [front + 10, 0] as const }, { cell: STAND[0]!, ticks: 6, victim: [front + 20, 0] as const }],
          release: { frame: 6, x: 3, y: 2 },
        };
        const drag = range(6).map((i) => c(`drag ${i}`, { s: "run", f: i, flip: true, dx: -i, fx: [dustUnder] }));
        const fetch: ThrowSpec = {
          ...b.base.throws!.find((t) => t.state === 1300)!,
          name: "Fetch!",
          box: bx(F - 2, -H, F + 10, 0),
          reach: { action: 1300, cells: [...RUN.slice(0, 5), c("fetch bite", { s: "run", f: 5, fx: [chomp] }), RUN[6]!, RUN[7]!], ticks: [2, 2, 3, 3, 3, 4, 5, 6] },
          hold: [...drag.map((cell) => ({ cell, ticks: 4, victim: [front, 0] as const })), { cell: BARK_WORD[1]!, ticks: 8, victim: [front, 0] as const }],
          release: { frame: 6, x: -3, y: 3 },
        };
        return [chewToy, fetch];
      })()
    : undefined;

  const art = kit.source({
    "5000,0": HIT_HIGH[0]!, "5000,10": HIT_HIGH[1]!, "5000,20": HIT_HIGH[2]!,
    "5010,0": HIT_LOW[0]!, "5010,10": HIT_LOW[1]!, "5010,20": HIT_LOW[2]!,
    "5020,0": CROUCH_HIT[0]!, "5020,10": CROUCH_HIT[0]!, "5020,20": CROUCH_HIT[1]!,
    "5030,0": { cell: HIT_HIGH[2]!, anchor: "feet" }, "5030,10": { cell: TUMBLE[2]!, anchor: "feet" }, "5030,20": { cell: TUMBLE[3]!, anchor: "feet" },
    "5030,30": { cell: TUMBLE[3]!, anchor: "feet" }, "5030,40": { cell: TUMBLE[3]!, anchor: "feet" }, "5030,50": { cell: TUMBLE[5]!, anchor: "feet" },
    "5040,0": LYING, "5040,10": LYING, "5040,20": LYING_HIT,
    "5060,0": { cell: UPRIGHT, anchor: "feet" }, "5060,10": { cell: HEAD_DOWN, anchor: "feet" },
    "5070,0": { cell: TRIPPED[0]!, anchor: "feet" }, "5070,10": { cell: TRIPPED[1]!, anchor: "feet" }, "5070,20": { cell: TRIPPED[2]!, anchor: "feet" },
  });
  /** Word `n` of `wordArt`'s list, readable, above the dog (x art pixels in front of its feet) for `ticks`. */
  const say = (n: number, x: number, ticks: number) => ({ anim: WORD_ANIM + n, x: units(x), y: units(H + 6), readable: true, ticks });

  return {
    ...b.base,
    art,
    id: b.id,
    name: b.name,
    constants: { ...b.base.constants, width: [Math.max(10, units(F * 0.8)), Math.max(10, units(B * 0.8))], height: Math.max(24, units(H)) },
    anims: [
      a(0, STAND, 5, "stand: tail wagging"),
      a(5, [STAND[0]!], 3, "turn"),
      a(6, [CROUCH[1]!], 3, "crouch turn"),
      a(10, CROUCH, 2, "stand to crouch: lies low"),
      a(11, [CROUCH[1]!], 8, "crouching"),
      a(12, [CROUCH[0]!, STAND[0]!], 2, "crouch to stand"),
      a(20, WALK, 4, "walk forward"),
      a(21, [...WALK].reverse(), 4, "walk back"),
      a(40, [JUMP_START], 3, "jump start"),
      air(41, [...JUMP_UP, ...JUMP_DOWN], [4, 4, 6, 6, 8], "jump up"),
      air(42, FLIP, 3, "jump forward: a flip"),
      air(43, [...FLIP].reverse(), 3, "jump back: a flip"),
      a(47, [LAND], 3, "jump land"),
      a(100, RUN, 3, "run"),
      air(105, [JUMP_UP[0]!, JUMP_UP[1]!], 6, "hop back"),
      a(120, [GUARD], 2, "guard start: braces"),
      a(121, [CROUCH_GUARD], 2, "crouch guard start"),
      air(122, [JUMP_UP[2]!], 2, "air guard start"),
      a(130, [GUARD], 10, "stand guard"),
      a(131, [CROUCH_GUARD], 10, "crouch guard"),
      air(132, [JUMP_UP[2]!], 10, "air guard"),
      a(140, [GUARD], 2, "guard end"),
      a(141, [CROUCH_GUARD], 2, "crouch guard end"),
      air(142, [JUMP_UP[2]!], 2, "air guard end"),
      a(150, [GUARD_HIT, GUARD], 3, "stand guard hit"),
      a(151, [CROUCH_GUARD], 6, "crouch guard hit"),
      air(152, [JUMP_UP[2]!], 6, "air guard hit"),
      a(170, [SAD], 6, "lose (time over): sits, sad", { loop: false }),
      a(175, [SAD], 6, "draw (time over)", { loop: false }),
      a(5000, [HIT_HIGH[0]!, HIT_HIGH[1]!], 3, "hit high, light"),
      a(5001, HIT_HIGH, 3, "hit high, medium"),
      a(5002, [HIT_HIGH[1]!, HIT_HIGH[2]!, HIT_HIGH[2]!], 3, "hit high, hard"),
      a(5005, [HIT_HIGH[1]!, HIT_HIGH[0]!], 3, "recover high, light"),
      a(5006, [HIT_HIGH[2]!, HIT_HIGH[1]!, HIT_HIGH[0]!], 3, "recover high, medium"),
      a(5007, [HIT_HIGH[2]!, HIT_HIGH[2]!, HIT_HIGH[1]!, HIT_HIGH[0]!], 3, "recover high, hard"),
      a(5010, [HIT_LOW[0]!, HIT_LOW[1]!], 3, "hit low, light"),
      a(5011, HIT_LOW, 3, "hit low, medium"),
      a(5012, [HIT_LOW[1]!, HIT_LOW[2]!, HIT_LOW[2]!], 3, "hit low, hard"),
      a(5015, [HIT_LOW[1]!, HIT_LOW[0]!], 3, "recover low, light"),
      a(5016, [HIT_LOW[2]!, HIT_LOW[1]!, HIT_LOW[0]!], 3, "recover low, medium"),
      a(5017, [HIT_LOW[2]!, HIT_LOW[2]!, HIT_LOW[1]!, HIT_LOW[0]!], 3, "recover low, hard"),
      a(5020, [CROUCH_HIT[0]!], 6, "crouching hit, light"),
      a(5021, [CROUCH_HIT[0]!], 8, "crouching hit, medium"),
      a(5022, [CROUCH_HIT[1]!], 10, "crouching hit, hard"),
      a(5025, [CROUCH_HIT[0]!], 3, "crouching recover, light"),
      a(5026, [CROUCH_HIT[0]!], 4, "crouching recover, medium"),
      a(5027, [CROUCH_HIT[1]!, CROUCH_HIT[0]!], 3, "crouching recover, hard"),
      air(5030, [HIT_HIGH[2]!], 4, "hit in the air"),
      air(5035, [HIT_HIGH[2]!], 3, "air hit transition"),
      air(5040, [TUMBLE[1]!, TUMBLE[0]!, STAND[0]!], 4, "air recover"),
      air(5050, [TUMBLE[0]!, TUMBLE[1]!], 5, "falling"),
      air(5060, [TUMBLE[2]!, TUMBLE[3]!], 5, "falling, coming down"),
      a(5070, [TRIPPED[0]!, TRIPPED[1]!], 4, "tripped"),
      a(5080, [LYING_HIT], 4, "hit while down"),
      air(5090, [TUMBLE[3]!], 4, "hit up while down"),
      air(5100, [TUMBLE[3]!, LYING], 3, "hit the ground"),
      air(5101, [TUMBLE[2]!], 4, "bounce"),
      a(5110, [LYING], 30, "lying down: paws up"),
      a(5120, GET_UP, 4, "getting up: rolls back over"),
      a(5140, [LYING], 30, "lying defeated", { loop: false }),
      a(5150, [LYING], 30, "lying defeated (match over)", { loop: false }),
      air(5160, [TUMBLE[2]!], 4, "bounce into the air"),
      air(5170, [TUMBLE[3]!, LYING], 4, "hit the ground after a bounce"),
      air(5200, [TUMBLE[0]!, STAND[0]!], 3, "fall recovery near the ground"),
      air(5210, [TUMBLE[1]!, TUMBLE[0]!, STAND[0]!, STAND[1]!], 3, "fall recovery in the air"),
      a(180, SIT_HEARTS, [8, 8, 8, 60], "win: sits pretty in hearts (GOOD BOY!)", { loop: false }),
      a(181, [BARK[0]!, BARK_WORD[0]!, BARK_WORD[1]!, BARK[0]!, BARK_WORD[0]!, BARK_WORD[1]!, SIT_HEARTS[3]!], [4, 4, 4, 4, 4, 4, 60], "win: barks and barks", { loop: false }),
      a(190, [...SLEEP, ...STRETCH, STAND[0]!], [12, 12, 12, ...Array(10).fill(4), 10], "intro: wakes up and stretches"),
      a(195, SQUIRREL, 4, "taunt: SQUIRREL!"),
    ],
    attacks,
    ...(throws ? { throws } : {}),
    sounds: () => dogSounds(b.pitch),
    gags: ["explosion"],
    effectArt: () => wordArt([word, "GRR!", "SIT!", "GOOD BOY!", "Z Z Z", "SQUIRREL!", "PFFT", "SPLAT!"]),
    cues: [
      { action: 240, frame: 1, sound: SOUNDS.bark, effect: say(0, F, 14) },
      { action: 410, frame: 2, sound: SOUNDS.slurp },
      { action: 630, frame: 1, sound: SOUNDS.thud },
      b.base.archetype === "ZONER" ? { action: 1000, frame: 1, sound: SOUNDS.howl, effect: say(0, F, 24) } : { action: 1000, frame: 0, sound: SOUNDS.yip },
      { action: 1100, frame: 5, sound: SOUNDS.yip },
      ...(b.base.archetype === "GRAPPLER" ? [{ action: 1100, frame: 4, sound: SOUNDS.thud }, { action: 810, frame: 1, sound: SOUNDS.growl, effect: say(1, F, 24) }] : []),
      ...(b.base.archetype === "HEAVY" ? [{ action: 1200, frame: 4, sound: SOUNDS.thud, effect: say(2, 0, 30) }] : b.base.archetype === "GRAPPLER" ? [] : [{ action: 1200, frame: 0, sound: SOUNDS.growl }]),
      { action: 180, frame: 1, sound: SOUNDS.bark },
      { action: 180, frame: 2, effect: say(3, 0, 70) },
      { action: 181, frame: 1, sound: SOUNDS.bark, effect: say(0, F, 10) },
      { action: 181, frame: 4, sound: SOUNDS.bark, effect: say(0, F, 10) },
      { action: 190, frame: 0, effect: say(4, F, 36) },
      { action: 190, frame: 3, sound: SOUNDS.yip },
      { action: 170, frame: 0, sound: SOUNDS.whimper },
      { action: 195, frame: 0, effect: say(5, F + 4, 24) },
      { action: 195, frame: 3, sound: SOUNDS.bark },
      { action: 1400, frame: 4, sound: b.id === "gi-good-boy" ? SOUNDS.squeak : SOUNDS.splat },
      { action: 1500, frame: 2, sound: SOUNDS.fart, effect: say(6, -B - 8, 18) },
    ] satisfies Cue[],
    colors: {},
    palettes: b.outfits,
    portrait: { cell: STAND[0]! },
  };
}

// ----- The howl that flies -----

/** A music note (6 x 8 pixels), its head's middle at (x, y). */
function note(img: IndexedImage, x: number, y: number, color: number) {
  disc(img, x, y, 1.6, color);
  for (let t = 0; t < 7; t++) put(img, x + 2, y - t, color);
  put(img, x + 3, y - 6, color), put(img, x + 4, y - 5, color), put(img, x + 4, y - 4, color);
}

/** The howl that flies: rings and music notes (no letters: a projectile mirrors when fired left); it pops when it hits. */
export function howlArt() {
  return (state: number): ProjectileArt => {
    const base = state + 50;
    const sprites: SffSprite[] = [];
    const W = 34, Hh = 26;
    const add = (draw: (img: IndexedImage) => void) => {
      const img: IndexedImage = { width: W, height: Hh, pixels: new Uint8Array(W * Hh) };
      draw(img);
      sprites.push({ group: base, number: sprites.length, image: scaleUp(img), axisX: Math.round((W / 2) * SCALE), axisY: Math.round((Hh / 2) * SCALE), palette: 0 });
      return sprites.length - 1;
    };
    const fly = [0, 1, 2].map((k) =>
      add((img) => {
        arcs(img, 4, Hh / 2, 6 + k * 2, 3, 4, k % 2 ? FX.sky : FX.white, 100);
        note(img, 20, 12 + (k === 1 ? -2 : 0), FX.white);
        note(img, 27, 17 + (k === 2 ? -2 : 0), FX.sky);
      }),
    );
    const pop = [0, 1, 2].map((k) =>
      add((img) => {
        for (let i = 0; i < 8; i++) {
          const t = (i / 8) * 2 * Math.PI;
          disc(img, W / 2 + Math.cos(t) * (4 + k * 4), Hh / 2 + Math.sin(t) * (3 + k * 3), 1.5, k === 2 ? FX.grey : FX.sky);
        }
        if (k === 0) star(img, W / 2, Hh / 2, 7, FX.white, FX.yellow);
      }),
    );
    const half = Math.round((W / 2 - 2) * SCALE), tall = Math.round(8 * SCALE);
    const box: Box = [-half, -tall, half, tall];
    const actions: AirAction[] = [
      { action: base, comment: "the howl flies", frames: fly.map((n) => ({ group: base, number: n, ticks: 4, clsn1: [box], clsn2: [box] })) },
      { action: base + 1, comment: "the howl pops", frames: pop.map((n) => ({ group: base, number: n, ticks: 3 })) },
      { action: base + 2, comment: "the howl fades", frames: pop.slice(1).map((n) => ({ group: base, number: n, ticks: 3 })) },
    ];
    return { sprites, actions };
  };
}

/** A projectile's three animations from drawn frames: flying (with one box), hitting and fading. */
function projectile(state: number, fly: ((img: IndexedImage) => void)[], hitFrames: ((img: IndexedImage) => void)[], size: { w: number; h: number; box: Box }): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const add = (draw: (img: IndexedImage) => void) => {
    const img: IndexedImage = { width: size.w, height: size.h, pixels: new Uint8Array(size.w * size.h) };
    draw(img);
    sprites.push({ group: base, number: sprites.length, image: scaleUp(img), axisX: Math.round((size.w / 2) * SCALE), axisY: Math.round((size.h / 2) * SCALE), palette: 0 });
    return sprites.length - 1;
  };
  const f = fly.map(add), h = hitFrames.map(add);
  const box = size.box.map((v) => v * SCALE) as unknown as Box;
  const actions: AirAction[] = [
    { action: base, comment: "flying", frames: f.map((n) => ({ group: base, number: n, ticks: 3, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "hits", frames: h.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "fades", frames: h.slice(-2).map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

/** The poop, sliding: a little bob, stink and a fly; it splats brown when it hits. */
export function poopArt(state: number): ProjectileArt {
  const W = 30, H = 24;
  const fly = [0, 1, 2, 3].map((t) => (img: IndexedImage) => {
    poop(img, 15, 20 - (t % 2));
    stink(img, 15, 9 - (t % 2), t);
    dust(img, 8, 2, 21, FX.dust, t + 1);
  });
  const splat = [0, 1, 2].map((k) => (img: IndexedImage) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * 2 * Math.PI;
      disc(img, 15 + Math.cos(a) * (3 + k * 4), 14 + Math.sin(a) * (2 + k * 3), k === 2 ? 1 : 1.8, i % 3 ? FX.poop : FX.poopDark);
    }
    if (k < 2) cloud(img, 15, 12, 6 + k * 4, k + 5);
  });
  return projectile(state, fly, splat, { w: W, h: H, box: [-7, -4, 7, 8] });
}

/** The tennis ball, bouncing as it flies; it pops a star when it hits. */
export function ballArt(state: number): ProjectileArt {
  const W = 20, H = 20;
  const fly = [0, 1, 2, 3].map((t) => (img: IndexedImage) => ball(img, 10, 10 - [0, 3, 4, 3][t]!, t));
  const pop = [0, 1, 2].map((k) => (img: IndexedImage) => {
    if (k < 2) star(img, 10, 10, 5 + k * 2, FX.yellow, FX.white);
    ball(img, 10 - k * 2, 10 + k * 2, k);
  });
  return projectile(state, fly, pop, { w: W, h: H, box: [-4, -6, 4, 4] });
}

const scaleUp = (img: IndexedImage): IndexedImage => {
  const out: IndexedImage = { width: img.width * SCALE, height: img.height * SCALE, pixels: new Uint8Array(img.width * img.height * SCALE * SCALE) };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.pixels[y * out.width + x] = img.pixels[Math.floor(y / SCALE) * img.width + Math.floor(x / SCALE)]!;
  return out;
};

// ----- Words -----

/** Effect animations: each word in outlined letters, its bottom middle on the axis (played with `readable`, so never mirrored). */
export const WORD_ANIM = 7100;
export function wordArt(words: readonly string[]): { sprites: SffSprite[]; actions: AirAction[] } {
  const sprites: SffSprite[] = [];
  const actions: AirAction[] = [];
  words.forEach((w, n) => {
    const tw = shoutWidth(w);
    const img: IndexedImage = { width: tw + 4, height: 11, pixels: new Uint8Array((tw + 4) * 11) };
    shout(img, w, 2, 2, n === 3 ? FX.yellow : n === 4 ? FX.blue : FX.white, FX.ink);
    const big = scaleUp(img);
    sprites.push({ group: WORD_ANIM + n, number: 0, image: big, axisX: Math.round(big.width / 2), axisY: big.height, palette: 0 });
    actions.push({ action: WORD_ANIM + n, comment: `says ${w}`, frames: [{ group: WORD_ANIM + n, number: 0, ticks: -1 }] });
  });
  return { sprites, actions };
}

// ----- Sounds -----

/** Barks, a yip, a growl, a howl, a slurp, a whimper and a thud, made in code: `pitch` 1 is a retriever's voice. */
export function dogSounds(pitch: number): SndSound[] {
  const rate = 22050;
  const noise = seeded(17);
  const rough = (p: number) => 0.55 * WAVES.saw(p) + 0.3 * WAVES.square(p) + 0.15 * noise();
  const bark = (len: number) =>
    mix(
      synth(len, (t) => (560 - 320 * (t / len)) * pitch, (t) => Math.min(1, t * 60) * Math.exp((-t * 9) / len / 4) * (1 - t / len) * 0.9, rough, rate),
      synth(0.05, () => 0, (t) => (1 - t / 0.05) * 0.5, () => noise(), rate),
    );
  const growl = synth(0.7, () => 85 * pitch, (t) => Math.min(1, t * 8) * (1 - t / 0.7) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 26 * t)), rough, rate);
  const howl = synth(1.4, (t) => (360 + 300 * Math.sin(Math.min(1, t / 0.9) * Math.PI * 0.6) - (t > 1 ? 120 * (t - 1) : 0)) * pitch + 9 * Math.sin(2 * Math.PI * 6 * t), (t) => Math.min(1, t * 4) * Math.min(1, (1.4 - t) * 3) * 0.7, (p) => 0.8 * WAVES.sine(p) + 0.2 * WAVES.saw(p), rate);
  const slurp = synth(0.35, () => 0, (t) => Math.min(1, t * 20) * (1 - t / 0.35) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 14 * t)) * 0.6, () => noise() * 0.7 + 0.3 * Math.sin(noise() * 3), rate);
  const whimper = synth(0.5, (t) => (950 - 400 * (t / 0.5)) * pitch, (t) => Math.min(1, t * 10) * (1 - t / 0.5) * 0.5, WAVES.sine, rate);
  const thud = mix(synth(0.3, (t) => 90 - 50 * (t / 0.3), (t) => Math.exp(-t * 14) * 0.9, WAVES.sine, rate), synth(0.15, () => 0, (t) => (1 - t / 0.15) * 0.35, () => noise(), rate));
  const squeak = synth(0.22, (t) => 1500 + 700 * Math.sin((t / 0.22) * Math.PI) + 60 * Math.sin(2 * Math.PI * 30 * t), (t) => Math.min(1, t * 50) * (1 - t / 0.22) * 0.6, WAVES.square, rate);
  const fart = synth(0.75, (t) => 70 + 25 * Math.sin(2 * Math.PI * 9 * t) - 30 * (t / 0.75), (t) => Math.min(1, t * 15) * (1 - t / 0.75) ** 0.5 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 23 * t)), (p) => 0.6 * WAVES.saw(p) + 0.4 * noise(), rate);
  const splat = mix(synth(0.25, () => 0, (t) => Math.exp(-t * 18) * 0.9, () => noise(), rate), synth(0.2, (t) => 160 - 120 * (t / 0.2), (t) => Math.exp(-t * 20) * 0.6, WAVES.sine, rate));
  const wav = (s: Samples) => writeWav(normalize(s, 0.85));
  return [
    { group: SOUNDS.squeak[0], number: SOUNDS.squeak[1], wav: wav(squeak) },
    { group: SOUNDS.fart[0], number: SOUNDS.fart[1], wav: wav(fart) },
    { group: SOUNDS.splat[0], number: SOUNDS.splat[1], wav: wav(splat) },
    { group: SOUNDS.bark[0], number: SOUNDS.bark[1], wav: wav(bark(0.24)) },
    { group: SOUNDS.yip[0], number: SOUNDS.yip[1], wav: wav(bark(0.12)) },
    { group: SOUNDS.growl[0], number: SOUNDS.growl[1], wav: wav(growl) },
    { group: SOUNDS.howl[0], number: SOUNDS.howl[1], wav: wav(howl) },
    { group: SOUNDS.slurp[0], number: SOUNDS.slurp[1], wav: wav(slurp) },
    { group: SOUNDS.whimper[0], number: SOUNDS.whimper[1], wav: wav(whimper) },
    { group: SOUNDS.thud[0], number: SOUNDS.thud[1], wav: wav(thud) },
  ];
}

// ----- The six -----

const fur = (from: number, to: number, minSat = 0.4) => ({ from, to, minSat });
const coat = { from: 0, to: 360, minSat: 0, maxSat: 0.2, lights: [0.25, 0.8] as const };

export const GOOD_BOY = dogFighter({
  id: "gi-good-boy", name: "Good Boy", folder: "Dog-1-Golden-Retriever", prefix: "Golden-Retriever", idle: "idle",
  base: ALL_ROUNDER, localcoord: 528, word: "WOOF!", pitch: 1,
  body: { front: 16, back: 17, height: 22 },
  sha256: "9de8243547bbbd92730c8ed7e583d7574b9f70589d67b0b5f57fbb52abfda608",
  outfits: [
    { name: "Chocolate", colors: {}, shifts: [{ ...fur(20, 40), hue: 22, light: 0.6 }] },
    { name: "Black Lab", colors: {}, shifts: [{ ...fur(20, 40), hue: null, light: 0.32 }] },
    { name: "Cream", colors: {}, shifts: [{ ...fur(20, 40), hue: 40, sat: 0.5, light: 1.5 }] },
  ],
});

export const MUCH_WOW = dogFighter({
  id: "gi-much-wow", name: "Much Wow", folder: "Dog-2-Akita", prefix: "Akita", idle: "Idle",
  base: RUSHDOWN, localcoord: 400, word: "YAP!", pitch: 1.35,
  body: { front: 9, back: 10, height: 15 },
  sha256: "f629f378f377a4f9555f56e39d89f7f9386d4f23b40426c7d197374f0b732a1b",
  outfits: [
    { name: "Black and Tan", colors: {}, shifts: [{ ...fur(20, 38, 0.45), hue: 30, light: 0.35 }] },
    { name: "Red", colors: {}, shifts: [{ ...fur(20, 38, 0.45), hue: 10, sat: 1.3 }] },
    { name: "Snow", colors: {}, shifts: [{ ...fur(20, 38, 0.45), hue: null, light: 1.6 }] },
  ],
});

export const GENTLE_GIANT = dogFighter({
  id: "gi-gentle-giant", name: "Gentle Giant", folder: "Dog-3-Great-Dane", prefix: "Great-Dane", idle: "idle",
  base: HEAVY, localcoord: 528, word: "WOOF!", pitch: 0.7,
  body: { front: 19, back: 20, height: 34 },
  sha256: "e573ef43dd4883db5ea71b645590eb558a96deff3ece2f376193e1dd12320329",
  outfits: [
    { name: "Fawn", colors: {}, shifts: [{ ...coat, hue: 35, tint: 0.45 }] },
    { name: "Blue", colors: {}, shifts: [{ ...coat, hue: 210, tint: 0.25 }] },
    { name: "Black", colors: {}, shifts: [{ ...coat, hue: null, light: 0.4 }] },
  ],
});

export const MISTER_YAPPERS = dogFighter({
  id: "gi-mister-yappers", name: "Mister Yappers", folder: "Dog-4-Schnauzer", prefix: "Schnauzer", idle: "Idle",
  base: RUSHDOWN, localcoord: 528, word: "YAP!", pitch: 1.5,
  body: { front: 13, back: 14, height: 23 },
  sha256: "b63405500043c0cba56cde8f9b4084661a6aa0394aa66d5f22f752714b5132b6",
  outfits: [
    { name: "Black", colors: {}, shifts: [{ ...coat, hue: null, light: 0.5 }] },
    { name: "Ginger", colors: {}, shifts: [{ ...coat, hue: 25, tint: 0.5 }] },
    { name: "Bubblegum", colors: {}, shifts: [{ ...coat, hue: 330, tint: 0.4 }] },
  ],
});

export const BIG_BERNIE = dogFighter({
  id: "gi-big-bernie", name: "Big Bernie", folder: "Dog-5-Saint-Bernard", prefix: "Saint-Bernard", idle: "Idle",
  base: GRAPPLER, localcoord: 528, word: "WOOF!", pitch: 0.65,
  body: { front: 21, back: 22, height: 29 },
  sha256: "4cbcc3af32935e3fe4b433616ee99a674e71d77e9d1f37685c23ab15c4964c22",
  outfits: [
    { name: "Red", colors: {}, shifts: [{ ...fur(10, 25), hue: 4, sat: 1.2 }] },
    { name: "Black", colors: {}, shifts: [{ ...fur(10, 25), hue: null, light: 0.45 }] },
    { name: "Golden", colors: {}, shifts: [{ ...fur(10, 25), hue: 38 }] },
  ],
});

export const AWOO = dogFighter({
  id: "gi-awoo", name: "Awoo", folder: "Dog-6-Siberian-Husky", prefix: "Siberian-Husky", idle: "Idle",
  base: ZONER, localcoord: 528, word: "AWOO", pitch: 0.95,
  body: { front: 16, back: 17, height: 24 },
  sha256: "68ef5c09ebafcbeb966360045ed9b35a9be503ba6ee74545c664ca879001d87b",
  outfits: [
    { name: "Red", colors: {}, shifts: [{ ...coat, hue: 18, tint: 0.5 }] },
    { name: "Agouti", colors: {}, shifts: [{ ...coat, hue: 35, tint: 0.25, light: 0.9 }] },
    { name: "White", colors: {}, shifts: [{ ...coat, hue: null, light: 1.6 }] },
  ],
});

export const DOGS: readonly TemplateSpec[] = [GOOD_BOY, MUCH_WOW, GENTLE_GIANT, MISTER_YAPPERS, BIG_BERNIE, AWOO];
