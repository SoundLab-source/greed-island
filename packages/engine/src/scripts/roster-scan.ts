// `pnpm roster:scan`: draft roster entries from $IKEMEN_DIR/chars and stages.
import { loadRepoEnv } from "@greed-island/db";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { missingDefFiles } from "../roster/files.ts";
import { scanIkemen } from "../roster/scan.ts";
import { loadRoster } from "../roster/schema.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}

const roster = await loadRoster();
const scan = await scanIkemen(ikemenDir);
const knownDefs = new Set([...roster.fighters, ...roster.stages].map((e) => e.def.toLowerCase()));
const newFighters = scan.fighters.filter((f) => !knownDefs.has(f.def.toLowerCase()));
const newStages = scan.stages.filter((s) => !knownDefs.has(s.def.toLowerCase()));

console.log(`Scanned ${ikemenDir}`);
console.log(`  characters: ${scan.fighters.length} found, ${newFighters.length} not in roster.json`);
for (const f of newFighters) console.log(`    + ${f.id.padEnd(20)} ${f.def}  (${f.enabled ? "license found" : "NO LICENSE: disabled"})`);
console.log(`  stages: ${scan.stages.length} found, ${newStages.length} not in roster.json`);
for (const s of newStages) console.log(`    + ${s.id.padEnd(20)} ${s.def}  (license unknown: disabled)`);
for (const w of scan.warnings) console.log(`  warning: ${w}`);
const missing = missingDefFiles(roster, ikemenDir);
for (const m of missing) console.log(`  warning: roster.json points to a missing file: ${m}`);

const draftPath = fileURLToPath(new URL("../../roster.draft.json", import.meta.url));
const draft = {
  fighters: newFighters,
  stages: newStages,
  characters: newFighters.map((f) => ({ key: `house-${f.id}`, fighter: f.id, name: f.displayName, palette: 1, enabled: f.enabled })),
};
await writeFile(draftPath, JSON.stringify(draft, null, 2) + "\n");
console.log(`\nDraft written to ${draftPath}. Review it, then copy entries into roster.json and run pnpm roster:sync.`);
