/**
 * House fighter "Nyan Cat" (ZONER): the flying pop-tart cat, rebuilt from the
 * sprites of the MUGEN character (CyberAkumaTv's, installed by
 * `pnpm mugen:import` into chars/mugen-nyan-cat), whose own code only plays a
 * screen gag and freezes the game. Everything it does is ours: its frames
 * are the six flying frames turned, squashed and moved in code (it has no
 * other art), and its moves are effects drawn here, like the explosion gag:
 * a Glitter Firework it throws and the IMMA FIRIN MAH LAZER rainbow beam,
 * with a speech bubble, plus pats, slams and rainbow lashes. It keeps the
 * Sage's numbers and AI. Sounds are made in code, with a few seconds of its
 * own song for the intro.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AirAction, Box } from "../art/air.ts";
import { readSff, type SffSprite } from "../art/sff.ts";
import type { IndexedImage, Sheet } from "../art/sheet.ts";
import { readSnd, type SndSound } from "../art/snd.ts";
import { cut, mix, normalize, readWav, resample, seeded, synth, WAVES, writeWav, type Samples } from "../art/wav.ts";
import { drawText, textWidth } from "../fx/font.ts";
import type { ProjectileArt } from "./projectile.ts";
import type { AnimSpec, ArtSource, AttackSpec, TemplateSpec } from "./spec.ts";
import { redrawMove } from "./universal-prototype-2.ts";
import { ZONER } from "./zoner.ts";

/** The MUGEN character's files, checked by checksum (it's a download, mugen.json). */
const SOURCE = {
  folder: "chars/mugen-nyan-cat",
  sff: { file: "Nyan_Cat.sff", sha256: "917e8a982c39918e03c1ff49f4d02cbec905357d25b5d724dc9270c4d755446a" },
  snd: { file: "Nyan_Cat.snd", sha256: "178b26f7e31ddc5ad8193764e4ba3a4e3200f1201f6fc5326ccb38543e1c855f" },
} as const;

// Its palette (the flying frames' own): the body, and the rainbow trail, red to purple from the top.
const GREY = 242, CHEEK = 243, CRUST = 245, FROSTING = 252, SPRINKLE = 253, WHITE = 254, BLACK = 255;
export const RAINBOW = [244, 246, 247, 248, 249, 251] as const;
/** Our effect colours, in slots its palette leaves empty (2-240). */
export const FX = { white: 10, paleYellow: 11, gold: 12, pink: 13, cyan: 14, lime: 15, violet: 16, bubble: 20, ink: 21, shade: 22, core: 30, glow: 31, charge: 40, chargeMid: 41, chargeEdge: 42 } as const;
const FX_COLORS: Record<number, string> = {
  [FX.white]: "#ffffff", [FX.paleYellow]: "#fff6a0", [FX.gold]: "#ffd030", [FX.pink]: "#ff7ad9", [FX.cyan]: "#7af0ff", [FX.lime]: "#b6ff5a", [FX.violet]: "#c9a2ff",
  [FX.bubble]: "#ffffff", [FX.ink]: "#141414", [FX.shade]: "#c8c8d0", [FX.core]: "#ffffff", [FX.glow]: "#ffe6ff", [FX.charge]: "#ffffff", [FX.chargeMid]: "#ffb8ff", [FX.chargeEdge]: "#ff5ad0",
};
const SPARK = [FX.white, FX.paleYellow, FX.gold, FX.pink, FX.cyan, FX.lime, FX.violet] as const;

/** Its size: the frames' pixels are drawn at 320 / LOCALCOORD units each, so the cat stands about 50 units tall (a cat beside people). */
const LOCALCOORD = 720;
/** The sheet: cells of 720 x 400, the ground point at (400, 360); the cat's centre (its sprites' axis) at REST, hovering. */
const W = 720, H = 400;
const GROUND = { x: 400, y: 360 } as const;
const REST = { x: 400, y: 290 } as const;
/** Points on the cat, from its centre, in its frames' pixels: the mouth, and the front of its face. */
const MOUTH = { x: 44, y: 23 } as const;
const NOSE = { x: 86, y: 18 } as const;

interface Frame { img: IndexedImage; ax: number; ay: number; catLeft: number }

/** A pose: one of the six flying frames, its trail, moved, turned (clockwise, degrees) and squashed about its centre, plus effects drawn on top. */
interface Pose {
  f?: number;
  trail?: "stub" | "full" | "none";
  dx?: number;
  dy?: number;
  rot?: number;
  sx?: number;
  sy?: number;
  fx?: ((c: Canvas) => void)[];
}

interface Canvas {
  img: IndexedImage;
  /** Where a point of the cat (from its centre, frame pixels) lands in the cell. */
  at: (p: { x: number; y: number }) => { x: number; y: number };
}

function put(img: IndexedImage, x: number, y: number, color: number) {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && y >= 0 && x < img.width && y < img.height) img.pixels[y * img.width + x] = color;
}

function disc(img: IndexedImage, cx: number, cy: number, r: number, color: number) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(img, x, y, color);
}

/** A four-pointed twinkle: a plus with longer arms, and a bright centre. */
function twinkle(img: IndexedImage, cx: number, cy: number, size: number, color: number, centre: number = FX.white) {
  for (let d = -size; d <= size; d++) {
    const w = Math.max(0, Math.round((size - Math.abs(d)) / 4));
    for (let t = -w; t <= w; t++) {
      put(img, cx + d, cy + t, color);
      put(img, cx + t, cy + d, color);
    }
  }
  disc(img, cx, cy, Math.max(1, size / 5), centre);
}

/** Rainbow stripes from x0 to x1 (in the facing direction), centred on y, each `band` pixels tall, with a wavy edge. */
function stripes(img: IndexedImage, x0: number, x1: number, cy: number, band: number, wave = 0) {
  const top = cy - (band * RAINBOW.length) / 2;
  for (let x = Math.round(x0); x <= x1; x++) {
    const off = wave ? Math.round(Math.sin(x / 9) * wave) : 0;
    RAINBOW.forEach((c, i) => {
      for (let y = 0; y < band; y++) put(img, x, top + i * band + y + off, c);
    });
  }
}

/** Load the cat's six flying frames from the MUGEN character's sprite file. */
async function loadFrames(ikemenDir: string): Promise<{ frames: Frame[]; palette: Uint8Array; song?: Samples }> {
  const read = async (f: { file: string; sha256: string }) => {
    const file = path.join(ikemenDir, SOURCE.folder, f.file);
    const bytes = await readFile(file).catch(() => {
      throw new Error(`${file} is missing: install the MUGEN Nyan Cat first (pnpm mugen:import nyan-cat)`);
    });
    const sum = createHash("sha256").update(bytes).digest("hex");
    if (sum !== f.sha256) throw new Error(`${file}: checksum ${sum} does not match ${f.sha256}`);
    return bytes;
  };
  const sff = readSff(await read(SOURCE.sff));
  const frames: Frame[] = [];
  let palette: Uint8Array | undefined;
  for (let n = 0; n < 6; n++) {
    const s = sff.sprites.find((x) => x.group === 255 && x.number === n);
    if (!s) throw new Error(`Nyan_Cat.sff has no sprite 255,${n}`);
    palette ??= sff.palettes[s.palette]!.colors;
    let catLeft = s.image.width;
    s.image.pixels.forEach((p, i) => {
      if (p && !(RAINBOW as readonly number[]).includes(p)) catLeft = Math.min(catLeft, i % s.image.width);
    });
    frames.push({ img: s.image, ax: s.axisX, ay: s.axisY, catLeft });
  }
  const pal = new Uint8Array(768);
  pal.set(palette!.subarray(0, 768));
  for (const [i, c] of Object.entries(FX_COLORS)) pal.set([1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16)), Number(i) * 3);
  // Its song, for the intro: the first of its two sounds.
  const song = readSnd(await read(SOURCE.snd)).find((s) => s.group === 255 && s.number === 0);
  return { frames, palette: pal, song: song ? readWav(song.wav) : undefined };
}

/** Draw a pose into a cell. */
function draw(frames: Frame[], pose: Pose): IndexedImage {
  const img: IndexedImage = { width: W, height: H, pixels: new Uint8Array(W * H) };
  const fr = frames[pose.f ?? 0]!;
  const dx = pose.dx ?? 0, dy = pose.dy ?? 0, sx = pose.sx ?? 1, sy = pose.sy ?? 1;
  const t = ((pose.rot ?? 0) * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const trail = pose.trail ?? "stub";
  const from = trail === "full" ? 0 : fr.catLeft - (trail === "stub" ? 40 : 0);
  const cx = REST.x + dx, cy = REST.y + dy;
  const at = (p: { x: number; y: number }) => ({ x: cx + p.x * sx * cos - p.y * sy * sin, y: cy + p.x * sx * sin + p.y * sy * cos });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Back from the cell to the frame: undo the move, the turn and the squash.
      const u = x + 0.5 - cx, v = y + 0.5 - cy;
      const fx = Math.floor(fr.ax + (u * cos + v * sin) / sx), fy = Math.floor(fr.ay + (-u * sin + v * cos) / sy);
      if (fx < from || fy < 0 || fx >= fr.img.width || fy >= fr.img.height) continue;
      const p = fr.img.pixels[fy * fr.img.width + fx]!;
      if (!p) continue;
      if (trail === "none" && (RAINBOW as readonly number[]).includes(p)) continue;
      img.pixels[y * W + x] = p === 1 ? BLACK : p;
    }
  }
  const canvas: Canvas = { img, at };
  for (const e of pose.fx ?? []) e(canvas);
  return img;
}

// ----- Effects drawn into the cat's own frames (effect colours: never part of its hurtboxes) -----

/** Twinkles around the cat, `phase` turning them. */
const sparklesAround = (phase: number, radius = 120, count = 6) => (c: Canvas) => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 2 * Math.PI + phase;
    const p = c.at({ x: 0, y: 0 });
    twinkle(c.img, p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius * 0.6, 6 + ((i + Math.round(phase * 3)) % 3) * 3, SPARK[i % SPARK.length]!);
  }
};
/** A dotted shield of twinkles in front of the cat. */
const shield = (flash = false) => (c: Canvas) => {
  const p = c.at(NOSE);
  for (let i = -3; i <= 3; i++) twinkle(c.img, p.x + 16 - Math.abs(i) * 4, p.y + i * 16, flash ? 9 : 6, SPARK[(i + 3) % SPARK.length]!);
};
/** The rainbow lashing forward from the face: `len` pixels long. */
const lash = (len: number, band = 5) => (c: Canvas) => {
  const p = c.at(NOSE);
  stripes(c.img, p.x - 10, p.x + len, p.y, band, 2);
};
/** A rainbow arc swung in front of the cat (the tail whip), `reach` pixels out, `sweep` 0-1 of the way down. */
const arc = (reach: number, sweep: number) => (c: Canvas) => {
  const o = c.at({ x: 10, y: 0 });
  const from = -1.2, to = from + 2.2 * sweep;
  for (let a = from; a <= to; a += 0.01) RAINBOW.forEach((col, i) => {
    const r = reach - i * 5;
    for (let k = 0; k < 5; k++) put(c.img, o.x + Math.cos(a) * (r - k), o.y + Math.sin(a) * (r - k) * 0.9, col);
  });
};
/** Sprinkles tossed forward and down. */
const sprinkles = (t: number) => (c: Canvas) => {
  const p = c.at(MOUTH);
  const rnd = seeded(7);
  for (let i = 0; i < 14; i++) {
    const vx = 3 + (rnd() + 1) * 2.5, vy = -1 + rnd() * 1.5;
    disc(c.img, p.x + vx * t * 6, p.y + vy * t * 6 + 0.5 * t * t * 9, 5, SPARK[i % SPARK.length]!);
  }
};
/** A rainbow skidding along the ground in front. */
const groundSweep = (len: number) => (c: Canvas) => {
  const p = c.at(NOSE);
  stripes(c.img, p.x - 20, p.x + len, GROUND.y - 12, 4);
};
/** Rings of light gathering at the mouth (the lazer charging), `level` 0-1. */
const charge = (level: number) => (c: Canvas) => {
  const p = c.at(NOSE);
  const r = 6 + level * 22;
  disc(c.img, p.x + 4, p.y + 4, r, FX.chargeEdge);
  disc(c.img, p.x + 4, p.y + 4, r * 0.7, FX.chargeMid);
  disc(c.img, p.x + 4, p.y + 4, r * 0.4, FX.charge);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * Math.PI + level * 4;
    twinkle(c.img, p.x + 4 + Math.cos(a) * (r + 22 - level * 14), p.y + 4 + Math.sin(a) * (r + 22 - level * 14), 4, SPARK[i % SPARK.length]!);
  }
};
/** A burst of light at the mouth (throwing the firework, firing the lazer). */
const flash = (size: number) => (c: Canvas) => {
  const p = c.at(NOSE);
  twinkle(c.img, p.x + 8, p.y + 4, size, FX.paleYellow);
};

// ----- The cells -----

const POSES: Pose[] = [];
const poseIndex = new Map<string, number>();
/** Add a pose (once per name) and return its cell. */
function cell(name: string, pose: Pose): number {
  const known = poseIndex.get(name);
  if (known !== undefined) return known;
  POSES.push(pose);
  poseIndex.set(name, POSES.length - 1);
  return POSES.length - 1;
}
const six = [0, 1, 2, 3, 4, 5];
const STAND = six.map((f) => cell(`stand ${f}`, { f }));
const FULL = six.map((f) => cell(`full trail ${f}`, { f, trail: "full" }));
/** Crouching: squashed onto the ground (feet 62 below the centre, squashed to 46). */
const CROUCH = six.map((f) => cell(`crouch ${f}`, { f, sx: 1.08, sy: 0.75, dy: 24 }));
const WALK = six.map((f) => cell(`walk ${f}`, { f, rot: 5 }));
const WALK_BACK = six.map((f) => cell(`walk back ${f}`, { f, rot: -5 }));
const RUN = six.map((f) => cell(`run ${f}`, { f, trail: "full", rot: 8, dy: -6 }));
const JUMP_START = cell("jump start", { sx: 1.1, sy: 0.82, dy: 12 });
const JUMP_UP = [cell("rising 1", { f: 0, rot: -18 }), cell("rising 2", { f: 2, rot: -12 }), cell("rising 3", { f: 4, rot: -6 }), cell("top", { f: 1 })];
const JUMP_DOWN = [cell("falling 1", { f: 3, rot: 10 }), cell("falling 2", { f: 5, rot: 16 })];
const FLIP = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cell(`flip ${i}`, { f: i % 6, rot: -45 * i }));
const LAND = cell("land", { sx: 1.12, sy: 0.8, dy: 14 });
const GUARD = cell("guard", { f: 0, rot: -8, dx: -6, fx: [shield()] });
const GUARD_HIT = cell("guard hit", { f: 0, rot: -12, dx: -12, fx: [shield(true)] });
const CROUCH_GUARD = cell("crouch guard", { f: 0, sx: 1.08, sy: 0.75, dy: 24, fx: [shield()] });
const HIT_HIGH = [cell("hit high 1", { f: 0, rot: -12, dx: -6 }), cell("hit high 2", { f: 1, rot: -22, dx: -10 }), cell("hit high 3", { f: 2, rot: -32, dx: -14 })];
const HIT_LOW = [cell("hit low 1", { f: 0, sy: 0.88, dy: 7, rot: 8 }), cell("hit low 2", { f: 1, sy: 0.82, dy: 11, rot: 14 }), cell("hit low 3", { f: 2, sy: 0.76, dy: 15, rot: 20 })];
const CROUCH_HIT = [cell("crouch hit 1", { f: 0, sx: 1.12, sy: 0.68, dy: 28, rot: -8 }), cell("crouch hit 2", { f: 1, sx: 1.15, sy: 0.62, dy: 32, rot: -14 })];
/** Knocked back, turning over: 45, 90 (on its back), 135, upside down. */
const TUMBLE = [-45, -90, -135, -180].map((r) => cell(`tumble ${r}`, { f: 0, rot: r, trail: "none" }));
/** Lying upside down on the ground, paws up. */
const LYING = cell("lying", { f: 0, rot: 180, trail: "none", dy: 13 });
const LYING_HIT = cell("lying hit", { f: 1, rot: 172, trail: "none", dy: 16, sy: 0.92 });
const GET_UP = [150, 110, 70, 30].map((r) => cell(`get up ${r}`, { f: 0, rot: r, trail: "none", dy: 8 }));
const TRIPPED = [30, 60, 90].map((r) => cell(`tripped ${r}`, { f: 0, rot: r, trail: "none" }));
const DROOP = cell("droop", { f: 0, rot: 14, dy: 10, sy: 0.94 });

// Attacks.
const PAT = [0, 12, 26, 26, 10].map((d, i) => cell(`pat ${i}`, { f: i % 6, dx: d }));
const SLAM = [[8, 10], [18, 30], [18, 36], [8, 12], [0, 0]].map(([r, d], i) => cell(`slam ${i}`, { f: i % 6, rot: r, dx: d }));
const LASH = [cell("lash 0", { f: 0, dx: -6 }), cell("lash 1", { f: 1, dx: -4, fx: [arc(150, 0.35)] }), cell("lash 2", { f: 2, fx: [arc(150, 0.7)] }), cell("lash 3", { f: 3, fx: [arc(150, 1)] }), cell("lash 4", { f: 4 }), cell("lash 5", { f: 5 })];
const BURST = [cell("burst 0", { f: 0, rot: -6 }), cell("burst 1", { f: 1, fx: [lash(60)] }), cell("burst 2", { f: 2, fx: [lash(125)] }), cell("burst 3", { f: 3, fx: [lash(140, 4)] }), cell("burst 4", { f: 4, fx: [lash(70, 3)] }), cell("burst 5", { f: 5 })];
const LOW_PAT = [0, 14, 28, 12].map((d, i) => cell(`low pat ${i}`, { f: i, sx: 1.08, sy: 0.75, dy: 24, dx: d }));
const TOSS = [0, 1, 2, 3].map((t) => cell(`toss ${t}`, { f: t, sx: 1.08, sy: 0.75, dy: 24, fx: t ? [sprinkles(t)] : [] }));
const SWEEP = [0, 1, 2, 3, 4].map((i) => cell(`sweep ${i}`, { f: i, sx: 1.08, sy: 0.75, dy: 24, fx: i >= 1 && i <= 3 ? [groundSweep(40 + i * 35)] : [] }));
const SKID = [0, 14, 34, 52, 52, 30, 10].map((d, i) => cell(`skid ${i}`, { f: i % 6, trail: "full", sx: 1.1, sy: 0.7, dy: 26, dx: d, rot: 4 }));
const POUNCE = [cell("pounce 0", { f: 0, rot: 12 }), cell("pounce 1", { f: 1, rot: 22, dx: 16 }), cell("pounce 2", { f: 2, rot: 22, dx: 22 })];
const DIVE = [cell("dive 0", { f: 0, rot: 30 }), cell("dive 1", { f: 1, rot: 45, dx: 14, dy: 10 }), cell("dive 2", { f: 2, rot: 45, dx: 18, dy: 14 })];
const THROW = [cell("throw 0", { f: 0, rot: -10, dx: -8 }), cell("throw 1", { f: 1, rot: -14, dx: -12 }), cell("throw 2", { f: 2, rot: 6, dx: 6, fx: [flash(14)] }), cell("throw 3", { f: 3, rot: 4, dx: 4 }), cell("throw 4", { f: 4 })];
const ROCKET = [cell("rocket 0", { f: 0, sx: 1.1, sy: 0.85, dy: 10 }), cell("rocket 1", { f: 1, trail: "full", rot: -35, dx: 10, dy: -20 }), cell("rocket 2", { f: 2, trail: "full", rot: -50, dx: 18, dy: -50, fx: [sparklesAround(0, 90, 4)] }), cell("rocket 3", { f: 3, trail: "full", rot: -55, dx: 20, dy: -70 }), cell("rocket 4", { f: 4, rot: -20, dy: -40 })];
/** The lazer: charging (trembling, light gathering), firing (recoil), and back. */
const CHARGE = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cell(`charge ${i}`, { f: i % 6, dx: i % 2 ? 2 : -2, rot: -4, fx: [charge(i / 7)] }));
const FIRE = [cell("fire 0", { f: 0, dx: -10, rot: -6, fx: [flash(24)] }), cell("fire 1", { f: 1, dx: -12, rot: -6, fx: [flash(18)] }), cell("fire 2", { f: 2, dx: -12, rot: -6, fx: [flash(22)] })];
const FIRE_END = [cell("fire end 0", { f: 3, dx: -8, rot: -4 }), cell("fire end 1", { f: 4, dx: -4 })];
// Intro: flying in from the left with its whole rainbow; win: a loop-the-loop in sparkles, or bobbing in them; taunt: twinkles.
const INTRO = [-300, -250, -200, -150, -105, -65, -35, -15, -5, 0].map((d, i) => cell(`intro ${i}`, { f: i % 6, trail: "full", dx: d }));
const LOOP = [0, -40, -80, -120, -160, -200, -240, -280, -320, -360].map((r, i) => cell(`loop ${i}`, { f: i % 6, rot: r, dy: -Math.round(Math.sin((i / 9) * Math.PI) * 40), fx: [sparklesAround(i / 3, 130, 6)] }));
const BOB = six.map((f) => cell(`bob ${f}`, { f, fx: [sparklesAround(f / 2, 125, 8)] }));
const TAUNT = [0, 1, 2, 3, 4, 5].map((f) => cell(`taunt ${f}`, { f, fx: [sparklesAround(f / 1.5, 105, 5)] }));

/** The cells as a sheet (cell n at column n % 10, row n / 10), made from the MUGEN character's frames. */
async function nyanSheet(ctx: { ikemenDir: string }): Promise<Sheet> {
  const { frames, palette, song } = await loadFrames(ctx.ikemenDir);
  loadedSong = song;
  const columns = 10, rows = Math.ceil(POSES.length / columns);
  const sheet: Sheet = { width: W * columns, height: H * rows, pixels: new Uint8Array(W * columns * H * rows), palette, cellWidth: W, cellHeight: H, columns, rows };
  POSES.forEach((pose, n) => {
    const img = draw(frames, pose);
    const x0 = (n % columns) * W, y0 = Math.floor(n / columns) * H;
    for (let y = 0; y < H; y++) sheet.pixels.set(img.pixels.subarray(y * W, (y + 1) * W), (y0 + y) * sheet.width + x0);
  });
  return sheet;
}
let loadedSong: Samples | undefined;

export const NYAN_ART: ArtSource = {
  id: "nyan-cat",
  file: `$IKEMEN_DIR/${SOURCE.folder}/${SOURCE.sff.file}`,
  sha256: SOURCE.sff.sha256,
  cellWidth: W,
  cellHeight: H,
  columns: 10,
  rows: Math.ceil(POSES.length / 10),
  axis: GROUND,
  stray: [],
  localcoord: LOCALCOORD,
  standardSprites: {
    "5000,0": HIT_HIGH[0]!, "5000,10": HIT_HIGH[1]!, "5000,20": HIT_HIGH[2]!,
    "5010,0": HIT_LOW[0]!, "5010,10": HIT_LOW[1]!, "5010,20": HIT_LOW[2]!,
    "5020,0": CROUCH_HIT[0]!, "5020,10": CROUCH_HIT[0]!, "5020,20": CROUCH_HIT[1]!,
    "5030,0": { cell: HIT_HIGH[2]!, anchor: "feet" }, "5030,10": { cell: TUMBLE[0]!, anchor: "feet" }, "5030,20": { cell: TUMBLE[1]!, anchor: "feet" },
    "5030,30": { cell: TUMBLE[1]!, anchor: "feet" }, "5030,40": { cell: TUMBLE[2]!, anchor: "feet" }, "5030,50": { cell: TUMBLE[3]!, anchor: "feet" },
    "5040,0": LYING, "5040,10": LYING, "5040,20": LYING_HIT,
    "5060,0": { cell: STAND[0]!, anchor: "feet" }, "5060,10": { cell: TUMBLE[3]!, anchor: "feet" },
    "5070,0": { cell: TRIPPED[0]!, anchor: "feet" }, "5070,10": { cell: TRIPPED[1]!, anchor: "feet" }, "5070,20": { cell: TRIPPED[2]!, anchor: "feet" },
  },
  effects: [...RAINBOW, ...Object.values(FX)],
  sheet: nyanSheet,
  credit: "Sprites: Nyan Cat (the MUGEN character by CyberAkumaTv, after Chris Torres's Nyan Cat), MUGEN Archive file 50461; moves, effects and sounds by Greed Island",
};

// ----- Projectiles: the Glitter Firework and the IMMA FIRIN MAH LAZER beam -----

function blank(width: number, height: number): IndexedImage {
  return { width, height, pixels: new Uint8Array(width * height) };
}

/** The firework: a star trailing rainbow glitter; it bursts into a ring of sparks, which fade. */
export function fireworkArt(state: number): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const add = (img: IndexedImage, ax: number, ay: number) => (sprites.push({ group: base, number: sprites.length, image: img, axisX: ax, axisY: ay, palette: 0 }), sprites.length - 1);
  const fly = [0, 1, 2, 3].map((k) => {
    const img = blank(170, 70);
    const rnd = seeded(11 + k);
    for (let i = 0; i < 26; i++) {
      const x = 132 - i * 5 - rnd() * 4, y = 35 + rnd() * (5 + i * 0.8);
      disc(img, x, y, 2, RAINBOW[(i + k) % RAINBOW.length]!);
      if (i % 3 === k % 3) twinkle(img, x, y, 4, SPARK[i % SPARK.length]!);
    }
    twinkle(img, 145, 35, 20 + (k % 2) * 4, k % 2 ? FX.gold : FX.paleYellow);
    return add(img, 145, 35);
  });
  const burst = [14, 34, 54, 74, 90].map((r, k) => {
    const img = blank(220, 220);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 2 * Math.PI + k * 0.1;
      for (let s = 0; s < 3; s++) twinkle(img, 110 + Math.cos(a) * (r - s * 11), 110 + Math.sin(a) * (r - s * 11), Math.max(3, 10 - k * 1.5 - s * 2), SPARK[(i + s) % SPARK.length]!);
    }
    if (k < 2) twinkle(img, 110, 110, 28 - k * 8, FX.white);
    return add(img, 110, 110);
  });
  const fade = [0, 1, 2].map((k) => {
    const img = blank(220, 220);
    const rnd = seeded(31 + k);
    for (let i = 0; i < 24 - k * 7; i++) disc(img, 110 + rnd() * 95, 110 + rnd() * 95 + k * 8, 2, SPARK[i % SPARK.length]!);
    return add(img, 110, 110);
  });
  const box: Box = [-20, -20, 20, 20];
  const actions: AirAction[] = [
    { action: base, comment: "Glitter Firework", frames: fly.map((n) => ({ group: base, number: n, ticks: 3, clsn1: [box], clsn2: [box] })) },
    { action: base + 1, comment: "Glitter Firework bursts", frames: [...burst, ...fade].map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "Glitter Firework fades", frames: fade.map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

/** How long the beam is, in the cat's pixels (about 230 units), and how thick each colour band is. */
export const BEAM_LENGTH = 520;
const BEAM_BAND = 6;

/** The lazer: a rainbow beam with a white core, growing out of the mouth, then flickering; it fades when spent. */
export function beamArt(state: number): ProjectileArt {
  const base = state + 50;
  const sprites: SffSprite[] = [];
  const height = BEAM_BAND * RAINBOW.length + 16;
  const halfH = Math.round((BEAM_BAND * RAINBOW.length) / 2);
  const beam = (length: number, flicker: number, fade = 0) => {
    const img = blank(length + 24, height);
    const cy = height / 2;
    for (let x = 0; x < length; x++) {
      const taper = Math.min(1, x / 18) * (1 - fade);
      const half = Math.max(1, Math.round((BEAM_BAND * RAINBOW.length * taper) / 2 + Math.sin(x / 7 + flicker) * 1.5));
      for (let y = -half; y < half; y++) {
        const band = Math.floor(((y + half) / (2 * half)) * RAINBOW.length);
        put(img, x, cy + y, RAINBOW[Math.min(RAINBOW.length - 1, band)]!);
      }
      const core = Math.max(0, Math.round(half * 0.35));
      for (let y = -core; y <= core; y++) put(img, x, cy + y, Math.abs(y) < core * 0.5 ? FX.core : FX.glow);
    }
    // The tip: a bright ball where it ends.
    if (!fade) {
      disc(img, length, cy, halfH + 3, FX.glow);
      disc(img, length, cy, halfH - 2, FX.core);
    }
    for (let i = 0; i < 6; i++) twinkle(img, (length * (i + 0.5 + flicker / 6)) / 6, cy + (i % 2 ? -1 : 1) * (BEAM_BAND * 3 + 6), 3, SPARK[i % SPARK.length]!);
    sprites.push({ group: base, number: sprites.length, image: img, axisX: 0, axisY: Math.round(cy), palette: 0 });
    return sprites.length - 1;
  };
  const grow = [0.2, 0.45, 0.75].map((f) => [beam(Math.round(BEAM_LENGTH * f), 0), Math.round(BEAM_LENGTH * f)] as const);
  const full = [beam(BEAM_LENGTH, 0), beam(BEAM_LENGTH, 2), beam(BEAM_LENGTH, 4)];
  const fading = [0.35, 0.65, 0.9].map((f) => beam(BEAM_LENGTH, 1, f));
  const box = (len: number): Box => [0, -halfH, len, halfH];
  const actions: AirAction[] = [
    {
      action: base, comment: "IMMA FIRIN MAH LAZER", loopStart: grow.length,
      frames: [...grow.map(([n, len]) => ({ group: base, number: n, ticks: 2, clsn1: [box(len)], clsn2: [box(len)] })), ...full.map((n) => ({ group: base, number: n, ticks: 2, clsn1: [box(BEAM_LENGTH)], clsn2: [box(BEAM_LENGTH)] }))],
    },
    { action: base + 1, comment: "the lazer is spent", frames: fading.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "the lazer fades", frames: fading.map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}

// ----- The speech bubble -----

/** Effect animation: "IMMA FIRIN MAH LAZER!!" in a speech bubble, its tail pointing down at the cat. */
export const BUBBLE_ANIM = 7000;
export function bubbleArt(): { sprites: SffSprite[]; actions: AirAction[] } {
  const lines = ["IMMA FIRIN", "MAH LAZER!!"];
  const scale = 3, pad = 12, lineH = 7 * scale + 8;
  const tw = Math.max(...lines.map((l) => textWidth(l, scale)));
  const bw = tw + pad * 2, bh = lines.length * lineH + pad * 2 - 6, tail = 18;
  const img = blank(bw + 4, bh + tail + 4);
  // Rounded box with a black outline, a soft shade along the bottom, and a tail.
  const r = 10;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const cx = Math.max(r, Math.min(bw - 1 - r, x)), cy = Math.max(r, Math.min(bh - 1 - r, y));
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      put(img, x + 2, y + 2, d > r - 2.2 ? FX.ink : y > bh - 7 ? FX.shade : FX.bubble);
    }
  }
  const tx = Math.round(bw / 2) + 2;
  for (let y = 0; y < tail; y++) {
    const half = Math.round((tail - y) * 0.5);
    for (let x = -half; x <= half; x++) put(img, tx + x - Math.round(y * 0.3), bh + y, Math.abs(x) >= half - 1 ? FX.ink : FX.bubble);
  }
  lines.forEach((l, i) => drawText(img, l, 2 + pad + Math.round((tw - textWidth(l, scale)) / 2), 2 + pad + i * lineH, FX.ink, scale));
  const group = BUBBLE_ANIM;
  const sprites: SffSprite[] = [{ group, number: 0, image: img, axisX: tx, axisY: bh + tail, palette: 0 }];
  // It pops in (a frame drawn smaller would need another sprite: it just blinks once), then stays.
  return { sprites, actions: [{ action: BUBBLE_ANIM, comment: "IMMA FIRIN MAH LAZER speech bubble", frames: [{ group, number: 0, ticks: -1 }] }] };
}

// ----- Sounds -----

/** Sound numbers: its song (intro), the lazer's charge and blast, the firework's launch and burst, a twinkle. */
export const SOUNDS = { song: [1, 0], charge: [2, 0], lazer: [2, 1], launch: [3, 0], burst: [3, 1], twinkle: [4, 0] } as const;

export function nyanSounds(): SndSound[] {
  const rate = 22050;
  const tremolo = (hz: number) => (p: number, t: number) => WAVES.sine(p) * (0.75 + 0.25 * Math.sin(2 * Math.PI * hz * t));
  const noise = seeded(5);
  const chargeUp = synth(1.0, (t) => 300 + 1300 * t * t, (t) => Math.min(1, t * 3) * 0.6, tremolo(18), rate);
  const blast = mix(
    synth(1.6, (t) => 92 - 20 * t, (t) => Math.min(1, t * 30) * (1 - t) ** 0.6 * 0.55, (p) => 0.6 * WAVES.saw(p) + 0.4 * WAVES.square(p * 2), rate),
    mix(synth(1.6, (t) => 1800 + 300 * Math.sin(t * 40), (t) => (1 - t) * 0.18, WAVES.sine, rate), synth(1.6, () => 0, (t) => Math.min(1, t * 20) * (1 - t) * 0.25, () => noise(), rate)),
  );
  const whistle = synth(0.45, (t) => 900 + 1700 * t, (t) => (1 - t) * 0.5, WAVES.sine, rate);
  const crackle = seeded(9);
  let burst = synth(0.9, () => 0, (t) => Math.exp(-t * 7) * 0.8, () => crackle(), rate);
  for (let i = 0; i < 14; i++) burst = mix(burst, synth(0.03, () => 0, (t) => (1 - t) * 0.5, () => crackle(), rate), 0.08 + i * 0.05 + (crackle() + 1) * 0.02);
  let chime = synth(0.35, () => 2093, (t) => Math.exp(-t * 6) * 0.35, WAVES.sine, rate);
  chime = mix(chime, synth(0.28, () => 2637, (t) => Math.exp(-t * 6) * 0.3, WAVES.sine, rate), 0.07);
  chime = mix(chime, synth(0.22, () => 3136, (t) => Math.exp(-t * 6) * 0.25, WAVES.sine, rate), 0.14);
  const song = loadedSong ? normalize(cut(resample(loadedSong, rate), 0, 3.2, 0.5), 0.75) : chime;
  const wav = (s: Samples) => writeWav(normalize(s, 0.85));
  return [
    { group: SOUNDS.song[0], number: SOUNDS.song[1], wav: writeWav(song) },
    { group: SOUNDS.charge[0], number: SOUNDS.charge[1], wav: wav(chargeUp) },
    { group: SOUNDS.lazer[0], number: SOUNDS.lazer[1], wav: wav(blast) },
    { group: SOUNDS.launch[0], number: SOUNDS.launch[1], wav: wav(whistle) },
    { group: SOUNDS.burst[0], number: SOUNDS.burst[1], wav: wav(burst) },
    { group: SOUNDS.twinkle[0], number: SOUNDS.twinkle[1], wav: wav(chime) },
  ];
}

// ----- The fighter -----

const a = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => ({ action, cells, ticks, comment, ...more });
const air = (action: number, cells: number[], ticks: number | number[], comment: string, more: Partial<AnimSpec> = {}): AnimSpec => a(action, cells, ticks, comment, { anchor: "feet", ...more });
const sage: TemplateSpec = { ...ZONER, art: NYAN_ART };
/** A move redrawn with Nyan Cat's cells, its hit frames and box (sheet pixels from the ground point; boxes here because a lunge moves the whole cat). */
const move = (state: number, name: string, cells: number[], ticks: number[], frames: number[], extra: Parameters<typeof redrawMove>[6] = {}): AttackSpec => redrawMove(sage, state, name, cells, ticks, frames, extra);

/** Where the cat's mouth is above the ground in units (its centre is 70 pixels up, the mouth 23 below it). */
const MOUTH_HEIGHT = Math.round(((GROUND.y - REST.y - MOUTH.y) * 320) / LOCALCOORD);
/** How far in front of its position the beam starts (the front of its face), in units. */
const NOSE_FRONT = Math.round((NOSE.x * 320) / LOCALCOORD);
const LAZER_FIRE_FRAME = CHARGE.length;

export const NYAN_CAT: TemplateSpec = {
  ...sage,
  id: "gi-nyan-cat",
  name: "Nyan Cat",
  // The Sage's numbers to start with: balanced against the house fighters afterwards.
  constants: { ...ZONER.constants, width: [22, 22], height: 45 },
  anims: [
    a(0, STAND, 6, "stand: flying in place"),
    a(5, [STAND[0]!], 3, "turn"),
    a(6, [CROUCH[0]!], 3, "crouch turn"),
    a(10, [JUMP_START, CROUCH[0]!], 2, "stand to crouch"),
    a(11, CROUCH, 6, "crouching"),
    a(12, [JUMP_START, STAND[0]!], 2, "crouch to stand"),
    a(20, WALK, 4, "walk forward"),
    a(21, WALK_BACK, 5, "walk back"),
    a(40, [JUMP_START], 3, "jump start"),
    air(41, [...JUMP_UP, ...JUMP_DOWN], [4, 4, 5, 6, 6, 8], "jump up"),
    air(42, FLIP, 3, "jump forward: a flip"),
    air(43, [...FLIP].reverse(), 3, "jump back: a flip"),
    a(47, [LAND], 3, "jump land"),
    a(100, RUN, 3, "run: the whole rainbow"),
    air(105, [JUMP_UP[0]!, JUMP_UP[1]!], 6, "hop back"),
    a(120, [GUARD], 2, "guard start"),
    a(121, [CROUCH_GUARD], 2, "crouch guard start"),
    air(122, [GUARD], 2, "air guard start"),
    a(130, [GUARD], 10, "stand guard"),
    a(131, [CROUCH_GUARD], 10, "crouch guard"),
    air(132, [GUARD], 10, "air guard"),
    a(140, [GUARD], 2, "guard end"),
    a(141, [CROUCH_GUARD], 2, "crouch guard end"),
    air(142, [GUARD], 2, "air guard end"),
    a(150, [GUARD_HIT, GUARD], 3, "stand guard hit"),
    a(151, [CROUCH_GUARD], 6, "crouch guard hit"),
    air(152, [GUARD_HIT], 6, "air guard hit"),
    a(170, [DROOP], 6, "lose (time over)", { loop: false }),
    a(175, [DROOP], 6, "draw (time over)", { loop: false }),
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
    a(5120, GET_UP, 4, "getting up: turning back over"),
    a(5140, [LYING], 30, "lying defeated", { loop: false }),
    a(5150, [LYING], 30, "lying defeated (match over)", { loop: false }),
    air(5160, [TUMBLE[2]!], 4, "bounce into the air"),
    air(5170, [TUMBLE[3]!, LYING], 4, "hit the ground after a bounce"),
    air(5200, [TUMBLE[0]!, STAND[0]!], 3, "fall recovery near the ground"),
    air(5210, [TUMBLE[1]!, TUMBLE[0]!, STAND[0]!, STAND[1]!], 3, "fall recovery in the air"),
    a(180, LOOP, [4, 4, 4, 4, 4, 4, 4, 4, 4, 60], "win: a loop-the-loop in sparkles", { loop: false }),
    a(181, BOB, 6, "win: bobbing in sparkles"),
    a(190, [...INTRO, STAND[4]!, STAND[5]!], [4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 6, 20], "intro: flies in on its rainbow"),
    a(195, TAUNT, 5, "taunt: twinkles"),
  ],
  attacks: [
    move(200, "Paw Pat", PAT, [2, 3, 3, 3, 3], [2, 3], { hit: { box: [80, -95, 132, -38] } }),
    move(210, "Poptart Slam", SLAM, [3, 3, 4, 4, 4], [1, 2], { hit: { box: [70, -110, 140, -30] } }),
    move(230, "Rainbow Lash", LASH, [2, 2, 3, 3, 3, 3], [2, 3]),
    move(240, "Rainbow Burst", BURST, [3, 3, 3, 4, 4, 4], [2, 3, 4]),
    move(400, "Low Pat", LOW_PAT, [2, 3, 3, 3], [2], { hit: { box: [86, -50, 138, -6] } }),
    move(410, "Sprinkle Toss", TOSS, [3, 3, 4, 4], [2, 3], { hit: { box: [88, -60, 175, 0] } }),
    move(430, "Tail Sweep", SWEEP, [2, 3, 4, 4, 3], [2, 3]),
    move(440, "Rainbow Skid", SKID, [3, 3, 3, 4, 5, 5, 5], [2, 3, 4], { hit: { box: [120, -44, 190, 0] } }),
    move(600, "Air Pounce", POUNCE, [3, 3, 6], [1, 2], { anchor: "feet", hit: { box: [70, -90, 130, -20] } }),
    move(630, "Cannonball", DIVE, [3, 4, 8], [1, 2], { anchor: "feet", hit: { box: [60, -80, 130, 0] } }),
    // The Sage's energy palm, as a firework.
    {
      ...move(1000, "Glitter Firework", THROW, [3, 3, 6, 4, 4], [2], { hit: { hitSound: SOUNDS.burst } }),
      projectile: { ...ZONER.attacks.find((x) => x.state === 1000)!.projectile!, frame: 2, height: MOUTH_HEIGHT, offset: NOSE_FRONT, art: fireworkArt },
    },
    move(1100, "Nyan Rocket", ROCKET, [2, 3, 4, 8, 5], [1, 2, 3], { hit: { box: [40, -220, 150, -40] } }),
    // In place of the spin kick: the lazer. A long charge (it's seen coming), then five hits along the beam.
    {
      ...move(1200, "IMMA FIRIN MAH LAZER", [...CHARGE, ...FIRE, ...FIRE, ...FIRE, ...FIRE, ...FIRE_END], [...CHARGE.map(() => 4), ...Array(12).fill(3), 6, 6], [LAZER_FIRE_FRAME], {
        hit: { damage: 17, chip: 4, height: "high", weight: "medium", hitStun: 14, blockStun: 10, push: 2, knockdown: false, launch: undefined },
        moves: [],
      }),
      projectile: { frame: LAZER_FIRE_FRAME, speed: 0, height: MOUTH_HEIGHT, offset: NOSE_FRONT, hits: 5, missTime: 6, removeTime: 34, maxRange: Math.round((BEAM_LENGTH * 320) / LOCALCOORD) + NOSE_FRONT - 20, art: beamArt },
      ai: { range: 240, weight: 1.2 },
    },
  ],
  sounds: nyanSounds,
  effectArt: bubbleArt,
  cues: [
    { action: 190, frame: 0, sound: SOUNDS.song },
    { action: 195, frame: 0, sound: SOUNDS.twinkle },
    { action: 180, frame: 0, sound: SOUNDS.twinkle },
    { action: 181, frame: 0, sound: SOUNDS.twinkle },
    { action: 1000, frame: 2, sound: SOUNDS.launch },
    { action: 1200, frame: 0, sound: SOUNDS.charge, effect: { anim: BUBBLE_ANIM, x: 18, y: 66, readable: true, ticks: 60 } },
    { action: 1200, frame: LAZER_FIRE_FRAME, sound: SOUNDS.lazer },
  ],
  // Its own colours are its palette's; the outfits recolour the cat, its pop-tart and its rainbow.
  colors: {},
  palettes: [
    {
      name: "Tac Nayn", // the waffle-bodied evil twin
      colors: { [GREY]: "#3a3a3a", [CHEEK]: "#7a1010", [CRUST]: "#b8742c", [FROSTING]: "#d9a05b", [SPRINKLE]: "#7b4a12", [WHITE]: "#ff3030", 244: "#2a2a2a", 246: "#444444", 247: "#5e5e5e", 248: "#787878", 249: "#929292", 251: "#acacac" },
    },
    {
      name: "Golden Nyan",
      colors: { [GREY]: "#f2f2f2", [CRUST]: "#c58a2b", [FROSTING]: "#ffd94a", [SPRINKLE]: "#ff8c1a", 244: "#fff2a8", 246: "#ffe27a", 247: "#ffd24d", 248: "#f2b630", 249: "#d9961a", 251: "#b8740d" },
    },
    {
      name: "Neon Nyan",
      colors: { [GREY]: "#38e0ff", [CHEEK]: "#ff4fd8", [CRUST]: "#2b2b80", [FROSTING]: "#ff2bd1", [SPRINKLE]: "#39ff6a", 244: "#ff2bd1", 246: "#ff6a2b", 247: "#fff02b", 248: "#39ff6a", 249: "#2bd8ff", 251: "#8a2bff" },
    },
  ],
  portrait: { cell: STAND[0]!, box: [REST.x + 18, REST.y - 30, REST.x + 92, REST.y + 44] },
};
