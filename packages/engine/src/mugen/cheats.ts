/**
 * The cheat scanner: reads a MUGEN character's code (.cns/.st/.cmd) and lists
 * the tricks that make "cheap" characters unbeatable, with file and line, so
 * they can be patched out before the character fights on a betting stream.
 * It reads the code; it doesn't run it, so expressions are judged by the
 * numbers in them, and a finding is "cheat" (almost certainly breaks a fair
 * fight) or "check" (often legitimate, worth a look).
 */

export type Level = "cheat" | "check";

export interface Finding {
  level: Level;
  /** What the trick does, in plain words. */
  what: string;
  file: string;
  line: number;
  /** The line as written. */
  text: string;
}

export interface CodeFile {
  name: string;
  text: string;
}

interface Param {
  value: string;
  line: number;
  raw: string;
}

interface Block {
  file: string;
  /** The Statedef the controller belongs to (negative ones run every tick). */
  statedef: number | undefined;
  type: string;
  params: Map<string, Param>;
  triggers: string[];
}

/** Normal [Data] values; a character far above them is "boosted". */
export const NORMAL = { life: 1000, attack: 100, defence: 100 } as const;

const numbers = (v: string): number[] => (v.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const isPlainNumber = (v: string): boolean => /^\s*-?\d+(?:\.\d+)?\s*(,.*)?$/.test(v);
/** A trigger that is always true: `1`, or a time check that always holds. */
const alwaysTrue = (t: string): boolean => /^\s*(1|time\s*>=\s*0|!?\s*0\s*=\s*0)\s*$/i.test(t);
/** A trigger tied to particular states or moments (an intro, a move), the usual reason for code in an always-running state. */
const scoped = (t: string): boolean => /\b(stateno|prevstateno|anim|animelem|animtime|movecontact|movehit|roundstate|movetype|statetype|hitpausetime|ishelper)\b/i.test(t);

export function stripComment(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ";" && !quoted) return line.slice(0, i);
  }
  return line;
}

/** Every state controller in a file, and its [Data] section. */
export function parseCode(file: CodeFile): { blocks: Block[]; data: Map<string, Param> } {
  const blocks: Block[] = [];
  const data = new Map<string, Param>();
  let statedef: number | undefined;
  let current: Block | undefined;
  let section = "";
  file.text.replace(/^﻿/, "").split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw).trim();
    if (!line) return;
    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (header) {
      const h = header[1]!;
      current = undefined;
      section = h.toLowerCase();
      const def = /^statedef\s+(-?\d+)/i.exec(h);
      if (def) {
        statedef = Number(def[1]);
      } else if (/^state\s+-?\d+/i.test(h)) {
        const own = /^state\s+(-?\d+)/i.exec(h);
        // A [State -2, ...] block with no Statedef header belongs to that number.
        if (own && Number(own[1]) < 0 && statedef === undefined) statedef = Number(own[1]);
        current = { file: file.name, statedef, type: "", params: new Map(), triggers: [] };
        blocks.push(current);
      }
      return;
    }
    const eq = line.indexOf("=");
    if (eq < 0) return;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    const param = { value, line: i + 1, raw: raw.trim() };
    if (section === "data") data.set(key, param);
    if (!current) return;
    if (key === "type") current.type = value.toLowerCase();
    else if (/^trigger(all|\d+)$/.test(key)) current.triggers.push(value);
    else current.params.set(key, param);
  });
  return { blocks, data };
}

/** Everything suspicious in a character's code files. */
export function scanCheats(files: readonly CodeFile[]): Finding[] {
  const out: Finding[] = [];
  const add = (level: Level, what: string, file: string, p: Param) => out.push({ level, what, file, line: p.line, text: p.raw });
  for (const file of files) {
    const { blocks, data } = parseCode(file);
    for (const [key, normal, big] of [["life", NORMAL.life, 3000], ["attack", NORMAL.attack, 250], ["defence", NORMAL.defence, 250]] as const) {
      const p = data.get(key);
      const v = p && numbers(p.value)[0];
      if (p && v !== undefined && v >= normal * 1.3) add(v >= big ? "cheat" : "check", `boosted ${key}: ${v} (normal ${normal})`, file.name, p);
    }
    for (const b of blocks) {
      // Code in an always-running state (Statedef -1, -2, -3): a cheat when it always fires, worth a look when it hangs
      // on something other than a particular state (a mode switch), fine when tied to particular states.
      const always = b.statedef !== undefined && b.statedef < 0;
      const unconditional = b.triggers.length > 0 && b.triggers.some(alwaysTrue);
      const permanent: Level | undefined = !always ? undefined : unconditional ? "cheat" : b.triggers.some(scoped) ? undefined : "check";
      const p = (k: string) => b.params.get(k);
      switch (b.type) {
        case "hitdef":
        case "projectile":
          for (const k of ["damage", "fall.damage"]) {
            const d = p(k);
            // A plain "hit, guard" pair counts its hit damage; an expression, its biggest number.
            const v = d && Math.max(0, ...(isPlainNumber(d.value) ? numbers(d.value).slice(0, 1) : numbers(d.value)));
            if (d && v !== undefined && v >= 250) add(v >= 400 && isPlainNumber(d.value) ? "cheat" : "check", `one hit does ${v} damage (a normal special does 50-150, out of 1000 life)`, file.name, d);
          }
          break;
        case "targetlifeadd":
        case "lifeadd": {
          const d = p("value");
          const v = d && Math.min(0, ...numbers(d.value));
          if (d && v !== undefined && v <= -300) add(b.type === "targetlifeadd" ? "cheat" : "check", `takes ${-v} life in one go (${b.type})`, file.name, d);
          if (d && permanent && b.type === "lifeadd" && Math.max(0, ...numbers(d.value)) > 0) add("check", "gains life all the time (lifeadd in an always-running state)", file.name, d);
          break;
        }
        case "lifeset": {
          const d = p("value");
          if (d) add(numbers(d.value).length === 1 && numbers(d.value)[0] === 0 ? "cheat" : "check", "sets life directly (lifeset)", file.name, d);
          break;
        }
        case "nothitby":
        case "hitby": {
          const d = p("value") ?? p("value2");
          const t = p("time");
          if (d && permanent) add(permanent, "can't be hit (nothitby in an always-running state)", file.name, d);
          else if (d && t && Math.max(...numbers(t.value), 0) >= 120) add("check", `can't be hit for ${numbers(t.value)[0]} ticks`, file.name, t);
          break;
        }
        case "hitoverride":
        case "reversaldef":
          if (permanent && p("attr")) add(permanent, `${b.type === "hitoverride" ? "ignores hits" : "reverses every attack"} in an always-running state`, file.name, p("attr")!);
          break;
        case "assertspecial":
          for (const [k, d] of b.params) {
            if (/^flag\d?$/.test(k) && /\b(global)?noko\b/i.test(d.value)) add("cheat", "can't be knocked out (noko)", file.name, d);
          }
          break;
        case "pause":
        case "superpause": {
          const t = p("time");
          const m = p("movetime");
          if (t && Math.max(0, ...numbers(t.value)) >= 300) add("check", `freezes the game for ${numbers(t.value)[0]} ticks`, file.name, t);
          if (m && Math.max(0, ...numbers(m.value)) >= 300) add("check", `acts during a freeze for ${numbers(m.value)[0]} ticks`, file.name, m);
          break;
        }
        case "attackmulset":
        case "defencemulset": {
          const d = p("value");
          const v = d && Math.max(0, ...numbers(d.value));
          if (d && v !== undefined && v >= 2) add("check", `${b.type === "attackmulset" ? "hits" : "defends"} ${v} times as hard (${b.type})`, file.name, d);
          break;
        }
        case "powerset":
        case "poweradd":
          if (permanent && p("value")) add("check", "fills its power bar all the time", file.name, p("value")!);
          break;
        case "displaytoclipboard":
        case "appendtoclipboard": {
          const d = p("text");
          if (d && /%n/i.test(d.value)) add("cheat", "a WinMUGEN memory exploit (%n in clipboard text)", file.name, d);
          break;
        }
      }
    }
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "cheat" ? -1 : 1));
}
