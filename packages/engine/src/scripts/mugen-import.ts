// `pnpm mugen:import [id...]`: install the MUGEN characters listed in packages/engine/mugen.json from their
// downloaded archives in mugen/ (repo root, not in git) into $IKEMEN_DIR/chars/<id>/, add their roster.json
// entries (never cleared for commercial use), and run the cheat scanner on each.
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanCheats } from "../mugen/cheats.ts";
import { codeFiles, installMugen, loadMugen, rosterEntries } from "../mugen/import.ts";
import { ROSTER_PATH } from "../roster/schema.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const recipe = await loadMugen();
const unknown = only.filter((id) => !recipe.characters.some((c) => c.id === id));
if (unknown.length) {
  console.error(`Not in mugen.json: ${unknown.join(", ")}`);
  process.exit(1);
}
const roster = JSON.parse(await readFile(ROSTER_PATH, "utf8")) as { fighters: { id: string }[]; characters: { key: string }[] };
let added = 0;
for (const entry of recipe.characters.filter((c) => only.length === 0 || only.includes(c.id))) {
  const archive = path.join(REPO_ROOT, "mugen", entry.file);
  if (!existsSync(archive)) {
    console.log(`  missing   ${entry.name.padEnd(24)} put ${entry.file} in mugen/ (from ${entry.source})`);
    continue;
  }
  const r = await installMugen(ikemenDir, entry, archive);
  const found = scanCheats(await codeFiles(path.join(ikemenDir, r.defPath)));
  const cheats = found.filter((f) => f.level === "cheat").length;
  console.log(`  ${r.status.padEnd(9)} ${entry.name.padEnd(24)} ${r.defPath}  (cheat scan: ${cheats} cheats, ${found.length - cheats} to check)`);
  for (const [key, name] of Object.entries(r.changed)) console.log(`            file name fixed: ${key} = ${name}`);
  for (const m of r.missing) console.log(`            MISSING file: ${m}`);
  const { fighter, character } = rosterEntries(entry, r.defPath);
  if (!roster.fighters.some((f) => f.id === fighter.id)) {
    roster.fighters.push(fighter);
    added++;
  }
  if (!roster.characters.some((c) => c.key === character.key)) roster.characters.push(character);
}
if (added) {
  await writeFile(ROSTER_PATH, JSON.stringify(roster, null, 2) + "\n");
  console.log(`Added ${added} fighter(s) to roster.json (commercialUse: false).`);
}
console.log("Next: pnpm mugen:scan <id> for the cheat details, pnpm match:once --p1 <id> --p2 gi-tpl-all-rounder --sim to try one.");
