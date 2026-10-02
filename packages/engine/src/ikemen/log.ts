/**
 * Fallback result source: the `-log` file IKEMEN writes after a quick-VS
 * match, a Lua table dump from main.f_printTable (external/script/main.lua:113):
 *
 *   table: 0x1234 {
 *     ["winSide"] => 0
 *     ["wins"] => table: 0x5678 {
 *                 [1] => 2
 *                 [2] => 1
 *                 }
 *   }
 *
 * Used only when the event mod produced nothing. See docs/ikemen-notes.md §4.
 */
import type { EngineOutcome, Side, WinnerSide } from "@greed-island/shared";
import { readFile } from "node:fs/promises";

export type LuaDump = { [key: string]: LuaValue };
export type LuaValue = string | number | boolean | null | LuaDump;

const ENTRY = /^\s*\[(?:"((?:[^"\\]|\\.)*)"|([^\]]+))\]\s*=>\s*(.*)$/;

function scalar(raw: string): LuaValue {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "nil") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

/** Parse a print_r-style Lua table dump into nested objects (array indices become string keys). */
export function parseLuaDump(text: string): LuaDump {
  const root: LuaDump = {};
  const stack: LuaDump[] = [root];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === "}") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const m = ENTRY.exec(line);
    if (!m) continue; // the opening "table: 0x… {" line
    const key = m[1] ?? m[2]!.trim();
    const value = m[3]!;
    const top = stack[stack.length - 1]!;
    if (/^table: [^{]*\{\s*$/.test(value.trim())) {
      const child: LuaDump = {};
      top[key] = child;
      stack.push(child);
    } else {
      top[key] = scalar(value);
    }
  }
  return root;
}

function field(obj: LuaDump, ...names: string[]): LuaValue | undefined {
  for (const n of names) {
    for (const key of Object.keys(obj)) if (key.toLowerCase() === n.toLowerCase()) return obj[key];
  }
  return undefined;
}

/**
 * Decide the match from the log. The engine's winSide is only the last
 * round's winner, so the winner is taken from the win tally and cross-checked.
 * Returns null if the log can't be read confidently.
 */
export function outcomeFromDump(dump: LuaDump, roundsToWin: number): EngineOutcome | null {
  const wins = field(dump, "wins");
  const winSide = field(dump, "winSide");
  if (typeof wins !== "object" || wins === null || typeof winSide !== "number") return null;
  const w1 = field(wins, "1");
  const w2 = field(wins, "2");
  if (typeof w1 !== "number" || typeof w2 !== "number") return null;
  const r1 = w1 >= roundsToWin;
  const r2 = w2 >= roundsToWin;
  // Nobody reached the win count: the match never finished (the window was
  // closed or the engine quit). A real draw ends with both at the count
  // (docs/ikemen-notes.md §3); a closed window logs WinSide -1, Wins 0-0 (§4).
  if (!r1 && !r2) return { kind: "engine_crash", detail: `the match stopped before anyone won (wins ${w1}-${w2}): the game was closed or quit` };
  const tally: WinnerSide = r1 === r2 ? 0 : r1 ? 1 : 2;
  // winSide is 0-based (0 = P1, 1 = P2), −1 for a draw.
  const engine: WinnerSide = winSide === 0 ? 1 : winSide === 1 ? 2 : 0;
  if (tally !== engine) return { kind: "engine_crash", detail: `log disagrees: wins ${w1}-${w2}, winSide ${winSide}` };
  return { kind: "finished", winnerSide: tally, rounds: [] };
}

/** One round as the log tells it: who won, how long it took and how much life each side had left. */
export interface RoundDetail {
  winnerSide: WinnerSide;
  /** Game ticks (60 a second at normal speed). */
  ticks: number;
  /** Life left at the end, as a share of that fighter's full life (0–1). */
  lifeLeft: Record<Side, number>;
  /** Decided by the clock running out instead of a knockout. */
  byTime: boolean;
}

export interface MatchDetail {
  /** Fighting time of the whole match in game ticks. */
  ticks: number;
  rounds: RoundDetail[];
}

/**
 * Round-by-round detail for balance checks (docs/ikemen-notes.md §4: `Rounds`
 * lists each round's `Timer` and, per side, the fighter's `Life`, `LifeMax`,
 * `Win` and `WinTime`). Returns null if the log doesn't have that shape.
 */
export function matchDetailFromDump(dump: LuaDump): MatchDetail | null {
  const ticks = field(dump, "MatchTime");
  const rounds = field(dump, "Rounds");
  if (typeof ticks !== "number" || typeof rounds !== "object" || rounds === null) return null;
  const out: RoundDetail[] = [];
  for (const key of Object.keys(rounds).sort((a, b) => Number(a) - Number(b))) {
    const round = rounds[key];
    if (typeof round !== "object" || round === null) return null;
    const timer = field(round, "Timer");
    const fighters = field(round, "Fighters");
    if (typeof timer !== "number" || typeof fighters !== "object" || fighters === null) return null;
    const lifeLeft: Record<Side, number> = { 1: 0, 2: 0 };
    let winnerSide: WinnerSide = 0;
    let byTime = false;
    for (const side of [1, 2] as const) {
      const team = field(fighters, String(side));
      const f = typeof team === "object" && team !== null ? field(team, "1") : undefined;
      if (typeof f !== "object" || f === null) return null;
      const life = field(f, "Life");
      const lifeMax = field(f, "LifeMax");
      if (typeof life !== "number" || typeof lifeMax !== "number" || lifeMax <= 0) return null;
      lifeLeft[side] = Math.min(1, Math.max(0, life / lifeMax));
      if (field(f, "Win") === true) {
        winnerSide = winnerSide === 0 ? side : 0; // both flagged: a drawn round
        byTime ||= field(f, "WinTime") === true;
      }
    }
    out.push({ winnerSide, ticks: timer, lifeLeft, byTime });
  }
  return { ticks, rounds: out };
}

export async function matchDetailFromLog(file: string): Promise<MatchDetail | null> {
  try {
    return matchDetailFromDump(parseLuaDump(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function outcomeFromLog(file: string, roundsToWin: number): Promise<EngineOutcome | null> {
  try {
    return outcomeFromDump(parseLuaDump(await readFile(file, "utf8")), roundsToWin);
  } catch {
    return null;
  }
}
