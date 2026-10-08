/**
 * The Mint: where Greed Island's coins are made. Brick and steel, a crucible of molten gold glowing, coin presses
 * stamping, a conveyor carrying fresh coins past, gauges and pipes, a banner, a diamond-plate floor. Drawn in code.
 */
import { textWidth } from "../fx/font.ts";
import { Canvas, circle, dithered, hex, line, mix, polygon, rng, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";

const STEEL = { dark: hex("#1e2228"), mid: hex("#3a4048"), light: hex("#6a7280"), shine: hex("#a8b0bc") };
const GOLD = [hex("#7a4a08"), hex("#c9971c"), hex("#f6c945"), hex("#fff0a0")];

/** A coin seen from a little above: an ellipse with a rim and a shine. */
function coin(c: Canvas, cx: number, cy: number, r: number): void {
  circle(c, cx, cy + 1, r, GOLD[0]!, r * 0.45);
  circle(c, cx, cy, r, (dx, dy) => (Math.hypot(dx, dy) > 0.78 ? GOLD[1]! : dx + dy < -0.5 ? GOLD[3]! : GOLD[2]!), r * 0.42);
}

/** The back wall: dark brick, a steel beam across, pipes and gauges. */
function wall(): Canvas {
  const c = new Canvas(WIDTH, HEIGHT), r = rng(201);
  const mortar = hex("#140c0a");
  const bricks: Rgb[] = [hex("#4a2418"), hex("#53291b"), hex("#43201a"), hex("#5a2e1e")];
  c.fill(0, 0, WIDTH, HEIGHT, mortar);
  for (let y = 0, row = 0; y < HEIGHT; y += 18, row++) {
    for (let x = row % 2 ? -24 : 0; x < WIDTH; x += 48) {
      c.fill(x + 1, y + 1, x + 47, y + 17, bricks[Math.floor(r() * bricks.length)]!);
      c.fill(x + 1, y + 1, x + 47, y + 3, hex("#6a3a26"));
    }
  }
  // Darker toward the top and the corners (the light is low, from the furnace).
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const t = Math.max(0, 1 - y / 420) * 0.85 + (Math.abs(x - WIDTH / 2) / (WIDTH / 2)) * 0.25;
    if (dithered(x, y, t)) c.set(x, y, mortar);
  }
  // A steel beam with rivets.
  c.fill(0, 90, WIDTH, 120, STEEL.mid);
  c.fill(0, 90, WIDTH, 94, STEEL.light);
  c.fill(0, 116, WIDTH, 120, STEEL.dark);
  for (let x = 12; x < WIDTH; x += 40) c.set(x, 105, STEEL.shine);
  // Pipes down the wall, with gauges.
  for (const x of [70, 1180]) {
    c.fill(x, 120, x + 18, HEIGHT, STEEL.mid);
    c.fill(x, 120, x + 4, HEIGHT, STEEL.light);
    c.fill(x - 4, 300, x + 22, 310, STEEL.dark);
    circle(c, x + 9, 250, 18, (dx, dy) => (Math.hypot(dx, dy) > 0.82 ? STEEL.shine : hex("#e8e0c8")));
    line(c, x + 9, 250, x + 19, 243, hex("#c02020"), 2);
  }
  return c;
}

/** A banner hanging from the beam. */
function banner(): Canvas {
  const label = "GREED ISLAND MINT", sub = "EST. 2026", w = textWidth(label, 3) + 60, c = new Canvas(w, 92);
  c.fill(0, 0, w, 6, STEEL.dark);
  polygon(c, [[8, 6], [w - 8, 6], [w - 8, 74], [w / 2, 90], [8, 74]], (x, y) => (y < 10 || x < 12 || x > w - 13 ? hex("#5a0c14") : hex("#8a1420")));
  text(c, label, Math.round(w / 2 - textWidth(label, 3) / 2), 18, GOLD[2]!, 3);
  text(c, sub, Math.round(w / 2 - textWidth(sub, 2) / 2), 50, GOLD[1]!, 2);
  return c;
}

/** The crucible: a big bucket of molten gold on chains, glowing. */
function crucible(): Canvas {
  const c = new Canvas(220, 300);
  for (const x of [40, 180]) for (let y = 0; y < 150; y += 8) circle(c, x, y + 4, 3, STEEL.light, 4);
  polygon(c, [[20, 150], [200, 150], [180, 280], [40, 280]], (x) => (x < 50 ? STEEL.light : x > 170 ? STEEL.dark : STEEL.mid));
  c.fill(14, 146, 206, 158, STEEL.shine);
  // A spout on the right lip.
  polygon(c, [[196, 146], [218, 138], [218, 146], [204, 158]], STEEL.shine);
  for (let x = 20; x < 200; x++) {
    const wave = Math.round(2 * Math.sin(x / 9));
    for (let y = 138 + wave; y < 150; y++) c.set(x, y, y < 142 + wave ? hex("#fffbe0") : GOLD[2]!);
  }
  return c;
}

/** Molten gold pouring from the spout down to the belt: a wobbling stream, a little different each frame. */
function pour(k: number): Canvas {
  const c = new Canvas(40, 200), r = rng(221 + k);
  for (let y = 0; y < c.height; y++) {
    const w = 8 + Math.round(2 * Math.sin(y / 11 + k * 2)), x0 = 20 + Math.round(Math.sin(y / 23 + k) * 2) - Math.floor(w / 2);
    c.fill(x0 - 1, y, x0 + w + 1, y + 1, GOLD[1]!);
    c.fill(x0, y, x0 + w, y + 1, GOLD[2]!);
    c.fill(x0 + 2, y, x0 + 4, y + 1, y % 9 < 4 ? hex("#fffbe0") : GOLD[3]!);
  }
  for (let i = 0; i < 14; i++) circle(c, 20 + (r() - 0.5) * 30, 184 + r() * 14, 2 + r() * 2, r() < 0.5 ? GOLD[3]! : GOLD[2]!);
  return c;
}

/** The crucible's light on the room, added on: brightest just above it. */
function furnaceGlow(): Canvas {
  const c = new Canvas(WIDE, HEIGHT), cx = WIDE / 2 - 420, cy = 360, LEVELS = 7;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDE; x++) {
    const d = Math.hypot((x - cx) / 1.4, y - cy) / 520;
    if (d >= 1) continue;
    const t = (1 - d) ** 2 * LEVELS, lo = Math.floor(t), lvl = dithered(x, y, t - lo) ? lo + 1 : lo;
    if (lvl > 0) c.set(x, y, mix(hex("#000000"), hex("#40200a"), lvl / LEVELS));
  }
  return c;
}

/** A coin press: a frame, a cylinder and a die that comes down `drop` of the way. */
function press(drop: number): Canvas {
  const c = new Canvas(160, 330);
  c.fill(10, 0, 30, 330, STEEL.mid);
  c.fill(130, 0, 150, 330, STEEL.mid);
  c.fill(10, 0, 14, 330, STEEL.light);
  c.fill(130, 0, 134, 330, STEEL.light);
  c.fill(0, 0, 160, 40, STEEL.dark);
  c.fill(0, 0, 160, 5, STEEL.light);
  c.fill(56, 40, 104, 120, STEEL.mid);
  c.fill(56, 40, 64, 120, STEEL.shine);
  const ram = 120 + Math.round(drop * 120);
  c.fill(72, 120, 88, ram, STEEL.light);
  c.fill(50, ram, 110, ram + 26, STEEL.dark);
  c.fill(50, ram, 110, ram + 4, STEEL.light);
  c.fill(30, 290, 130, 330, STEEL.dark);
  c.fill(30, 290, 130, 294, STEEL.light);
  // Hazard stripes on the base.
  for (let x = 30; x < 130; x++) for (let y = 300; y < 312; y++) if (Math.floor((x + y) / 6) % 2 === 0) c.set(x, y, hex("#e0b020"));
  if (drop > 0.95) for (const [dx, dy] of [[-28, 278], [28, 278], [-34, 284], [34, 284]] as const) c.set(80 + dx, dy, hex("#fff0a0"));
  return c;
}

/** The conveyor's frame and belt. */
function conveyor(): Canvas {
  const c = new Canvas(WIDE, 70);
  c.fill(0, 10, WIDE, 22, hex("#16181c"));
  c.fill(0, 10, WIDE, 12, hex("#3a3e46"));
  c.fill(0, 22, WIDE, 34, STEEL.mid);
  c.fill(0, 22, WIDE, 24, STEEL.light);
  for (let x = 0; x < WIDE; x += 64) {
    circle(c, x + 32, 28, 5, STEEL.shine);
    c.fill(x + 6, 34, x + 14, 70, STEEL.dark);
  }
  return c;
}

/** Fresh coins on the belt, evenly spaced so the layer repeats seamlessly as it moves. */
function beltCoins(): Canvas {
  const c = new Canvas(WIDE, 24), r = rng(211);
  for (let x = 20; x < WIDE; x += 80) coin(c, x + Math.floor(r() * 16), 11, 16);
  return c;
}

/** Diamond plate: steel with raised diamonds in rows. */
function diamondPlate(): Canvas {
  const c = new Canvas(WIDE, HEIGHT - GROUND + 20);
  c.gradient(0, c.height, [[0, hex("#4a505a")], [1, hex("#2a2e34")]], 12);
  for (let y = 4, row = 0; y < c.height; y += 10, row++) {
    for (let x = row % 2 ? 10 : 0; x < WIDE; x += 20) {
      line(c, x, y + 3, x + 6, y, STEEL.shine);
      line(c, x + 1, y + 4, x + 7, y + 1, hex("#20242a"));
    }
  }
  c.fill(0, 0, WIDE, 3, hex("#e0b020"));
  for (let x = 0; x < WIDE; x += 24) c.fill(x, 0, x + 12, 3, hex("#1a1a1a"));
  return c;
}

export const MINT: StageDesign = {
  id: "gi-the-mint",
  name: "The Mint",
  draw: () => {
    const layers: Layer[] = [{ canvas: wall(), y: 0, delta: [0, 0], tile: false }];
    layers.push({ canvas: banner(), y: 120, delta: [0.05, 0.03], tile: false });
    layers.push({ canvas: crucible(), y: 140, x: -420, delta: [0.2, 0.1], tile: false });
    const stream = [0, 1, 2].map(pour);
    layers.push({ canvas: stream[0]!, frames: stream.slice(1), ticks: 4, y: 284, x: -420 + 96, delta: [0.2, 0.1], tile: false });
    layers.push({ canvas: furnaceGlow(), y: 0, delta: [0.2, 0.1], tile: true, light: true });
    // Two presses at the right, out of step with each other.
    const strokes = [0, 0.25, 0.6, 1, 1, 0.6, 0.25, 0, 0, 0];
    const p1 = strokes.map(press), p2 = [...strokes.slice(5), ...strokes.slice(0, 5)].map(press);
    layers.push({ canvas: p1[0]!, frames: p1.slice(1), ticks: 6, y: GROUND - 420, x: 330, delta: [0.35, 0.18], tile: false });
    layers.push({ canvas: p2[0]!, frames: p2.slice(1), ticks: 6, y: GROUND - 420, x: 510, delta: [0.35, 0.18], tile: false });
    layers.push({ canvas: conveyor(), y: GROUND - 120, delta: [0.45, 0.24], tile: true });
    layers.push({ canvas: beltCoins(), y: GROUND - 130, delta: [0.45, 0.24], tile: true, velocity: [1.2, 0] });
    layers.push({ canvas: diamondPlate(), y: GROUND, delta: [1, 1], tile: true });
    return layers;
  },
};
