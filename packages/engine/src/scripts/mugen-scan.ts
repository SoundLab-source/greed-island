// `pnpm mugen:scan [id...]`: the cheat scanner's findings for installed characters (default: every one in
// mugen.json), cheats first, with file and line.
import { loadRepoEnv } from "@greed-island/db";
import { existsSync } from "node:fs";
import path from "node:path";
import { scanCheats } from "../mugen/cheats.ts";
import { codeFiles, loadMugen } from "../mugen/import.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const only = process.argv.slice(2);
const ids = only.length ? only : (await loadMugen()).characters.map((c) => c.id);
for (const id of ids) {
  const def = path.join(ikemenDir, "chars", id, `${id}.def`);
  if (!existsSync(def)) {
    console.log(`${id}: not installed (pnpm mugen:import ${id})`);
    continue;
  }
  const files = await codeFiles(def);
  const found = scanCheats(files);
  console.log(`${id}: ${files.length} code file(s), ${found.length ? `${found.length} finding(s)` : "nothing suspicious"}`);
  for (const f of found) console.log(`  ${f.level.padEnd(5)} ${f.what}\n        ${f.file}:${f.line}  ${f.text}`);
}
