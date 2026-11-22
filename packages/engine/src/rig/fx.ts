/**
 * Effects drawn over a rig fighter's pose (rig/skeleton.ts `Pose.fx`): speed
 * lines, swooshes and the like, in effect colours (rig/parts.ts FX_FIRST on),
 * which hurtboxes leave out.
 */
import type { BoneId, FxDraw } from "./skeleton.ts";

/** Lines streaming back from the end of `bone` (a fist or foot moving forward): `length` pixels, in `colors` from the inside out. */
export function speedLines(bone: BoneId, length: number, colors: readonly number[], spread = 7): FxDraw {
  return ({ put, bones }) => {
    const e = bones[bone].end;
    for (const k of [-1, 0, 1]) {
      const len = length * (k === 0 ? 1 : 0.7);
      const y = e.y + k * spread;
      for (let x = 0; x < len; x++) put(e.x - 10 - x, y, colors[Math.min(colors.length - 1, Math.floor((x / len) * colors.length))]!);
    }
  };
}

/** A swoosh: an arc round the joint of `bone` (centre), radius to the bone's end plus `extra`, from angle `from` to `to` (degrees on screen, 0 right, counterclockwise), `width` pixels thick. */
export function swoosh(bone: BoneId, from: number, to: number, colors: readonly number[], width = 6, extra = 8, centre: "at" | "end" = "at"): FxDraw {
  return ({ put, bones }) => {
    const b = bones[bone];
    const c = centre === "at" ? b.at : b.end;
    const r = Math.hypot(b.end.x - b.at.x, b.end.y - b.at.y) + extra;
    const step = from <= to ? 1 : -1;
    const span = Math.abs(to - from);
    for (let a = from; step > 0 ? a <= to : a >= to; a += step * 0.5) {
      const t = Math.abs(a - from) / span; // 0 at the tail, 1 at the head
      const thick = Math.max(1, Math.round(width * t));
      const col = colors[Math.min(colors.length - 1, Math.floor(t * colors.length))]!;
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < thick; k++) put(c.x + Math.cos(rad) * (r - k), c.y - Math.sin(rad) * (r - k), col);
    }
  };
}

/** A filled rectangle (a chart's candle), `x`/`y` from the end of `bone`, `w` x `h`, with a wick above and below. */
export function candle(bone: BoneId, dx: number, dy: number, w: number, h: number, body: number, edge: number, wick = 10): FxDraw {
  return ({ put, bones }) => {
    const e = bones[bone].end;
    const x0 = Math.round(e.x + dx), y0 = Math.round(e.y + dy);
    for (let y = -wick; y < h + wick; y++) put(x0 + Math.floor(w / 2), y0 + y, edge);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, x === 0 || y === 0 || x === w - 1 || y === h - 1 ? edge : body);
  };
}

/** A starburst at the end of `bone` (an impact): `points` rays `size` pixels long. */
export function burst(bone: BoneId, size: number, colors: readonly number[], points = 8): FxDraw {
  return ({ put, bones }) => {
    const e = bones[bone].end;
    for (let i = 0; i < points; i++) {
      const a = (i / points) * Math.PI * 2 + 0.3;
      const len = i % 2 ? size * 0.6 : size;
      for (let r = 4; r < len; r++) put(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, colors[Math.min(colors.length - 1, Math.floor((r / len) * colors.length))]!);
    }
  };
}

/** A small currency sign (the fighter's theme) drawn in pixels, `scale` pixels per dot, centred at the end of `bone` plus (dx, dy). */
export function dollar(bone: BoneId, dx: number, dy: number, color: number, scale = 2): FxDraw {
  const rows = ["00100", "01111", "10100", "01110", "00101", "11110", "00100"];
  return ({ put, bones }) => {
    const e = bones[bone].end;
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== "1") return;
      for (let i = 0; i < scale; i++) for (let j = 0; j < scale; j++) put(e.x + dx + (x - 2) * scale + i, e.y + dy + (y - 3) * scale + j, color);
    }));
  };
}
