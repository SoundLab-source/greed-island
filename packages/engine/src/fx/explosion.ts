/**
 * A big cartoon explosion, drawn here (flat colours with a black outline, in
 * the style of Aqua Teen Hunger Force's), for Greed Island's own effect pack:
 * a white flash, a spiky fireball that grows and flickers, then a cloud of
 * smoke that thins out. Characters play it through the pack (fx/pack.ts).
 */
import type { AirAction } from "../art/air.ts";
import type { IndexedImage } from "../art/sheet.ts";

export const EXPLOSION_COLORS: readonly string[] = [
  "#000000", // 0: transparent
  "#1a1414", // 1: outline
  "#fffbe6", // 2: white-hot core
  "#ffe23a", // 3: yellow
  "#ff8a1f", // 4: orange
  "#e8371f", // 5: red
  "#8a1a10", // 6: dark red
  "#c4c0bc", // 7: light smoke
  "#8f8a86", // 8: smoke
  "#5c5753", // 9: dark smoke
];

/** The frame size, and where the explosion's foot (the opponent's feet) sits in it. */
export const EXPLOSION_SIZE = { width: 220, height: 210, axisX: 110, axisY: 200 } as const;

/** A small seeded random generator, so the explosion is the same every build. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** One spiky fireball: layers from the outline in to the white core, each spike's length jittered by `seed`. */
function fireball(img: IndexedImage, cx: number, cy: number, radius: number, seed: number, cool = 0): void {
  const rand = seeded(seed);
  const spikes = 13;
  const lengths = Array.from({ length: spikes }, () => 0.75 + rand() * 0.5);
  // Outer to inner: outline, red, orange, yellow, white (a cooling fireball loses its hot middle).
  const layers: [number, number][] = [[1.06, 1], [1, cool > 0 ? 6 : 5], [0.78, cool > 0 ? 5 : 4], [0.56, cool > 1 ? 4 : 3], [0.3, cool > 0 ? 3 : 2]];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = x - cx, dy = (y - cy) * 1.08;
      const d = Math.hypot(dx, dy);
      if (d > radius * 1.4) continue;
      // A star: the edge reaches out to a spike and back in between, like a cartoon burst.
      const t = ((Math.atan2(dy, dx) / (2 * Math.PI)) * spikes + spikes) % spikes;
      const i = Math.floor(t);
      const between = Math.abs(t - i - 0.5) * 2; // 1 at a spike's tip, 0 between spikes
      const edge = radius * (0.68 + 0.32 * between * lengths[i]!);
      for (const [scale, color] of layers) if (d <= edge * scale) img.pixels[y * img.width + x] = color;
    }
  }
}

/** Smoke: overlapping puffs with a dark rim, rising and spreading; `thin` (0-1) leaves holes as it clears. */
function smoke(img: IndexedImage, cx: number, cy: number, spread: number, thin: number, seed: number, ember = false): void {
  const rand = seeded(seed);
  const puffs = Array.from({ length: 14 }, (_, k) => {
    const a = (k / 14) * 2 * Math.PI + rand() * 0.4;
    const dist = spread * (0.35 + rand() * 0.55);
    return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist * 0.75 - spread * 0.25, r: spread * (0.32 + rand() * 0.18) };
  });
  puffs.push({ x: cx, y: cy - spread * 0.2, r: spread * 0.55 });
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let best = Infinity;
      let shade = 0;
      let middle = false;
      for (const [k, p] of puffs.entries()) {
        const d = Math.hypot(x - p.x, y - p.y) / p.r;
        if (d < best) {
          best = d;
          middle = k === puffs.length - 1;
          // Lit from above: the top of each puff light, the underside dark.
          shade = y < p.y - p.r * 0.3 ? 7 : y > p.y + p.r * 0.35 ? 9 : 8;
        }
      }
      if (best > 1.08) continue;
      // Clearing smoke breaks up in a scattered pattern (a hash of the pixel, not stripes).
      if (thin > 0 && (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 < thin * 1000) continue;
      const i = y * img.width + x;
      img.pixels[i] = best > 1 ? 1 : ember && middle && best < 0.45 ? 4 : shade;
    }
  }
}

/** The explosion's frames and how long each shows (ticks at 60 a second). */
export function explosionFrames(): { frames: IndexedImage[]; ticks: number[] } {
  const { width, height } = EXPLOSION_SIZE;
  const blank = (): IndexedImage => ({ width, height, pixels: new Uint8Array(width * height) });
  const cx = width / 2, cy = 104;
  const frames: IndexedImage[] = [];
  const ticks: number[] = [];
  const add = (draw: (img: IndexedImage) => void, t: number) => {
    const img = blank();
    draw(img);
    frames.push(img);
    ticks.push(t);
  };
  // The flash, then the fireball growing fast, flickering at full size, and cooling.
  add((img) => fireball(img, cx, cy + 30, 22, 1), 2);
  for (const [r, seed] of [[48, 2], [72, 3], [90, 4]] as const) add((img) => fireball(img, cx, cy, r, seed), 2);
  for (const seed of [5, 6, 7]) add((img) => fireball(img, cx, cy, 96, seed), 3);
  add((img) => fireball(img, cx, cy, 94, 8, 1), 3);
  // Smoke takes over, with embers in its middle at first, then rises and clears.
  add((img) => { smoke(img, cx, cy - 4, 84, 0, 9, true); fireball(img, cx, cy + 6, 40, 10, 2); }, 4);
  for (const [dy, spread, thin] of [[-10, 90, 0], [-18, 94, 0.25], [-26, 97, 0.5], [-34, 99, 0.7], [-40, 100, 0.85]] as const) add((img) => smoke(img, cx, cy + dy, spread, thin, 11, thin === 0), 5);
  return { frames, ticks };
}

/** The explosion's animation in the pack: action 1, sprites 1,0 to 1,n. */
export function explosionAction(ticks: readonly number[]): AirAction {
  return { action: 1, comment: "a big cartoon explosion", frames: ticks.map((t, i) => ({ group: 1, number: i, ticks: t })) };
}
