/**
 * The automatic checks on one fighter (docs/PHASE3.md step 4): a smoke test,
 * the template check, and a balance simulation against the same opponents as
 * its archetype's reference fighter. How a fight is run is the caller's
 * business (real sim fights in the orchestrator, the fake engine in tests).
 */
import { balanceResult, DEFAULT_STATS, type CheckResults, type CheckSettings, type WinTally } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { templateFindings, type FighterNumbers, type TemplateLimits } from "../templates/limits.ts";
import type { EventSource, FightSpec } from "../types.ts";
import { versus, type PlannedFight } from "./plan.ts";
import { runSeries } from "./series.ts";

export interface CheckFighter {
  id: string;
  name: string;
  /** Character .def, relative to IKEMEN_DIR. */
  defPath: string;
}

export interface FighterCheckInput {
  /** The engine character the fighter will fight as. `ownArt`: built from its own art, not its archetype's template itself. */
  fighter: CheckFighter & { ownArt: boolean };
  /** Its archetype's reference fighter (the template). */
  reference: CheckFighter;
  /** The spread of the roster both are measured against. */
  opponents: readonly CheckFighter[];
  stages: readonly { id: string; name: string; defPath: string }[];
  settings: CheckSettings;
  /** The fighter's and its template's numbers, when it has its own (own art); without them the template check has nothing to compare. */
  numbers?: { fighter: FighterNumbers; template: FighterNumbers; limits?: TemplateLimits };
}

export interface FighterCheckDeps {
  source: EventSource;
  /** Sim fights at a time. */
  parallel: number;
  /**
   * The reference's record against these opponents, kept between checks: it is
   * the same for every fighter of an archetype, so it's only fought once.
   */
  referenceRecords?: Map<string, WinTally>;
  signal?: AbortSignal;
  newFightId?: () => string;
}

/** Thrown when the checks couldn't be run at all (as opposed to run and failed). */
export class CheckError extends Error {}

function tally(plan: readonly PlannedFight[], results: Awaited<ReturnType<typeof runSeries>>, id: string): WinTally & { failed: number } {
  const t = { fights: 0, wins: 0, draws: 0, failed: plan.length - results.length };
  for (const r of results) {
    if (r.outcome.kind !== "finished") {
      t.failed++;
      continue;
    }
    t.fights++;
    const side = r.fight.p1 === id ? 1 : 2;
    if (r.outcome.winnerSide === 0) t.draws++;
    else if (r.outcome.winnerSide === side) t.wins++;
  }
  return t;
}

export async function checkFighter(input: FighterCheckInput, deps: FighterCheckDeps): Promise<CheckResults> {
  const { fighter, reference, opponents, stages, settings } = input;
  if (opponents.length === 0) throw new CheckError("there are no other fighters to check it against");
  if (stages.length === 0) throw new CheckError("there are no stages to fight on");
  if (opponents.some((o) => o.id === fighter.id || o.id === reference.id)) throw new CheckError("the opponents can't include the fighter or its reference");
  const everyone = new Map([fighter, reference, ...opponents].map((f) => [f.id, f]));
  const stageOf = new Map(stages.map((s) => [s.id, s]));
  const newId = deps.newFightId ?? randomUUID;
  const run = async (fight: PlannedFight) => {
    const side = (id: string) => {
      const f = everyone.get(id)!;
      return { characterId: f.id, fighterId: f.id, defPath: f.defPath, palette: 1, stats: { ...DEFAULT_STATS } };
    };
    const stage = stageOf.get(fight.stageId)!;
    const spec: FightSpec = { fightId: newId(), sides: { 1: side(fight.p1), 2: side(fight.p2) }, stage: { id: stage.id, defPath: stage.defPath }, roundsToWin: 2 };
    return { outcome: await deps.source.run(spec, deps.signal ? { signal: deps.signal } : {}), detail: null };
  };
  const series = (id: string) => {
    const plan = versus(id, opponents.map((o) => o.id), settings.fights, stages.map((s) => s.id));
    return runSeries(plan, run, { parallel: deps.parallel, ...(deps.signal ? { signal: deps.signal } : {}) }).then((results) => tally(plan, results, id));
  };
  const checkedAs = { fighterId: fighter.id, name: fighter.name, ownArt: fighter.ownArt };

  // 1. Smoke test: one whole fight on the first stage.
  const first = opponents[0]!;
  const smokeFight = await run({ index: 0, p1: fighter.id, p2: first.id, stageId: stages[0]!.id });
  if (deps.signal?.aborted) throw new CheckError("stopped before it finished");
  if (smokeFight.outcome.kind !== "finished") {
    return { checkedAs, smoke: { ok: false, detail: `A fight against ${first.name} on ${stages[0]!.name} didn't finish: ${smokeFight.outcome.kind.replace("_", " ")} (${smokeFight.outcome.detail}).` }, template: null, balance: null };
  }
  let smoke = { ok: true, detail: `A full fight against ${first.name} on ${stages[0]!.name} finished in ${smokeFight.outcome.rounds.length} rounds.` };

  // 2. Template check: its numbers against its template's.
  const findings = input.numbers ? templateFindings(input.numbers.fighter, input.numbers.template, input.numbers.limits) : [];
  const template = { ok: findings.length === 0, findings };

  // 3. Balance simulation: the reference's record (fought once, then remembered), then the fighter's own.
  const sameCharacter = fighter.defPath === reference.defPath;
  const key = [reference.defPath, settings.fights, ...opponents.map((o) => o.defPath), ...stages.map((s) => s.defPath)].join("|");
  let referenceRecord = deps.referenceRecords?.get(key);
  if (!referenceRecord) {
    const r = await series(reference.id);
    if (deps.signal?.aborted) throw new CheckError("stopped before it finished");
    if (r.fights < (r.fights + r.failed) / 2) throw new CheckError(`the reference fighter ${reference.name} didn't finish most of its fights (${r.failed} of ${r.fights + r.failed} failed)`);
    if (sameCharacter && r.failed > 0) smoke = { ok: false, detail: `${r.failed} of ${r.fights + r.failed} sim fights crashed or timed out.` };
    referenceRecord = { fights: r.fights, wins: r.wins, draws: r.draws };
    if (r.failed === 0) deps.referenceRecords?.set(key, referenceRecord);
  }
  let own: WinTally | null = null;
  if (!sameCharacter) {
    const r = await series(fighter.id);
    if (deps.signal?.aborted) throw new CheckError("stopped before it finished");
    if (r.failed > 0) smoke = { ok: false, detail: `${r.failed} of ${r.fights + r.failed} sim fights crashed or timed out.` };
    own = { fights: r.fights, wins: r.wins, draws: r.draws };
  }
  const balance = balanceResult(own, { ...referenceRecord, fighterId: reference.id, name: reference.name }, opponents.map((o) => o.name), settings.tolerance);
  return { checkedAs, smoke, template, balance };
}
