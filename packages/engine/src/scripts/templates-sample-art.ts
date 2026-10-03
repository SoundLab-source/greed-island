// `pnpm templates:sample-art [archetype]`: a sprite sheet "drawn" on a template's guide by tracing the
// template's own frames in other colours (red and blue swapped), in runs/guides/, with an alternate colour
// sheet (the same drawing in a third set of colours), a portrait (the fighter's stance), and an intro and a
// win pose on the pose guide (the template's own, traced the same way). For trying the own-art pipeline end
// to end (submit them as a sprite sheet, an alternate colour sheet, the portrait, the intro and the win pose)
// before an artist has drawn one.
import { loadRepoEnv, REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPng } from "../art/png.ts";
import { cardImage, loadTemplateSheet } from "../templates/art.ts";
import { artFromGuide, guideLayout, sampleArt } from "../templates/guide.ts";
import { TEMPLATES } from "../templates/index.ts";
import { cellList } from "../templates/spec.ts";
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
const cells_ = sheetCells(sheet, spec.art.stray);
const swap = ([r, g, b]: [number, number, number]): [number, number, number] => [b, g, r];
const png = sampleArt(spec, cells_, layout, swap);
const colours = sampleArt(spec, cells_, layout, ([r, g, b]) => [g, b, r]);
const drawn = artFromGuide(spec, readPng(png), layout);
const portrait = cardImage(spec, drawn, drawn.palette);
const dir = path.join(REPO_ROOT, "runs", "guides");
await mkdir(dir, { recursive: true });
const file = path.join(dir, `sample-${spec.id}.png`);
await writeFile(file, png);
await writeFile(path.join(dir, `sample-${spec.id}-colours.png`), colours);
await writeFile(path.join(dir, `sample-${spec.id}-portrait.png`), portrait);
// A pose: the template's frames of one animation, a box each, in the sample's colours.
const pose = (action: number) => {
  const cells = cellList(spec.anims.find((a) => a.action === action)!.cells);
  return sampleArt(spec, cells_, { ...layout, cells, columns: cells.length, rows: 1, width: cells.length * layout.box.width, height: layout.box.height }, swap);
};
await writeFile(path.join(dir, `sample-${spec.id}-intro.png`), pose(190));
await writeFile(path.join(dir, `sample-${spec.id}-win.png`), pose(180));
console.log(`${path.relative(REPO_ROOT, file)}: ${layout.width}x${layout.height}, ${layout.cells.length} frames of the ${spec.name} in other colours (${Math.round(png.length / 1024)} KB)`);
console.log(`  with sample-${spec.id}-colours.png (an alternate colour sheet), -portrait.png (a portrait), -intro.png and -win.png (an intro and a win pose)`);
