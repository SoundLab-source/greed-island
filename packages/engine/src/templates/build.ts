/**
 * Build a template's character folder inside IKEMEN_DIR/chars from its spec
 * and sprite sheet. Only the spec is committed; the folder holds the art, so
 * it stays outside git like every IKEMEN character. Never touches a folder it
 * didn't create, and rewrites its own folder only when the output changed.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MARKER } from "../ikemen/derive.ts";
import type { CellSource, Sheet } from "../art/sheet.ts";
import { buildTemplateArt, cardImage, cellsOf, type TemplateArt } from "./art.ts";
import { guideImage, guideLayout } from "./guide.ts";
import { fighterNumbers } from "./limits.ts";
import { commandsFile, constantsFile, defFile, statesFile } from "./cns.ts";
import { measureReach } from "./reach.ts";
import type { TemplateSpec } from "./spec.ts";

export interface TemplateFiles {
  art: TemplateArt;
  /** File name → contents. */
  files: Map<string, Buffer>;
  hash: string;
}

/** Every file of the character, in memory. */
export function templateFiles(spec: TemplateSpec, sheet: Sheet | CellSource): TemplateFiles {
  const source = cellsOf(spec, sheet);
  const art = buildTemplateArt(spec, source);
  const reach = measureReach(spec, art.actions);
  return withHash(art, [
    [`${spec.id}.def`, Buffer.from(defFile(spec, spec.palettes.length + 1), "latin1")],
    ["gi.cns", Buffer.from(constantsFile(spec), "latin1")],
    ["gi-states.cns", Buffer.from(statesFile(spec), "latin1")],
    ["gi.cmd", Buffer.from(commandsFile(spec, reach), "latin1")],
    ["gi.air", Buffer.from(art.air, "latin1")],
    ["gi.sff", art.sff],
    // The website's picture of the fighter (GET /api/fighters/:id/image).
    ["card.png", cardImage(spec, source)],
    // For community artists: every frame on one sheet to draw over (GET /api/guides/:archetype), and
    // the template's numbers, which a fighter drawn on it is checked against (templates/limits.ts).
    [GUIDE_FILE, guideImage(spec, source, guideLayout(spec))],
    [NUMBERS_FILE, Buffer.from(JSON.stringify(fighterNumbers(spec, reach), null, 2) + "\n")],
  ]);
}

/** In a template's folder: the artists' guide sheet, and its numbers with measured reach. */
export const GUIDE_FILE = "guide.png";
export const NUMBERS_FILE = "numbers.json";

export function withHash(art: TemplateArt, entries: readonly [string, Buffer][]): TemplateFiles {
  const files = new Map(entries);
  const h = createHash("sha256");
  for (const [name, bytes] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) h.update(name).update(bytes);
  return { art, files, hash: h.digest("hex").slice(0, 16) };
}

export interface BuiltTemplate {
  id: string;
  defPath: string;
  status: "built" | "unchanged";
}

export function templateDefPath(spec: Pick<TemplateSpec, "id">): string {
  return `chars/${spec.id}/${spec.id}.def`;
}

export async function writeTemplate(ikemenDir: string, spec: TemplateSpec, out: TemplateFiles): Promise<BuiltTemplate> {
  return writeCharacter(ikemenDir, spec.id, out, { template: spec.archetype, generatedBy: "pnpm templates:build" });
}

/**
 * Write a generated character to IKEMEN_DIR/chars/<id>/: into a temporary
 * folder, then swapped in. Skipped when the files haven't changed; refuses a
 * folder without our marker. `id` must be one of ours (never typed by a player).
 */
export async function writeCharacter(ikemenDir: string, id: string, out: TemplateFiles, meta: Record<string, string>): Promise<BuiltTemplate> {
  if (!/^gi-[a-z0-9-]+$/.test(id)) throw new Error(`not a Greed Island character id: ${id}`);
  const dest = path.join(ikemenDir, "chars", id);
  const marker = path.join(dest, MARKER);
  const defPath = `chars/${id}/${id}.def`;
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { hash?: string };
    if (previous.hash === out.hash) return { id, defPath, status: "unchanged" };
  }
  const tmp = `${dest}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (const [name, bytes] of out.files) await writeFile(path.join(tmp, name), bytes);
  await writeFile(path.join(tmp, MARKER), JSON.stringify({ id, hash: out.hash, ...meta }, null, 2) + "\n");
  await rm(dest, { recursive: true, force: true });
  await rename(tmp, dest);
  return { id, defPath, status: "built" };
}
