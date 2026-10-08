/**
 * Treasure Island, the island the game is named for: sunset over the sea, clouds drifting, a pirate ship bobbing on
 * the horizon, palms in front, a sand floor and an open chest of gold that glints. Drawn in code (our own art).
 */
import { blend, Canvas, circle, dithered, hex, line, mix, polygon, rng, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, sky, stars, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";

const HORIZON = 440;

/** A long sunset cloud: overlapping ellipses, lit from below. */
function cloud(c: Canvas, cx: number, cy: number, w: number, r: () => number, body: Rgb, lit: Rgb, rim: Rgb): void {
  const puffs = 4 + Math.floor(r() * 4);
  for (let i = 0; i < puffs; i++) {
    const px = cx + (i / (puffs - 1) - 0.5) * w * 0.8 + (r() - 0.5) * 20;
    const pr = w * (0.12 + r() * 0.1);
    circle(c, px, cy - r() * pr * 0.4, pr, (_dx, dy) => (dy > 0.55 ? rim : dy > 0.15 ? lit : body), pr * 0.42);
  }
}

/** A palm tree from its foot: a curved, ringed trunk and drooping fronds. */
function palm(c: Canvas, x: number, base: number, height: number, lean: number, r: () => number): void {
  const trunk = hex("#2a1810"), trunkLit = hex("#6a3b22"), ring = hex("#1a0e08");
  let top: [number, number] = [x, base];
  const steps = Math.round(height / 6);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x + lean * t * t * height, py = base - t * height;
    const w = Math.round(15 - t * 6);
    c.fill(Math.round(px - w / 2), Math.round(py), Math.round(px + w / 2), Math.round(py) + 7, i % 2 ? trunk : ring);
    c.fill(Math.round(px + w / 2) - 4, Math.round(py), Math.round(px + w / 2), Math.round(py) + 6, trunkLit);
    top = [px, py];
  }
  const leaf = hex("#12301e"), leafLit = hex("#2f6a3a"), leafEdge = hex("#ff9a5a");
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * (0.05 + (k / 6) * 0.9) + (r() - 0.5) * 0.2;
    const len = height * (0.32 + r() * 0.12);
    let [fx, fy] = top;
    for (let s = 0; s < 18; s++) {
      const t = s / 17;
      const nx = top[0] + Math.cos(a) * len * t, ny = top[1] + Math.sin(a) * len * t + t * t * len * 0.55;
      const w = Math.max(2, Math.round((1 - Math.abs(t - 0.35)) * 12));
      line(c, fx, fy, nx, ny, t < 0.5 ? leafLit : leaf, w);
      if (Math.cos(a) > 0 && s % 3 === 0) c.set(Math.round(nx) + 1, Math.round(ny) - Math.ceil(w / 2), leafEdge);
      [fx, fy] = [nx, ny];
    }
  }
  for (const [dx, dy] of [[-6, 6], [5, 8], [0, 12]] as const) circle(c, top[0] + dx, top[1] + dy, 6, (ddx, ddy) => (ddx + ddy < -0.4 ? hex("#7a5030") : hex("#3a2414")));
}

/** A small island on the horizon with a palm or two. */
function island(c: Canvas, cx: number, w: number, base: number, r: () => number): void {
  const land = hex("#2a1a40"), rim = hex("#5a2e58");
  polygon(c, Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return [cx - w / 2 + t * w, base - Math.sin(t * Math.PI) ** 0.7 * w * 0.16 - (r() - 0.5) * 3] as const;
  }).concat([[cx + w / 2, base + 1], [cx - w / 2, base + 1]]), (x, y) => (y < base - w * 0.13 && dithered(x, y, 0.5) ? rim : land));
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const px = cx + (r() - 0.5) * w * 0.4, ph = 26 + r() * 14, lean = (r() - 0.5) * 0.5;
    for (let s = 0; s <= ph; s++) c.set(Math.round(px + lean * (s * s) / ph), Math.round(base - w * 0.12 - s), land);
    const tx = px + lean * ph, ty = base - w * 0.12 - ph;
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI * (0.1 + (k / 5) * 0.8);
      line(c, tx, ty, tx + Math.cos(a) * 14, ty + Math.sin(a) * 6 + 6, land, 2);
    }
  }
}

/** A galleon side-on: dark hull, three masts, sails lit on the sun's side, a skull on the flag. */
function ship(c: Canvas): void {
  const hull = hex("#1e1430"), hullLit = hex("#5a3050"), sail = hex("#3a2648"), sailLit = hex("#c8705a"), mast = hex("#140c20"), white = hex("#f4e8d8");
  const W = c.width, base = c.height - 10;
  polygon(c, [[20, base - 34], [W - 30, base - 40], [W - 6, base - 58], [W - 18, base - 30], [W - 40, base], [44, base], [8, base - 46]], (x, y) => (y < base - 32 || x > W - 44 ? hullLit : hull));
  for (let x = 40; x < W - 50; x += 16) c.fill(x, base - 22, x + 5, base - 18, hex("#ffcf7a"));
  for (const [mx, h] of [[0.28, 120], [0.52, 150], [0.76, 110]] as const) {
    const x = Math.round(W * mx);
    c.fill(x - 1, base - 34 - h, x + 2, base - 34, mast);
    for (const [top, bottom, wTop, wBottom] of [[h - 6, h * 0.55, 0.3, 0.4], [h * 0.5, h * 0.12, 0.42, 0.5]] as const) {
      const y0 = base - 34 - top, y1 = base - 34 - bottom;
      const ht = W * wTop * 0.5, hb = W * wBottom * 0.5;
      polygon(c, [[x - ht, y0], [x + ht, y0], [x + hb + 6, y1], [x - hb + 6, y1]], (px, py) => (px > x + (py - y0) * 0.1 + 4 ? sailLit : sail));
    }
  }
  const fx = Math.round(W * 0.52), fy = base - 34 - 150;
  c.fill(fx + 2, fy, fx + 22, fy + 13, mast);
  for (const [dx, dy] of [[9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [8, 4], [9, 4], [11, 4], [13, 4], [14, 4], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [10, 6], [12, 6], [9, 8], [13, 8], [10, 9], [12, 9], [11, 10], [9, 10], [13, 10]] as const) c.set(fx + dx, fy + dy, white);
}

/** An open chest spilling gold, on the floor; the frames add glints in turn. */
function chest(glintAt: number): Canvas {
  const c = new Canvas(150, 90);
  const wood = hex("#5a3218"), woodDark = hex("#3a1e0e"), woodLit = hex("#8a5228"), band = hex("#c9971c"), bandLit = hex("#ffe08a");
  const gold = [hex("#a87410"), hex("#d9a520"), hex("#f6c945"), hex("#fff0a0")];
  const box = { x0: 30, x1: 120, y0: 46, y1: 88 };
  // The lid, tipped back.
  polygon(c, [[box.x0 + 4, box.y0 - 2], [box.x1 - 4, box.y0 - 2], [box.x1 - 10, box.y0 - 34], [box.x0 + 10, box.y0 - 34]], (x, y) => (y < box.y0 - 30 ? woodLit : (x + y) % 9 === 0 ? woodDark : wood));
  c.fill(box.x0 + 10, box.y0 - 34, box.x1 - 10, box.y0 - 31, band);
  // Gold heaped above the rim, coins spilled on the floor.
  const r = rng(77);
  circle(c, 75, box.y0 + 2, 46, (dx, dy) => (dy > 0.1 ? null : gold[Math.min(3, Math.max(0, Math.floor((1 - (dx + dy + 1) / 2) * 4 + (r() - 0.5))))]!), 16);
  for (let i = 0; i < 22; i++) {
    const cx = box.x0 + r() * (box.x1 - box.x0), cy = box.y0 - 10 + r() * 12;
    circle(c, cx, cy, 3, (dx, dy) => (dx + dy < -0.3 ? gold[3]! : dx + dy > 0.6 ? gold[0]! : gold[2]!), 2);
  }
  for (const [cx, cy] of [[14, 84], [22, 87], [130, 85], [139, 87], [124, 88], [8, 88]] as const) circle(c, cx, cy, 4, (dx, dy) => (dx + dy < -0.3 ? gold[3]! : gold[1]!), 2.5);
  // The box: planks, gold bands and a lock.
  c.fill(box.x0, box.y0, box.x1, box.y1, wood);
  for (let y = box.y0 + 10; y < box.y1; y += 11) c.fill(box.x0, y, box.x1, y + 1, woodDark);
  c.fill(box.x0, box.y0, box.x1, box.y0 + 3, woodLit);
  for (const x of [box.x0, box.x0 + 26, box.x1 - 32, box.x1 - 6]) {
    c.fill(x, box.y0, x + 6, box.y1, band);
    c.fill(x, box.y0, x + 2, box.y1, bandLit);
  }
  c.fill(70, box.y0 + 6, 81, box.y0 + 19, band);
  c.fill(74, box.y0 + 11, 77, box.y0 + 16, woodDark);
  // A glint: a four-pointed sparkle on one of the coins.
  const spots = [[52, 34], [96, 30], [68, 22], [112, 40], [40, 42]] as const;
  if (glintAt >= 0) {
    const [gx, gy] = spots[glintAt % spots.length]!;
    const white = hex("#ffffff");
    for (let d = -5; d <= 5; d++) {
      c.set(gx + d, gy, Math.abs(d) < 3 ? white : bandLit);
      c.set(gx, gy + d, Math.abs(d) < 3 ? white : bandLit);
    }
    c.set(gx - 1, gy - 1, white);
    c.set(gx + 1, gy + 1, white);
  }
  return c;
}

export const TREASURE_ISLAND: StageDesign = {
  id: "gi-treasure-island",
  name: "Treasure Island",
  draw: () => {
    const layers: Layer[] = [];
    layers.push(
      sky([[0, "#140f3a"], [0.3, "#3b1d5e"], [0.48, "#8a2f6a"], [0.58, "#e0583f"], [0.62, "#ffb057"], [1, "#ffd98a"]], (c) => {
        stars(c, 9, 120, "#e8dcff", 170);
        circle(c, 900, HORIZON - 6, 62, (dx, dy) => {
          const d = Math.hypot(dx, dy);
          return d < 0.6 ? hex("#fff6d0") : d < 0.85 ? hex("#ffe08a") : hex("#ffb347");
        });
      }),
    );
    // The sun's glow, added onto the sky.
    const glow = new Canvas(WIDTH, HORIZON);
    const LEVELS = 8;
    for (let y = 0; y < HORIZON; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const d = Math.hypot((x - 900) / 1.7, y - (HORIZON - 6)) / 360;
        if (d >= 1) continue;
        // Smooth falloff, dithered between steps so it shows no rings.
        const t = (1 - d) ** 1.8 * LEVELS, lo = Math.floor(t);
        const level = dithered(x, y, t - lo) ? lo + 1 : lo;
        if (level > 0) glow.set(x, y, mix(hex("#000000"), hex("#40200c"), level / LEVELS));
      }
    }
    layers.push({ canvas: glow, y: 0, delta: [0, 0], tile: false, light: true });

    const clouds = new Canvas(WIDE, 300);
    const cr = rng(13);
    for (let i = 0; i < 9; i++) cloud(clouds, cr() * WIDE, 60 + cr() * 200, 180 + cr() * 260, cr, hex("#4a2462"), hex("#d0605a"), hex("#ffb27a"));
    layers.push({ canvas: clouds, y: 40, delta: [0.05, 0.03], tile: true, velocity: [-0.12, 0] });

    const islands = new Canvas(WIDE, 90);
    const ir = rng(21);
    island(islands, 420, 220, 88, ir);
    island(islands, 1180, 120, 88, ir);
    island(islands, 2060, 300, 88, ir);
    layers.push({ canvas: islands, y: HORIZON - 88, delta: [0.12, 0.08], tile: true });

    const galleon = new Canvas(240, 210);
    ship(galleon);
    layers.push({ canvas: galleon, y: HORIZON - 200, x: -330, delta: [0.16, 0.09], tile: false, bob: [3, 220] });

    // The sea: the sky's colours, darker toward us, with the sun's reflection broken on the waves.
    const sea = new Canvas(WIDE, GROUND - HORIZON + 40);
    sea.gradient(0, sea.height, [[0, hex("#d8684a")], [0.12, hex("#7a3a6a")], [0.45, hex("#2e2658")], [1, hex("#141a3c")]], 20);
    const sr = rng(31);
    const sunX = 900 + (WIDE / 2 - WIDTH / 2);
    for (let i = 0; i < 900; i++) {
      const y = Math.floor(sr() ** 1.4 * sea.height), w = 3 + Math.floor(sr() * 14 * (0.4 + y / sea.height));
      const near = sr() < 0.55;
      const x = near ? sunX + (sr() - 0.5) * (60 + y * 1.6) : sr() * WIDE;
      sea.fill(Math.round(x), y, Math.round(x + w), y + 1, near ? (sr() < 0.5 ? hex("#ffe08a") : hex("#ffb057")) : hex("#5a4a8a"));
    }
    layers.push({ canvas: sea, y: HORIZON, delta: [0.2, 0.12], tile: true });

    // Palms on the beach behind the fighters.
    const beach = new Canvas(WIDE, 430);
    const br = rng(41);
    blend(beach, 0, 400, WIDE, 430, hex("#b07a48"), hex("#c88e58"), (x) => 0.5 + 0.3 * Math.sin(x / 90));
    // Framing the fight (the camera starts on the middle, x 1280): none behind the fighters.
    for (const [x, h, lean] of [[180, 260, -0.2], [770, 340, 0.2], [1800, 320, -0.22], [2400, 250, 0.24]] as const) palm(beach, x, 410, h, lean, br);
    for (let i = 0; i < 14; i++) {
      const x = br() * WIDE, w = 14 + br() * 30;
      circle(beach, x, 408, w, (dx, dy) => (dy < -0.3 && dx < 0.2 ? hex("#6a5060") : hex("#3a2a40")), w * 0.45);
    }
    layers.push({ canvas: beach, y: GROUND - 410, delta: [0.55, 0.3], tile: true });

    // The sand: warm, rippled, with shells.
    const sand = new Canvas(WIDE, HEIGHT - GROUND + 20);
    sand.gradient(0, sand.height, [[0, hex("#f0c890")], [0.4, hex("#dcaa6a")], [1, hex("#b88044")]], 14);
    const rr = rng(51);
    for (let i = 0; i < 70; i++) {
      const y = 8 + Math.floor(rr() * (sand.height - 10)), x = rr() * WIDE, w = 30 + rr() * 90;
      for (let k = 0; k < w; k++) sand.setWrapped(Math.round(x + k), Math.round(y + Math.sin(k / 9) * 1.5), hex("#c08850"));
    }
    for (let i = 0; i < 40; i++) {
      const x = rr() * WIDE, y = 10 + rr() * (sand.height - 14);
      circle(sand, x, y, 2 + rr() * 2, (dx, dy) => (dx + dy < 0 ? hex("#fff0f0") : hex("#e8a0a0")), 1.6);
    }
    layers.push({ canvas: sand, y: GROUND, delta: [1, 1], tile: true });

    // The treasure, at the right-hand edge of the fight.
    const glints = [chest(0), chest(-1), chest(1), chest(-1), chest(2), chest(-1), chest(3), chest(-1), chest(4), chest(-1)];
    layers.push({ canvas: glints[0]!, frames: glints.slice(1), ticks: 12, y: GROUND - 82, x: 560, delta: [1, 1], tile: false });
    return layers;
  },
};
