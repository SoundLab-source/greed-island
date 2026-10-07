/**
 * Gags: moves of our own added to an imported character (mugen.json "gags").
 *
 * "explosion": out of nowhere, a big cartoon explosion (fx/explosion.ts, played
 * from our effect pack) goes off where the opponent stands, for 45% of their
 * life: it can't be blocked (a HitDef with no guardflag can't be guarded:
 * vendor/Ikemen-GO src/char.go:705) and knocks them down, to Counter-Strike 1.6's AWP shot. The hit is an
 * unseen projectile placed on the opponent (Projectile postype = p2) whose
 * animation is one big hitbox. The AI sets it off at random, at most once a
 * round (about one round in three). A hit during the 20-tick wind-up stops it.
 */
import { FX_EXPLOSION } from "../fx/pack.ts";

export const GAGS = ["explosion"] as const;
export type Gag = (typeof GAGS)[number];

/** The character's state for the explosion, and its hit's animation (added to the character's .air). */
export const EXPLOSION_STATE = 7770;
export const EXPLOSION_HIT_ANIM = 7771;
/** Share of the opponent's life the explosion takes. */
export const EXPLOSION_DAMAGE = 0.45;

/**
 * The states file of a character's gags. `scale` is the character's units per 320-wide unit (its localcoord / 320),
 * so the blast throws everyone as far and shakes the screen as hard whatever the character's size.
 */
export function gagStates(gags: readonly Gag[], scale = 1): string {
  if (!gags.includes("explosion")) return "";
  const k = (x: number) => String(Math.round(x * scale * 100) / 100);
  return [
    "; Greed Island gags (mugen.json \"gags\", pnpm mugen:import). Generated; do not edit.",
    "",
    "; The big explosion: a wind-up, then KABOOM on the opponent, for 45% of their life.",
    `[Statedef ${EXPLOSION_STATE}]`,
    "type = S",
    "movetype = A",
    "physics = S",
    "anim = 0",
    "ctrl = 0",
    "velset = 0, 0",
    "",
    `[State ${EXPLOSION_STATE}, KABOOM]`,
    "type = Explod",
    "trigger1 = Time = 20",
    `anim = ${FX_EXPLOSION}`,
    "postype = p2",
    "pos = 0, 0",
    "facing = 1",
    "removetime = -2",
    "sprpriority = 6",
    "ownpal = 1",
    "",
    "; The AWP shot (silent if the pack was built without it).",
    `[State ${EXPLOSION_STATE}, sound]`,
    "type = PlaySnd",
    "trigger1 = Time = 20",
    `value = ${FX_EXPLOSION}, 0`,
    "",
    `[State ${EXPLOSION_STATE}, flash]`,
    "type = AllPalFX",
    "trigger1 = Time = 20",
    "time = 8",
    "add = 220, 200, 160",
    "mul = 256, 256, 256",
    "",
    `[State ${EXPLOSION_STATE}, shake]`,
    "type = EnvShake",
    "trigger1 = Time = 21",
    "time = 36",
    `ampl = ${k(8)}`,
    "freq = 60",
    "",
    `[State ${EXPLOSION_STATE}, the blast]`,
    "type = Projectile",
    "trigger1 = Time = 24",
    `projid = ${EXPLOSION_STATE}`,
    `projanim = ${EXPLOSION_HIT_ANIM}`,
    `projhitanim = ${EXPLOSION_HIT_ANIM}`,
    `projremanim = ${EXPLOSION_HIT_ANIM}`,
    `projcancelanim = ${EXPLOSION_HIT_ANIM}`,
    "postype = p2",
    "offset = 0, 0",
    "velocity = 0, 0",
    "projremovetime = 6",
    "projhits = 1",
    "projpriority = 9",
    "attr = S, SP",
    `damage = floor((EnemyNear, LifeMax) * ${EXPLOSION_DAMAGE}), 0`,
    "animtype = Back",
    "ground.type = High",
    "air.type = High",
    "ground.slidetime = 20",
    "ground.hittime = 20",
    `ground.velocity = ${k(-5)}, ${k(-7)}`,
    `air.velocity = ${k(-5)}, ${k(-7)}`,
    "fall = 1",
    "air.fall = 1",
    "fall.recover = 0",
    "pausetime = 0, 10",
    "sparkno = -1",
    "getpower = 0",
    "givepower = 0",
    "",
    `[State ${EXPLOSION_STATE}, done]`,
    "type = ChangeState",
    "trigger1 = Time >= 60",
    "value = 0",
    "ctrl = 1",
    "",
  ].join("\n");
}

/** The explosion hit's one big hitbox around the opponent, in 320-wide units. */
export const EXPLOSION_BOX = [-75, -175, 75, 5] as const;

/** The animation of the explosion's hit: no picture (sprite -1), one big hitbox around the opponent. */
export function gagAir(gags: readonly Gag[], eol = "\n"): string {
  if (!gags.includes("explosion")) return "";
  return ["", "; Greed Island gag: the big explosion's hit (no picture, one big hitbox). Generated; do not edit.", `[Begin Action ${EXPLOSION_HIT_ANIM}]`, "Clsn1Default: 1", ` Clsn1[0] = ${EXPLOSION_BOX.join(", ")}`, "-1, 0, 0, 0, 30", ""].join(eol);
}

/** For the character's [Statedef -1]: the AI sets a gag off at random, at most once a round. */
export function gagTriggers(gags: readonly Gag[]): string[] {
  if (!gags.includes("explosion")) return [];
  return [
    "; ----- Greed Island gags. Generated; do not edit. -----",
    "[State -1, GI gag: a new round]",
    "type = MapSet",
    "trigger1 = RoundState < 2",
    'map = "gi_boom"',
    "value = 0",
    "",
    "; About one round in three: two dice, 1 in 1000 and 3 in 10, each tick it has control.",
    "[State -1, GI gag: the big explosion]",
    "type = ChangeState",
    `value = ${EXPLOSION_STATE}`,
    "triggerall = AILevel && RoundState = 2 && P2Life > 0 && !Map(gi_boom)",
    "trigger1 = ctrl && StateType = S && P2StateType != L && Random < 1 && Random < 300",
    "",
    "[State -1, GI gag: explosion used]",
    "type = MapSet",
    `trigger1 = StateNo = ${EXPLOSION_STATE}`,
    'map = "gi_boom"',
    "value = 1",
    "",
  ];
}
