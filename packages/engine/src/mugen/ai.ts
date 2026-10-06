/**
 * An AI for MUGEN characters that have none of their own (left to the
 * engine, they only get its random button presses, and lose to any real AI).
 * It's written the way MUGEN AI patches are: each attack the character's
 * [Statedef -1] starts from a button command is copied with the command
 * swapped for "the opponent is in reach, and a dice roll", keeping the
 * character's own conditions (control, stance, power for a super, chains).
 * Reach comes from the attack animation's hitboxes in the .air file. The rest
 * is our fighters' AI (templates/cns.ts): no random presses, block decided
 * once per incoming attack (and again for a projectile on its way), run, jump and walk in, back off.
 *
 * Engine facts (vendor/Ikemen-GO, v1.0.0): for a MUGEN character the first
 * [Statedef -1] the engine meets wins and later ones are dropped (the st files
 * in order, then the cmd file: compiler.go:8164, 8345-8358, 7110-7113), so the
 * AI goes at the top of that same statedef, not in a file of its own. Its
 * memory is the engine's named maps (MapSet, Map(): compiler_functions.go:4764,
 * char.go:9553), which can't collide with the character's own var()s.
 */
import type { AiSpec } from "../templates/spec.ts";

/** Changes whenever the generated AI does, so imported characters get the new one (pnpm mugen:import). */
export const AI_VERSION = 8;

/** 0-1000 per tick: chance to jump over a projectile that's on its way from afar. */
export const PROJECTILE_JUMP = 60;
import { stripComment, type CodeFile } from "./cheats.ts";

interface Controller {
  type: string;
  /** Every key = value line in order, triggers included. */
  lines: [string, string][];
}

export interface Statedef {
  number: number;
  file: string;
  params: Map<string, string>;
  controllers: Controller[];
}

/** The statedefs of a code file, with their controllers' lines in order. */
export function parseStates(file: CodeFile): Statedef[] {
  const out: Statedef[] = [];
  let def: Statedef | undefined;
  let ctrl: Controller | undefined;
  for (const raw of file.text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (header) {
      const sd = /^statedef\s+(-?\d+)/i.exec(header[1]!);
      if (sd) {
        def = { number: Number(sd[1]), file: file.name, params: new Map(), controllers: [] };
        out.push(def);
        ctrl = undefined;
      } else if (/^state\s/i.test(header[1]!) && def) {
        ctrl = { type: "", lines: [] };
        def.controllers.push(ctrl);
      } else {
        def = undefined;
        ctrl = undefined;
      }
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0 || !def) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (!ctrl) def.params.set(key, value);
    else if (key === "type") ctrl.type = value.toLowerCase();
    else ctrl.lines.push([key, value]);
  }
  return out;
}

export interface AnimReach {
  /** How far forward the hitboxes reach from the axis, in the character's units. */
  reach: number;
  /** Ticks before the first frame with a hitbox. */
  startup: number;
}

/**
 * Each action's hitbox reach in a MUGEN .air file: `Clsn1Default` boxes hold for every following frame until
 * replaced, `Clsn1: n` boxes only for the next one; boxes may be written right to left.
 */
export function airReach(text: string): Map<number, AnimReach> {
  const out = new Map<number, AnimReach>();
  let action: number | undefined;
  let deflt: number[][] = [];
  let next: number[][] | undefined;
  let into: "default" | "next" | undefined;
  let ticks = 0;
  let reach: number | undefined;
  let startup = 0;
  const finish = () => {
    if (action !== undefined && reach !== undefined) out.set(action, { reach, startup });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*/, "").trim();
    if (!line) continue;
    const begin = /^\[\s*begin\s+action\s+(-?\d+)\s*\]$/i.exec(line);
    if (begin) {
      finish();
      action = Number(begin[1]);
      deflt = [];
      next = undefined;
      into = undefined;
      ticks = 0;
      reach = undefined;
      startup = 0;
      continue;
    }
    const head = /^clsn([12])(default)?\s*:/i.exec(line);
    if (head) {
      if (head[1] === "1") {
        into = head[2] ? "default" : "next";
        if (into === "default") deflt = [];
        else next = [];
      } else into = undefined;
      continue;
    }
    const box = /^clsn([12])\s*\[\s*\d+\s*\]\s*=\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/i.exec(line);
    if (box) {
      if (box[1] === "1" && into) (into === "default" ? deflt : next!).push([+box[2]!, +box[3]!, +box[4]!, +box[5]!]);
      continue;
    }
    const frame = /^(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/.exec(line);
    if (frame && action !== undefined) {
      const boxes = next ?? deflt;
      if (boxes.length) {
        const r = Math.max(...boxes.map((b) => Math.max(b[0]!, b[2]!)));
        if (reach === undefined) startup = ticks;
        reach = Math.max(reach ?? r, r);
      }
      ticks += Math.max(0, Number(frame[5]));
      next = undefined;
      into = undefined;
    }
  }
  finish();
  return out;
}

export interface AiAttack {
  state: number;
  /** The commands that started it, for the comments. */
  commands: string[];
  kind: "melee" | "throw" | "air" | "ranged";
  reach?: number;
}

export interface MugenAiInput {
  /** The character's state and command files, in the order the engine loads them (st, st0, st1..., then cmd). */
  files: readonly CodeFile[];
  air: string;
  /** [Size] ground.front: how far the body reaches forward, in the character's units. */
  front: number;
  /** The character's units per 320 (its localcoord width / 320). */
  scale: number;
  ai: AiSpec;
}

export interface MugenAi {
  /** The file whose [Statedef -1] gets the AI, and its new text. */
  file: string;
  text: string;
  attacks: AiAttack[];
}

const COMMAND = /command\s*!?=\s*"([^"]*)"/gi;

/** A trigger of the character's own, for the AI: commands taken as pressed, and for a crouching attack, standing allowed. */
function own(trigger: string, crouching: boolean): string {
  const t = trigger.replace(COMMAND, "1");
  return crouching ? t.replace(/\bstatetype\s*=\s*c\b/gi, "StateType != A") : t;
}

/** Does the character bring its own AI (it checks AILevel, or has the classic impossible "CPU" commands)? */
export function hasOwnAi(files: readonly CodeFile[]): boolean {
  return files.some((f) => /\bailevel\b/i.test(f.text.split(/\r?\n/).map(stripComment).join("\n")) || /^\s*name\s*=\s*"(cpu|ai|com)[\s_-]*\d*"/im.test(f.text));
}

/** The engine's load order of a .def's state and command files: st, then st0, st1... (natural order), then cmd. */
export function loadOrder(files: ReadonlyMap<string, string>): string[] {
  const st = [...files.keys()].filter((k) => /^st\d*$/.test(k)).sort((a, b) => (a === "st" ? -1 : b === "st" ? 1 : Number(a.slice(2)) - Number(b.slice(2))));
  return [...st, "cmd"].map((k) => files.get(k)).filter((v): v is string => !!v).map((v) => v.replace(/\\/g, "/"));
}

/** The AI for a character, or why there can't be one. */
export function mugenAi(input: MugenAiInput): MugenAi {
  const states = input.files.flatMap(parseStates);
  // Positive states: the first definition wins. The -1 that runs: the first one met.
  const byNumber = new Map<number, Statedef>();
  for (const s of states) if (!byNumber.has(s.number)) byNumber.set(s.number, s);
  const minus1 = byNumber.get(-1);
  const reaches = airReach(input.air);
  const k = input.scale;
  const n = (v: number) => Math.round(v * k);
  const inFight = "AILevel && RoundState = 2 && P2Life > 0";
  const notBlocking = "!(InGuardDist && Map(gi_block))";
  const attacks: AiAttack[] = [];
  const blocks: string[] = [];
  for (const c of minus1?.controllers ?? []) {
    if (c.type !== "changestate") continue;
    const triggers = c.lines.filter(([key]) => /^trigger(all|\d+)$/.test(key));
    const commands = [...new Set(triggers.flatMap(([, v]) => [...v.matchAll(COMMAND)].map((m) => m[1]!)))];
    const value = Number(c.lines.find(([key]) => key === "value")?.[1]);
    if (!commands.length || !Number.isInteger(value)) continue;
    const crouching = commands.some((x) => x.toLowerCase() === "holddown") && triggers.some(([, v]) => /command\s*=\s*"holddown"/i.test(v));
    const target = byNumber.get(value);
    if (!target || !/^a/i.test(target.params.get("movetype") ?? "")) continue;
    const ctrls = target.controllers;
    const hitdef = ctrls.find((x) => x.type === "hitdef");
    const throws = !!hitdef?.lines.some(([key]) => key === "p2stateno" || key === "p2getp1state");
    const shoots = ctrls.some((x) => x.type === "projectile");
    const anim = Number(/^-?\d+/.exec(target.params.get("anim") ?? "")?.[0] ?? NaN);
    const r = reaches.get(anim);
    const air = /^a/i.test(target.params.get("type") ?? "") || triggers.some(([, v]) => /statetype\s*=\s*a\b/i.test(v));
    const kind: AiAttack["kind"] | undefined = shoots ? "ranged" : !r ? undefined : throws ? "throw" : air ? "air" : "melee";
    if (!kind) continue;
    const reach = r ? Math.max(5, r.reach - input.front) : undefined;
    attacks.push({ state: value, commands, kind, ...(reach !== undefined ? { reach: Math.round(reach / k) } : {}) });
    const near = (extra: number) => `P2BodyDist X <= ${Math.round((reach ?? 0) + extra * k)} && P2BodyDist X >= ${n(-10)}`;
    const ours =
      kind === "ranged" ? [`P2BodyDist X > ${n(70)}`, `Random < ${Math.round(input.ai.aggression / 3)}`]
      : kind === "throw" ? ["P2StateType != A && P2StateType != L && P2MoveType != H", near(3), `Random < ${Math.round(input.ai.aggression / 3)}`]
      : kind === "air" ? [near(10), `P2BodyDist Y > ${n(-40)}`, `Random < ${Math.round(input.ai.aggression / 2)}`]
      : [near(5), `Random < ${Math.round(input.ai.aggression / 3)}`];
    blocks.push(
      `[State -1, GI AI: ${value} (${commands.join(", ")})]`,
      "type = ChangeState",
      ...[`triggerall = ${inFight}`, `triggerall = ${notBlocking}`, ...ours.map((t) => `triggerall = ${t}`)],
      // The character's own conditions, with "the button was pressed" taken as given. A crouching attack (down held)
      // starts straight from standing, as our fighters' do: this AI doesn't crouch first.
      ...c.lines.map(([key, v]) => `${key} = ${/^trigger/.test(key) ? own(v, crouching) : v}`),
      "",
    );
  }
  const melee = attacks.filter((a) => a.kind === "melee" && a.reach !== undefined).map((a) => a.reach!).sort((a, b) => a - b);
  const spacing = melee.length ? Math.min(input.ai.range, melee[Math.min(1, melee.length - 1)]!) : input.ai.range;
  const lines = [
    "; ----- Greed Island AI (pnpm mugen:import; the character had none of its own). Generated; do not edit. -----",
    "[State -1, GI AI: in control]",
    "type = AssertSpecial",
    "trigger1 = AILevel",
    "flag = NoAIButtonJam",
    "flag2 = NoAICheat",
    "ignorehitpause = 1",
    "",
    "; Block: decided once per incoming attack (map gi_block), and sometimes when an attack is already on its way.",
    "[State -1, GI AI: decide to block]",
    "type = MapSet",
    `trigger1 = ${inFight} && InGuardDist && !Map(gi_seen)`,
    'map = "gi_block"',
    `value = Random < ${input.ai.block}`,
    "",
    "; A projectile is slow and seen from far away: decide again when one is on its way, and block most of them.",
    "[State -1, GI AI: decide to block a projectile]",
    "type = MapSet",
    `trigger1 = ${inFight} && InGuardDist && (EnemyNear, NumProj) > 0 && !Map(gi_proj)`,
    'map = "gi_block"',
    `value = Random < ${input.ai.blockProjectile ?? 800}`,
    "",
    "[State -1, GI AI: react and block]",
    "type = MapSet",
    `trigger1 = ${inFight} && InGuardDist && !Map(gi_block) && P2MoveType = A && Random < ${input.ai.react ?? 35}`,
    'map = "gi_block"',
    "value = 1",
    "",
    "[State -1, GI AI: projectile seen]",
    "type = MapSet",
    "trigger1 = AILevel",
    'map = "gi_proj"',
    "value = InGuardDist && (EnemyNear, NumProj) > 0",
    "",
    "[State -1, GI AI: attack seen]",
    "type = MapSet",
    "trigger1 = AILevel",
    'map = "gi_seen"',
    "value = InGuardDist",
    "",
    "[State -1, GI AI: block]",
    "type = AssertInput",
    `trigger1 = ${inFight} && InGuardDist && Map(gi_block)`,
    "flag = B",
    "",
    "[State -1, GI AI: block low]",
    "type = AssertInput",
    `trigger1 = ${inFight} && InGuardDist && Map(gi_block) && P2StateType = C`,
    "flag = D",
    "",
    ...blocks,
    "; A projectile on its way from afar: jump over it (forward, so the jump closes the gap) rather than walk into it.",
    "[State -1, GI AI: jump over a projectile]",
    "type = ChangeState",
    "value = 40",
    `triggerall = ${inFight} && ctrl && StateType = S`,
    `trigger1 = (EnemyNear, NumProj) > 0 && P2BodyDist X > ${n(60)} && Random < ${PROJECTILE_JUMP}`,
    "",
    "; Getting in: run when far, jump in sometimes, walk otherwise; back off a little when crowded.",
    "[State -1, GI AI: run in]",
    "type = ChangeState",
    "value = 100",
    `triggerall = ${inFight} && ${notBlocking}`,
    `trigger1 = ctrl && StateType = S && P2BodyDist X > ${n(spacing * 2.2)} && Random < ${input.ai.run}`,
    "",
    "[State -1, GI AI: keep running]",
    "type = AssertInput",
    `trigger1 = AILevel && StateNo = 100 && P2BodyDist X > ${n(spacing * 1.1)}`,
    "flag = F",
    "",
    "[State -1, GI AI: stop running]",
    "type = ChangeState",
    "value = 0",
    `trigger1 = AILevel && StateNo = 100 && P2BodyDist X <= ${n(spacing * 1.1)}`,
    "",
    "[State -1, GI AI: jump in]",
    "type = ChangeState",
    "value = 40",
    `triggerall = ${inFight} && ${notBlocking}`,
    `trigger1 = ctrl && StateType = S && P2BodyDist X = [${n(spacing * 1.2)}, ${n(spacing * 2.5)}] && Random < ${input.ai.jump}`,
    "",
    "[State -1, GI AI: jump forward]",
    "type = AssertInput",
    "trigger1 = AILevel && StateNo = 40",
    "flag = F",
    "",
    "[State -1, GI AI: walk in]",
    "type = AssertInput",
    `trigger1 = ${inFight} && ctrl && StateType = S && !InGuardDist && P2BodyDist X > ${n(spacing)} && Random < 900`,
    "flag = F",
    "",
    "[State -1, GI AI: back off]",
    "type = AssertInput",
    `trigger1 = ${inFight} && ctrl && StateType = S && !InGuardDist && P2BodyDist X < ${n(spacing * 0.5)} && Random < ${input.ai.retreat ?? 300}`,
    "flag = B",
    "",
    "; ----- End of the Greed Island AI; the character's own commands follow. -----",
    "",
  ];
  const host = minus1Host(input.files);
  const file = input.files.find((f) => f.name === host);
  if (!file) throw new Error("no state or command file to put the AI in");
  return { file: file.name, text: insertIntoMinus1(file.text, lines), attacks };
}

/** The file whose [Statedef -1] the engine keeps (the first one, in load order), or the last file if none has one. */
export function minus1Host(files: readonly CodeFile[]): string | undefined {
  return files.find((f) => parseStates(f).some((s) => s.number === -1))?.name ?? files.at(-1)?.name;
}

/** `lines` at the top of the text's first [Statedef -1], or in a new one at the end. */
export function insertIntoMinus1(text: string, lines: readonly string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const all = text.split(/\r?\n/);
  const isHeader = (l: string) => /^\s*\[.*\]\s*$/.test(stripComment(l));
  const start = all.findIndex((l) => /^\s*\[\s*statedef\s+-1\s*[\],]/i.test(stripComment(l)));
  if (start < 0) return [...all, "", "[Statedef -1]", "", ...lines].join(eol);
  // Right after the statedef's own params (if any), before the comments and controllers that follow.
  let at = start + 1;
  while (at < all.length && !isHeader(all[at]!) && stripComment(all[at]!).includes("=")) at++;
  return [...all.slice(0, at), ...lines, ...all.slice(at)].join(eol);
}
