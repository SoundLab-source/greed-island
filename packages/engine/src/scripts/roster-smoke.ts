// `pnpm roster:smoke [--dry-run]`: run every enabled fighter and stage once in sim mode;
// disable (in roster.json) any that crash or hang.
import { loadRepoEnv } from "@greed-island/db";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadEngineConfig } from "../config.ts";
import { createIkemenSource } from "../ikemen/runner.ts";
import { loadRoster, ROSTER_PATH } from "../roster/schema.ts";
import { specFromRoster } from "../roster/spec.ts";

loadRepoEnv();
const { values } = parseArgs({ options: { "dry-run": { type: "boolean" } } });
const cfg = loadEngineConfig();
if (!cfg.ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const roster = await loadRoster();
const source = createIkemenSource({
  mode: "sim",
  ikemenDir: cfg.ikemenDir,
  runsDir: cfg.runsDir,
  timeoutMs: cfg.simTimeoutMs,
  aiLevel: cfg.aiLevel,
  simSpeed: cfg.simSpeed,
  extraArgs: cfg.extraArgs,
});
const chars = roster.characters.filter((c) => c.enabled && roster.fighters.find((f) => f.id === c.fighter)?.enabled);
const stages = roster.stages.filter((s) => s.enabled);
if (chars.length < 2 || stages.length < 1) {
  console.error("Need at least two enabled characters and one enabled stage");
  process.exit(1);
}
const stamp = new Date().toISOString().slice(0, 10);
const failures: string[] = [];

async function trial(label: string, k1: string, k2: string, stageId: string): Promise<string | null> {
  const spec = specFromRoster(roster, randomUUID(), k1, k2, stageId);
  const outcome = await source.run(spec);
  const ok = outcome.kind === "finished";
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${outcome.kind}${ok ? "" : ` (${"detail" in outcome ? outcome.detail : ""})`}  [runs/${spec.fightId}]`);
  return ok ? null : `${outcome.kind}${"detail" in outcome ? `: ${outcome.detail}` : ""}`;
}

console.log("Fighters:");
for (const fighter of roster.fighters.filter((f) => f.enabled)) {
  const own = chars.find((c) => c.fighter === fighter.id);
  const other = chars.find((c) => c.fighter !== fighter.id);
  if (!own || !other) continue;
  const problem = await trial(fighter.id, own.key, other.key, stages[0]!.id);
  if (problem) {
    fighter.enabled = false;
    fighter.notes = `roster:smoke ${stamp}: ${problem}`;
    failures.push(`fighter ${fighter.id}`);
  }
}
console.log("Stages:");
const [a, b] = chars;
for (const stage of stages) {
  const problem = await trial(stage.id, a!.key, b!.key, stage.id);
  if (problem) {
    stage.enabled = false;
    stage.notes = `roster:smoke ${stamp}: ${problem}`;
    failures.push(`stage ${stage.id}`);
  }
}

if (failures.length === 0) {
  console.log("All passed.");
} else if (values["dry-run"]) {
  console.log(`Would disable: ${failures.join(", ")} (dry run, roster.json unchanged)`);
} else {
  await writeFile(ROSTER_PATH, JSON.stringify(roster, null, 2) + "\n");
  console.log(`Disabled in roster.json: ${failures.join(", ")}. Run pnpm roster:sync to apply.`);
}
