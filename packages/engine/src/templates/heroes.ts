/**
 * Heroes and monsters from LuizMelo's CC0 combat packs (art/SOURCES.md): knights, a wizard, huntresses, a king,
 * a goblin, a mushroom, a skeleton, a rat, a mimic... Each pack has a handful of strips (idle, run, jump, an attack
 * or two, hurt, death), so `heroFighter` makes every animation a fighter plays from them with the pixel-pack kit
 * (templates/pack-kit.ts): its own attacks as they're drawn, squashed low for crouching moves and tipped up or down
 * for anti-airs and air attacks, its hurt frames turned for falls, its death for lying down and (backwards) for
 * getting up. Specials come from its archetype (a dash slash, a rising slash, a whirlwind, a projectile from the
 * pack's own strip or a sword wave), and each fighter adds its own signature moves and gags (`Hero.more`). Sounds
 * are made in code; sword trails drawn into the strips are effects, so hurtboxes leave them out.
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import { bounds, crop, type IndexedImage } from "../art/sheet.ts";
import type { SndSound } from "../art/snd.ts";
import { mix, normalize, seeded, synth, WAVES, writeWav, type Samples } from "../art/wav.ts";
import { FX_COLORS as DOG_FX_COLORS, FX as DOG_FX } from "./dogs.ts";
import { arcs, disc, dust, PackKit, put, shout, shoutWidth, speedLines, star, type Body, type Effect, type PackArt, type PackCanvas, type PackPose, type StripFiles } from "./pack-kit.ts";
import type { ProjectileArt } from "./projectile.ts";
import { cellList, type AnimSpec, type AttackSpec, type Cue, type HitSpec, type PaletteSpec, type TemplateSpec, type ThrowSpec } from "./spec.ts";
import { redrawMove } from "./universal-prototype-2.ts";

export const LUIZMELO = "art/sources/luizmelo";

/** Art pixels are drawn 3 times bigger in the sheet. */
export const SCALE = 3;

/** Effect colours: the dogs' (stars, words, poop and stink), and the heroes' own from 224. */
export const FX = {
  ...DOG_FX,
  flame: 224, flameLight: 225, flameDark: 226, coin: 227, coinDark: 228, pan: 229, panDark: 230, glint: 231, purple: 232,
  cheese: 233, cheeseDark: 234, steel: 235, mallow: 236, stick: 237, red: 238, green: 239,
} as const;
export const FX_COLORS: Record<number, string> = {
  ...DOG_FX_COLORS,
  [FX.flame]: "#ff8a1f", [FX.flameLight]: "#ffe14a", [FX.flameDark]: "#c8360c", [FX.coin]: "#ffd23a", [FX.coinDark]: "#b8860b", [FX.pan]: "#3a3a40",
  [FX.panDark]: "#1c1c20", [FX.glint]: "#cfefff", [FX.purple]: "#b46cff", [FX.cheese]: "#ffd35a", [FX.cheeseDark]: "#d9a521", [FX.steel]: "#b9c3cc",
  [FX.mallow]: "#fff6e8", [FX.stick]: "#8a5a2b", [FX.red]: "#e8333a", [FX.green]: "#7fd14b",
};

/** Sound numbers (heroSounds makes them). */
export const SOUNDS = {
  swish: [1, 0], swishBig: [1, 1], shing: [2, 0], clang: [3, 0], thud: [4, 0], whoosh: [5, 0], boom: [6, 0], bonk: [7, 0],
  twang: [8, 0], fire: [9, 0], coin: [10, 0], zap: [11, 0], squeak: [12, 0], splat: [13, 0], chomp: [14, 0], fart: [15, 0],
} as const;

export interface HeroAttack {
  /** The strip, the frames it plays (default all), and which of those (indices into them) hit. */
  strip: string;
  frames?: readonly number[];
  hits: readonly number[];
  /** Start from the first idle frame (for a strip whose first frame already reaches out, like a flame). */
  lead?: boolean;
  /** A hand-made hitbox (art pixels from the feet: forward, up negative) where too little reaches out to find one (an arrow on a bow). */
  box?: readonly [number, number, number, number];
}

export interface Hero {
  id: string;
  name: string;
  base: TemplateSpec;
  localcoord: number;
  pack: { name: string; url: string };
  /** Strip name → [file under `root` (or a file per frame), frame count]. */
  strips: Readonly<Record<string, readonly [StripFiles, number]>>;
  /** The folder the strip files are under (default art/sources/luizmelo). */
  root?: string;
  /** The art credit, when the pack isn't LuizMelo's. */
  credit?: string;
  /** The pack's art faces left (it's mirrored to face right, like every other). */
  mirror?: boolean;
  widths?: Readonly<Record<string, number>>;
  /** The first idle frame's body (checked) and the strips' digest (`packHash`). */
  body: Body;
  sha256: string;
  /** Room the strips' frames take around the feet, in art pixels (left, right, up, down). */
  room: { l: number; r: number; u: number; d: number };
  slash?: PackArt["slash"];
  /**
   * Frames of the `hurt` strip to use (the white flash left out), and the `death` frame where it's down. A pack with no
   * death strip falls back onto the floor on its last hurt frame instead (`down` is then 2: falling, falling, lying).
   */
  hurt: readonly number[];
  down: number;
  /** The pack's attacks, from the quickest to the biggest. */
  attacks: readonly HeroAttack[];
  /** Floats this many art pixels off the ground (flyers). */
  hover?: number;
  outfits: PaletteSpec[];
  /** Its battle cry (big normal), intro, win and taunt words. */
  words: { cry: string; intro: string; win: string; taunt: string };
  /** A projectile from the pack's own strips, for a zoner's fireball (QCF), thrown with `shot` (default the first attack; it leaves on the first hit frame). */
  projectile?: { name?: string; fly: { strip: string; frames: readonly number[] }; hit: { strip: string; frames: readonly number[] }; speed?: number; height?: number; sound?: readonly [number, number] };
  shot?: HeroAttack;
  /** Raise the death strip's frames this many art pixels (a flyer's fall drawn below its feet). */
  deathLift?: number;
  /** Signature moves, animations and cues of its own, replacing the generic ones with the same numbers. */
  more?: (k: HeroCtx) => HeroMore;
  /** Other names for the generic moves, by state (a fist fighter's "Quick Slash" is a jab). */
  names?: Readonly<Record<number, string>>;
}

export interface HeroMore {
  attacks?: AttackSpec[];
  throws?: ThrowSpec[];
  anims?: AnimSpec[];
  cues?: Cue[];
}

/** What a hero's signature moves are made with. */
export interface HeroCtx {
  hero: Hero;
  /** Art pixels the fighter floats off the ground. */
  lift: number;
  kit: PackKit;
  /** A cell for this pose, by name (floating flyers are lifted unless `grounded`). */
  c: (name: string, pose: PackPose, grounded?: boolean) => number;
  body: Body;
  /** Art pixels to 320-wide units. */
  units: (px: number) => number;
  /** A box in art pixels from the feet (forward and down positive). */
  bx: (x0: number, y0: number, x1: number, y1: number) => Box;
  /** One of the archetype's moves on these cells, its numbers kept; no box means the automatic one. */
  move: (state: number, name: string, cells: number[], ticks: number[], frames: number[], box?: Box, extra?: Parameters<typeof redrawMove>[6]) => AttackSpec;
  /** A word above the fighter (x art pixels in front of its feet) for `ticks`, as a cue's effect. */
  say: (word: string, x: number, ticks: number, color?: number) => NonNullable<Cue["effect"]>;
  /** Attack `i` of the pack's (wrapping), as cells with a pose on each frame, and its hit frames. */
  strike: (i: number, tag: string, pose?: Partial<PackPose>, fx?: (frame: number, hit: boolean) => readonly Effect[]) => { cells: number[]; hits: number[]; box?: Box };
  /** Ticks for an attack: `pre` before its first hit frame, `act` on hit frames, `post` after. */
  tk: (cells: readonly number[], hits: readonly number[], pre: number, act: number, post: number) => number[];
  cells: { STAND: number[]; RUN: number[]; JUMP_UP: number[]; JUMP_DOWN: number[]; HURT: number[]; LYING: number; CROUCH: number; DEATH: number[] };
  /** A projectile from the pack's own strips (drawn after the sheet is made). */
  stripProjectile: (fly: { strip: string; frames: readonly number[] }, hit: { strip: string; frames: readonly number[] }, box?: Box) => (state: number) => ProjectileArt;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const a = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => ({ action, cells, ticks, comment, ...more });
const air = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => a(action, cells, ticks, comment, { anchor: "feet", ...more });

// ----- Effects, from the feet (x forward, y down) -----

const hitStar = (fx: number, fy: number, size = 6): Effect => (c) => star(c.img, c.x + fx, c.y - fy, size, FX.yellow, FX.white);
const dustUnder: Effect = (c) => dust(c.img, c.x - c.body.back - 4, c.x + c.body.front + 4, c.y, FX.dust, 3);
const dustBehind = (len = 16): Effect => (c) => dust(c.img, c.x - c.body.back, c.x - c.body.back - len, c.y, FX.dust, len);
const speed: Effect = (c) => speedLines(c.img, c.x - c.body.back - 2, c.x - c.body.back - 30, [c.y - 6, c.y - Math.round(c.body.height * 0.5), c.y - c.body.height + 4], FX.white);
/** A swish around the body, forward (and back). */
const swish = (k: number, both = false): Effect => (c) => {
  arcs(c.img, c.x, c.y - Math.round(c.body.height * 0.5), c.body.front + 4 + k, 2, 3, FX.white, 120);
  if (both) arcs(c.img, c.x - 1, c.y - Math.round(c.body.height * 0.5), c.body.back + 4 + k, 2, 3, FX.white, 120, true);
};
/** The guard: a glint of steel in front. */
const glint = (k: number): Effect => (c) => {
  const x = c.x + c.body.front + 3 + k, top = c.y - c.body.height, bottom = c.y - Math.round(c.body.height * 0.2);
  for (let y = top; y <= bottom; y++) put(c.img, x + Math.round(Math.sin(((y - top) / (bottom - top)) * Math.PI) * 3), y, (y + k) % 4 ? FX.glint : FX.white);
};
/** Text in a cell: only for what reads the same mirrored ("..."). */
const sayAbove = (text: string, color: number = FX.white): Effect => (c) => shout(c.img, text, c.x - Math.round(shoutWidth(text) / 2), c.y - c.body.height - 14, color, FX.ink);

export const effects = { hitStar, dustUnder, dustBehind, speed, swish, glint, sayAbove };

/** Every pixel of `img` drawn `k` times bigger. */
export const scaleUp = (img: IndexedImage, k = SCALE): IndexedImage => {
  const out: IndexedImage = { width: img.width * k, height: img.height * k, pixels: new Uint8Array(img.width * img.height * k * k) };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.pixels[y * out.width + x] = img.pixels[Math.floor(y / k) * img.width + Math.floor(x / k)]!;
  return out;
};

/** A projectile's three animations from frames drawn in code: flying (with one box), hitting and fading. */
export function drawnProjectile(state: number, fly: ((img: IndexedImage) => void)[], hitFrames: ((img: IndexedImage) => void)[], size: { w: number; h: number; box: Box }, ticks = 3): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const add = (draw: (img: IndexedImage) => void) => {
    const img: IndexedImage = { width: size.w, height: size.h, pixels: new Uint8Array(size.w * size.h) };
    draw(img);
    if (!bounds(img)) put(img, size.w / 2, size.h / 2, FX.white);
    sprites.push({ group: base, number: sprites.length, image: scaleUp(img), axisX: Math.round((size.w / 2) * SCALE), axisY: Math.round((size.h / 2) * SCALE), palette: 0 });
    return sprites.length - 1;
  };
  const f = fly.map(add), h = hitFrames.map(add);
  const box = size.box.map((v) => v * SCALE) as unknown as Box;
  const actions: AirAction[] = [
    { action: base, comment: "flying", frames: f.map((n) => ({ group: base, number: n, ticks, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "hits", frames: h.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "fades", frames: h.slice(-2).map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

/** A sword wave: a crescent of light flying forward (for zoners whose pack has no projectile). */
export function waveArt(core: number, edge: number) {
  return (state: number) =>
    drawnProjectile(
      state,
      [0, 1, 2].map((k) => (img: IndexedImage) => {
        arcs(img, 8 + k, 15, 9, 3, 1, edge, 110);
        arcs(img, 9 + k, 15, 11, 2, 1, core, 100);
        speedLines(img, 2, 8, [10 + k, 20 - k], edge);
      }),
      [0, 1, 2].map((k) => (img: IndexedImage) => {
        if (k < 2) star(img, 16, 15, 6 + k * 3, core, FX.white);
        else arcs(img, 16, 15, 10, 2, 2, edge, 360);
      }),
      { w: 32, h: 30, box: [-6, -10, 8, 10] },
    );
}

/** Words above the fighter, each in outlined letters with its bottom middle on the axis (played `readable`), `k` times bigger. */
export const WORD_ANIM = 7100;
export function heroWords(words: readonly { text: string; color: number }[], k = SCALE): { sprites: SffSprite[]; actions: AirAction[] } {
  const sprites: SffSprite[] = [];
  const actions: AirAction[] = [];
  words.forEach(({ text, color }, n) => {
    const tw = shoutWidth(text);
    const img: IndexedImage = { width: tw + 4, height: 11, pixels: new Uint8Array((tw + 4) * 11) };
    shout(img, text, 2, 2, color, FX.ink);
    const big = scaleUp(img, k);
    sprites.push({ group: WORD_ANIM + n, number: 0, image: big, axisX: Math.round(big.width / 2), axisY: big.height, palette: 0 });
    actions.push({ action: WORD_ANIM + n, comment: `says ${text}`, frames: [{ group: WORD_ANIM + n, number: 0, ticks: -1 }] });
  });
  return { sprites, actions };
}

export function heroFighter(h: Hero): TemplateSpec {
  const { front: F, back: B, height: H } = h.body;
  const pad = { l: 14, r: 18, u: 26, d: 4 };
  const up = Math.max(h.room.u, H + 34);
  const cell = { width: h.room.l + h.room.r + pad.l + pad.r, height: up + h.room.d + pad.u + pad.d, feet: { x: h.room.l + pad.l, y: up + pad.u } };
  const kit = new PackKit({
    id: h.id.replace(/^gi-/, ""),
    strips: Object.fromEntries(Object.entries(h.strips).map(([k, [file]]) => [k, typeof file === "string" ? `${h.root ?? LUIZMELO}/${file}` : file.map((f) => `${h.root ?? LUIZMELO}/${f}`)])),
    ...(h.mirror ? { mirror: true } : {}),
    counts: Object.fromEntries(Object.entries(h.strips).map(([k, [, n]]) => [k, n])),
    ...(h.widths ? { widths: h.widths } : {}),
    ...(h.slash ? { slash: h.slash } : {}),
    idle: "idle",
    body: h.body,
    sha256: h.sha256,
    cell,
    scale: SCALE,
    localcoord: h.localcoord,
    fx: FX_COLORS,
    credit: h.credit ?? `Sprites: ${h.pack.name} by LuizMelo (CC0), ${h.pack.url}; moves, effects and sounds by Greed Island`,
  });
  const lift = h.hover ?? 0;
  const c = (name: string, pose: PackPose, grounded = false) => kit.cell(name, lift && !grounded ? { ...pose, dy: (pose.dy ?? 0) - lift } : pose);
  const count = (s: string) => h.strips[s]?.[1] ?? 0;
  const has = (s: string) => count(s) > 0;
  const units = (px: number) => Math.round((px * SCALE * 320) / h.localcoord);
  const bx = (x0: number, y0: number, x1: number, y1: number) => kit.box(Math.round(x0), Math.round(y0 - lift), Math.round(x1), Math.round(y1 - lift));
  const words: { text: string; color: number }[] = [];
  const say = (text: string, x: number, ticks: number, color: number = FX.white) => {
    let n = words.findIndex((w) => w.text === text);
    if (n < 0) n = words.push({ text, color }) - 1;
    return { anim: WORD_ANIM + n, x: units(x), y: units(H + 8 + lift), readable: true, ticks };
  };
  const tk = (cells: readonly number[], hits: readonly number[], pre: number, act: number, post: number) => cells.map((_, i) => (i < Math.min(...hits) ? pre : hits.includes(i) ? act : post));

  // Moving about.
  const STAND = range(count("idle")).map((f) => c(`stand ${f}`, { s: "idle", f }));
  const RUN = has("run") ? range(count("run")).map((f) => c(`run ${f}`, { s: "run", f })) : STAND;
  const WALK = has("walk") ? range(count("walk")).map((f) => c(`walk ${f}`, { s: "walk", f })) : RUN;
  const CROUCH = c("crouch", { s: "idle", sy: 0.72, sx: 1.06 });
  const CROUCH_DOWN = c("crouching down", { s: "idle", sy: 0.86, sx: 1.03 });
  const JUMP_START = c("jump start", { s: "idle", sx: 1.08, sy: 0.84 });
  const JUMP_UP = has("jump") ? range(count("jump")).map((f) => c(`jump ${f}`, { s: "jump", f })) : [c("rising", { s: "idle", sy: 1.08, rot: -6, mid: true })];
  const JUMP_DOWN = has("fall") ? range(count("fall")).map((f) => c(`fall ${f}`, { s: "fall", f })) : [c("falling", { s: "idle", sy: 1.04, rot: 6, mid: true })];
  const FLIP = range(8).map((i) => c(`flip ${i}`, { s: has("jump") ? "jump" : "idle", rot: -45 * i, mid: true }));
  const LAND = c("land", { s: "idle", sx: 1.1, sy: 0.84 });
  // Blocking: its shield if it has one, else a glint of steel.
  const GUARD = has("block") ? c("guard", { s: "block" }) : c("guard", { s: "idle", dx: -2, fx: [glint(0)] });
  const GUARD_HIT = has("block") ? c("guard hit", { s: "block", f: 1, dx: -3, fx: [hitStar(F + 2, H * 0.6, 4)] }) : c("guard hit", { s: "idle", dx: -4, fx: [glint(2), hitStar(F + 4, H * 0.6, 4)] });
  const CROUCH_GUARD = c("crouch guard", { s: has("block") ? "block" : "idle", sy: 0.72, sx: 1.06, dx: -2, fx: has("block") ? [] : [glint(0)] });
  // Getting hit and falling.
  const HURT = h.hurt.map((f) => c(`hurt ${f}`, { s: "hurt", f }));
  const hurt = (i: number) => h.hurt[Math.min(i, h.hurt.length - 1)]!;
  const HIT_HIGH = [0, 1, 2].map((i) => c(`hit high ${i}`, { s: "hurt", f: hurt(i), rot: -4 * i, dx: -i, mid: true }));
  const HIT_LOW = [0.92, 0.86, 0.8].map((sy, i) => c(`hit low ${i}`, { s: "hurt", f: hurt(i), sy, sx: 1.04, rot: 6 + 3 * i, mid: true }));
  const CROUCH_HIT = [c("crouch hit 0", { s: "hurt", f: hurt(0), sy: 0.72, sx: 1.06, rot: -6, mid: true }), c("crouch hit 1", { s: "hurt", f: hurt(1), sy: 0.7, sx: 1.06, rot: -10, dx: -2, mid: true })];
  const TUMBLE = [-45, -90, -135, -180, -225, -270].map((r) => c(`tumble ${r}`, { s: "hurt", f: hurt(0), rot: r, mid: true }));
  // Its death strip, or (a pack without one) its last hurt frame falling back onto the floor.
  const down = has("death") ? h.down : 2;
  const deathPose = (f: number): PackPose =>
    has("death")
      ? { s: "death", f, dy: -(h.deathLift ?? 0) }
      : { s: "hurt", f: hurt(h.hurt.length - 1), rot: [-30, -60, -90][Math.min(f, 2)]!, mid: true, dy: f >= 2 ? Math.round(H / 2 - B) : 0 };
  const DEATH = range(down + 1).map((f) => c(`death ${f}`, deathPose(f), true));
  const LYING = DEATH[down]!;
  const LYING_HIT = c("lying hit", { ...deathPose(down), dy: (deathPose(down).dy ?? 0) - 1, fx: [hitStar(0, 4, 4)] }, true);
  const GET_UP = [...new Set([down, down - 1, Math.round(down * 0.6), Math.round(down * 0.3), 0].map((f) => Math.max(0, f)))].map((f) => DEATH[f]!);
  const TRIPPED = [30, 60, 90].map((r) => c(`tripped ${r}`, { s: "hurt", f: hurt(1), rot: r, mid: true }));
  const UPRIGHT = c("launched upright", { s: "hurt", f: hurt(0), rot: -90, mid: true });
  const HEAD_DOWN = c("launched head down", { s: "hurt", f: hurt(0), rot: 90, mid: true });
  const SAD = c("sad", { s: "hurt", f: hurt(h.hurt.length - 1), sy: 0.94, fx: [sayAbove("...", FX.grey)] });

  // The pack's attacks as cells, posed: frame by frame (the idle frame first if it leads), and the hit frames.
  const framesOf = (at: HeroAttack) => {
    const list = (at.frames ?? range(count(at.strip))).map((f) => ({ s: at.strip, f }));
    return at.lead ? { list: [{ s: "idle", f: 0 }, ...list], hits: at.hits.map((x) => x + 1) } : { list, hits: [...at.hits] };
  };
  const strike = (i: number, tag: string, pose: Partial<PackPose> = {}, fx?: (frame: number, hit: boolean) => readonly Effect[]) => {
    const at = h.attacks[i % h.attacks.length]!;
    const { list, hits } = framesOf(at);
    const cells = list.map(({ s, f }, k) => {
      const extra = fx?.(k, hits.includes(k)) ?? [];
      return c(`${s} ${f} ${tag}${extra.length ? ` fx${k}` : ""}`, { s, f, ...pose, ...(extra.length ? { fx: [...(pose.fx ?? []), ...extra] } : {}) });
    });
    // A hand-made box follows the pose's squash (turns are left out: near enough for a poke).
    const sy = pose.sy ?? 1, sx = pose.sx ?? 1;
    const box = at.box ? bx(at.box[0] * sx, at.box[1] * sy, at.box[2] * sx, at.box[3] * sy) : undefined;
    return { cells, hits, ...(box ? { box } : {}) };
  };
  const last = h.attacks.length - 1;

  const base = h.base;
  const move = (state: number, name: string, cells: number[], ticks: number[], frames: number[], box?: Box, extra: Parameters<typeof redrawMove>[6] = {}): AttackSpec => {
    const was = base.attacks.find((x) => x.state === state);
    const len = was ? cellList(was.anim.cells).length : cells.length;
    const moves = was?.moves?.map((m) => ({ ...m, frame: Math.min(cells.length - 1, Math.round((m.frame * cells.length) / len)) }));
    const hit: Partial<HitSpec> = { ...extra.hit, ...(box ? { box } : {}) };
    return redrawMove(base, state, name, cells, ticks, frames, { ...(moves ? { moves } : {}), ...extra, hit });
  };

  // Normals: the pack's attacks, quick to big; crouching ones squashed low, the anti-air tipped up, air ones as drawn.
  const normal = (state: number, name: string, s: { cells: number[]; hits: number[]; box?: Box }, t: [number, number, number], extra: Parameters<typeof redrawMove>[6] = {}) =>
    move(state, name, s.cells, tk(s.cells, s.hits, ...t), s.hits, s.box, extra);
  const kick = (): AttackSpec => {
    // A lunge on the run's frames (or the idle's, for a flyer): no attack strip to spare.
    const s = has("run") ? "run" : "idle";
    const cells = [STAND[0]!, c("kick 1", { s, f: 1, dx: 1, rot: -8, mid: true }), c("kick 2", { s, f: 2, dx: 4, rot: -14, mid: true, fx: [hitStar(F + 8, H * 0.35, 5)] }), c("kick 3", { s, f: 2, dx: 2, rot: -8, mid: true }), STAND[0]!];
    return move(230, "Boot", cells, [2, 3, 4, 3, 3], [2], bx(F, -H * 0.55, F + 12, -H * 0.1));
  };
  const S = (i: number, tag: string, pose: Partial<PackPose> = {}) => strike(i, tag, pose);
  const generic: AttackSpec[] = [
    normal(200, "Quick Slash", S(0, "light"), [2, 2, 2]),
    normal(210, "Slash", S(1, "medium"), [3, 3, 3]),
    h.attacks.length >= 3 ? normal(230, "Cut", S(2, "cut"), [2, 3, 3]) : kick(),
    normal(240, "Big Slash", S(last, "heavy"), [3, 4, 4]),
    normal(400, "Low Slash", S(0, "crouch", { sy: 0.72, sx: 1.06 }), [2, 2, 3]),
    normal(410, "Rising Cut", S(1, "anti-air", { sy: 0.85, rot: -24, mid: true }), [3, 3, 3]),
    normal(430, "Shin Cut", S(0, "shin", { sy: 0.62, sx: 1.08, rot: 10, mid: true }), [2, 3, 3]),
    normal(440, "Sweep", S(last, "sweep", { sy: 0.55, sx: 1.12, rot: 14, mid: true }), [3, 3, 4]),
    normal(600, "Air Slash", S(0, "air"), [2, 3, 3], { anchor: "feet" }),
    normal(630, "Diving Slash", S(last, "dive", { rot: 22, mid: true }), [3, 3, 4], { anchor: "feet" }),
    ...specials(),
  ];

  function specials(): AttackSpec[] {
    const big = framesOf(h.attacks[last]!);
    const from = Math.max(0, Math.min(...big.hits) - 1);
    // Dash slash: a run with speed lines into the big attack.
    const dash = (state: number, name: string) => {
      const run = RUN.slice(0, 4).map((_, i) => c(`dash ${i}`, { s: has("run") ? "run" : "idle", f: i % Math.max(1, count("run")), fx: [speed, dustBehind(12)] }));
      const end = big.list.slice(from).map(({ s, f }, k) => c(`${s} ${f} dash end`, { s, f, fx: k === 0 ? [speed] : [] }));
      const hits = big.hits.map((x) => x - from + run.length);
      const cells = [...run, ...end];
      return move(state, name, cells, tk(cells, hits, 2, 4, 4), hits);
    };
    // Rising slash: the second attack tipped up, rising off the ground.
    const rising = (state: number, name: string) => {
      const at = framesOf(h.attacks[Math.min(1, last)]!);
      const first = Math.min(...at.hits);
      const cells = at.list.map(({ s, f }, k) => c(`${s} ${f} rising ${k}`, { s, f, rot: -32, mid: true, dy: k < first ? 0 : -Math.min(22, 8 * (k - first + 1)) }));
      return move(state, name, cells, tk(cells, at.hits, 2, 4, 4), at.hits);
    };
    // Whirlwind: the big attack's hit frame, spun round and round.
    const whirl = (state: number, name: string) => {
      const { s, f } = big.list[big.hits[0]!]!;
      const cells = range(8).map((i) => c(`whirl ${i}`, { s, f, flip: i % 2 === 1, fx: i >= 1 && i <= 6 ? [swish(i % 3, true)] : [] }));
      return move(state, name, [...cells, STAND[0]!], [3, 3, 3, 3, 3, 3, 3, 4, 4], [2, 3, 4, 5], bx(-B - 14, -H * 1.05, F + 18, 0));
    };
    // Hammer drop: up high, then the big attack down onto them.
    const drop = (state: number, name: string) => {
      const cells = [
        JUMP_START,
        c("drop up 1", { s: has("jump") ? "jump" : "idle", dy: -18 }),
        c("drop up 2", { s: has("jump") ? "jump" : "idle", f: Math.max(0, count("jump") - 1), dy: -26 }),
        ...big.list.slice(from).map(({ s, f }, k) => c(`${s} ${f} drop ${k}`, { s, f, dy: k === 0 ? -14 : 0, fx: k === 1 ? [dustUnder, hitStar(F + 6, 0, 8)] : [] })),
      ];
      const hits = [4, 5].filter((x) => x < cells.length);
      return move(state, name, cells, tk(cells, hits, 3, 5, 4), hits, bx(-4, -H * 1.1, F + 22, 2));
    };
    // A projectile: the pack's own, or a sword wave.
    const shot = (state: number, name: string) => {
      const at = framesOf(h.shot ?? h.attacks[0]!);
      const cells = at.list.map(({ s, f }) => c(`${s} ${f} shot`, { s, f }));
      const fire = Math.min(...at.hits);
      const was = base.attacks.find((x) => x.state === state)!;
      const p = h.projectile;
      return {
        ...move(state, name, cells, tk(cells, at.hits, 3, 5, 4), [fire]),
        projectile: {
          ...(was.projectile ?? { frame: fire, speed: 5, height: 65 }),
          frame: fire,
          ...(p?.speed ? { speed: p.speed } : {}),
          height: units(p?.height ?? H * 0.6),
          offset: units(F + 4),
          art: p ? stripProjectile(p.fly, p.hit) : waveArt(FX.white, FX.sky),
        },
      } satisfies AttackSpec;
    };
    switch (base.archetype) {
      case "ZONER":
        return [shot(1000, h.projectile?.name ?? (h.projectile ? "Shot" : "Sword Wave")), rising(1100, "Rising Slash"), whirl(1200, "Whirlwind")];
      case "HEAVY":
        return [dash(1000, "Charge"), rising(1100, "Rising Slash"), drop(1200, "Hammer Drop")];
      case "GRAPPLER": {
        const tackle = [c("tackle 0", { s: has("jump") ? "jump" : "idle", rot: 40, mid: true, dy: -8 }), c("tackle 1", { s: has("jump") ? "jump" : "idle", rot: 70, mid: true, dy: -10, fx: [speed] }), c("tackle 2", { s: has("jump") ? "jump" : "idle", rot: 80, mid: true, dy: -6, fx: [speed, hitStar(F + 10, H * 0.5, 6)] }), c("tackle 3", { s: "hurt", f: hurt(0), rot: 90, mid: true }), LYING, ...GET_UP.slice(2)];
        return [dash(1000, "Charge"), move(1100, "Flying Tackle", tackle, tackle.map((_, i) => (i < 3 ? 4 : 5)), [1, 2], bx(F - 6, -H * 0.9, F + 16, -H * 0.2))];
      }
      default:
        return [dash(1000, "Dash Slash"), rising(1100, "Rising Slash"), whirl(1200, "Whirlwind")];
    }
  }

  // Throws (the grappler): a lift and slam up close, and a running grab.
  const throws: ThrowSpec[] | undefined = base.throws
    ? (() => {
        const front = units(F + 6);
        const reach = strike(0, "grab");
        const grab = reach.cells.slice(0, Math.min(...reach.hits) + 1);
        const lifted = c("lift", { s: has("jump") ? "jump" : "idle", sy: 1.06 });
        const big = framesOf(h.attacks[last]!);
        const slam = c("slam", { ...big.list[big.hits[0]!]!, fx: [dustUnder, hitStar(F + 8, 0, 9)] });
        const slam800: ThrowSpec = {
          ...base.throws!.find((t) => t.state === 800)!,
          name: "Lift and Slam",
          box: bx(F - 2, -H, F + 10, 0),
          reach: { action: 800, cells: grab, ticks: grab.map((_, i) => (i === grab.length - 1 ? 6 : 2)) },
          catchFrames: [grab.length - 1],
          hold: [
            { cell: grab[grab.length - 1]!, ticks: 6, victim: [front, 0] },
            { cell: lifted, ticks: 10, victim: [front - 10, units(H * 0.9)], lifted: true },
            { cell: slam, ticks: 8, victim: [front + 10, 0] },
            { cell: STAND[0]!, ticks: 8, victim: [front + 16, 0] },
          ],
          release: { frame: 2, x: 3, y: 3 },
        };
        const shake = range(6).map((i) => c(`shake ${i}`, { s: "idle", f: i % Math.max(1, count("idle")), rot: i % 2 ? 7 : -7, mid: true }));
        const grabRun: ThrowSpec = {
          ...base.throws!.find((t) => t.state === 1300)!,
          name: "Running Grab",
          box: bx(F - 2, -H, F + 12, 0),
          reach: { action: 1300, cells: [...range(6).map((i) => RUN[i % RUN.length]!), grab[grab.length - 1]!], ticks: [2, 2, 3, 3, 3, 4, 8] },
          catchFrames: [6],
          hold: [...shake.map((cell) => ({ cell, ticks: 4, victim: [front, 0] as const })), { cell: slam, ticks: 8, victim: [front + 10, 0] as const }],
          release: { frame: 6, x: 4, y: 3 },
        };
        return [slam800, grabRun];
      })()
    : undefined;

  function stripProjectile(fly: { strip: string; frames: readonly number[] }, hit: { strip: string; frames: readonly number[] }, box?: Box) {
    return (state: number): ProjectileArt => {
      const base = state + 50;
      const sprites: SffSprite[] = [];
      let flyBox: Box | undefined = box;
      const add = (strip: string, f: number) => {
        const fr = kit.frames(strip)[f];
        if (!fr) throw new Error(`${h.id}: ${strip} has no frame ${f}`);
        const b = bounds(fr);
        if (!b) return undefined;
        const cx = fr.width / 2, cy = fr.height / 2;
        flyBox ??= [Math.round((b.x0 - cx) * SCALE), Math.round((b.y0 - cy) * SCALE), Math.round((b.x1 - cx) * SCALE), Math.round((b.y1 - cy) * SCALE)];
        sprites.push({ group: base, number: sprites.length, image: scaleUp(crop(fr, b)), axisX: Math.round((cx - b.x0) * SCALE), axisY: Math.round((cy - b.y0) * SCALE), palette: 0 });
        return sprites.length - 1;
      };
      const f = fly.frames.map((k) => add(fly.strip, k)).filter((n) => n !== undefined);
      const hf = hit.frames.map((k) => add(hit.strip, k)).filter((n) => n !== undefined);
      const actions: AirAction[] = [
        { action: base, comment: "flying", frames: f.map((n) => ({ group: base, number: n, ticks: 3, clsn1: [flyBox!], clsn2: [flyBox!] })) },
        { action: base + 1, comment: "hits", frames: hf.map((n) => ({ group: base, number: n, ticks: 3 })) },
        { action: base + 2, comment: "fades", frames: hf.slice(-2).map((n) => ({ group: base, number: n, ticks: 3 })) },
      ];
      return { sprites, actions };
    };
  }

  const ctx: HeroCtx = {
    hero: h, lift, kit, c, body: h.body, units, bx, move, say, strike, tk,
    cells: { STAND, RUN, JUMP_UP, JUMP_DOWN, HURT, LYING, CROUCH, DEATH },
    stripProjectile,
  };
  const more = h.more?.(ctx) ?? {};
  const replaced = new Set([...(more.attacks ?? []).map((x) => x.state), ...(more.anims ?? []).map((x) => x.action)]);
  const attacks = [...generic.filter((x) => !replaced.has(x.state)).map((x) => (h.names?.[x.state] ? { ...x, name: h.names[x.state]! } : x)), ...(more.attacks ?? [])];

  const BIG = strike(last, "win");
  const W = h.words;
  const anims: AnimSpec[] = [
    a(0, STAND, 5, "stand"),
    a(5, [STAND[0]!], 3, "turn"),
    a(6, [CROUCH], 3, "crouch turn"),
    a(10, [CROUCH_DOWN, CROUCH], 2, "stand to crouch"),
    a(11, [CROUCH], 8, "crouching"),
    a(12, [CROUCH_DOWN, STAND[0]!], 2, "crouch to stand"),
    a(20, WALK, 5, "walk forward"),
    a(21, [...WALK].reverse(), 5, "walk back"),
    a(40, [JUMP_START], 3, "jump start"),
    air(41, [...JUMP_UP, ...JUMP_DOWN], [...JUMP_UP.map(() => 5), ...JUMP_DOWN.map(() => 7)], "jump up"),
    air(42, has("jump") ? [...JUMP_UP, ...JUMP_DOWN] : FLIP, has("jump") ? [...JUMP_UP.map(() => 5), ...JUMP_DOWN.map(() => 7)] : 3, "jump forward"),
    air(43, FLIP, 3, "jump back: a flip"),
    a(47, [LAND], 3, "jump land"),
    a(100, RUN, 3, "run"),
    air(105, [JUMP_UP[0]!, JUMP_DOWN[0]!], 6, "hop back"),
    a(120, [GUARD], 2, "guard start"),
    a(121, [CROUCH_GUARD], 2, "crouch guard start"),
    air(122, [JUMP_UP[0]!], 2, "air guard start"),
    a(130, [GUARD], 10, "stand guard"),
    a(131, [CROUCH_GUARD], 10, "crouch guard"),
    air(132, [JUMP_UP[0]!], 10, "air guard"),
    a(140, [GUARD], 2, "guard end"),
    a(141, [CROUCH_GUARD], 2, "crouch guard end"),
    air(142, [JUMP_UP[0]!], 2, "air guard end"),
    a(150, [GUARD_HIT, GUARD], 3, "stand guard hit"),
    a(151, [CROUCH_GUARD], 6, "crouch guard hit"),
    air(152, [JUMP_UP[0]!], 6, "air guard hit"),
    a(170, [SAD], 6, "lose (time over)", { loop: false }),
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
    a(5110, [LYING], 30, "lying down"),
    a(5120, GET_UP, 5, "getting up: its fall, backwards"),
    a(5140, [LYING], 30, "lying defeated", { loop: false }),
    a(5150, [LYING], 30, "lying defeated (match over)", { loop: false }),
    air(5160, [TUMBLE[2]!], 4, "bounce into the air"),
    air(5170, [TUMBLE[3]!, LYING], 4, "hit the ground after a bounce"),
    air(5200, [TUMBLE[0]!, STAND[0]!], 3, "fall recovery near the ground"),
    air(5210, [TUMBLE[1]!, TUMBLE[0]!, STAND[0]!, STAND[1 % STAND.length]!], 3, "fall recovery in the air"),
    a(180, [...BIG.cells, BIG.cells[BIG.cells.length - 1]!], [...BIG.cells.map(() => 4), 60], `win: its big attack (${W.win})`, { loop: false }),
    a(181, [STAND[0]!, c("hop 1", { s: has("jump") ? "jump" : "idle", dy: -6 }), c("hop 2", { s: has("jump") ? "jump" : "idle", dy: -10 }), c("hop 1", { s: "idle" }), LAND, STAND[0]!], [4, 4, 6, 4, 4, 60], `win: a hop for joy (${W.win})`, { loop: false }),
    a(190, [...STAND, ...STAND], 5, `intro (${W.intro})`),
    a(195, [...STAND.slice(0, 4), ...STAND.slice(0, 4)], 5, `taunt (${W.taunt})`),
  ];
  const finalAnims = [...anims.filter((x) => !replaced.has(x.action)), ...(more.anims ?? [])];

  // Sounds: a swish on every hit frame of its own attacks, its words on wins, intro and taunt.
  const swishCues: Cue[] = attacks.flatMap((x) => {
    if (x.projectile) return [{ action: x.state, frame: x.projectile.frame, sound: h.projectile?.sound ?? SOUNDS.whoosh }];
    const first = Math.min(...x.hits.flatMap((y) => y.frames));
    return [{ action: x.state, frame: Math.max(0, first - 1), sound: x.hits[0]!.weight === "light" ? SOUNDS.swish : SOUNDS.swishBig }];
  });
  const cues: Cue[] = [
    ...swishCues.filter((q) => !(more.cues ?? []).some((m) => m.action === q.action && m.sound)),
    ...(replaced.has(240) ? [] : [{ action: 240, frame: Math.min(...BIG.hits), effect: say(W.cry, F, 20) }]),
    ...(replaced.has(180) ? [] : [{ action: 180, frame: Math.min(...BIG.hits), effect: say(W.win, 0, 80, FX.yellow) }]),
    ...(replaced.has(181) ? [] : [{ action: 181, frame: 2, effect: say(W.win, 0, 70, FX.yellow) }]),
    ...(replaced.has(190) ? [] : [{ action: 190, frame: 2, effect: say(W.intro, 0, 40) }]),
    ...(replaced.has(195) ? [] : [{ action: 195, frame: 1, effect: say(W.taunt, F, 30) }]),
    ...(more.cues ?? []),
  ];

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

  return {
    ...base,
    art,
    id: h.id,
    name: h.name,
    constants: { ...base.constants, width: [Math.max(10, units(F * 0.8)), Math.max(10, units(B * 0.8))], height: Math.max(24, units(H)) },
    anims: finalAnims,
    attacks,
    ...(throws || more.throws ? { throws: [...(throws ?? []).filter((t) => !(more.throws ?? []).some((m) => m.state === t.state)), ...(more.throws ?? [])] } : {}),
    sounds: () => heroSounds(),
    gags: ["explosion"],
    // Words the same size on screen whatever the fighter's units (a big king's art is drawn in smaller units).
    effectArt: () => heroWords(words, Math.max(2, Math.round((SCALE * h.localcoord) / 450))),
    cues,
    colors: {},
    palettes: h.outfits,
    portrait: { cell: STAND[0]! },
  };
}

// ----- Sounds -----

/** Swishes, a sword's ring, a clang, thuds, a boom, a frying pan's bonk, a bowstring, fire, a coin, a zap and more, made in code. */
export function heroSounds(): SndSound[] {
  const rate = 22050;
  const noise = seeded(31);
  const env = (len: number, attack: number) => (t: number) => Math.min(1, t / attack) * Math.max(0, 1 - t / len);
  const bell = (freqs: readonly number[], len: number, decay: number) =>
    synth(len, () => 0, (t) => Math.exp(-t * decay) * Math.min(1, t * 400), (_p, t) => freqs.reduce((s, f, i) => s + Math.sin(2 * Math.PI * f * t) / (i + 1), 0) / 1.6, rate);
  const swish = (len: number) =>
    mix(
      synth(len, () => 0, (t) => Math.sin((t / len) * Math.PI) ** 2 * 0.8, () => noise(), rate),
      synth(len, (t) => 900 - 600 * (t / len), (t) => Math.sin((t / len) * Math.PI) * 0.15, WAVES.sine, rate),
    );
  const thud = mix(synth(0.3, (t) => 90 - 50 * (t / 0.3), (t) => Math.exp(-t * 14) * 0.9, WAVES.sine, rate), synth(0.15, () => 0, (t) => (1 - t / 0.15) * 0.35, () => noise(), rate));
  const boom = mix(synth(1.1, () => 0, (t) => Math.exp(-t * 3.5) * Math.min(1, t * 80), () => noise(), rate), synth(0.8, (t) => 70 - 40 * (t / 0.8), (t) => Math.exp(-t * 4) * 0.9, WAVES.sine, rate));
  const twang = synth(0.5, (t) => 196 * (1 + 0.04 * Math.exp(-t * 20)), (t) => Math.exp(-t * 7) * Math.min(1, t * 300), (p) => 0.6 * WAVES.saw(p) + 0.4 * WAVES.sine(p), rate);
  const fire = synth(0.8, () => 0, (t) => Math.min(1, t * 6) * Math.max(0, 1 - t / 0.8) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 11 * t)), () => noise() * (noise() > 0.97 ? 1.6 : 0.7), rate);
  const coin = mix(synth(0.08, () => 1320, env(0.08, 0.002), WAVES.square, rate), synth(0.35, () => 1760, env(0.35, 0.002), WAVES.square, rate), 0.08);
  const zap = synth(0.3, (t) => 1800 * Math.exp(-t * 9) + 120, env(0.3, 0.004), WAVES.square, rate);
  const squeak = synth(0.22, (t) => 1500 + 700 * Math.sin((t / 0.22) * Math.PI), env(0.22, 0.01), WAVES.square, rate);
  const splat = mix(synth(0.25, () => 0, (t) => Math.exp(-t * 18) * 0.9, () => noise(), rate), synth(0.2, (t) => 160 - 120 * (t / 0.2), (t) => Math.exp(-t * 20) * 0.6, WAVES.sine, rate));
  const chomp = mix(synth(0.06, () => 0, env(0.06, 0.002), () => noise(), rate), synth(0.18, (t) => 140 - 60 * (t / 0.18), (t) => Math.exp(-t * 25), WAVES.square, rate), 0.03);
  const fart = synth(0.75, (t) => 70 + 25 * Math.sin(2 * Math.PI * 9 * t) - 30 * (t / 0.75), (t) => Math.min(1, t * 15) * (1 - t / 0.75) ** 0.5 * (0.7 + 0.3 * Math.sin(2 * Math.PI * 23 * t)), (p) => 0.6 * WAVES.saw(p) + 0.4 * noise(), rate);
  const wav = (s: Samples) => writeWav(normalize(s, 0.85));
  const all: [readonly [number, number], Samples][] = [
    [SOUNDS.swish, swish(0.18)],
    [SOUNDS.swishBig, swish(0.32)],
    [SOUNDS.shing, mix(bell([2400, 3310, 4720], 0.6, 7), synth(0.05, () => 0, env(0.05, 0.001), () => noise(), rate))],
    [SOUNDS.clang, mix(bell([820, 1240, 1930, 2610], 0.8, 6), synth(0.04, () => 0, env(0.04, 0.001), () => noise(), rate))],
    [SOUNDS.thud, thud],
    [SOUNDS.whoosh, swish(0.45)],
    [SOUNDS.boom, boom],
    [SOUNDS.bonk, bell([310, 742, 1133, 1630], 0.9, 4.5)],
    [SOUNDS.twang, twang],
    [SOUNDS.fire, fire],
    [SOUNDS.coin, coin],
    [SOUNDS.zap, zap],
    [SOUNDS.squeak, squeak],
    [SOUNDS.splat, splat],
    [SOUNDS.chomp, chomp],
    [SOUNDS.fart, fart],
  ];
  return all.map(([[group, number], s]) => ({ group, number, wav: wav(s) }));
}

// ----- Gag drawings shared by the heroes -----

/** A frying pan (about 16 x 7) with its handle pointing back from (x, y), the pan's middle `len` ahead. */
export function pan(img: IndexedImage, x: number, y: number, angle: number) {
  const ca = Math.cos((angle * Math.PI) / 180), sa = Math.sin((angle * Math.PI) / 180);
  for (let t = 0; t < 8; t++) put(img, x + ca * t, y + sa * t, FX.stick);
  const px = x + ca * 14, py = y + sa * 14;
  disc(img, px, py, 7, FX.steel);
  disc(img, px, py, 5.6, FX.panDark);
  disc(img, px - 0.5, py - 0.5, 4.6, FX.pan);
  put(img, px - 3, py - 2, FX.white), put(img, px - 2, py - 3, FX.white), put(img, px + 3, py + 3, FX.steel);
}

/** A gold coin, `r` across, turned `t` (0-3: face, edge-on...). */
export function coin(img: IndexedImage, x: number, y: number, t: number, r = 3) {
  const w = [r, r * 0.6, 1, r * 0.6][t % 4]!;
  for (let v = -r; v <= r; v++) for (let u = -w; u <= w; u++) if ((u / (w + 0.3)) ** 2 + (v / (r + 0.3)) ** 2 <= 1) put(img, x + u, y + v, Math.abs(u) > w - 1 || Math.abs(v) > r - 1 ? FX.coinDark : FX.coin);
  if (t % 4 === 0) put(img, x - 1, y - 1, FX.white);
}

/** Flames licking up from (x, y), `h` tall. */
export function flames(img: IndexedImage, x: number, y: number, h: number, t: number) {
  for (let i = -2; i <= 2; i++) {
    const tall = h * (1 - Math.abs(i) * 0.25) * (0.8 + 0.2 * Math.sin(t * 2 + i * 1.7));
    for (let k = 0; k < tall; k++) {
      const wobble = Math.round(Math.sin((k + t * 2) * 0.7 + i) * 1.2);
      const col = k < tall * 0.35 ? FX.flameLight : k < tall * 0.75 ? FX.flame : FX.flameDark;
      put(img, x + i * 2 + wobble, y - k, col);
      put(img, x + i * 2 + wobble + 1, y - k, col);
    }
  }
}

export type { PackCanvas };
