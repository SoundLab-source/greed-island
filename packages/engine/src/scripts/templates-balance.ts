// `pnpm templates:balance [--fights 20] [--only bruiser] [--fighters a,b,c] [--stages x,y] [--speed 100] [--parallel 6] [--keep]`:
// a round robin of sim fights between the fighter templates (or any roster fighters), reporting win
// rates per fighter and per matchup (docs/PHASE3.md step 4). --fights is per pairing: 20 with the five
// templates is 200 fights, a couple of minutes. --only runs just one fighter's pairings. The results
// are saved in runs/balance/; failed fights keep their artifacts there (--keep keeps every fight's).
// --sides instead runs each fighter against itself (--fights each, default 60) to check that
// neither side of the screen has an edge.
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { DEFAULT_STATS } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { mirrors, roundRobin } from "../balance/plan.ts";
import { formatSides, formatSummary } from "../balance/report.ts";
import { runSeries } from "../balance/series.ts";
import { summarize, summarizeSides } from "../balance/stats.ts";
import { loadEngineConfig } from "../config.ts";
import { matchDetailFromLog } from "../ikemen/log.ts";
import { createIkemenSource } from "../ikemen/runner.ts";
import { loadRoster } from "../roster/schema.ts";
import { TEMPLATES } from "../templates/index.ts";
import type { FightSpec } from "../types.ts";

loadRepoEnv();
const { values } = parseArgs({
  options: {
    fights: { type: "string" },
    sides: { type: "boolean" },
    only: { type: "string" },
    fighters: { type: "string" },
    stages: { type: "string" },
    speed: { type: "string", default: "100" },
    parallel: { type: "string", default: "6" },
    keep: { type: "boolean" },
  },
});
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const whole = (flag: string, raw: string, max: number) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(`--${flag} must be a whole number from 1 to ${max} (got "${raw}")`);
  return n;
};
const fightsPerPair = whole("fights", values.fights ?? (values.sides ? "60" : "20"), 1000);
const speed = whole("speed", values.speed, 100);
const parallel = whole("parallel", values.parallel, 16);

const cfg = loadEngineConfig();
const ikemenDir = cfg.ikemenDir ?? fail("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
const roster = await loadRoster();

// Fighters by roster id or display name ("gi-tpl-heavy" or "bruiser").
const findFighter = (word: string) => {
  const w = word.trim().toLowerCase();
  return roster.fighters.find((f) => f.id.toLowerCase() === w) ?? roster.fighters.find((f) => f.displayName.toLowerCase() === w) ?? fail(`No fighter "${word}" in roster.json. Known: ${roster.fighters.map((f) => f.displayName).join(", ")}`);
};
const fighters = values.fighters ? values.fighters.split(",").map(findFighter) : TEMPLATES.map((t) => findFighter(t.id));
const stages = values.stages
  ? values.stages.split(",").map((id) => roster.stages.find((s) => s.id === id.trim()) ?? fail(`No stage "${id}" in roster.json`))
  : roster.stages.filter((s) => s.enabled && s.id.startsWith("gi-"));
if (stages.length === 0) fail("No stages to fight on: run pnpm stages:build, or name some with --stages");
const only = values.only ? findFighter(values.only).id : undefined;

const ids = fighters.map((f) => f.id);
const plan = (() => {
  try {
    const stageIds = stages.map((s) => s.id);
    return values.sides ? mirrors(only ? [only] : ids, fightsPerPair, stageIds) : roundRobin(ids, fightsPerPair, stageIds, only ? { only } : {});
  } catch (e) {
    return fail((e as Error).message);
  }
})();
const names = Object.fromEntries(fighters.map((f) => [f.id, f.displayName]));

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(cfg.runsDir, "balance", stamp);
await mkdir(outDir, { recursive: true });
const source = createIkemenSource({ mode: "sim", ikemenDir, runsDir: outDir, timeoutMs: cfg.simTimeoutMs, aiLevel: cfg.aiLevel, simSpeed: speed, extraArgs: cfg.extraArgs });

console.log(values.sides ? `Side check: ${(only ? [names[only]] : fighters.map((f) => f.displayName)).join(", ")}, each against itself` : `Balance check: ${fighters.map((f) => f.displayName).join(", ")}${only ? ` (only ${names[only]}'s pairings)` : ""}`);
console.log(`${plan.length} fights (${fightsPerPair} per ${values.sides ? "fighter" : "pairing"}) on ${stages.map((s) => s.displayName).join(", ")}; ${speed}x speed, ${parallel} at a time. Game windows open behind your other apps.`);

const abort = new AbortController();
process.once("SIGINT", () => {
  console.log("\nStopping after the fights in progress…");
  abort.abort();
});
const startedAt = Date.now();
const results = await runSeries(
  plan,
  async (fight) => {
    const fightId = randomUUID();
    const side = (id: string) => {
      const f = fighters.find((x) => x.id === id)!;
      return { characterId: f.id, fighterId: f.id, defPath: f.def, palette: 1, stats: { ...DEFAULT_STATS } };
    };
    const stage = stages.find((s) => s.id === fight.stageId)!;
    const spec: FightSpec = { fightId, sides: { 1: side(fight.p1), 2: side(fight.p2) }, stage: { id: stage.id, defPath: stage.def }, roundsToWin: 2 };
    const outcome = await source.run(spec, { signal: abort.signal });
    const dir = path.join(outDir, fightId);
    const detail = outcome.kind === "finished" ? await matchDetailFromLog(path.join(dir, "match.log")) : null;
    if (outcome.kind === "finished" && !values.keep) await rm(dir, { recursive: true, force: true });
    return { outcome, detail };
  },
  {
    parallel,
    signal: abort.signal,
    onResult: (r, done, total) => {
      if (r.outcome.kind !== "finished" && !abort.signal.aborted) console.log(`  FAILED ${names[r.fight.p1]} vs ${names[r.fight.p2]}: ${r.outcome.kind} (${r.outcome.detail})`);
      if (done % 20 === 0 || done === total) console.log(`  ${done}/${total} fights (${Math.round((Date.now() - startedAt) / 1000)} s)`);
    },
  },
);

// Fights cut short by Ctrl+C aren't failures.
const counted = abort.signal.aborted ? results.filter((r) => r.outcome.kind === "finished") : results;
const summary = values.sides ? summarizeSides(counted, only ? [only] : ids) : summarize(counted, ids);
console.log("");
console.log("fighters" in summary && "overall" in summary ? formatSides(summary, names) : formatSummary(summary, names));
const file = path.join(outDir, "summary.json");
await writeFile(file, JSON.stringify({ at: new Date().toISOString(), kind: values.sides ? "sides" : "round-robin", fightsPerPair, speed, parallel, only: only ?? null, stages: stages.map((s) => s.id), names, summary, results: counted }, null, 2) + "\n");
console.log(`\nSaved: ${path.relative(REPO_ROOT, file)}`);
if (summary.failed.length > 0) process.exitCode = 1;
