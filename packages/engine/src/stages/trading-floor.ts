/**
 * The Trading Floor: the Greed Island Exchange. A big LED board with a chart that climbs (and wobbles), our own
 * tickers (SALT, GOLD, LOOT, BONK...), a ticker tape scrolling across the top, walls of monitors, trading desks and
 * paper slips drifting down. Drawn in code.
 */
import { Canvas, circle, dithered, hex, line, mix, polygon, rng, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";
import { textWidth } from "../fx/font.ts";

const UP = hex("#3ddc84"), DOWN = hex("#ff4d5a"), AMBER = hex("#ffb84a"), LED_OFF = hex("#0c1220");

/** The board's tickers: a name and a change in tenths of a percent (our own jokes, no real markets). */
const TICKERS: readonly (readonly [string, number])[] = [
  ["SALT", 42], ["GOLD", 11], ["LOOT", -30], ["BONK", 120], ["CASH", -4], ["YOINK", 77], ["COIN", 23], ["GREED", 99], ["BAIL", -15], ["HYPE", 58],
];
const change = (tenths: number) => `${tenths >= 0 ? "+" : "-"}${Math.floor(Math.abs(tenths) / 10)}.${Math.abs(tenths) % 10}%`;

/** A small up or down triangle, `size` pixels tall, top-left at x, y. */
function arrow(c: Canvas, x: number, y: number, size: number, up: boolean): void {
  for (let k = 0; k < size; k++) {
    const half = up ? k : size - 1 - k;
    c.fill(x + size - 1 - half, y + k, x + size + half, y + k + 1, up ? UP : DOWN);
  }
}

/** LED dots: every third pixel faintly lit, like an unlit matrix. */
function ledDots(c: Canvas, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) c.set(x, y, LED_OFF);
}

/** A price line over `w` x `h`: a seeded climb with dips, the last stretch red; area under it dithered. */
function chart(c: Canvas, x0: number, y0: number, w: number, h: number, seed: number, endDown: boolean): void {
  const r = rng(seed);
  const pts: number[] = [];
  let v = 0.25;
  for (let i = 0; i <= 40; i++) {
    v += (r() - 0.38) * 0.09;
    if (endDown && i > 34) v -= 0.05;
    pts.push(Math.max(0.05, Math.min(0.95, v)));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const xa = x0 + (i / 40) * w, xb = x0 + ((i + 1) / 40) * w;
    const ya = y0 + h - pts[i]! * h, yb = y0 + h - pts[i + 1]! * h;
    const col = endDown && i >= 34 ? DOWN : UP;
    for (let x = Math.round(xa); x < Math.round(xb); x++) {
      const yy = ya + ((x - xa) / (xb - xa)) * (yb - ya);
      for (let y = Math.round(yy) + 2; y < y0 + h; y++) if (dithered(x, y, 0.35 * (1 - (y - yy) / h))) c.set(x, y, mix(col, hex("#000000"), 0.6));
    }
    line(c, xa, ya, xb, yb, col, 2);
  }
}

/** The big board: a bezel, the title, a chart and the tickers. */
function board(): Canvas {
  const W = 1020, H = 330, c = new Canvas(W, H);
  c.fill(0, 0, W, H, hex("#22262e"));
  c.fill(0, 0, W, 3, hex("#3c424e"));
  c.fill(12, 12, W - 12, H - 12, hex("#04060c"));
  ledDots(c, 14, 14, W - 14, H - 14);
  const title = "GREED ISLAND EXCHANGE";
  text(c, title, Math.round(W / 2 - textWidth(title, 3) / 2), 26, AMBER, 3);
  c.fill(24, 60, W - 24, 62, hex("#2a1e0a"));
  // The chart, with faint grid lines.
  const cx = 330, cy = 80, cw = W - cx - 30, ch = H - cy - 30;
  for (let k = 0; k <= 4; k++) for (let x = cx; x < cx + cw; x += 4) c.set(x, cy + (k * ch) / 4, hex("#1a2234"));
  chart(c, cx, cy, cw, ch, 5, true);
  text(c, "SALT INDEX", cx + 6, cy + 4, hex("#8a96b0"), 2);
  // The tickers, two columns.
  TICKERS.slice(0, 7).forEach(([name, tenths], i) => {
    const y = 80 + i * 33, up = tenths >= 0;
    text(c, name, 30, y, hex("#d8deea"), 2);
    arrow(c, 130, y + 1, 10, up);
    text(c, change(tenths), 156, y, up ? UP : DOWN, 2);
  });
  return c;
}

/** The ticker tape: names and changes, spaced so it repeats seamlessly across the layer. */
function tape(): Canvas {
  const c = new Canvas(WIDE, 30), slot = WIDE / TICKERS.length;
  c.fill(0, 0, WIDE, 30, hex("#05070c"));
  c.fill(0, 0, WIDE, 2, hex("#2c313c"));
  c.fill(0, 28, WIDE, 30, hex("#2c313c"));
  ledDots(c, 0, 3, WIDE, 27);
  TICKERS.forEach(([name, tenths], i) => {
    const x = Math.round(i * slot) + 16, up = tenths >= 0;
    text(c, name, x, 8, AMBER, 2);
    arrow(c, x + textWidth(name, 2) + 10, 9, 8, up);
    text(c, change(tenths), x + textWidth(name, 2) + 28, 8, up ? UP : DOWN, 2);
  });
  return c;
}

/** Banks of monitors either side, each with a little chart. */
function monitors(): Canvas {
  const c = new Canvas(WIDE, 300), r = rng(91);
  for (const [x0, x1] of [[0, WIDE / 2 - 560], [WIDE / 2 + 560, WIDE]] as const) {
    for (let x = x0 + 20; x + 150 < x1; x += 168) {
      for (const y of [10, 120]) {
        c.fill(x, y, x + 150, y + 96, hex("#1a1d24"));
        c.fill(x + 6, y + 6, x + 144, y + 90, hex("#05080e"));
        chart(c, x + 10, y + 12, 128, 72, Math.floor(r() * 1000), r() < 0.35);
      }
      c.fill(x + 70, 216, x + 80, 300, hex("#14161c"));
    }
  }
  return c;
}

/** Trading desks: long counters with screens glowing on them, chairs behind. */
function desks(): Canvas {
  const c = new Canvas(WIDE, 140), r = rng(101);
  const top = hex("#2a2f3a"), topLit = hex("#4a5262"), front = hex("#161a22");
  for (const [x0, x1] of [[0, WIDE / 2 - 300], [WIDE / 2 + 300, WIDE]] as const) {
    c.fill(x0, 92, x1, 100, topLit);
    c.fill(x0, 100, x1, 140, front);
    c.fill(x0, 96, x1, 100, top);
    for (let x = x0 + 24; x + 70 < x1; x += 96 + Math.floor(r() * 30)) {
      const pick = r(), glow = pick < 0.3 ? DOWN : pick < 0.45 ? AMBER : UP;
      c.fill(x, 40, x + 64, 88, hex("#0e1016"));
      c.fill(x + 4, 44, x + 60, 84, mix(glow, hex("#000000"), 0.7));
      for (let k = 0; k < 4; k++) c.fill(x + 8, 50 + k * 8, x + 12 + Math.floor(r() * 40), 52 + k * 8, glow);
      c.fill(x + 28, 88, x + 36, 92, hex("#0e1016"));
      // A chair back between screens.
      circle(c, x + 84, 76, 11, (dx, dy) => (dx + dy < -0.6 ? hex("#262c3a") : hex("#12151c")), 15);
    }
  }
  return c;
}

/** Paper slips, scattered so the layer can repeat in both directions as they fall. */
function slips(): Canvas {
  const c = new Canvas(WIDE, HEIGHT), r = rng(111);
  const colors: Rgb[] = [hex("#e8ecf4"), hex("#c8d0e0"), hex("#f6e7a8")];
  for (let i = 0; i < 70; i++) {
    const x = r() * WIDE, y = r() * HEIGHT, col = colors[Math.floor(r() * colors.length)]!;
    const flat = r() < 0.5;
    polygon(c, flat ? [[x, y], [x + 6, y + 1], [x + 5, y + 4], [x - 1, y + 3]] : [[x, y], [x + 3, y], [x + 4, y + 6], [x + 1, y + 6]], col);
  }
  return c;
}

export const TRADING_FLOOR: StageDesign = {
  id: "gi-trading-floor",
  name: "The Trading Floor",
  draw: () => {
    const layers: Layer[] = [];
    const wall = new Canvas(WIDTH, HEIGHT);
    wall.gradient(0, HEIGHT, [[0, hex("#04060c")], [0.5, hex("#0a0f1e")], [0.85, hex("#121a30")], [1, hex("#0a0e1a")]], 18);
    // Glass panels behind, catching the board's light.
    for (let x = 0; x < WIDTH; x += 128) wall.fill(x, 0, x + 2, HEIGHT, hex("#141c30"));
    layers.push({ canvas: wall, y: 0, delta: [0, 0], tile: false });
    // The tape runs just under the game's life bars, the board under it.
    layers.push({ canvas: tape(), y: 150, delta: [0.08, 0.04], tile: true, velocity: [-1.5, 0] });
    layers.push({ canvas: board(), y: 192, delta: [0.12, 0.06], tile: false });
    // The board's glow on the room, added on.
    const glow = new Canvas(WIDTH, HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const d = Math.hypot((x - WIDTH / 2) / 1.5, (y - 350) * 1.2) / 700;
        if (d >= 1) continue;
        const t = (1 - d) ** 2 * 5, lo = Math.floor(t), lvl = dithered(x, y, t - lo) ? lo + 1 : lo;
        if (lvl > 0) glow.set(x, y, mix(hex("#000000"), hex("#102018"), lvl / 5));
      }
    }
    layers.push({ canvas: glow, y: 0, delta: [0.12, 0.06], tile: false, light: true });
    layers.push({ canvas: monitors(), y: 120, delta: [0.3, 0.15], tile: true });
    layers.push({ canvas: desks(), y: GROUND - 136, delta: [0.65, 0.35], tile: true });
    // Carpet: deep blue with a small diamond pattern and a few slips on it.
    const carpet = new Canvas(WIDE, HEIGHT - GROUND + 20);
    carpet.gradient(0, carpet.height, [[0, hex("#1e2a4a")], [1, hex("#121a30")]], 10);
    for (let y = 4; y < carpet.height; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < WIDE; x += 24) {
      carpet.set(x, y, hex("#2c3c64"));
      carpet.set(x - 1, y + 1, hex("#2c3c64"));
      carpet.set(x + 1, y + 1, hex("#2c3c64"));
      carpet.set(x, y + 2, hex("#2c3c64"));
    }
    const cr = rng(121);
    for (let i = 0; i < 26; i++) {
      const x = cr() * WIDE, y = 6 + cr() * (carpet.height - 12);
      polygon(carpet, [[x, y], [x + 9, y + 1], [x + 8, y + 5], [x - 1, y + 4]], hex("#c8d0e0"));
    }
    layers.push({ canvas: carpet, y: GROUND, delta: [1, 1], tile: true });
    layers.push({ canvas: slips(), y: 0, delta: [0.85, 0.85], tile: true, tileY: true, velocity: [-0.15, 0.45] });
    return layers;
  },
};
