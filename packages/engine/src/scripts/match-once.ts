// `pnpm match:once [--p1 key] [--p2 key] [--stage id] [--sim]`: run one real fight (needs IKEMEN_DIR).
import { loadRepoEnv } from "@greed-island/db";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { loadEngineConfig } from "../config.ts";
import { createIkemenSource } from "../ikemen/runner.ts";
import { loadRoster } from "../roster/schema.ts";
import { specFromRoster } from "../roster/spec.ts";

loadRepoEnv();
// Stat overrides for trying upgraded loadouts, e.g. --p1-attack 115 --p2-life 120.
const statFlags = Object.fromEntries(
  ["p1", "p2"].flatMap((p) => ["life", "attack", "defense", "power"].map((k) => [`${p}-${k}`, { type: "string" as const }])),
);
const { values } = parseArgs({ options: { p1: { type: "string" }, p2: { type: "string" }, stage: { type: "string" }, sim: { type: "boolean" }, ...statFlags } });
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
const flag = (name: string) => (values as Record<string, string | boolean | undefined>)[name];
for (const side of [1, 2] as const) {
  const read = (k: string) => {
    const v = flag(`p${side}-${k}`);
    return typeof v === "string" ? Number(v) : undefined;
  };
  const stats = spec.sides[side].stats;
  stats.lifePct = read("life") ?? stats.lifePct;
  stats.attackPct = read("attack") ?? stats.attackPct;
  stats.defensePct = read("defense") ?? stats.defensePct;
  stats.startPower = read("power") ?? stats.startPower;
}
const source = createIkemenSource({
  mode,
  ikemenDir: cfg.ikemenDir,
  runsDir: cfg.runsDir,
  timeoutMs: mode === "sim" ? cfg.simTimeoutMs : cfg.timeoutMs,
  aiLevel: cfg.aiLevel,
  simSpeed: cfg.simSpeed,
  extraArgs: cfg.extraArgs,
  // One fight you're here to watch: show it in front.
  bringToFront: mode === "live" || cfg.bringToFront,
});
console.log(`Fight ${spec.fightId} (${mode}): ${p1} vs ${p2} on ${stage}`);
for (const side of [1, 2] as const) {
  const st = spec.sides[side].stats;
  if (st.lifePct !== 100 || st.attackPct !== 100 || st.defensePct !== 100 || st.startPower !== 0) console.log(`  P${side} stats: ${JSON.stringify(st)}`);
}
const outcome = await source.run(spec, { onEvent: (e) => console.log(`  ${JSON.stringify(e)}`) });
console.log(`Outcome: ${JSON.stringify(outcome)}`);
console.log(`Artifacts: ${cfg.runsDir}/${spec.fightId}/`);
if (outcome.kind !== "finished") process.exitCode = 1;
