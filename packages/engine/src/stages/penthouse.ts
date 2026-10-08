/**
 * The Penthouse: a skyscraper roof at night. The city below, searchlights sweeping, a blimp drifting past, red lights
 * blinking on the towers, a giant GREED ISLAND neon sign that flickers, and a helipad to fight on. Drawn in code.
 */
import { GLYPH_HEIGHT, textWidth } from "../fx/font.ts";
import { Canvas, circle, dithered, hex, mix, polygon, rng, skyline, text, type Rgb } from "./draw.ts";
import { GROUND, HEIGHT, sky, stars, WIDE, type Layer, type StageDesign } from "./layers.ts";

const NEON = { red: hex("#ff3a5a"), core: hex("#ffd0d8"), gold: hex("#f6c945"), dim: hex("#5a1424") };

/** A skyline band; `spires` towers get antennas whose tips are where the red lights blink. */
function towers(seed: number, o: { baseline: number; minH: number; maxH: number; body: Rgb; windows: readonly Rgb[]; lit: number; dark: Rgb }, height: number): { c: Canvas; tips: [number, number][] } {
  const c = new Canvas(WIDE, height), r = rng(seed + 1), tips: [number, number][] = [];
  skyline(c, seed, o);
  // Tall spires with a tip each.
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * WIDE), top = o.baseline - o.maxH - 30 - Math.floor(r() * 50);
    c.fill(x - 14, top + 40, x + 14, height, o.body);
    c.fill(x - 2, top, x + 2, top + 40, o.body);
    for (let wy = top + 50; wy < height - 6; wy += 14) if (r() < 0.5) c.fill(x - 8, wy, x + 8, wy + 6, o.windows[0]!);
    tips.push([x, top]);
  }
  return { c, tips };
}

/** Red aircraft lights at the tips, on or off. */
function blinkers(tips: readonly [number, number][], height: number, on: boolean): Canvas {
  const c = new Canvas(WIDE, height);
  for (const [x, y] of tips) {
    if (on) {
      circle(c, x, y - 2, 4, hex("#ff2020"));
      c.set(x, y - 3, hex("#ffc0c0"));
    } else c.set(x, y - 2, hex("#401010"));
  }
  return c;
}

/** A searchlight beam: a tall wedge of faint light, brightest at its foot, added on. */
function beam(lean: number): Canvas {
  const W = 420, H = 640, c = new Canvas(W, H), LEVELS = 4;
  for (let y = 0; y < H; y++) {
    const t = 1 - y / H, cx = W / 2 + lean * t * (W / 2 - 40), half = 10 + t * 70;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const edge = 1 - Math.abs(x - cx) / half;
      const s = edge ** 0.6 * (0.35 + 0.65 * (1 - t)) * LEVELS, lo = Math.floor(s), lvl = dithered(x, y, s - lo) ? lo + 1 : lo;
      if (lvl > 0) c.set(x, y, mix(hex("#000000"), hex("#283850"), lvl / LEVELS));
    }
  }
  return c;
}

/** The blimp, side on: a silver envelope with our name, fins, a gondola. */
function blimp(): Canvas {
  const c = new Canvas(300, 120);
  circle(c, 150, 50, 130, (dx, dy) => (dy < -0.5 ? hex("#d8dce4") : dy > 0.55 ? hex("#5a6070") : dx < -0.6 ? hex("#b8bcc8") : hex("#9aa0ae")), 44);
  polygon(c, [[12, 50], [-2, 14], [30, 30]], hex("#7a8090"));
  polygon(c, [[12, 52], [-2, 88], [30, 72]], hex("#5a6070"));
  c.fill(130, 92, 180, 106, hex("#3a3e48"));
  for (let x = 136; x < 176; x += 8) c.fill(x, 96, x + 4, 100, hex("#ffd27a"));
  const label = "GREED ISLAND";
  text(c, label, Math.round(150 - textWidth(label, 2) / 2), 44, hex("#8a1420"), 2);
  c.set(270, 50, hex("#ff2020"));
  return c;
}

/** The sign: GREED ISLAND in big neon letters on a frame; `flicker` dims one letter. */
function sign(flicker: number): Canvas {
  const label = "GREED ISLAND", scale = 9, w = textWidth(label, scale) + 80, h = GLYPH_HEIGHT * scale + 70, c = new Canvas(w, h + 120);
  // The scaffold under it.
  for (let x = 40; x < w - 30; x += 120) {
    c.fill(x, h, x + 8, h + 120, hex("#14161e"));
    for (let y = h; y < h + 120; y += 30) polygon(c, [[x, y], [x + 8, y], [x + 128, y + 30], [x + 120, y + 30]], hex("#1c1f2a"));
  }
  c.fill(0, h - 14, w, h, hex("#1c1f2a"));
  // Letters: a halo, the tube, a bright core.
  const tx = 40, ty = 30;
  const letters = [...label];
  letters.forEach((ch, i) => {
    if (ch === " ") return;
    const lx = tx + i * 6 * scale, off = i === flicker;
    const glyph = new Canvas(5 * scale + 12, GLYPH_HEIGHT * scale + 12);
    text(glyph, ch, 6, 6, off ? NEON.dim : NEON.red, scale);
    for (let y = 0; y < glyph.height; y++) for (let x = 0; x < glyph.width; x++) {
      if (!glyph.pixels[y * glyph.width + x]) continue;
      // The core runs down the middle of each stroke.
      const inner = [[-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => glyph.pixels[(y + dy!) * glyph.width + (x + dx!)]);
      c.set(lx - 6 + x, ty - 6 + y, off ? NEON.dim : inner ? NEON.core : NEON.red);
    }
  });
  // A gold border of bulbs.
  for (let x = 10; x < w - 10; x += 16) {
    circle(c, x, 10, 3, NEON.gold);
    circle(c, x, h - 24, 3, NEON.gold);
  }
  return c;
}

/** The sign's glow on the night, added on. */
function signGlow(w: number, h: number): Canvas {
  const c = new Canvas(w + 200, h + 200), LEVELS = 5;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const dx = Math.max(0, Math.abs(x - c.width / 2) - w / 2 + 60) / 120, dy = Math.max(0, Math.abs(y - c.height / 2) - h / 2 + 40) / 90;
    const d = Math.hypot(dx, dy);
    if (d >= 1) continue;
    const t = (1 - d) ** 1.5 * LEVELS, lo = Math.floor(t), lvl = dithered(x, y, t - lo) ? lo + 1 : lo;
    if (lvl > 0) c.set(x, y, mix(hex("#000000"), hex("#3a0c18"), lvl / LEVELS));
  }
  return c;
}

/** The roof: a parapet, air-conditioning units and a water tank at the sides. */
function roof(): Canvas {
  const c = new Canvas(WIDE, 220), r = rng(411);
  c.fill(0, 180, WIDE, 220, hex("#1a1c24"));
  c.fill(0, 180, WIDE, 184, hex("#3a3e4a"));
  for (const [x0, x1] of [[0, WIDE / 2 - 480], [WIDE / 2 + 480, WIDE]] as const) {
    for (let x = x0 + 30; x < x1 - 120; x += 150 + r() * 80) {
      if (r() < 0.35) {
        // A water tank on legs.
        c.fill(x + 10, 120, x + 16, 182, hex("#14161c"));
        c.fill(x + 74, 120, x + 80, 182, hex("#14161c"));
        polygon(c, [[x, 40], [x + 90, 40], [x + 86, 124], [x + 4, 124]], (px) => (px < x + 20 ? hex("#4a3a2e") : hex("#2e2420")));
        polygon(c, [[x - 4, 40], [x + 45, 14], [x + 94, 40]], hex("#2a2028"));
      } else {
        c.fill(x, 120, x + 100, 182, hex("#3a3e4a"));
        c.fill(x, 120, x + 100, 124, hex("#5a6070"));
        circle(c, x + 50, 150, 22, (dx, dy) => (Math.hypot(dx, dy) < 0.25 ? hex("#14161c") : Math.floor((Math.atan2(dy, dx) + Math.PI) * 3) % 2 ? hex("#262a34") : hex("#1a1c24")));
      }
    }
  }
  return c;
}

/** The helipad: dark concrete, a yellow ring and a big H, edge lights. */
function helipad(): Canvas {
  const c = new Canvas(WIDE, HEIGHT - GROUND + 20), cx = WIDE / 2;
  c.gradient(0, c.height, [[0, hex("#2a2c34")], [1, hex("#16171c")]], 10);
  for (let y = 0; y < c.height; y++) {
    const half = 520 + y * 3.2, inner = half - 22 - y * 0.15;
    for (const side of [-1, 1]) for (let x = Math.round(cx + side * inner); side < 0 ? x > cx + side * half : x < cx + side * half; x += side) c.set(x, y, hex("#d8b020"));
  }
  // A big H, seen at a low angle: wider toward us.
  const hy = 30, hh = c.height - 42, paint = hex("#b8b8b8");
  const at = (u: number, v: number): [number, number] => [cx + u * (1 + v * 0.35), hy + v * hh];
  const quad = (u0: number, u1: number, v0: number, v1: number) => polygon(c, [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)], paint);
  quad(-130, -90, 0, 1);
  quad(90, 130, 0, 1);
  quad(-90, 90, 0.4, 0.62);
  for (let x = 40; x < WIDE; x += 160) circle(c, x, 4, 3, hex("#40e080"));
  return c;
}

export const PENTHOUSE: StageDesign = {
  id: "gi-penthouse",
  name: "The Penthouse",
  draw: () => {
    const layers: Layer[] = [];
    layers.push(
      sky([[0, "#05061a"], [0.45, "#141838"], [0.75, "#2e1e4a"], [1, "#5a2a5a"]], (c) => {
        stars(c, 21, 160, "#c8d0ff", 300);
        circle(c, 1040, 110, 36, (dx, dy) => (dx + dy > 0.6 ? hex("#c9c2a6") : hex("#f4f1e0")));
      }),
    );
    for (const lean of [-0.8, 0.9]) layers.push({ canvas: beam(lean), y: 40, x: lean < 0 ? -380 : 360, delta: [0.04, 0.02], tile: false, light: true, sway: [160, lean < 0 ? 520 : 680] });
    layers.push({ canvas: blimp(), y: 150, x: -1500, delta: [0.06, 0.03], tile: true, tileSpacing: 4000, velocity: [0.35, 0] });
    const far = towers(401, { baseline: 300, minH: 100, maxH: 220, body: hex("#0c0e22"), windows: [hex("#2a3466"), hex("#3a2c66")], lit: 0.3, dark: hex("#0e1028") }, 320);
    layers.push({ canvas: far.c, y: 280, delta: [0.1, 0.06], tile: true });
    layers.push({ canvas: blinkers(far.tips, 320, true), frames: [blinkers(far.tips, 320, false)], ticks: 45, y: 280, delta: [0.1, 0.06], tile: true, tileSpacing: WIDE });
    const near = towers(403, { baseline: 300, minH: 60, maxH: 200, body: hex("#06071a"), windows: [hex("#ffd75e"), hex("#8ac8ff"), hex("#ff8ac8")], lit: 0.22, dark: hex("#0a0b20") }, 300);
    layers.push({ canvas: near.c, y: 330, delta: [0.2, 0.1], tile: true });
    const flickers = [-1, -1, -1, -1, -1, 7, -1, 7, -1, -1, -1, -1, -1, -1, 2, -1].map(sign);
    const sw = flickers[0]!.width;
    layers.push({ canvas: signGlow(sw, flickers[0]!.height - 120), y: 120 - 100, delta: [0.3, 0.15], tile: false, light: true });
    layers.push({ canvas: flickers[0]!, frames: flickers.slice(1), ticks: 9, y: 120, delta: [0.3, 0.15], tile: false });
    layers.push({ canvas: roof(), y: GROUND - 216, delta: [0.6, 0.32], tile: true });
    layers.push({ canvas: helipad(), y: GROUND, delta: [1, 1], tile: true });
    return layers;
  },
};
