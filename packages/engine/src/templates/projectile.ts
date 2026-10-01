/**
 * The projectile a template fires: an energy ball drawn here, since the
 * sprite sheet has none. It uses six palette slots the sheet leaves empty,
 * so each outfit can recolour it. Three animations per projectile move:
 * flying (action `base`), hitting (`base + 1`) and fading out (`base + 2`).
 */
import type { AirAction, Box } from "../art/air.ts";
import type { SffSprite } from "../art/sff.ts";
import type { IndexedImage } from "../art/sheet.ts";

/** Palette slots for the ball, bright core to dark edge (the sheet uses 0-72). */
export const PROJECTILE_SLOTS = [240, 241, 242, 243, 244, 245] as const;
export const PROJECTILE_COLORS = ["#ffffff", "#d8f6ff", "#8fe3ff", "#3fb4ff", "#1a73e0", "#0b3f99"] as const;

/**
 * A glowing ball of `radius` pixels, with a tail stretched `tail` times
 * behind it (to the left: the fighter faces right). `hollow` clears the
 * middle, for the burst when it hits.
 */
export function orb(radius: number, tail = 1, hollow = 0): IndexedImage {
  const back = Math.ceil(radius * tail);
  const width = back + radius + 2, height = radius * 2 + 2;
  const cx = back + 1, cy = radius + 1;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx < 0 ? dx / tail : dx, dy) / radius;
      if (d > 1 || d < hollow) continue;
      const shade = Math.min(PROJECTILE_SLOTS.length - 1, Math.floor(d * d * PROJECTILE_SLOTS.length));
      pixels[y * width + x] = PROJECTILE_SLOTS[shade]!;
    }
  }
  return { width, height, pixels };
}

export interface ProjectileArt {
  sprites: SffSprite[];
  actions: AirAction[];
}

/** Sprites and animations for the projectile of attack state `state`, in sprite group and actions `state + 50`... */
export function projectileArt(state: number): ProjectileArt {
  const base = state + 50;
  const frames: { img: IndexedImage; cx: number; cy: number }[] = [];
  const add = (img: IndexedImage, radius: number, tail: number) => {
    frames.push({ img, cx: Math.ceil(radius * tail) + 1, cy: radius + 1 });
    return frames.length - 1;
  };
  const fly = [20, 22, 21, 23].map((r) => add(orb(r, 1.6), r, 1.6));
  const hit = [22, 28, 34, 40].map((r, i) => add(orb(r, 1, 0.25 + i * 0.2), r, 1));
  const fade = [14, 8].map((r) => add(orb(r, 1.2), r, 1.2));
  const sprites: SffSprite[] = frames.map((f, i) => ({ group: base, number: i, image: f.img, axisX: f.cx, axisY: f.cy, palette: 0 }));
  const box = (r: number): Box => [-Math.round(r * 0.8), -Math.round(r * 0.8), Math.round(r * 0.8), Math.round(r * 0.8)];
  const flyRadii = [20, 22, 21, 23];
  const actions: AirAction[] = [
    { action: base, comment: "projectile", frames: fly.map((n, i) => ({ group: base, number: n, ticks: 3, clsn1: [box(flyRadii[i]!)], clsn2: [box(flyRadii[i]!)] })) },
    { action: base + 1, comment: "projectile hits", frames: hit.map((n) => ({ group: base, number: n, ticks: 3 })) },
    { action: base + 2, comment: "projectile fades", frames: fade.map((n) => ({ group: base, number: n, ticks: 3 })) },
  ];
  return { sprites, actions };
}
