/**
 * The Vault: inside Greed Island's reserve. A giant round vault door, shelves of gold bars, money bags, hanging lamps
 * throwing light on a polished marble floor, and red security lasers sweeping the back wall. Drawn in code.
 */
import { Canvas, circle, dithered, hex, line, mix, polygon, rng, text } from "./draw.ts";
import { GROUND, HEIGHT, WIDE, WIDTH, type Layer, type StageDesign } from "./layers.ts";
import { textWidth } from "../fx/font.ts";

const GOLD = { dark: hex("#8a5a0c"), mid: hex("#c9971c"), light: hex("#f6c945"), shine: hex("#fff0a0") };

/** A gold bar end-on-side: a trapezoid with a lit top face. */
function bar(c: Canvas, x: number, y: number, w: number): void {
  const h = Math.round(w * 0.42), inset = Math.round(w * 0.16);
  polygon(c, [[x + inset, y], [x + w - inset, y], [x + w, y + h], [x, y + h]], (px, py) => (py < y + 3 ? GOLD.shine : px < x + inset + 2 ? GOLD.light : px > x + w - inset - 2 ? GOLD.dark : GOLD.mid));
  c.fill(x, y + h, x + w, y + h + 1, GOLD.dark);
}

/** A pyramid of bars: `rows` high from its bottom-left corner. */
function pyramid(c: Canvas, x: number, base: number, rows: number, w: number): void {
  const h = Math.round(w * 0.42) + 1;
  for (let r = 0; r < rows; r++) for (let k = 0; k < rows - r; k++) bar(c, x + k * w + (r * w) / 2, base - (r + 1) * h, w);
}

/** A money bag with a dollar sign. */
function moneyBag(c: Canvas, cx: number, base: number, size: number): void {
  const cloth = hex("#7a6a48"), clothLit = hex("#a8966a"), clothDark = hex("#4a3e28"), tie = hex("#3a2e1c");
  circle(c, cx, base - size * 0.55, size * 0.6, (dx, dy) => (dx + dy < -0.5 ? clothLit : dx + dy > 0.7 ? clothDark : cloth), size * 0.55);
  polygon(c, [[cx - size * 0.18, base - size * 1.05], [cx + size * 0.18, base - size * 1.05], [cx + size * 0.32, base - size * 1.32], [cx - size * 0.32, base - size * 1.32]], cloth);
  c.fill(Math.round(cx - size * 0.2), Math.round(base - size * 1.1), Math.round(cx + size * 0.2), Math.round(base - size * 1.02), tie);
  const scale = Math.max(1, Math.round(size / 18));
  text(c, "$", Math.round(cx - (5 * scale) / 2), Math.round(base - size * 0.78), GOLD.light, scale);
}

/** The vault door: a steel frame ringed with bolts, the door face, a spoked wheel with a gold hub, a brass plaque. */
function vaultDoor(): Canvas {
  const R = 236, c = new Canvas(560, 600), cx = 280, cy = R + 20;
  const frame = hex("#2c313c"), frameLit = hex("#4a5262"), bolt = hex("#9aa3b3"), boltDark = hex("#5a6272");
  circle(c, cx, cy, R + 18, (dx, dy) => (dx + dy < -0.9 ? frameLit : frame));
  circle(c, cx, cy, R, (dx, dy) => {
    const d = Math.hypot(dx, dy);
    if (d > 0.93) return hex("#1a1e26");
    const shade = 0.5 + 0.5 * (-dx * 0.5 - dy * 0.7);
    return mix(hex("#5a6272"), hex("#b8c0cc"), Math.round(Math.max(0, Math.min(1, shade)) * 6) / 6);
  });
  // Brushed rings.
  for (const k of [0.78, 0.62]) circle(c, cx, cy, R * k, (dx, dy) => (Math.hypot(dx, dy) > 0.96 ? (dx + dy < 0 ? hex("#d8dee8") : hex("#3e4552")) : null));
  // Locking bolts around the rim.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, bx = cx + Math.cos(a) * (R - 12), by = cy + Math.sin(a) * (R - 12);
    circle(c, bx, by, 9, (dx, dy) => (dx + dy < -0.3 ? bolt : boltDark));
  }
  // The wheel: six spokes, a rim and a gold hub.
  const spoke = hex("#c0c8d4"), spokeDark = hex("#6a7282");
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    line(c, cx, cy, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, spokeDark, 9);
    line(c, cx, cy - 2, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5 - 2, spoke, 5);
    circle(c, cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52, 11, (dx, dy) => (dx + dy < 0 ? spoke : spokeDark));
  }
  circle(c, cx, cy, 40, (dx, dy) => {
    const d = Math.hypot(dx, dy);
    return d > 0.85 ? GOLD.dark : dx + dy < -0.6 ? GOLD.shine : dx + dy < 0.2 ? GOLD.light : GOLD.mid;
  });
  text(c, "GI", cx - 11, cy - 7, hex("#5a3a08"), 2);
  // A brass plaque under the door.
  const label = "GREED ISLAND RESERVE", w = textWidth(label, 2) + 28;
  c.fill(cx - w / 2, cy + R + 30, cx + w / 2, cy + R + 58, GOLD.dark);
  c.fill(cx - w / 2 + 2, cy + R + 32, cx + w / 2 - 2, cy + R + 56, GOLD.mid);
  text(c, label, Math.round(cx - textWidth(label, 2) / 2), cy + R + 37, hex("#3a2606"), 2);
  return c;
}

/** Steel shelving full of gold, either side of the door (the middle of the layer is left clear). */
function shelves(): Canvas {
  const c = new Canvas(WIDE, 380), r = rng(61);
  const post = hex("#1c2028"), postLit = hex("#3c4352"), plank = hex("#30353f"), plankLit = hex("#5a6272");
  for (const [x0, x1] of [[0, WIDE / 2 - 380], [WIDE / 2 + 380, WIDE]] as const) {
    for (let x = x0 + 20; x < x1 - 40; x += 300) {
      c.fill(x, 0, x + 10, 380, post);
      c.fill(x, 0, x + 3, 380, postLit);
      c.fill(x + 270, 0, x + 280, 380, post);
      for (const y of [110, 230, 350]) {
        c.fill(x, y, x + 280, y + 10, plank);
        c.fill(x, y, x + 280, y + 2, plankLit);
        let bx = x + 16;
        while (bx < x + 250) {
          const rows = 1 + Math.floor(r() * 3), w = 30;
          if (bx + rows * w > x + 266) break;
          pyramid(c, bx, y, rows, w);
          bx += rows * w + 8 + Math.floor(r() * 16);
        }
      }
    }
  }
  return c;
}

/** Light: lamps' cones down to the floor, added on (dithered so it fades without bands). */
function lamps(xs: readonly number[]): Canvas {
  const c = new Canvas(WIDE, GROUND + 40);
  for (const x of xs) {
    for (let y = 40; y < c.height; y++) {
      const t = (y - 40) / (c.height - 40), half = 20 + t * 120;
      for (let dx = -half; dx <= half; dx++) {
        const edge = 1 - Math.abs(dx) / half, strength = edge ** 1.2 * (1 - t * 0.6) * 5;
        const lo = Math.floor(strength), lvl = dithered(x + dx, y, strength - lo) ? lo + 1 : lo;
        if (lvl > 0) c.setWrapped(Math.round(x + dx), y, mix(hex("#000000"), hex("#3a2c14"), lvl / 6));
      }
    }
  }
  return c;
}

/** The lamps themselves, hanging on chains. */
function lampShades(xs: readonly number[]): Canvas {
  const c = new Canvas(WIDE, 70);
  for (const x of xs) {
    c.fill(x - 1, 0, x + 2, 34, hex("#14161c"));
    polygon(c, [[x - 12, 34], [x + 12, 34], [x + 30, 56], [x - 30, 56]], (px) => (px < x - 8 ? hex("#2e5a3a") : hex("#1e3e28")));
    c.fill(x - 30, 56, x + 30, 58, hex("#c9971c"));
    circle(c, x, 60, 9, hex("#fff6d0"), 4);
  }
  return c;
}

/** A red laser beam with its glow, added on. */
function laser(): Canvas {
  const c = new Canvas(WIDTH, 9);
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < 9; y++) {
      const d = Math.abs(y - 4);
      const col = d === 0 ? hex("#ff8080") : d === 1 ? hex("#c02020") : d === 2 && dithered(x, y, 0.6) ? hex("#601010") : d === 3 && dithered(x, y, 0.3) ? hex("#300808") : null;
      if (col) c.set(x, y, col);
    }
  }
  return c;
}

export const VAULT: StageDesign = {
  id: "gi-the-vault",
  name: "The Vault",
  draw: () => {
    const layers: Layer[] = [];
    // The back wall: steel panels with seams and rivets, darker toward the corners.
    const wall = new Canvas(WIDTH, HEIGHT);
    wall.gradient(0, HEIGHT, [[0, hex("#0e1016")], [0.35, hex("#1e222c")], [0.75, hex("#262b36")], [1, hex("#14171e")]], 20);
    for (let x = 40; x < WIDTH; x += 150) {
      wall.fill(x, 0, x + 2, HEIGHT, hex("#0c0e12"));
      wall.fill(x + 2, 0, x + 3, HEIGHT, hex("#343a46"));
      for (let y = 30; y < HEIGHT; y += 60) {
        wall.set(x + 10, y, hex("#4a5262"));
        wall.set(x - 9, y, hex("#4a5262"));
      }
    }
    for (const y of [64, 560]) {
      wall.fill(0, y, WIDTH, y + 12, hex("#2c313c"));
      wall.fill(0, y, WIDTH, y + 2, hex("#4a5262"));
    }
    layers.push({ canvas: wall, y: 0, delta: [0, 0], tile: false });

    // Two lasers sweeping up and down the wall at different speeds.
    layers.push({ canvas: laser(), y: 220, delta: [0, 0], tile: false, bob: [120, 300], light: true });
    layers.push({ canvas: laser(), y: 330, delta: [0, 0], tile: false, bob: [90, 420], light: true });

    layers.push({ canvas: vaultDoor(), y: 60, delta: [0.15, 0.08], tile: false });
    layers.push({ canvas: shelves(), y: 220, delta: [0.35, 0.18], tile: true });

    const lampXs = [WIDE / 2 - 560, WIDE / 2, WIDE / 2 + 560, 120, WIDE - 120];
    layers.push({ canvas: lamps(lampXs), y: 0, delta: [0.45, 0.25], tile: true, light: true });
    layers.push({ canvas: lampShades(lampXs), y: 0, delta: [0.45, 0.25], tile: true });

    // Gold and money bags on the floor at the sides.
    const piles = new Canvas(WIDE, 180);
    const pr = rng(71);
    for (const [x0, x1] of [[0, WIDE / 2 - 470], [WIDE / 2 + 470, WIDE]] as const) {
      let x = x0 + 30;
      while (x < x1 - 140) {
        if (pr() < 0.55) {
          pyramid(piles, x, 176, 3 + Math.floor(pr() * 2), 34);
          x += 170;
        } else {
          moneyBag(piles, x + 40, 178, 46 + pr() * 18);
          x += 100;
        }
      }
    }
    layers.push({ canvas: piles, y: GROUND - 176, delta: [0.75, 0.4], tile: true });

    // Polished marble: black and white tiles with veins and the lamps' reflections.
    const marble = new Canvas(WIDE, HEIGHT - GROUND + 20);
    const mr = rng(81);
    let y = 0;
    [16, 22, 30, 42, 60].forEach((h, row) => {
      const w = 80 + row * 22;
      for (let x = row % 2 ? -w / 2 : 0, k = 0; x < WIDE; x += w, k++) {
        const light = (k + row) % 2 === 0;
        const base = light ? hex("#7c808c") : hex("#1c1e26"), vein = light ? hex("#686c78") : hex("#2c303a");
        marble.fill(Math.round(x), y, Math.round(x + w), y + h, base);
        for (let v = 0; v < 2; v++) {
          let vx = x + mr() * w, vy = y;
          while (vy < y + h) {
            marble.set(Math.round(vx), Math.round(vy), vein);
            vx += (mr() - 0.5) * 3;
            vy += 1;
          }
        }
        marble.fill(Math.round(x), y, Math.round(x) + 1, y + h, hex("#08090c"));
      }
      marble.fill(0, y, WIDE, y + 1, hex("#08090c"));
      y += h;
    });
    layers.push({ canvas: marble, y: GROUND, delta: [1, 1], tile: true });
    // The lamps reflected in the polish, added on.
    const shine = new Canvas(WIDE, HEIGHT - GROUND + 20);
    for (const x of lampXs) {
      for (let yy = 0; yy < shine.height; yy++) {
        const half = 40 + yy * 0.8;
        for (let dx = -half; dx <= half; dx++) {
          const s = (1 - Math.abs(dx) / half) * (1 - yy / shine.height) * 4, lo = Math.floor(s);
          const lvl = dithered(x + dx, yy, s - lo) ? lo + 1 : lo;
          if (lvl > 0) shine.setWrapped(Math.round(x + dx), yy, mix(hex("#000000"), hex("#3a2c14"), lvl / 4));
        }
      }
    }
    layers.push({ canvas: shine, y: GROUND, delta: [1, 1], tile: true, light: true });
    return layers;
  },
};
