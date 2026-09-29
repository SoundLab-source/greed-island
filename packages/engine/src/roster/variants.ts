/**
 * House characters derived from a base character (Kung Fu Man) by changing
 * only its own constants and palette. The recipe (variants.json) is committed;
 * the character folders are generated inside IKEMEN_DIR/chars, never
 * committed (they contain the base character's art).
 */
import { ARCHETYPES } from "@greed-island/shared";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { iniValue, parseIni } from "./ini.ts";

const value = z.union([z.string(), z.number()]).transform(String);

export const Variant = z.object({
  id: z.string().regex(/^gi-[a-z0-9-]+$/, "variant ids start with gi- and use lowercase letters, digits and -"),
  name: z.string().min(1).max(24),
  archetype: z.enum(ARCHETYPES),
  /** One of the base character's built-in costume palettes. */
  palette: z.number().int().min(1).max(12),
  /** Drawn size: [Size] xscale and yscale. */
  scale: z.number().min(0.5).max(1.6),
  /** [Data] life, attack, defence. */
  data: z.object({ life: z.number().int().min(100).max(3000), attack: z.number().int().min(10).max(300), defence: z.number().int().min(10).max(300) }),
  /** [Velocity] keys and their raw values, e.g. "run.fwd": "5.4, 0". */
  velocity: z.record(z.string().regex(/^[a-z.]+$/), value).default({}),
});

export const VariantRecipe = z
  .object({
    base: z.string().min(1),
    baseDef: z.string().regex(/\.def$/i),
    variants: z.array(Variant),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    const palettes = new Set<number>();
    r.variants.forEach((v, i) => {
      if (ids.has(v.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${v.id}`, path: ["variants", i, "id"] });
      if (palettes.has(v.palette)) ctx.addIssue({ code: "custom", message: `palette ${v.palette} is used twice`, path: ["variants", i, "palette"] });
      ids.add(v.id);
      palettes.add(v.palette);
    });
  });

export type Variant = z.infer<typeof Variant>;
export type VariantRecipe = z.infer<typeof VariantRecipe>;

export const VARIANTS_PATH = new URL("../../variants.json", import.meta.url);

export async function loadVariants(file: string | URL = VARIANTS_PATH): Promise<VariantRecipe> {
  return VariantRecipe.parse(JSON.parse(await readFile(file, "utf8")));
}

/** Where a variant's .def ends up, relative to IKEMEN_DIR (what roster.json points at). */
export function variantDefPath(v: Pick<Variant, "id">): string {
  return `chars/${v.id}/${v.id}.def`;
}

function stripComment(line: string): { body: string; comment: string } {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ";" && !inQuotes) return { body: line.slice(0, i), comment: line.slice(i) };
  }
  return { body: line, comment: "" };
}

/**
 * Set keys in the first `[section]` of a .def/.cns text, keeping everything
 * else (comments, spacing, other sections, line endings) as it was. Keys that
 * aren't there yet are added right after the section header.
 */
export function patchIni(text: string, section: string, values: Record<string, string>): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const wanted = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), { key: k, value: v }]));
  const start = lines.findIndex((l) => stripComment(l).body.trim().toLowerCase() === `[${section.toLowerCase()}]`);
  if (start < 0) throw new Error(`section [${section}] not found`);
  let i = start + 1;
  for (; i < lines.length; i++) {
    const { body, comment } = stripComment(lines[i]!);
    if (/^\s*\[.*\]\s*$/.test(body)) break;
    const m = /^(\s*)([^=\s][^=]*?)(\s*=\s*)(.*?)(\s*)$/.exec(body);
    if (!m) continue;
    const hit = wanted.get(m[2]!.toLowerCase());
    if (!hit) continue;
    lines[i] = `${m[1]}${m[2]}${m[3]}${hit.value}${comment ? (m[5] || " ") + comment : ""}`;
    wanted.delete(m[2]!.toLowerCase());
  }
  if (wanted.size > 0) lines.splice(start + 1, 0, ...[...wanted.values()].map((w) => `${w.key} = ${w.value}`));
  return lines.join(eol);
}

export const MARKER = ".greed-island-variant.json";

export function variantHash(recipe: VariantRecipe, v: Variant): string {
  return createHash("sha256").update(JSON.stringify({ base: recipe.base, baseDef: recipe.baseDef, v })).digest("hex").slice(0, 16);
}

export interface BuildResult {
  id: string;
  defPath: string;
  status: "built" | "unchanged";
}

/**
 * Build one variant folder in IKEMEN_DIR/chars. Refuses to touch a folder it
 * didn't create; rebuilds its own folder only when the recipe changed.
 */
export async function buildVariant(ikemenDir: string, recipe: VariantRecipe, v: Variant): Promise<BuildResult> {
  const src = path.join(ikemenDir, recipe.base);
  const dest = path.join(ikemenDir, "chars", v.id);
  const marker = path.join(dest, MARKER);
  const hash = variantHash(recipe, v);
  if (!existsSync(path.join(src, recipe.baseDef))) throw new Error(`base character not found: ${path.join(recipe.base, recipe.baseDef)}`);
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by roster:variants; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { hash?: string };
    if (previous.hash === hash) return { id: v.id, defPath: variantDefPath(v), status: "unchanged" };
    await rm(dest, { recursive: true });
  }
  await cp(src, dest, { recursive: true });
  const defFile = path.join(dest, `${v.id}.def`);
  await rename(path.join(dest, recipe.baseDef), defFile);

  // Files are latin1 so bytes outside ASCII survive unchanged.
  let def = await readFile(defFile, "latin1");
  const author = iniValue(parseIni(def), "Info", "author") ?? "unknown";
  def = patchIni(def, "Info", {
    name: `"${v.name}"`,
    displayname: `"${v.name}"`,
    author: `"${author} (variant: Greed Island)"`,
    "pal.defaults": String(v.palette),
  });
  await writeFile(defFile, def, "latin1");

  const cnsName = iniValue(parseIni(def), "Files", "cns");
  if (!cnsName) throw new Error(`${recipe.baseDef} has no [Files] cns entry`);
  const cnsFile = path.join(dest, cnsName);
  let cns = await readFile(cnsFile, "latin1");
  cns = patchIni(cns, "Data", { life: String(v.data.life), attack: String(v.data.attack), defence: String(v.data.defence) });
  cns = patchIni(cns, "Size", { xscale: String(v.scale), yscale: String(v.scale) });
  if (Object.keys(v.velocity).length > 0) cns = patchIni(cns, "Velocity", v.velocity);
  await writeFile(cnsFile, cns, "latin1");

  await writeFile(marker, JSON.stringify({ id: v.id, hash, base: recipe.base, generatedBy: "pnpm roster:variants" }, null, 2) + "\n");
  return { id: v.id, defPath: variantDefPath(v), status: "built" };
}
