// `pnpm match:once [--p1 key] [--p2 key] [--stage id] [--sim]`: run one real fight (needs IKEMEN_DIR).
import { loadRepoEnv } from "@greed-island/db";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { loadEngineConfig } from "../config.ts";
import { createIkemenSource } from "../ikemen/runner.ts";
import { loadRoster } from "../roster/schema.ts";
import { specFromRoster } from "../roster/spec.ts";

loadRepoEnv();
const { values } = parseArgs({ options: { p1: { type: "string" }, p2: { type: "string" }, stage: { type: "string" }, sim: { type: "boolean" } } });
const cfg = loadEngineConfig();
if (!cfg.ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const roster = await loadRoster();
const enabled = roster.characters.filter((c) => c.enabled && roster.fighters.find((f) => f.id === c.fighter)?.enabled);
const p1 = values.p1 ?? enabled[0]?.key;
const p2 = values.p2 ?? enabled.find((c) => c.key !== p1)?.key;
const stage = values.stage ?? roster.stages.find((s) => s.enabled)?.id;
if (!p1 || !p2 || !stage) {
  console.error("Need two enabled characters and an enabled stage in roster.json");
  process.exit(1);
}
const mode = values.sim ? "sim" : "live";
const spec = specFromRoster(roster, randomUUID(), p1, p2, stage);
const source = createIkemenSource({
  mode,
  ikemenDir: cfg.ikemenDir,
  runsDir: cfg.runsDir,
  timeoutMs: mode === "sim" ? cfg.simTimeoutMs : cfg.timeoutMs,
  aiLevel: cfg.aiLevel,
  simSpeed: cfg.simSpeed,
  extraArgs: cfg.extraArgs,
});
console.log(`Fight ${spec.fightId} (${mode}): ${p1} vs ${p2} on ${stage}`);
const outcome = await source.run(spec, { onEvent: (e) => console.log(`  ${JSON.stringify(e)}`) });
console.log(`Outcome: ${JSON.stringify(outcome)}`);
console.log(`Artifacts: ${cfg.runsDir}/${spec.fightId}/`);
if (outcome.kind !== "finished") process.exitCode = 1;
