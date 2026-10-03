// `pnpm templates:sample-art [archetype]`: a sprite sheet "drawn" on a template's guide by tracing the
// template's own frames in other colours (red and blue swapped), in runs/guides/. For trying the
// own-art pipeline end to end (submit it as a sprite sheet) before an artist has drawn one.
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadTemplateSheet } from "../templates/art.ts";
import { guideLayout, sampleArt } from "../templates/guide.ts";
import { TEMPLATES } from "../templates/index.ts";
import { sheetCells } from "../art/sheet.ts";

loadRepoEnv();
const wanted = (process.argv[2] ?? "GRAPPLER").toUpperCase().replace("-", "_");
const spec = TEMPLATES.find((t) => t.archetype === wanted || t.name.toUpperCase() === wanted);
if (!spec) {
  console.error(`No template for "${process.argv[2]}". Known: ${TEMPLATES.map((t) => `${t.archetype} (${t.name})`).join(", ")}`);
  process.exit(1);
}
const sheet = await loadTemplateSheet(spec, path.join(REPO_ROOT, spec.art.file));
const layout = guideLayout(spec);
const png = sampleArt(spec, sheetCells(sheet, spec.art.stray), layout, ([r, g, b]) => [b, g, r]);
const dir = path.join(REPO_ROOT, "runs", "guides");
await mkdir(dir, { recursive: true });
const file = path.join(dir, `sample-${spec.id}.png`);
await writeFile(file, png);
console.log(`${path.relative(REPO_ROOT, file)}: ${layout.width}x${layout.height}, ${layout.cells.length} frames of the ${spec.name} in other colours (${Math.round(png.length / 1024)} KB)`);
