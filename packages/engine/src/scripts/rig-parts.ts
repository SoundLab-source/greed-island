// Drawing a fighter as parts (rig/parts-sheet.ts), no IKEMEN needed:
//   pnpm rig:guide [--scale 4]                 the guide to draw on: runs/rig/parts-guide.png
//   pnpm rig:import <drawing.png> [--name X]   check a drawn parts sheet and see it fight: runs/rig/<name>.png
//   pnpm rig:import <drawing.png> --add "Name" [--artist who]
//                                              ...and add it as a fighter: copied to art/parts/, listed in
//                                              drawn-fighters.json and roster.json (then pnpm templates:build gi-<name>)
//   pnpm rig:sample-parts [example id]         an example design drawn on the guide (rig/examples.ts), to try the import
import { REPO_ROOT } from "@greed-island/db";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXAMPLE_DESIGNS } from "../rig/examples.ts";
import { galleryPng } from "../rig/gallery.ts";
import { partsGuidePng, partsSheetFromDesign, readPartsSheet } from "../rig/parts-sheet.ts";
import { showcasePoses } from "../rig/showcase.ts";
import { MARGIN_CALL } from "../templates/margin-call.ts";
import { addDrawnFighter } from "../rig/add-drawn.ts";

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
const dir = path.join(REPO_ROOT, "runs", "rig");
await mkdir(dir, { recursive: true });
const show = (file: string) => console.log(`  ${path.relative(REPO_ROOT, file)}`);

if (command === "guide") {
  const file = path.join(dir, "parts-guide.png");
  await writeFile(file, partsGuidePng(Number(flag("scale") ?? 4)));
  console.log("The parts guide: draw each part in its box on a layer over it, facing right, then export only your layer as a PNG with a transparent background.");
  show(file);
} else if (command === "import") {
  const input = positional[0];
  if (!input) {
    console.error("Usage: pnpm rig:import <drawing.png> [--name \"Fighter Name\"]");
    process.exit(1);
  }
  const add = flag("add");
  const name = add ?? flag("name") ?? path.basename(input, path.extname(input));
  const bytes = await readFile(path.resolve(process.env["INIT_CWD"] ?? process.cwd(), input));
  const result = readPartsSheet(bytes);
  for (const n of result.notes) console.log(`  note: ${n}`);
  for (const p of result.problems) console.log(`  problem: ${p}`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drawn";
  const file = path.join(dir, `${slug}.png`);
  await writeFile(file, galleryPng([{ name, style: "Drawn parts", design: result.design }], showcasePoses(MARGIN_CALL)));
  console.log(result.problems.length ? "Fix the problems above and import again. A preview anyway:" : "Imported. Here it is in his moves:");
  show(file);
  if (add) {
    if (result.problems.length) process.exit(1);
    const id = await addDrawnFighter(REPO_ROOT, { name: add, artist: flag("artist") ?? "the Greed Island team", bytes, sha256: createHash("sha256").update(bytes).digest("hex") });
    console.log(`Added ${add} (${id}): art/parts/${id.slice(3)}.png, drawn-fighters.json and roster.json. Next: pnpm templates:build ${id} --preview, then pnpm roster:sync.`);
  }
} else if (command === "sample") {
  const id = positional[0] ?? "blue-chip";
  const ex = EXAMPLE_DESIGNS.find((d) => d.id === id);
  if (!ex) {
    console.error(`Unknown example ${id}. Known: ${EXAMPLE_DESIGNS.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }
  const file = path.join(dir, `sample-parts-${id}.png`);
  await writeFile(file, partsSheetFromDesign(ex.design));
  console.log(`${ex.name} drawn on the parts guide. Try: pnpm rig:import ${path.relative(REPO_ROOT, file)} --name "${ex.name}"`);
  show(file);
} else {
  console.error("Usage: pnpm rig:guide | rig:import <drawing.png> [--name X] | rig:sample-parts [example id]");
  process.exit(1);
}
