/**
 * How far each attack and throw really reaches, measured from the built
 * hitboxes: the furthest hitbox edge on its active frames, plus how far the
 * move carries the fighter forward up to its last active frame (a charge hits
 * whenever it arrives while still active), minus the fighter's own front width. That is the gap between the two bodies (`P2BodyDist X`) at
 * which the move connects, which is what the AI checks before using it.
 */
import type { AirAction } from "../art/air.ts";
import { ticksOf, type TemplateSpec } from "./spec.ts";

/** Keep a little inside the measured reach, so the AI doesn't swing at the very tip. */
const MARGIN = 0.9;

/** Attack or throw state → reach in 320-wide units (body gap), for moves with a hitbox. */
export function measureReach(spec: TemplateSpec, actions: readonly AirAction[]): Map<number, number> {
  const k = spec.art.localcoord / 320;
  const byAction = new Map(actions.map((a) => [a.action, a]));
  const out = new Map<number, number>();
  const moves = [
    ...spec.attacks.filter((a) => !a.projectile).map((a) => ({ state: a.state, anim: a.anim, active: a.hits.flatMap((h) => h.frames), moves: a.moves ?? [] })),
    ...(spec.throws ?? []).map((t) => ({ state: t.state, anim: t.reach, active: [...t.catchFrames], moves: t.moves ?? [] })),
  ];
  for (const m of moves) {
    const action = byAction.get(m.state);
    if (!action) continue;
    const last = Math.max(...m.active);
    let tip = -Infinity;
    for (const f of m.active) for (const b of action.frames[f]?.clsn1 ?? []) tip = Math.max(tip, b[2]);
    if (!Number.isFinite(tip)) continue;
    // Forward travel before the last active frame: each VelSet holds until the next one.
    let travel = 0;
    const sorted = [...m.moves].sort((a, b) => a.frame - b.frame);
    for (let f = 0; f < last; f++) {
      const speed = sorted.filter((x) => x.frame <= f).at(-1)?.x ?? 0;
      travel += speed * ticksOf(m.anim, f);
    }
    out.set(m.state, Math.max(5, Math.round(((tip / k) + travel - spec.constants.width[0]) * MARGIN)));
  }
  return out;
}
