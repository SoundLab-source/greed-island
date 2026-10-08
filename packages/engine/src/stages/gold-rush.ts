/**
 * Gold Rush: a desert canyon in the afternoon. Mesas far off, rock walls with seams of gold, a mine with a cart of
 * nuggets on its rails, a claim sign, cacti, and a tumbleweed that rolls through now and then. Drawn in code.
 */
import { Canvas, circle, dithered, hex, line, mix, polygon, ridge, rng, silhouette, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, sky, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";
import { textWidth } from "../fx/font.ts";

const NUGGET = [hex("#8a5a0c"), hex("#d9a520"), hex("#f6c945"), hex("#fff0a0")];

/** Flat-topped mesas with lit faces and strata. */
function mesas(c: Canvas, r: () => number): void {
  const body = hex("#7a3f52"), lit = hex("#a85a62"), band = hex("#6a3446");
  let x = 0;
  while (x < c.width) {
    const w = 140 + r() * 260, h = 50 + r() * 90, slope = 18 + r() * 30, base = c.height;
    polygon(c, [[x, base], [x + slope, base - h], [x + w - slope, base - h], [x + w, base]], (px, py) => (px < x + slope + (base - py) * 0.1 + 10 ? lit : (Math.round(py) % 14 < 2 ? band : body)));
    x += w + r() * 120;
  }
}

/** Canyon walls: strata of orange rock either side of a low middle, with gold seams that sparkle. */
function canyon(c: Canvas, r: () => number): void {
  const line_ = ridge(c.width, 141, [[2, 40], [5, 18], [13, 6]]);
  const strata: Rgb[] = [hex("#c8703a"), hex("#b85e2c"), hex("#d88a4a"), hex("#a8522a"), hex("#c06834")];
  for (let x = 0; x < c.width; x++) {
    // Low in the middle of the layer (where the fight is), high at the sides.
    const mid = Math.abs(x - c.width / 2) / (c.width / 2);
    const top = Math.round(c.height - (60 + mid ** 1.6 * 210 + line_(x)));
    for (let y = Math.max(0, top); y < c.height; y++) {
      const band = Math.floor((y + Math.sin(x / 70) * 6) / 16) % strata.length;
      c.set(x, y, y < top + 3 ? hex("#f0a868") : strata[band]!);
    }
  }
  for (let i = 0; i < 70; i++) {
    let x = r() * c.width, y = c.height - r() * 200;
    const len = 20 + r() * 50;
    for (let k = 0; k < len; k++) {
      const px = Math.round(x), py = Math.round(y);
      if (c.pixels[py * c.width + ((px % c.width) + c.width) % c.width]) c.setWrapped(px, py, k % 7 === 0 ? NUGGET[3]! : NUGGET[2]!);
      x += 1;
      y += (r() - 0.5) * 1.6;
    }
  }
}

/** The mine: timbered entrance in a rock face, rails, a cart of nuggets, a lantern; and a claim sign. */
function mine(): Canvas {
  const c = new Canvas(WIDE, 300), r = rng(151);
  const rock = hex("#9a4e28"), rockLit = hex("#c86e3a"), dark = hex("#140a06");
  const beam = hex("#6a4424"), beamLit = hex("#9a6a3a"), beamDark = hex("#3a2212");
  // Left of the fight when the camera's in the middle (layer x 1280 is the middle of the screen).
  const mx = 760;
  // The rock face around the entrance.
  polygon(c, [[mx - 260, 300], [mx - 210, 120], [mx - 120, 60], [mx + 40, 40], [mx + 170, 90], [mx + 240, 190], [mx + 270, 300]], (x, y) => (x + y * 0.5 < mx - 60 + 120 ? rockLit : dithered(x, y, 0.15) ? hex("#8a4422") : rock));
  // The opening, timbered.
  polygon(c, [[mx - 70, 300], [mx - 70, 150], [mx - 50, 128], [mx + 50, 128], [mx + 70, 150], [mx + 70, 300]], dark);
  c.fill(mx - 84, 130, mx - 66, 300, beam);
  c.fill(mx - 84, 130, mx - 78, 300, beamLit);
  c.fill(mx + 66, 130, mx + 84, 300, beam);
  c.fill(mx + 66, 130, mx + 72, 300, beamLit);
  c.fill(mx - 96, 116, mx + 96, 134, beam);
  c.fill(mx - 96, 116, mx + 96, 120, beamLit);
  c.fill(mx - 96, 132, mx + 96, 134, beamDark);
  // A lantern hanging from the beam.
  c.fill(mx + 40, 134, mx + 42, 148, hex("#2a1a0e"));
  c.fill(mx + 35, 148, mx + 47, 164, hex("#3a2a14"));
  c.fill(mx + 37, 150, mx + 45, 162, hex("#ffd27a"));
  // Rails out of the mine, and the cart.
  for (const y of [282, 292]) c.fill(mx - 70, y, mx + 330, y + 3, hex("#5a5a62"));
  for (let x = mx - 60; x < mx + 330; x += 26) c.fill(x, 280, x + 8, 298, beamDark);
  const kx = mx + 110;
  polygon(c, [[kx, 214], [kx + 120, 214], [kx + 108, 270], [kx + 12, 270]], (x) => (x < kx + 30 ? hex("#6a6e7a") : hex("#4a4e5a")));
  c.fill(kx - 2, 210, kx + 122, 216, hex("#8a8e9a"));
  for (const wx of [kx + 30, kx + 90]) circle(c, wx, 274, 12, (dx, dy) => (Math.hypot(dx, dy) < 0.4 ? hex("#8a8e9a") : hex("#2a2c32")));
  for (let i = 0; i < 26; i++) {
    const nx = kx + 10 + r() * 100, ny = 212 - r() * 26 * Math.sin(((nx - kx) / 120) * Math.PI);
    circle(c, nx, ny, 5 + r() * 4, (dx, dy) => NUGGET[dx + dy < -0.7 ? 3 : dx + dy < 0 ? 2 : dx + dy < 0.6 ? 1 : 0]!, 4 + r() * 3);
  }
  // A claim sign on a post, on the other side.
  const sx = 1840;
  c.fill(sx - 4, 170, sx + 4, 300, beam);
  const label = "CLAIM NO. 1", w = textWidth(label, 2) + 24;
  c.fill(sx - w / 2, 150, sx + w / 2, 186, beam);
  c.fill(sx - w / 2, 150, sx + w / 2, 154, beamLit);
  text(c, label, Math.round(sx - textWidth(label, 2) / 2), 162, hex("#f0e0c0"), 2);
  return c;
}

/** A saguaro: a trunk and arms, ribbed. */
function cactus(c: Canvas, x: number, base: number, h: number, r: () => number): void {
  const body = hex("#2f5a32"), lit = hex("#4f8a4a"), rib = hex("#24462a");
  const stem = (x0: number, y0: number, y1: number, w: number) => {
    c.fill(x0 - w / 2, y1, x0 + w / 2, y0, body);
    c.fill(x0 - w / 2, y1, x0 - w / 2 + 3, y0, lit);
    for (let k = -w / 2 + 6; k < w / 2; k += 6) c.fill(x0 + k, y1 + 4, x0 + k + 1, y0, rib);
    circle(c, x0, y1, w / 2, (dx) => (dx < -0.4 ? lit : body));
  };
  stem(x, base, base - h, 22);
  for (const side of [-1, 1]) {
    if (r() < 0.25) continue;
    const ay = base - h * (0.35 + r() * 0.3), ax = x + side * 30;
    c.fill(Math.min(x, ax), ay, Math.max(x, ax), ay + 14, body);
    stem(ax, ay + 14, ay - h * 0.3, 16);
  }
}

/** A tumbleweed turned `angle` radians: tangled loops around a centre. */
function tumbleweed(angle: number): Canvas {
  const c = new Canvas(64, 64), r = rng(171);
  const cols = [hex("#a87a48"), hex("#c89a62"), hex("#7a5430")];
  for (let i = 0; i < 26; i++) {
    const a0 = r() * Math.PI * 2 + angle, sweep = 1.5 + r() * 2.5, rad = 10 + r() * 18, col = cols[i % 3]!;
    let [px, py] = [32 + Math.cos(a0) * rad, 32 + Math.sin(a0) * rad];
    for (let k = 1; k <= 14; k++) {
      const a = a0 + (sweep * k) / 14, rr = rad * (0.6 + 0.4 * Math.sin(k));
      const nx = 32 + Math.cos(a) * rr, ny = 32 + Math.sin(a) * rr;
      line(c, px, py, nx, ny, col);
      [px, py] = [nx, ny];
    }
  }
  return c;
}

export const GOLD_RUSH: StageDesign = {
  id: "gi-gold-rush",
  name: "Gold Rush",
  draw: () => {
    const layers: Layer[] = [];
    layers.push(
      sky([[0, "#2a6fb8"], [0.32, "#6aa8dc"], [0.5, "#b8d4e8"], [0.58, "#f2d6a0"], [1, "#f0b070"]], (c) => {
        circle(c, 300, 120, 40, (dx, dy) => (Math.hypot(dx, dy) < 0.75 ? hex("#fffbe8") : hex("#fff0b8")));
        const r = rng(131);
        for (let i = 0; i < 6; i++) {
          const x = r() * WIDTH, y = 60 + r() * 160, w = 120 + r() * 200;
          for (let k = 0; k < 3; k++) c.fill(Math.round(x + k * 18), Math.round(y + k * 5), Math.round(x + w - k * 30), Math.round(y + k * 5 + 3), hex("#e8f0f8"));
        }
      }),
    );
    const far = new Canvas(WIDE, 180);
    mesas(far, rng(133));
    layers.push({ canvas: far, y: 400 - 180 + 20, delta: [0.08, 0.05], tile: true });
    const walls = new Canvas(WIDE, 380);
    canyon(walls, rng(143));
    layers.push({ canvas: walls, y: GROUND - 380 + 10, delta: [0.25, 0.14], tile: true });
    layers.push({ canvas: mine(), y: GROUND - 300 + 4, delta: [0.5, 0.28], tile: true });
    const plants = new Canvas(WIDE, 220);
    const pr = rng(161);
    // Clear of the mine and the sign (this layer pans a little faster than theirs).
    for (const [x, h] of [[600, 170], [1660, 100], [2250, 150], [140, 120]] as const) cactus(plants, x, 220, h + pr() * 20, pr);
    for (let i = 0; i < 18; i++) {
      const x = pr() * WIDE, w = 10 + pr() * 26;
      if (Math.abs(x - WIDE / 2) < 420) continue;
      circle(plants, x, 218, w, (dx, dy) => (dx + dy < -0.4 ? hex("#c87a4a") : hex("#8a4a2a")), w * 0.55);
    }
    layers.push({ canvas: plants, y: GROUND - 216, delta: [0.75, 0.42], tile: true });
    // Red earth, with wagon ruts and pebbles.
    const dirt = new Canvas(WIDE, HEIGHT - GROUND + 20);
    dirt.gradient(0, dirt.height, [[0, hex("#d08a52")], [0.5, hex("#b86e3e")], [1, hex("#94532e")]], 14);
    for (const y of [30, 52]) for (let x = 0; x < WIDE; x++) if (dithered(x, y, 0.7)) dirt.set(x, y, hex("#8a4a26"));
    const dr = rng(181);
    for (let i = 0; i < 120; i++) {
      const x = dr() * WIDE, y = 4 + dr() * (dirt.height - 8);
      circle(dirt, x, y, 1.5 + dr() * 2.5, (dx, dy) => (dx + dy < 0 ? hex("#e8b080") : hex("#7a4222")), 1.2 + dr());
    }
    layers.push({ canvas: dirt, y: GROUND, delta: [1, 1], tile: true });
    // The tumbleweed: rolls in from the left now and then, across the whole stage.
    const turns = [0, 1, 2, 3, 4, 5].map((k) => tumbleweed((k / 6) * Math.PI));
    layers.push({ canvas: turns[0]!, frames: turns.slice(1), ticks: 5, y: GROUND - 58, x: -2000, delta: [1, 1], tile: true, tileSpacing: 4200, velocity: [2.4, 0], bob: [5, 34] });
    return layers;
  },
};
