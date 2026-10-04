// `pnpm templates:compare <fighter> [base]`: a built fighter next to another (by default the template of its
// archetype): each attack's reach and where its hitboxes sit, and how far the body reaches forward in each stance
// and movement, in 320-wide units, with warnings where they differ a lot (templates/compare.ts). Build both first.
import { loadRepoEnv } from "@greed-island/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAirBoxes } from "../art/air.ts";
import { actionExtents, bodyWarning, BODY_ACTIONS, hitWarning, type Extent } from "../templates/compare.ts";
import { BUILT_FIGHTERS, TEMPLATES } from "../templates/index.ts";

loadRepoEnv();
const ikemenDir = process.env["IKEMEN_DIR"];
if (!ikemenDir) {
  console.error("IKEMEN_DIR is not set. Add IKEMEN_DIR=/path/to/your/Ikemen_GO to .env");
  process.exit(1);
}
const [id, baseId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const spec = BUILT_FIGHTERS.find((t) => t.id === id);
if (!spec) {
  console.error(`Usage: pnpm templates:compare <fighter> [base]. Known: ${BUILT_FIGHTERS.map((t) => t.id).join(", ")}`);
  process.exit(1);
}
const base = baseId ? BUILT_FIGHTERS.find((t) => t.id === baseId) : TEMPLATES.find((t) => t.archetype === spec.archetype);
if (!base) {
  console.error(`No fighter "${baseId}". Known: ${BUILT_FIGHTERS.map((t) => t.id).join(", ")}`);
  process.exit(1);
}

interface Built {
  hit: Map<number, Extent>;
  hurt: Map<number, Extent>;
  moves: Map<number, { name: string; reach?: number }>;
}
async function built(t: (typeof BUILT_FIGHTERS)[number]): Promise<Built> {
  const dir = path.join(ikemenDir!, "chars", t.id);
  const air = readAirBoxes(await readFile(path.join(dir, "gi.air"), "latin1"));
  const numbers = JSON.parse(await readFile(path.join(dir, "numbers.json"), "utf8")) as { moves: { state: number; name: string; reach?: number }[] };
  return { ...actionExtents(air, t.art.localcoord), moves: new Map(numbers.moves.map((m) => [m.state, m])) };
}
const [a, b] = await Promise.all([built(spec), built(base)]).catch((e: Error) => {
  console.error(`${e.message}\nBuild both first: pnpm templates:build ${spec.id} ${base.id}`);
  process.exit(1);
});

const box = (e?: Extent) => (e ? `${e.left}..${e.right}, ${e.top}..${e.bottom}` : "-");
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${spec.name} against ${base.name} (320-wide units; boxes are left..right, top..bottom from the fighter's feet)\n`);
console.log(`${pad("Attack", 44)}${pad("reach", 12)}${pad(`hitboxes (${spec.name})`, 26)}${pad(`(${base.name})`, 22)}`);
let warnings = 0;
for (const state of [...new Set([...a.moves.keys(), ...b.moves.keys()])].sort((x, y) => x - y)) {
  const ma = a.moves.get(state), mb = b.moves.get(state);
  const warn = hitWarning(a.hit.get(state), b.hit.get(state));
  if (warn) warnings++;
  const name = `${state} ${ma?.name ?? "-"} / ${mb?.name ?? "-"}`;
  console.log(`${pad(name, 44)}${pad(`${ma?.reach ?? "-"} / ${mb?.reach ?? "-"}`, 12)}${pad(box(a.hit.get(state)), 26)}${pad(box(b.hit.get(state)), 22)}${warn ? `<- ${warn}` : ""}`);
}
console.log(`\n${pad("Stance and movement", 44)}${pad("front of the body", 20)}`);
for (const [action, label] of Object.entries(BODY_ACTIONS)) {
  const ea = a.hurt.get(Number(action)), eb = b.hurt.get(Number(action));
  const warn = bodyWarning(ea, eb);
  if (warn) warnings++;
  console.log(`${pad(`${action} ${label}`, 44)}${pad(`${ea?.right ?? "-"} / ${eb?.right ?? "-"}`, 20)}${warn ? `<- ${warn}` : ""}`);
}
console.log(warnings ? `\n${warnings} warning(s): worth a look (a hunched fighter rightly hits lower); the fixes are hand-made boxes (HitSpec.box) or other frames, and the balance tool has the last word.` : "\nNo warnings.");
