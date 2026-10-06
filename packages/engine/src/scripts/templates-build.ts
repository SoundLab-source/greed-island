// `pnpm templates:build [--preview] [id...]`: build the fighter templates (packages/engine/src/templates)
// into $IKEMEN_DIR/chars/gi-tpl-*, and the house fighters built the same way (HOUSE_FIGHTERS) into chars/gi-*. --preview also writes contact sheets of every animation to
// runs/templates/<id>/ (hurtboxes blue, hitboxes red). The sprite sheets come from art/sources/
// (not in git; art/SOURCES.md says where to get them).
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Sheet } from "../art/sheet.ts";
import { loadArtSheet } from "../templates/art.ts";
import { templateFiles, writeTemplate } from "../templates/build.ts";
import { BUILT_FIGHTERS, type ArtSource, type TemplateSpec } from "../templates/index.ts";
import { lookCells } from "../templates/mix.ts";
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
const unknown = only.filter((id) => !BUILT_FIGHTERS.some((t) => t.id === id));
if (unknown.length) {
  console.error(`Unknown template(s): ${unknown.join(", ")}. Known: ${BUILT_FIGHTERS.map((t) => t.id).join(", ")}`);
  process.exit(1);
}
const roster = await loadRoster();
const todo = BUILT_FIGHTERS.filter((t) => only.length === 0 || only.includes(t.id));
// Each sheet is loaded once (with the checksum check) and let go once no fighter still to build uses it: a sheet is
// about half a gigabyte unpacked. A fighter's looks (TemplateSpec.looks) need their models' sheets too.
const artOf = (spec: TemplateSpec): ArtSource[] => [spec.art, ...(spec.looks ?? []).map((p) => p.art)];
const sheets = new Map<string, Sheet>();
async function sheetOf(art: ArtSource): Promise<Sheet> {
  let sheet = sheets.get(art.id);
  if (!sheet) {
    const load = art.sheet ? art.sheet({ ikemenDir: ikemenDir!, repoRoot: REPO_ROOT }) : loadArtSheet(art, path.join(REPO_ROOT, art.file));
    sheet = await load.catch((e: Error) => {
      console.error(`${art.file}: ${e.message}\n${art.sheet ? "" : "Download it first (art/SOURCES.md)."}`);
      process.exit(1);
    });
    sheets.set(art.id, sheet);
  }
  return sheet;
}
for (const [n, spec] of todo.entries()) {
  for (const art of artOf(spec)) await sheetOf(art);
  const cells = lookCells(spec, sheets.get(spec.art.id)!, (art) => sheets.get(art.id)!);
  const out = templateFiles(spec, cells);
  const r = await writeTemplate(ikemenDir, spec, out);
  const listed = roster.fighters.some((f) => f.id === spec.id && f.def === r.defPath);
  console.log(`  ${r.status.padEnd(9)} ${spec.name.padEnd(10)} ${spec.archetype.padEnd(12)} ${r.defPath}  (${out.art.slots.size} sprites, ${out.art.actions.length} animations)${listed ? "" : "  (not in roster.json yet)"}`);
  if (preview) {
    const dir = path.join(REPO_ROOT, "runs", "templates", spec.id);
    await mkdir(dir, { recursive: true });
    const pages = previewPages(out.art.source, spec.art.axis, out.art.actions, out.art.slots);
    for (const [i, page] of pages.entries()) await writeFile(path.join(dir, `preview-${i + 1}.png`), page);
    console.log(`            preview: ${path.relative(REPO_ROOT, dir)}/preview-1..${pages.length}.png`);
  }
  const later = new Set(todo.slice(n + 1).flatMap((t) => artOf(t).map((a) => a.id)));
  for (const id of sheets.keys()) if (!later.has(id)) sheets.delete(id);
}
console.log("Done. Next: pnpm match:once --p1 <template id> --p2 kfm to watch one, or pnpm roster:smoke.");
