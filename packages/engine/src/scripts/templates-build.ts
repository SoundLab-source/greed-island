// `pnpm templates:build [--preview] [id...]`: build the fighter templates (packages/engine/src/templates)
// into $IKEMEN_DIR/chars/gi-tpl-*. --preview also writes contact sheets of every animation to
// runs/templates/<id>/ (hurtboxes blue, hitboxes red). The sprite sheets come from art/sources/
// (not in git; art/SOURCES.md says where to get them).
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sheet } from "../art/sheet.ts";
import { loadTemplateSheet } from "../templates/art.ts";
import { templateFiles, writeTemplate } from "../templates/build.ts";
import { TEMPLATES } from "../templates/index.ts";
import { previewPages } from "../templates/preview.ts";
import { loadRoster } from "../roster/schema.ts";

loadRepoEnv();
const args = process.argv.slice(2);
const preview = args.includes("--preview");
const only = args.filter((a) => !a.startsWith("--"));
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const unknown = only.filter((id) => !TEMPLATES.some((t) => t.id === id));
if (unknown.length) {
  console.error(`Unknown template(s): ${unknown.join(", ")}. Known: ${TEMPLATES.map((t) => t.id).join(", ")}`);
  process.exit(1);
}
const roster = await loadRoster();
const sheets = new Map<string, Sheet>();
for (const spec of TEMPLATES.filter((t) => only.length === 0 || only.includes(t.id))) {
  let sheet = sheets.get(spec.art.id);
  if (!sheet) {
    sheet = await loadTemplateSheet(spec, path.join(REPO_ROOT, spec.art.file)).catch((e: Error) => {
      console.error(`${spec.art.file}: ${e.message}\nDownload it first (art/SOURCES.md).`);
      process.exit(1);
    });
    sheets.set(spec.art.id, sheet);
  }
  const out = templateFiles(spec, sheet);
  const r = await writeTemplate(ikemenDir, spec, out);
  const listed = roster.fighters.some((f) => f.id === spec.id && f.def === r.defPath);
  console.log(`  ${r.status.padEnd(9)} ${spec.name.padEnd(10)} ${spec.archetype.padEnd(12)} ${r.defPath}  (${out.art.slots.size} sprites, ${out.art.actions.length} animations)${listed ? "" : "  (not in roster.json yet)"}`);
  if (preview) {
    const dir = path.join(REPO_ROOT, "runs", "templates", spec.id);
    await mkdir(dir, { recursive: true });
    const pages = previewPages(sheet, spec.art.axis, out.art.actions, out.art.slots);
    for (const [i, page] of pages.entries()) await writeFile(path.join(dir, `preview-${i + 1}.png`), page);
    console.log(`            preview: ${path.relative(REPO_ROOT, dir)}/preview-1..${pages.length}.png`);
  }
}
console.log("Done. Next: pnpm match:once --p1 <template id> --p2 kfm to watch one, or pnpm roster:smoke.");
