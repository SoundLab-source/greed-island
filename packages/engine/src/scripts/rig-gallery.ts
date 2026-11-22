// `pnpm rig:gallery [id...]`: a picture of the example rig fighters (rig/examples.ts) and Margin Call, each in a row of
// poses from his moves, into runs/rig/gallery.png. No IKEMEN or art needed.
import { REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EXAMPLE_DESIGNS } from "../rig/examples.ts";
import { galleryPng } from "../rig/gallery.ts";
import { showcasePoses } from "../rig/showcase.ts";
import { MARGIN_CALL, MARGIN_CALL_DESIGN } from "../templates/margin-call.ts";

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rows = [{ id: "margin-call", name: "Margin Call", style: "Broker who boxes", design: MARGIN_CALL_DESIGN }, ...EXAMPLE_DESIGNS].filter((d) => !only.length || only.includes(d.id));
const out = path.join(REPO_ROOT, "runs", "rig", "gallery.png");
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, galleryPng(rows, showcasePoses(MARGIN_CALL)));
console.log(`${rows.length} fighters: ${path.relative(REPO_ROOT, out)}`);
