/**
 * Two built fighters side by side (`pnpm templates:compare`): where each
 * attack's hitboxes sit and how far each animation's body (its hurtboxes)
 * reaches forward, in 320-wide units. Made for new art sources: a move whose
 * boxes sit much higher or lower than the same move of the fighter it's based
 * on, or a body that runs ahead of the fighter while walking, shows up here
 * before a balance run does (docs/PHASE3.md "More bodies").
 */
import type { Box, FrameBoxes } from "../art/air.ts";

/** The smallest box around some boxes, in 320-wide units. */
export interface Extent {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Boxes in a character's own units (localcoord wide) as one extent in 320-wide units, or null if there are none. */
export function extent(boxes: readonly Box[], localcoord: number): Extent | null {
  if (boxes.length === 0) return null;
  const k = 320 / localcoord;
  return {
    left: Math.round(Math.min(...boxes.map((b) => b[0])) * k),
    top: Math.round(Math.min(...boxes.map((b) => b[1])) * k),
    right: Math.round(Math.max(...boxes.map((b) => b[2])) * k),
    bottom: Math.round(Math.max(...boxes.map((b) => b[3])) * k),
  };
}

/** Each action's hitboxes (over all its frames) and hurtboxes, as extents. */
export function actionExtents(air: ReadonlyMap<number, readonly FrameBoxes[]>, localcoord: number): { hit: Map<number, Extent>; hurt: Map<number, Extent> } {
  const hit = new Map<number, Extent>();
  const hurt = new Map<number, Extent>();
  for (const [action, frames] of air) {
    const h = extent(frames.flatMap((f) => f.clsn1), localcoord);
    const b = extent(frames.flatMap((f) => f.clsn2), localcoord);
    if (h) hit.set(action, h);
    if (b) hurt.set(action, b);
  }
  return { hit, hurt };
}

/** How much of `base`'s height `e` covers (0-1). */
export function verticalCover(e: Extent, base: Extent): number {
  const overlap = Math.min(e.bottom, base.bottom) - Math.max(e.top, base.top);
  return Math.max(0, overlap) / Math.max(1, base.bottom - base.top);
}

/** A warning for an attack whose hitboxes miss most of the height the base's cover, or that reach much less far. */
export function hitWarning(e: Extent | undefined, base: Extent | undefined): string | undefined {
  if (!e || !base) return undefined;
  if (verticalCover(e, base) < 0.5) return e.top < base.top ? "sits higher than the base's" : "sits lower than the base's";
  if (e.right < base.right * 0.75) return "reaches much less far";
  return undefined;
}

/** Movement and stance actions, where a body drawn ahead of the fighter is a target the fighter can't see. */
export const BODY_ACTIONS: Readonly<Record<number, string>> = {
  0: "stand", 11: "crouch", 20: "walk forward", 21: "walk back", 41: "jump up", 42: "jump forward", 43: "jump back", 100: "run", 130: "guard",
};

/** A warning when a stance or movement's body reaches more than `slack` units further forward than the base's. */
export function bodyWarning(e: Extent | undefined, base: Extent | undefined, slack = 15): string | undefined {
  return e && base && e.right > base.right + slack ? "the body runs ahead of the fighter" : undefined;
}
