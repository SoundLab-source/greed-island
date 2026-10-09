// `pnpm roster:sync`: load roster.json into the database (never resets ratings).
import { createDb, loadRepoEnv } from "@greed-island/db";
import { loadConfig } from "@greed-island/shared";
import { missingDefFiles } from "../roster/files.ts";
import { commercialOnly, loadRoster, onlyFighters } from "../roster/schema.ts";
import { syncRoster } from "../roster/sync.ts";

loadRepoEnv();
const config = loadConfig();
const commercial = process.env["GI_COMMERCIAL_ONLY"] === "true";
let roster = commercial ? commercialOnly(await loadRoster()) : await loadRoster();
if (commercial) console.log("GI_COMMERCIAL_ONLY=true: fighters without commercial-use licenses are switched off.");
const only = (process.env["GI_ROSTER_ONLY"] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (only.length) {
  roster = onlyFighters(roster, only);
  const left = roster.fighters.filter((f) => f.enabled);
  console.log(`GI_ROSTER_ONLY=${only.join(",")}: only ${left.length} fighter${left.length === 1 ? "" : "s"} on (${left.map((f) => f.displayName).join(", ")}).`);
  if (left.length < 2) {
    console.error(`Fights need at least two fighters.${commercial ? " GI_COMMERCIAL_ONLY=true switches off fighters not cleared for commercial use: set it to false for a private demo." : ""}`);
    process.exit(1);
  }
}
const ikemenDir = process.env["IKEMEN_DIR"];
if (ikemenDir) {
  for (const m of missingDefFiles(roster, ikemenDir)) console.warn(`warning: file not found in IKEMEN_DIR: ${m}`);
} else {
  console.warn("warning: IKEMEN_DIR is not set, so .def paths were not checked");
}

const db = createDb();
try {
  const r = await syncRoster(db, roster, config);
  const line = (label: string, c: { created: number; updated: number; disabled: number }) =>
    console.log(`  ${label.padEnd(11)} ${c.created} created, ${c.updated} updated, ${c.disabled} disabled`);
  console.log("Roster synced:");
  line("fighters", r.fighters);
  line("stages", r.stages);
  line("characters", r.characters);
} finally {
  await db.$disconnect();
}
