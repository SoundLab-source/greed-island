/**
 * The template check (docs/PHASE3.md step 4): a community fighter is its
 * archetype's template plus art, so its numbers must be the template's. Its
 * collision boxes follow its own pixels, though, so how far each move reaches
 * can drift: that is held to a limit. Pure.
 */
import { cellList, ticksOf, type TemplateSpec } from "./spec.ts";

export interface MoveNumbers {
  state: number;
  name: string;
  kind: "normal" | "special" | "throw";
  /** Ticks before the first active frame, on the active frames, and after them. */
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  /** Measured reach (templates/reach.ts), when known. */
  reach: number | null;
}

export interface FighterNumbers {
  life: number;
  attack: number;
  defence: number;
  walkFwd: number;
  runFwd: number;
  moves: MoveNumbers[];
}

export interface TemplateLimits {
  /** A move may reach this much farther or shorter than the template's, as a share of the template's reach... */
  reachShare: number;
  /** ...or this many units (320-wide), whichever is more. */
  reachUnits: number;
}

export const DEFAULT_LIMITS: TemplateLimits = { reachShare: 0.1, reachUnits: 3 };

function phases(anim: TemplateSpec["attacks"][number]["anim"], activeFrames: readonly number[]): { startup: number; active: number; recovery: number } {
  const frames = cellList(anim.cells).length;
  const first = Math.min(...activeFrames);
  const last = Math.max(...activeFrames);
  let startup = 0;
  let active = 0;
  let recovery = 0;
  for (let f = 0; f < frames; f++) {
    const t = ticksOf(anim, f);
    if (f < first) startup += t;
    else if (f <= last) active += t;
    else recovery += t;
  }
  return { startup, active, recovery };
}

/** A template's (or a fighter built on one's) numbers; `reach` from `measureReach`. */
export function fighterNumbers(spec: TemplateSpec, reach?: ReadonlyMap<number, number>): FighterNumbers {
  const c = spec.constants;
  return {
    life: c.life,
    attack: c.attack,
    defence: c.defence,
    walkFwd: c.walkFwd,
    runFwd: c.runFwd,
    moves: [
      ...spec.attacks.map((a): MoveNumbers => ({
        state: a.state,
        name: a.name,
        kind: a.special ? "special" : "normal",
        ...phases(a.anim, a.hits.flatMap((h) => h.frames)),
        damage: a.hits.reduce((sum, h) => sum + h.damage, 0),
        reach: reach?.get(a.state) ?? null,
      })),
      ...(spec.throws ?? []).map((t): MoveNumbers => ({ state: t.state, name: t.name, kind: "throw", ...phases(t.reach, t.catchFrames), damage: t.damage, reach: reach?.get(t.state) ?? null })),
    ],
  };
}

/** What about `fighter` is outside its template's limits; empty when it's fine. */
export function templateFindings(fighter: FighterNumbers, template: FighterNumbers, limits: TemplateLimits = DEFAULT_LIMITS): string[] {
  const findings: string[] = [];
  for (const [key, label] of [["life", "life"], ["attack", "attack"], ["defence", "defence"], ["walkFwd", "walking speed"], ["runFwd", "running speed"]] as const) {
    if (fighter[key] !== template[key]) findings.push(`${label} is ${fighter[key]}, the template's is ${template[key]}`);
  }
  const mine = new Map(fighter.moves.map((m) => [m.state, m]));
  for (const t of template.moves) {
    const m = mine.get(t.state);
    if (!m) {
      findings.push(`the ${t.name} is missing`);
      continue;
    }
    mine.delete(t.state);
    for (const [key, label] of [["damage", "damage"], ["startup", "wind-up"], ["active", "active time"], ["recovery", "recovery"]] as const) {
      if (m[key] !== t[key]) findings.push(`the ${t.name}'s ${label} is ${m[key]}, the template's is ${t[key]}`);
    }
    if (m.reach !== null && t.reach !== null) {
      const allowed = Math.max(t.reach * limits.reachShare, limits.reachUnits);
      if (Math.abs(m.reach - t.reach) > allowed + 1e-9) {
        findings.push(`the ${t.name} reaches ${m.reach}, the template's reaches ${t.reach} (at most ${Math.round(allowed)} ${m.reach > t.reach ? "more" : "less"} is allowed)`);
      }
    }
  }
  for (const extra of mine.values()) findings.push(`the ${extra.name} isn't one of the template's moves`);
  return findings;
}
