import { checksPassed, describeChecks, type EngineOutcome, type WinTally } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { ALL_ROUNDER } from "../templates/all-rounder.ts";
import { fighterNumbers, templateFindings } from "../templates/limits.ts";
import type { EventSource, FightSpec } from "../types.ts";
import { checkFighter, CheckError, type FighterCheckInput } from "./check.ts";
import { versus } from "./plan.ts";

const fighter = (id: string) => ({ id, name: id.toUpperCase(), defPath: `chars/${id}/${id}.def` });
const STAGES = [{ id: "s1", name: "Stage One", defPath: "stages/s1.def" }, { id: "s2", name: "Stage Two", defPath: "stages/s2.def" }];
const finished = (winnerSide: 1 | 2): EngineOutcome => ({ kind: "finished", winnerSide, rounds: [1, 2].map((round) => ({ type: "round_end", round, winnerSide, reason: "ko" })) });

/** A stub engine: `strength` (0-1) is how often that fighter beats anyone, decided by a counter so runs repeat. */
function stubSource(strength: Record<string, number>, crash: ReadonlySet<string> = new Set()): EventSource & { fights: FightSpec[] } {
  const seen = new Map<string, number>();
  const fights: FightSpec[] = [];
  return {
    mode: "sim",
    fights,
    async run(spec) {
      fights.push(spec);
      const [a, b] = [spec.sides[1].fighterId, spec.sides[2].fighterId];
      if (crash.has(a) || crash.has(b)) return { kind: "engine_crash", detail: "boom" };
      const focus = a in strength ? a : b;
      const n = seen.get(focus) ?? 0;
      seen.set(focus, n + 1);
      const wins = Math.floor((n + 1) * strength[focus]!) > Math.floor(n * strength[focus]!);
      return finished((focus === a) === wins ? 1 : 2);
    },
  };
}

const input = (over: Partial<FighterCheckInput> = {}): FighterCheckInput => ({
  fighter: { ...fighter("tpl"), ownArt: false },
  reference: fighter("tpl"),
  opponents: [fighter("o1"), fighter("o2")],
  stages: STAGES,
  settings: { fights: 40, tolerance: 0.1 },
  ...over,
});

describe("versus", () => {
  it("meets every opponent the same even number of times, half on each side", () => {
    const plan = versus("me", ["a", "b", "c"], 20, ["s1", "s2"]);
    expect(plan).toHaveLength(24); // 20 / 3 opponents, rounded up to 8 each
    for (const o of ["a", "b", "c"]) {
      expect(plan.filter((f) => f.p1 === "me" && f.p2 === o)).toHaveLength(4);
      expect(plan.filter((f) => f.p1 === o && f.p2 === "me")).toHaveLength(4);
    }
    expect(plan.slice(0, 3).map((f) => f.p2)).toEqual(["a", "b", "c"]);
    expect(() => versus("me", [], 10, ["s1"])).toThrow(/opponent/);
    expect(() => versus("me", ["me"], 10, ["s1"])).toThrow(/different/);
    expect(() => versus("me", ["a"], 0, ["s1"])).toThrow(/whole number/);
    expect(() => versus("me", ["a"], 10, [])).toThrow(/stage/);
  });
});

describe("template check", () => {
  const template = fighterNumbers(ALL_ROUNDER, new Map(ALL_ROUNDER.attacks.map((a) => [a.state, 40])));

  it("reads a template's numbers: phases, damage and reach per move", () => {
    const jab = template.moves.find((m) => m.name === "Jab")!;
    const spec = ALL_ROUNDER.attacks[0]!;
    expect(jab).toMatchObject({ state: 200, kind: "normal", damage: spec.hits[0]!.damage, reach: 40 });
    expect(jab.startup + jab.active + jab.recovery).toBe((spec.anim.ticks as number[]).reduce((a, b) => a + b, 0));
    expect(template.moves.filter((m) => m.kind === "special")).toHaveLength(3);
    expect(fighterNumbers(ALL_ROUNDER).moves.every((m) => m.reach === null)).toBe(true);
  });

  it("passes the template itself and a fighter whose reach drifts a little", () => {
    expect(templateFindings(template, template)).toEqual([]);
    const drift = { ...template, moves: template.moves.map((m) => ({ ...m, reach: m.reach === null ? null : m.reach + 4 })) };
    expect(templateFindings(drift, template)).toEqual([]);
  });

  it("finds changed stats, changed moves, extra reach and missing or extra moves", () => {
    const jab = template.moves[0]!;
    const cheat = {
      ...template,
      life: template.life + 100,
      moves: [{ ...jab, damage: jab.damage + 10, reach: 50 }, ...template.moves.slice(2), { ...jab, state: 999, name: "Secret Move" }],
    };
    const findings = templateFindings(cheat, template);
    expect(findings).toContain(`life is ${template.life + 100}, the template's is ${template.life}`);
    expect(findings).toContain(`the Jab's damage is ${jab.damage + 10}, the template's is ${jab.damage}`);
    expect(findings).toContain("the Jab reaches 50, the template's reaches 40 (at most 4 more is allowed)");
    expect(findings).toContain(`the ${template.moves[1]!.name} is missing`);
    expect(findings).toContain("the Secret Move isn't one of the template's moves");
    expect(findings).toHaveLength(5);
  });
});

describe("checkFighter", () => {
  it("a fighter that plays its archetype's template passes: a smoke fight, nothing to compare, the reference's record", async () => {
    const source = stubSource({ tpl: 0.5 });
    const r = await checkFighter(input(), { source, parallel: 3 });
    expect(checksPassed(r)).toBe(true);
    expect(r.checkedAs).toEqual({ fighterId: "tpl", name: "TPL", ownArt: false, defPath: "chars/tpl/tpl.def" });
    expect(r.smoke).toEqual({ ok: true, detail: "A full fight against O1 on Stage One finished in 2 rounds." });
    expect(r.template).toEqual({ ok: true, findings: [] });
    expect(r.balance).toMatchObject({ ok: true, fighter: null, difference: null, opponents: ["O1", "O2"], reference: { fighterId: "tpl", fights: 40, winRate: 0.5 } });
    expect(source.fights).toHaveLength(41); // the smoke fight, then 40 for the reference
    expect(describeChecks(r)).toEqual([
      "Checked as TPL (its archetype's template, with the template's art: this fighter's own art isn't built into a character yet).",
      "Smoke test: passed. A full fight against O1 on Stage One finished in 2 rounds.",
      "Template check: passed (moves and numbers are within its archetype's limits).",
      "Balance simulation: passed. It plays the reference character itself; TPL wins 50.0% of 40 fights against O1, O2.",
    ]);
  });

  it("fights the reference once and remembers its record for the next fighter of that archetype", async () => {
    const referenceRecords = new Map<string, WinTally>();
    const source = stubSource({ tpl: 0.5 });
    await checkFighter(input(), { source, parallel: 2, referenceRecords });
    expect(referenceRecords.size).toBe(1);
    const before = source.fights.length;
    await checkFighter(input(), { source, parallel: 2, referenceRecords });
    expect(source.fights.length - before).toBe(1); // only the smoke fight
  });

  it("a fighter with its own character is measured against the reference, within the tolerance", async () => {
    const own = { ...fighter("mine"), ownArt: true };
    const close = await checkFighter(input({ fighter: own }), { source: stubSource({ tpl: 0.5, mine: 0.55 }), parallel: 4 });
    expect(close.balance).toMatchObject({ ok: true, fighter: { fights: 40, winRate: 0.55 }, reference: { winRate: 0.5 } });
    expect(close.balance!.difference).toBeCloseTo(0.05, 9);
    expect(checksPassed(close)).toBe(true);

    const strong = await checkFighter(input({ fighter: own }), { source: stubSource({ tpl: 0.5, mine: 0.75 }), parallel: 4 });
    expect(strong.balance).toMatchObject({ ok: false, fighter: { winRate: 0.75 } });
    expect(checksPassed(strong)).toBe(false);
    expect(describeChecks(strong).at(-1)).toBe("Balance simulation: FAILED. It won 75.0% of 40 fights; TPL wins 50.0% of 40 fights against O1, O2: +25.0 points (limit 10).");
  });

  it("fails the template check when its numbers are outside the template's", async () => {
    const template = fighterNumbers(ALL_ROUNDER);
    const r = await checkFighter(input({ fighter: { ...fighter("mine"), ownArt: true }, numbers: { fighter: { ...template, attack: 120 }, template } }), { source: stubSource({ tpl: 0.5, mine: 0.5 }), parallel: 2 });
    expect(r.template).toEqual({ ok: false, findings: [`attack is 120, the template's is ${template.attack}`] });
    expect(checksPassed(r)).toBe(false);
  });

  it("stops at a failed smoke test", async () => {
    const source = stubSource({ tpl: 0.5 }, new Set(["tpl"]));
    const r = await checkFighter(input(), { source, parallel: 2 });
    expect(r).toMatchObject({ smoke: { ok: false }, template: null, balance: null });
    expect(r.smoke.detail).toBe("A fight against O1 on Stage One didn't finish: engine crash (boom).");
    expect(source.fights).toHaveLength(1);
    expect(checksPassed(r)).toBe(false);
    expect(describeChecks(r).at(-1)).toBe("The template check and balance simulation weren't run.");
  });

  it("refuses to run without opponents or stages, or with the fighter among its opponents", async () => {
    const deps = { source: stubSource({ tpl: 0.5 }), parallel: 1 };
    await expect(checkFighter(input({ opponents: [] }), deps)).rejects.toThrow(CheckError);
    await expect(checkFighter(input({ stages: [] }), deps)).rejects.toThrow(/stages/);
    await expect(checkFighter(input({ opponents: [fighter("tpl")] }), deps)).rejects.toThrow(/can't include/);
  });
});
