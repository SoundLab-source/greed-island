// `pnpm roster:variants`: build the house characters in variants.json inside $IKEMEN_DIR/chars.
import { loadRepoEnv } from "@greed-island/db";
import { loadRoster } from "../roster/schema.ts";
import { buildVariant, loadVariants, variantDefPath } from "../roster/variants.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const recipe = await loadVariants();
const roster = await loadRoster();
for (const v of recipe.variants) {
  const r = await buildVariant(ikemenDir, recipe, v);
  const listed = roster.fighters.some((f) => f.id === v.id && f.def === variantDefPath(v));
  console.log(`  ${r.status.padEnd(9)} ${v.name.padEnd(14)} ${r.defPath}${listed ? "" : "  (not in roster.json yet)"}`);
}
console.log("Done. Next: pnpm roster:smoke, then pnpm roster:sync.");
