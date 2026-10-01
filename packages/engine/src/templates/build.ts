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
import type { Sheet } from "../art/sheet.ts";
import { buildTemplateArt, cardImage, type TemplateArt } from "./art.ts";
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
export function templateFiles(spec: TemplateSpec, sheet: Sheet): TemplateFiles {
  const art = buildTemplateArt(spec, sheet);
  const files = new Map<string, Buffer>([
    [`${spec.id}.def`, Buffer.from(defFile(spec, spec.palettes.length + 1), "latin1")],
    ["gi.cns", Buffer.from(constantsFile(spec), "latin1")],
    ["gi-states.cns", Buffer.from(statesFile(spec), "latin1")],
    ["gi.cmd", Buffer.from(commandsFile(spec, measureReach(spec, art.actions)), "latin1")],
    ["gi.air", Buffer.from(art.air, "latin1")],
    ["gi.sff", art.sff],
    // The website's picture of the fighter (GET /api/fighters/:id/image).
    ["card.png", cardImage(spec, sheet)],
  ]);
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
  const dest = path.join(ikemenDir, "chars", spec.id);
  const marker = path.join(dest, MARKER);
  const defPath = templateDefPath(spec);
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { hash?: string };
    if (previous.hash === out.hash) return { id: spec.id, defPath, status: "unchanged" };
  }
  const tmp = `${dest}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  for (const [name, bytes] of out.files) await writeFile(path.join(tmp, name), bytes);
  await writeFile(path.join(tmp, MARKER), JSON.stringify({ id: spec.id, hash: out.hash, template: spec.archetype, generatedBy: "pnpm templates:build" }, null, 2) + "\n");
  await rm(dest, { recursive: true, force: true });
  await rename(tmp, dest);
  return { id: spec.id, defPath, status: "built" };
}
