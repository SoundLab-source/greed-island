// `pnpm mugen:import [id...]`: install the MUGEN characters and stages listed in packages/engine/mugen.json from
// their downloaded archives in mugen/ (repo root, not in git) into $IKEMEN_DIR/chars/<id>/ and stages/<id>/, add
// their roster.json entries (never cleared for commercial use), and run the cheat scanner on each character.
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanCheats } from "../mugen/cheats.ts";
import { codeFiles, installMugen, loadMugen, rosterEntries } from "../mugen/import.ts";
import { installMugenStage, stageRosterEntry } from "../mugen/stages.ts";
import { ROSTER_PATH } from "../roster/schema.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const recipe = await loadMugen();
const unknown = only.filter((id) => !recipe.characters.some((c) => c.id === id) && !recipe.stages.some((s) => s.id === id));
if (unknown.length) {
  console.error(`Not in mugen.json: ${unknown.join(", ")}`);
  process.exit(1);
}
const roster = JSON.parse(await readFile(ROSTER_PATH, "utf8")) as { fighters: { id: string }[]; characters: { key: string }[]; stages: { id: string }[] };
let added = 0;
let failed = 0;
for (const entry of recipe.characters.filter((c) => only.length === 0 || only.includes(c.id))) {
  const archive = path.join(REPO_ROOT, "mugen", entry.file);
  if (!existsSync(archive)) {
    console.log(`  missing   ${entry.name.padEnd(24)} put ${entry.file} in mugen/ (from ${entry.source})`);
    continue;
  }
  let r: Awaited<ReturnType<typeof installMugen>>;
  try {
    r = await installMugen(ikemenDir, entry, archive);
  } catch (e) {
    console.log(`  FAILED    ${entry.name.padEnd(24)} ${(e as Error).message.split("\n")[0]}`);
    failed++;
    continue;
  }
  const found = scanCheats(await codeFiles(path.join(ikemenDir, r.defPath)));
  const cheats = found.filter((f) => f.level === "cheat").length;
  console.log(`  ${r.status.padEnd(9)} ${entry.name.padEnd(24)} ${r.defPath}  (cheat scan: ${cheats} cheats, ${found.length - cheats} to check)`);
  for (const [key, name] of Object.entries(r.changed)) console.log(`            file name fixed: ${key} = ${name}`);
  for (const m of r.missing) console.log(`            MISSING file: ${m}`);
  for (const f of r.removed ?? []) console.log(`            left out (a program, not character data): ${f}`);
  for (const f of r.unpackProblems ?? []) console.log(`            couldn't unpack: ${f}`);
  if (r.ai?.by === "own") console.log("            AI: its own");
  if (r.ai?.by === "none") console.log("            AI: the engine's (no attacks of its own to drive: a gag character?)");
  if (r.ai?.by === "ours") {
    const kinds = Object.entries(Object.groupBy(r.ai.attacks, (a) => a.kind)).map(([kind, list]) => `${list!.length} ${kind}`);
    console.log(`            AI: ours, using ${r.ai.attacks.length} attacks (${kinds.join(", ") || "none found"})`);
  }
  const { fighter, character } = rosterEntries(entry, r.defPath);
  if (!roster.fighters.some((f) => f.id === fighter.id)) {
    roster.fighters.push(fighter);
    added++;
  }
  if (!roster.characters.some((c) => c.key === character.key)) roster.characters.push(character);
}
let stagesAdded = 0;
for (const entry of recipe.stages.filter((s) => only.length === 0 || only.includes(s.id))) {
  const archive = path.join(REPO_ROOT, "mugen", entry.file);
  if (!existsSync(archive)) {
    console.log(`  missing   ${entry.name.padEnd(24)} put ${entry.file} in mugen/ (from ${entry.source})`);
    continue;
  }
  let r: Awaited<ReturnType<typeof installMugenStage>>;
  try {
    r = await installMugenStage(ikemenDir, entry, archive);
  } catch (e) {
    console.log(`  FAILED    ${entry.name.padEnd(24)} ${(e as Error).message.split("\n")[0]}`);
    failed++;
    continue;
  }
  console.log(`  ${r.status.padEnd(9)} ${entry.name.padEnd(24)} ${r.defPath}  (stage)`);
  for (const [key, name] of Object.entries(r.changed)) console.log(`            path fixed: ${key} = ${name}`);
  for (const m of r.missing) console.log(`            MISSING file: ${m}`);
  for (const f of r.removed ?? []) console.log(`            left out (a program, not stage data): ${f}`);
  if (!roster.stages.some((s) => s.id === entry.id)) {
    roster.stages.push(stageRosterEntry(entry, r.defPath));
    stagesAdded++;
  }
}
if (added || stagesAdded) {
  await writeFile(ROSTER_PATH, JSON.stringify(roster, null, 2) + "\n");
  console.log(`Added ${added} fighter(s) and ${stagesAdded} stage(s) to roster.json (commercialUse: false).`);
}
if (failed) process.exitCode = 1;
console.log("Next: pnpm mugen:scan <id> for the cheat details, pnpm match:once --p1 <id> --p2 gi-tpl-all-rounder --sim to try one.");
