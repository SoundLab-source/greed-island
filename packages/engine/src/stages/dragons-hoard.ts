/**
 * Dragon's Hoard: a cave with a mountain of gold and a dragon asleep on top of it, breathing slowly (Z z z),
 * torches flickering on the walls, gems in the gold, stalactites, coins across the floor. Drawn in code.
 */
import { Canvas, circle, dithered, hex, line, mix, polygon, rng, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";

const GOLD = [hex("#5a3606"), hex("#8a5a0c"), hex("#c9971c"), hex("#f6c945"), hex("#fff0a0")];
const GEMS: readonly (readonly [Rgb, Rgb])[] = [[hex("#c01830"), hex("#ff8090")], [hex("#1850c0"), hex("#80b0ff")], [hex("#18a050"), hex("#80ffb0")], [hex("#9030c0"), hex("#e0a0ff")]];

/** A cut gem: a small diamond with a highlight. */
function gem(c: Canvas, x: number, y: number, s: number, [body, shine]: readonly [Rgb, Rgb]): void {
  polygon(c, [[x, y - s], [x + s, y], [x, y + s], [x - s, y]], (px, py) => (px < x && py < y ? shine : body));
}

/** The cave wall: dark rock, mottled. */
function caveWall(): Canvas {
  const c = new Canvas(WIDTH, HEIGHT), r = rng(301);
  c.gradient(0, HEIGHT, [[0, hex("#07050c")], [0.45, hex("#140e1c")], [0.8, hex("#22182a")], [1, hex("#140e1a")]], 18);
  for (let i = 0; i < 140; i++) {
    const x = r() * WIDTH, y = r() * HEIGHT, s = 20 + r() * 70, lighter = r() < 0.5;
    circle(c, x, y, s, (dx, dy) => (dithered(Math.round(x + dx * s), Math.round(y + dy * s), 0.5) ? (lighter ? hex("#2a2034") : hex("#0a0810")) : null), s * 0.6);
  }
  return c;
}

/** Stalactites hanging from the roof, a tiling band. */
function stalactites(): Canvas {
  const c = new Canvas(WIDE, 200), r = rng(311);
  c.fill(0, 0, WIDE, 24, hex("#0a0810"));
  for (let x = 0; x < WIDE; ) {
    const w = 18 + r() * 50, h = 40 + r() * 150;
    polygon(c, [[x, 20], [x + w, 20], [x + w * (0.45 + r() * 0.1), 20 + h]], (px) => (px < x + w * 0.3 ? hex("#3a2c44") : hex("#1a1222")));
    x += w * (0.6 + r() * 0.8);
  }
  return c;
}

/** A torch on a bracket; `k` picks the flame's shape. */
function torch(k: number): Canvas {
  const c = new Canvas(40, 90), r = rng(321 + k);
  c.fill(17, 46, 23, 90, hex("#3a2412"));
  c.fill(12, 42, 28, 50, hex("#5a5a62"));
  const tall = 30 + r() * 10, lean = (r() - 0.5) * 6;
  polygon(c, [[10, 44], [30, 44], [20 + lean, 44 - tall]], (px, py) => {
    const t = (44 - py) / tall, mid = Math.abs(px - (20 + lean * t)) / (10 * (1 - t) + 1);
    return mid < 0.35 && t < 0.6 ? hex("#fff6c0") : mid < 0.7 ? hex("#ffb030") : hex("#e05010");
  });
  return c;
}

/** Warm light around each torch and up from the gold, added on. */
function glow(spots: readonly (readonly [number, number, number, Rgb])[]): Canvas {
  const c = new Canvas(WIDTH, HEIGHT), LEVELS = 6;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    let best = 0, color = spots[0]![3];
    for (const [sx, sy, radius, col] of spots) {
      const v = 1 - Math.hypot(x - sx, (y - sy) * 1.2) / radius;
      if (v > best) [best, color] = [v, col];
    }
    if (best <= 0) continue;
    const t = best ** 1.6 * LEVELS, lo = Math.floor(t), lvl = dithered(x, y, t - lo) ? lo + 1 : lo;
    if (lvl > 0) c.set(x, y, mix(hex("#000000"), color, lvl / LEVELS));
  }
  return c;
}

/** The hoard: a mountain of gold with coins, gems, a crown and a goblet in it. */
function hoard(): Canvas {
  const W = 1000, H = 300, c = new Canvas(W, H), r = rng(331);
  const top = (x: number) => H - Math.max(0, Math.sin(Math.min(1, Math.max(0, x / W)) * Math.PI)) ** 0.8 * 230;
  for (let x = 0; x < W; x++) {
    const t0 = Math.round(top(x) + (r() - 0.5) * 3);
    for (let y = t0; y < H; y++) {
      const depth = (y - t0) / 220, side = (x - W / 2) / (W / 2);
      const shade = Math.max(0.3, Math.min(0.8, 0.85 - depth * 0.45 - side * 0.25));
      const lvl = shade * 4, lo = Math.floor(lvl);
      c.set(x, y, GOLD[Math.min(4, dithered(x, y, lvl - lo) ? lo + 1 : lo)]!);
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = 20 + r() * (W - 40), y = top(x) + 4 + r() * (H - top(x));
    if (y >= H - 2) continue;
    circle(c, x, y, 4 + r() * 3, (dx, dy) => (dx + dy < -0.5 ? GOLD[4]! : Math.hypot(dx, dy) > 0.8 ? GOLD[1]! : GOLD[3]!), 2.2);
  }
  for (let i = 0; i < 30; i++) {
    const x = 60 + r() * (W - 120), y = top(x) + 10 + r() * (H - top(x) - 14);
    gem(c, x, y, 4 + r() * 4, GEMS[Math.floor(r() * GEMS.length)]!);
  }
  // A goblet on the left slope and a crown on the right.
  const gx = 210, gy = top(gx) + 6;
  polygon(c, [[gx - 14, gy - 40], [gx + 14, gy - 40], [gx + 6, gy - 20], [gx - 6, gy - 20]], (px) => (px < gx - 6 ? GOLD[4]! : GOLD[3]!));
  c.fill(gx - 2, gy - 20, gx + 2, gy - 6, GOLD[2]!);
  c.fill(gx - 10, gy - 6, gx + 10, gy - 2, GOLD[2]!);
  gem(c, gx, gy - 32, 4, GEMS[0]!);
  const kx = 780, ky = top(kx) + 4;
  polygon(c, [[kx - 26, ky], [kx + 26, ky], [kx + 30, ky - 30], [kx + 15, ky - 14], [kx, ky - 36], [kx - 15, ky - 14], [kx - 30, ky - 30]], (px, py) => (py > ky - 8 ? GOLD[2]! : px < kx ? GOLD[4]! : GOLD[3]!));
  for (const dx of [-14, 0, 14]) gem(c, kx + dx, ky - 5, 3, GEMS[dx === 0 ? 1 : 0]!);
  return c;
}

/** The dragon, asleep on the hoard: a coiled body, a tail down one side, its head on its claws, a folded wing. */
function dragon(): Canvas {
  const W = 760, H = 300, c = new Canvas(W, H);
  const scale = hex("#1e3a38"), scaleLit = hex("#3a6a5c"), dark = hex("#0e1e1e"), belly = hex("#7a7a48"), rim = hex("#a8782a");
  const shadeBody = (dx: number, dy: number): Rgb => (dy > 0.55 ? rim : dy > 0.25 ? belly : dx + dy < -0.6 ? scaleLit : scale);
  // The tail: down the right slope, tapering, with a spade at the tip.
  const tail = (t: number): [number, number] => [470 + t * 250 + Math.sin(t * 5) * 18, 150 + t * t * 120];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, [x, y] = tail(t);
    circle(c, x, y, 34 * (1 - t) + 6, shadeBody, (34 * (1 - t) + 6) * 0.8);
  }
  const [tx, ty] = tail(1);
  polygon(c, [[tx - 4, ty - 6], [tx + 26, ty - 14], [tx + 14, ty + 4], [tx + 30, ty + 18], [tx - 2, ty + 8]], scale);
  // The body: a big coil on the top of the mound.
  circle(c, 400, 150, 150, shadeBody, 70);
  // Spikes along the back and tail.
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (1.15 + (i / 13) * 0.7), x = 400 + Math.cos(a) * 140, y = 150 + Math.sin(a) * 66;
    polygon(c, [[x - 8, y + 4], [x + 8, y + 4], [x + 2, y - 16]], dark);
  }
  for (let i = 1; i < 10; i++) {
    const [x, y] = tail(i / 12), s = 10 * (1 - i / 12) + 3;
    polygon(c, [[x - s, y - 20 * (1 - i / 12) - 4], [x + s, y - 20 * (1 - i / 12) - 4], [x + 2, y - 20 * (1 - i / 12) - 4 - s * 1.6]], dark);
  }
  // The folded wing on its back: a membrane with ribs.
  polygon(c, [[330, 110], [500, 96], [560, 40], [420, 20], [300, 60]], (x, y) => (dithered(x, y, 0.25) ? hex("#2a4a46") : hex("#16302e")));
  for (const [x1, y1] of [[560, 40], [470, 22], [380, 30]] as const) line(c, 340, 104, x1, y1, dark, 3);
  // The neck down to the head, resting on its front claws at the left.
  const neck = (t: number): [number, number] => [270 - t * 150, 160 + Math.sin(t * Math.PI * 0.8) * 50];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, [x, y] = neck(t);
    circle(c, x, y, 40 - t * 12, shadeBody, (40 - t * 12) * 0.8);
  }
  const [hx, hy] = neck(1);
  for (const cx of [hx + 30, hx + 70]) {
    circle(c, cx, hy + 50, 18, shadeBody, 12);
    for (const k of [-10, 0, 10]) polygon(c, [[cx + k - 3, hy + 58], [cx + k + 3, hy + 58], [cx + k - 6, hy + 66]], hex("#e8e0c8"));
  }
  circle(c, hx, hy + 8, 44, shadeBody, 30);
  polygon(c, [[hx - 30, hy - 8], [hx - 110, hy + 10], [hx - 116, hy + 30], [hx - 30, hy + 36]], (x, y) => (y > hy + 24 ? belly : x + y * 0.2 < hx - 80 ? scaleLit : scale));
  circle(c, hx - 100, hy + 16, 4, dark, 3);
  // Horns, a closed eye, a wisp from the nostril.
  for (const [ex, ey, l] of [[hx + 20, hy - 22, 46], [hx + 4, hy - 28, 38]] as const) {
    for (let k = 0; k < l; k++) {
      const t = k / l;
      c.fill(ex + t * l * 0.9, ey - Math.sin(t * 1.4) * l * 0.5, ex + t * l * 0.9 + Math.max(2, 7 * (1 - t)), ey - Math.sin(t * 1.4) * l * 0.5 + 3, t < 0.5 ? hex("#c8c0a8") : hex("#e8e0c8"));
    }
  }
  line(c, hx - 42, hy - 2, hx - 22, hy + 2, dark, 3);
  line(c, hx - 42, hy - 2, hx - 38, hy + 4, dark, 2);
  return c;
}

/** "Z z z" rising from the dragon's head; `k` is how far they've risen. */
function snore(k: number): Canvas {
  const c = new Canvas(90, 110);
  const col = mix(hex("#c8d0f0"), hex("#000000"), k / 6);
  text(c, "Z", 6 + k * 3, 92 - k * 10, col, 3);
  if (k > 1) text(c, "Z", 34 + k * 2, 66 - k * 8, col, 2);
  if (k > 3) text(c, "Z", 60, 30 - (k - 3) * 6, col, 2);
  return c;
}

export const DRAGONS_HOARD: StageDesign = {
  id: "gi-dragons-hoard",
  name: "Dragon's Hoard",
  draw: () => {
    const layers: Layer[] = [{ canvas: caveWall(), y: 0, delta: [0, 0], tile: false }];
    const flames = [0, 1, 2, 3].map(torch);
    for (const x of [-480, 480]) layers.push({ canvas: flames[0]!, frames: flames.slice(1), ticks: 5, y: 250, x, delta: [0.08, 0.05], tile: false });
    layers.push({ canvas: glow([[160, 270, 260, hex("#3a1c06")], [1120, 270, 260, hex("#3a1c06")], [640, 560, 560, hex("#2e2006")]]), y: 0, delta: [0.08, 0.05], tile: false, light: true });
    layers.push({ canvas: hoard(), y: GROUND - 300 + 20, delta: [0.18, 0.1], tile: false });
    layers.push({ canvas: dragon(), y: GROUND - 300 - 104, x: 30, delta: [0.18, 0.1], tile: false, bob: [2, 260] });
    const zs = [0, 1, 2, 3, 4, 5].map(snore);
    layers.push({ canvas: zs[0]!, frames: zs.slice(1), ticks: 20, y: 166, x: -330, delta: [0.18, 0.1], tile: false });
    layers.push({ canvas: stalactites(), y: 0, delta: [0.3, 0.15], tile: true });
    // Rocks and stalagmites at the sides, near.
    const near = new Canvas(WIDE, 260), nr = rng(341);
    for (const [x0, x1] of [[0, WIDE / 2 - 520], [WIDE / 2 + 520, WIDE]] as const) {
      for (let x = x0 + 20; x < x1 - 40; x += 70 + nr() * 90) {
        const h = 60 + nr() * 180, w = 30 + nr() * 40;
        polygon(near, [[x - w, 260], [x + w, 260], [x + w * 0.2, 260 - h], [x - w * 0.15, 260 - h * 0.9]], (px) => (px < x - w * 0.3 ? hex("#3a2c44") : hex("#1e1626")));
      }
    }
    layers.push({ canvas: near, y: GROUND - 256, delta: [0.7, 0.4], tile: true });
    // Rock floor with spilled coins.
    const floor = new Canvas(WIDE, HEIGHT - GROUND + 20), fr = rng(351);
    floor.gradient(0, floor.height, [[0, hex("#3a2c34")], [1, hex("#1a1218")]], 12);
    for (let i = 0; i < 90; i++) {
      const x = fr() * WIDE, y = 3 + fr() * (floor.height - 6), s = 3 + fr() * 10;
      circle(floor, x, y, s, (dx, dy) => (dx + dy < -0.4 ? hex("#4a3a44") : hex("#2a1e26")), s * 0.4);
    }
    for (let i = 0; i < 70; i++) {
      const x = fr() * WIDE, y = 4 + fr() * (floor.height - 8);
      circle(floor, x, y, 3 + fr() * 2, (dx, dy) => (dx + dy < -0.4 ? GOLD[4]! : GOLD[2]!), 1.6);
    }
    layers.push({ canvas: floor, y: GROUND, delta: [1, 1], tile: true });
    return layers;
  },
};
