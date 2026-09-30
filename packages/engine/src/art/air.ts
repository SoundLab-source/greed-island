/**
 * IKEMEN/MUGEN animation files (.air), in the syntax IKEMEN GO v1.0.0 parses
 * (vendor/Ikemen-GO src/anim.go:290-408): `[Begin Action n]`, then per frame
 * optional `Clsn1: k` / `Clsn2: k` box lists (they apply to the next frame
 * only), a `group,number, x,y, ticks[, flip]` line, and `Loopstart`.
 */

/** A collision box relative to the character's axis: left, top, right, bottom (y is negative upwards). */
export type Box = readonly [number, number, number, number];

export interface AirFrame {
  group: number;
  number: number;
  x?: number;
  y?: number;
  /** Ticks shown (60 per second); -1 holds the frame forever. */
  ticks: number;
  flip?: "H" | "V" | "HV";
  /** Hitboxes (where this frame hits). */
  clsn1?: readonly Box[];
  /** Hurtboxes (where this frame can be hit). */
  clsn2?: readonly Box[];
}

export interface AirAction {
  action: number;
  frames: readonly AirFrame[];
  /** Index of the first frame of the loop (default 0: the whole action loops). */
  loopStart?: number;
  comment?: string;
}

function boxes(kind: 1 | 2, list: readonly Box[]): string[] {
  return [`Clsn${kind}: ${list.length}`, ...list.map((b, i) => `  Clsn${kind}[${i}] = ${b.map((n) => Math.round(n)).join(", ")}`)];
}

export function writeAir(actions: readonly AirAction[], header = ""): string {
  const seen = new Set<number>();
  const lines: string[] = header ? header.split("\n").map((l) => `; ${l}`) : [];
  for (const a of actions) {
    if (seen.has(a.action)) throw new Error(`action ${a.action} is defined twice`);
    seen.add(a.action);
    if (a.frames.length === 0) throw new Error(`action ${a.action} has no frames`);
    if (lines.length) lines.push("");
    if (a.comment) lines.push(`; ${a.comment}`);
    lines.push(`[Begin Action ${a.action}]`);
    a.frames.forEach((f, i) => {
      if (a.loopStart && i === a.loopStart) lines.push("Loopstart");
      if (!Number.isInteger(f.ticks) || (f.ticks < 1 && f.ticks !== -1)) throw new Error(`action ${a.action} frame ${i}: bad ticks ${f.ticks}`);
      if (f.clsn2) lines.push(...boxes(2, f.clsn2));
      if (f.clsn1?.length) lines.push(...boxes(1, f.clsn1));
      const parts = [`${f.group},${f.number}`, `${Math.round(f.x ?? 0)},${Math.round(f.y ?? 0)}`, String(f.ticks)];
      if (f.flip) parts.push(f.flip);
      lines.push(parts.join(", "));
    });
  }
  return `${lines.join("\n")}\n`;
}
