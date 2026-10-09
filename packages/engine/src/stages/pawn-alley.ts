/**
 * Pawn Alley: a back street on a rainy night. A pawn shop with the three gold balls and a barred window full of loot,
 * neon that flickers (PAWN SHOP, CASH 4 GOLD, WE BUY GOLD), a fire escape, a streetlamp, a dumpster with a cat whose
 * eyes blink, wet asphalt that shines with the neon, and rain. Drawn in code.
 */
import { textWidth } from "../fx/font.ts";
import { Canvas, circle, dithered, hex, line, mix, polygon, rng, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";

const NEON = { pink: hex("#ff4fa8"), pinkCore: hex("#ffd0ea"), green: hex("#3dff9a"), greenCore: hex("#d0ffe8"), amber: hex("#ffb84a"), off: hex("#3a1830") };
const GOLD = [hex("#8a5a0c"), hex("#c9971c"), hex("#f6c945"), hex("#fff0a0")];

/** Neon lettering: a coloured tube with a pale core down the strokes; `dim` draws it switched off. */
function neonText(c: Canvas, s: string, x: number, y: number, scale: number, tube: Rgb, core: Rgb, dim = false): void {
  const g = new Canvas(textWidth(s, scale) + 4, 7 * scale + 4);
  text(g, s, 2, 2, tube, scale);
  for (let gy = 0; gy < g.height; gy++) for (let gx = 0; gx < g.width; gx++) {
    if (!g.pixels[gy * g.width + gx]) continue;
    const inner = scale >= 3 && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => g.pixels[(gy + dy!) * g.width + gx + dx!]);
    c.set(x - 2 + gx, y - 2 + gy, dim ? NEON.off : inner ? core : tube);
  }
}

/** The back of the alley: wet brick, a rainy sky strip, dark windows (a few lit), a drainpipe. */
function backWall(): Canvas {
  const c = new Canvas(WIDTH, HEIGHT), r = rng(501);
  c.gradient(0, 120, [[0, hex("#0a0816")], [1, hex("#1e1838")]], 10);
  for (let i = 0; i < 6; i++) {
    const x = r() * WIDTH, w = 150 + r() * 200;
    c.fill(x, 30 + r() * 40, x + w, 120, hex("#120e22"));
  }
  const mortar = hex("#0e0a10"), bricks: Rgb[] = [hex("#3a1c1e"), hex("#341a1c"), hex("#401f20"), hex("#2e1618")];
  c.fill(0, 120, WIDTH, HEIGHT, mortar);
  for (let y = 120, row = 0; y < HEIGHT; y += 14, row++) {
    for (let x = row % 2 ? -18 : 0; x < WIDTH; x += 36) c.fill(x + 1, y + 1, x + 35, y + 13, bricks[Math.floor(r() * bricks.length)]!);
  }
  // Rain streaking the wall: darker vertical runs.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * WIDTH), y0 = 120 + r() * 300, len = 40 + r() * 200;
    for (let y = y0; y < y0 + len; y++) if (dithered(x, y, 0.5)) c.set(x, y, hex("#1a0c0e"));
  }
  // Windows upstairs.
  for (const [x, y, lit] of [[90, 170, false], [250, 170, true], [980, 160, false], [1130, 160, true], [980, 290, false], [1130, 290, false]] as const) {
    c.fill(x - 4, y - 4, x + 64, y + 84, hex("#1a1012"));
    c.fill(x, y, x + 60, y + 80, lit ? hex("#e8a050") : hex("#0a0c18"));
    if (lit) c.fill(x, y + 50, x + 60, y + 80, hex("#c07838"));
    c.fill(x + 28, y, x + 32, y + 80, hex("#1a1012"));
    c.fill(x, y + 38, x + 60, y + 42, hex("#1a1012"));
  }
  c.fill(470, 120, 482, HEIGHT, hex("#2a2e36"));
  c.fill(470, 120, 473, HEIGHT, hex("#4a505c"));
  return c;
}

/** The pawn shop front: an awning, the three gold balls, a barred window full of loot, a door with OPEN. */
function shopFront(): Canvas {
  const W = 560, H = 380, c = new Canvas(W, H), r = rng(511);
  c.fill(0, 60, W, H, hex("#20181c"));
  c.fill(0, 60, W, 66, hex("#3a2c30"));
  // Striped awning.
  polygon(c, [[0, 66], [W, 66], [W - 20, 120], [20, 120]], (x) => (Math.floor(x / 40) % 2 ? hex("#6a1020") : hex("#c8c0b0")));
  for (let x = 20; x < W - 20; x += 20) circle(c, x + 10, 120, 10, (dx, dy) => (dy < 0 ? null : Math.floor(x / 40) % 2 ? hex("#6a1020") : hex("#c8c0b0")), 6);
  // The three gold balls hanging from a bracket.
  c.fill(W - 60, 0, W - 56, 30, hex("#5a5a62"));
  c.fill(W - 120, 26, W - 56, 30, hex("#5a5a62"));
  for (const [bx, by] of [[W - 112, 46], [W - 88, 46], [W - 100, 66]] as const) {
    c.fill(bx - 1, 30, bx + 1, by - 10, hex("#5a5a62"));
    circle(c, bx, by, 11, (dx, dy) => GOLD[dx + dy < -0.8 ? 3 : dx + dy < 0 ? 2 : dx + dy < 0.8 ? 1 : 0]!);
  }
  // The window: loot behind bars.
  const wx = 40, wy = 150, ww = 300, wh = 170;
  c.fill(wx - 6, wy - 6, wx + ww + 6, wy + wh + 6, hex("#3a2c30"));
  c.gradient(wy, wy + wh, [[0, hex("#3a2a18")], [1, hex("#1a120a")]], 6, false);
  c.fill(0, wy, wx, wy + wh, hex("#20181c"));
  c.fill(wx + ww, wy, W, wy + wh, hex("#20181c"));
  // A guitar, a TV, watches and rings, a gold chain.
  polygon(c, [[wx + 30, wy + 160], [wx + 70, wy + 160], [wx + 74, wy + 110], [wx + 56, wy + 96], [wx + 60, wy + 70], [wx + 40, wy + 70], [wx + 44, wy + 96], [wx + 26, wy + 110]], hex("#8a4a1a"));
  c.fill(wx + 47, wy + 10, wx + 53, wy + 70, hex("#3a2010"));
  circle(c, wx + 50, wy + 120, 8, hex("#1a0a04"));
  c.fill(wx + 110, wy + 90, wx + 190, wy + 160, hex("#2a2a30"));
  c.fill(wx + 118, wy + 98, wx + 172, wy + 150, hex("#4a6a8a"));
  c.fill(wx + 118, wy + 98, wx + 172, wy + 104, hex("#8ab0d0"));
  for (let i = 0; i < 9; i++) {
    const x = wx + 210 + (i % 3) * 26, y = wy + 40 + Math.floor(i / 3) * 34;
    circle(c, x, y, 8, (dx, dy) => (Math.hypot(dx, dy) < 0.55 ? hex("#e8e0c8") : GOLD[r() < 0.5 ? 2 : 1]!));
  }
  for (let k = 0; k < 40; k++) circle(c, wx + 120 + k * 1.8, wy + 40 + Math.sin(k / 6) * 12, 2, GOLD[k % 2 ? 2 : 3]!);
  for (let x = wx + 8; x < wx + ww; x += 22) c.fill(x, wy, x + 4, wy + wh, hex("#14100e"));
  c.fill(wx, wy + 80, wx + ww, wy + 84, hex("#14100e"));
  // The door, with a little OPEN sign.
  c.fill(390, 140, 500, H, hex("#2a1e1a"));
  c.fill(400, 150, 490, 260, hex("#120c0a"));
  c.fill(480, 280, 486, 296, hex("#8a7a50"));
  return c;
}

/** The shop's neon signs; `flicker` switches one off. */
function signs(flicker: "none" | "pawn" | "cash"): Canvas {
  const c = new Canvas(560, 160);
  // PAWN SHOP across the top of the front.
  c.fill(60, 4, 380, 58, hex("#140c14"));
  neonText(c, "PAWN SHOP", 74, 12, 5, NEON.pink, NEON.pinkCore, flicker === "pawn");
  // CASH 4 GOLD on the window.
  neonText(c, "CASH 4 GOLD", 70, 132, 3, NEON.green, NEON.greenCore, flicker === "cash");
  // OPEN on the door.
  c.fill(410, 120, 480, 146, hex("#140c14"));
  neonText(c, "OPEN", 420, 126, 2, hex("#ff3a3a"), hex("#ffd0d0"));
  return c;
}

/** Soft coloured light around the signs, added on. */
function signGlow(): Canvas {
  // Tall enough to reach the pavement, so the light fades out instead of stopping at an edge.
  const c = new Canvas(760, 470), LEVELS = 5;
  const spots: [number, number, number, Rgb][] = [[320, 130, 240, hex("#3a0c2a")], [270, 250, 190, hex("#0c3a20")]];
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    let best = 0, col = spots[0]![3];
    for (const [sx, sy, rad, cc] of spots) {
      const v = 1 - Math.hypot((x - sx) / 1.6, y - sy) / rad;
      if (v > best) [best, col] = [v, cc];
    }
    if (best <= 0) continue;
    const t = best ** 1.5 * LEVELS, lo = Math.floor(t), lvl = dithered(x, y, t - lo) ? lo + 1 : lo;
    if (lvl > 0) c.set(x, y, mix(hex("#000000"), col, lvl / LEVELS));
  }
  return c;
}

/** A fire escape on the left wall: platforms, railings and zig-zag stairs. */
function fireEscape(): Canvas {
  const c = new Canvas(300, 460), iron = hex("#16181e"), ironLit = hex("#3a3e48");
  for (const y of [40, 200, 360]) {
    c.fill(0, y, 300, y + 6, ironLit);
    c.fill(0, y + 6, 300, y + 10, iron);
    for (let x = 0; x < 300; x += 14) c.fill(x, y - 40, x + 2, y, iron);
    c.fill(0, y - 42, 300, y - 38, ironLit);
  }
  for (const [y0, y1, x0, x1] of [[46, 200, 260, 60], [206, 360, 60, 260]] as const) {
    line(c, x0, y0, x1, y1, ironLit, 4);
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      c.fill(x - 10, y, x + 10, y + 2, iron);
    }
  }
  return c;
}

/** The streetlamp: a post and a hood; its light is a separate layer. */
function lamp(): Canvas {
  const c = new Canvas(140, 470);
  c.fill(64, 40, 72, 470, hex("#1a1c22"));
  c.fill(64, 40, 66, 470, hex("#3a3e48"));
  c.fill(60, 440, 76, 470, hex("#1a1c22"));
  line(c, 68, 44, 110, 30, hex("#1a1c22"), 6);
  polygon(c, [[96, 26], [130, 26], [138, 40], [88, 40]], hex("#2a2e36"));
  c.fill(98, 40, 128, 44, hex("#fff2c0"));
  return c;
}

function lampLight(): Canvas {
  const c = new Canvas(360, GROUND - 160), LEVELS = 5;
  for (let y = 0; y < c.height; y++) {
    const t = y / c.height, half = 20 + t * 150;
    for (let dx = -half; dx <= half; dx++) {
      const s = (1 - Math.abs(dx) / half) ** 1.2 * (1 - t * 0.5) * LEVELS, lo = Math.floor(s), lvl = dithered(dx, y, s - lo) ? lo + 1 : lo;
      if (lvl > 0) c.set(180 + dx, y, mix(hex("#000000"), hex("#3a3018"), lvl / LEVELS));
    }
  }
  return c;
}

/** A dumpster, trash bags and boxes; the cat on the lid, eyes open or shut. */
function junk(eyesOpen: boolean): Canvas {
  const c = new Canvas(360, 200), r = rng(521);
  c.fill(40, 90, 260, 196, hex("#1e4a32"));
  c.fill(40, 90, 260, 96, hex("#2e6a48"));
  c.fill(36, 82, 264, 92, hex("#163a26"));
  for (let x = 60; x < 250; x += 40) c.fill(x, 100, x + 3, 190, hex("#163a26"));
  c.fill(50, 196, 62, 200, hex("#0e0e10"));
  c.fill(238, 196, 250, 200, hex("#0e0e10"));
  for (const [x, w] of [[270, 50], [300, 44], [10, 40]] as const) circle(c, x, 178, w / 2, (dx, dy) => (dx + dy < -0.6 ? hex("#3a3c44") : hex("#1a1c22")), w * 0.42);
  polygon(c, [[280, 140], [340, 136], [344, 196], [284, 198]], (x) => (x < 296 ? hex("#8a6a40") : hex("#6a5030")));
  // The cat, sitting on the lid: a silhouette, ears, a curled tail.
  const k = hex("#08080a");
  circle(c, 120, 64, 16, k, 18);
  circle(c, 120, 40, 11, k);
  polygon(c, [[110, 34], [113, 22], [118, 32]], k);
  polygon(c, [[122, 32], [127, 22], [130, 34]], k);
  for (let t = 0; t < 1; t += 0.02) c.fill(136 + t * 30, 80 - Math.sin(t * Math.PI) * 18, 140 + t * 30, 84 - Math.sin(t * Math.PI) * 18, k);
  if (eyesOpen) {
    c.fill(114, 38, 118, 41, hex("#c0ff60"));
    c.fill(122, 38, 126, 41, hex("#c0ff60"));
  }
  return c;
}

/** Wet asphalt: dark, with puddles that shine with the neon above. */
function asphalt(): Canvas {
  const c = new Canvas(WIDE, HEIGHT - GROUND + 20), r = rng(531);
  c.gradient(0, c.height, [[0, hex("#1a1c24")], [1, hex("#0c0d12")]], 10);
  for (let i = 0; i < 260; i++) c.set(r() * WIDE, r() * c.height, hex("#2a2c36"));
  // Puddles: dark, glossy ellipses with a pale rim, holding a soft vertical smear of the neon above.
  for (const [x, y, w, col] of [[WIDE / 2 - 380, 40, 170, NEON.pink], [WIDE / 2 - 120, 72, 120, NEON.green], [WIDE / 2 + 260, 46, 200, hex("#fff2c0")], [WIDE / 2 + 520, 82, 140, NEON.pink], [300, 60, 160, NEON.green], [WIDE - 300, 50, 180, NEON.pink]] as const) {
    const ry = w / 9;
    circle(c, x, y, w / 2, (dx, dy) => {
      const px = Math.round(x + dx * (w / 2)), py = Math.round(y + dy * ry), d = Math.hypot(dx, dy);
      if (d > 0.9 && dy < 0) return hex("#2e323e");
      const smear = Math.max(0, 1 - Math.abs(dx) / 0.32) * (0.5 + 0.5 * (1 - Math.abs(dy)));
      if (smear > 0 && dithered(px, py, smear * 0.85)) return mix(col, hex("#0c0d12"), 0.35 + 0.4 * (Math.round((1 - smear) * 3) / 3));
      return d < 0.6 && dithered(px, py, 0.25) ? hex("#161a24") : hex("#0e1018");
    }, ry);
  }
  return c;
}

/** Rain: thin slanted streaks scattered so the layer repeats both ways as it falls. */
function rain(seed: number, n: number, len: number, col: Rgb): Canvas {
  const c = new Canvas(WIDE, HEIGHT), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * WIDE, y = r() * HEIGHT;
    for (let k = 0; k < len; k++) c.setWrapped(x - k * 0.18, (y + k) % HEIGHT, col);
  }
  return c;
}

export const PAWN_ALLEY: StageDesign = {
  id: "gi-pawn-alley",
  name: "Pawn Alley",
  draw: () => {
    const layers: Layer[] = [{ canvas: backWall(), y: 0, delta: [0, 0], tile: false }];
    layers.push({ canvas: rain(541, 260, 10, hex("#3a4258")), y: 0, delta: [0.05, 0.05], tile: true, tileY: true, velocity: [-1.2, 9] });
    layers.push({ canvas: fireEscape(), y: 150, x: -470, delta: [0.12, 0.06], tile: false });
    layers.push({ canvas: shopFront(), y: GROUND - 380 + 6, x: 300, delta: [0.25, 0.12], tile: false });
    layers.push({ canvas: signGlow(), y: GROUND - 380 + 6 - 60, x: 300, delta: [0.25, 0.12], tile: false, light: true });
    const flickers = (["none", "none", "none", "pawn", "none", "pawn", "none", "none", "none", "none", "cash", "none"] as const).map(signs);
    layers.push({ canvas: flickers[0]!, frames: flickers.slice(1), ticks: 10, y: GROUND - 380 + 6 + 2, x: 300, delta: [0.25, 0.12], tile: false });
    layers.push({ canvas: lamp(), y: GROUND - 470 + 4, x: -150, delta: [0.45, 0.24], tile: false });
    layers.push({ canvas: lampLight(), y: 130, x: -150 + 47, delta: [0.45, 0.24], tile: false, light: true });
    const cat = [true, true, true, true, true, true, true, true, false, true, true, true, true, true, false, false].map(junk);
    layers.push({ canvas: cat[0]!, frames: cat.slice(1), ticks: 12, y: GROUND - 196, x: -420, delta: [0.6, 0.32], tile: false });
    layers.push({ canvas: asphalt(), y: GROUND, delta: [1, 1], tile: true });
    layers.push({ canvas: rain(551, 140, 18, hex("#5a6684")), y: 0, delta: [0.9, 0.9], tile: true, tileY: true, velocity: [-2, 14] });
    return layers;
  },
};
