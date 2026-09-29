/**
 * House characters derived from a base character (Kung Fu Man) by changing
 * only its own constants and palette. The recipe (variants.json) is committed;
 * the character folders are generated inside IKEMEN_DIR/chars, never
 * committed (they contain the base character's art).
 */
import { ARCHETYPES } from "@greed-island/shared";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { deriveCharacter } from "../ikemen/derive.ts";
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

/** Fingerprint of a variant's recipe: its folder is rebuilt only when this changes. */
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
  const srcDefPath = path.posix.join(recipe.base, recipe.baseDef);
  const author = iniValue(parseIni(await readFile(path.join(ikemenDir, srcDefPath), "latin1").catch(() => "")), "Info", "author") ?? "unknown";
  const r = await deriveCharacter(ikemenDir, {
    srcDefPath,
    destId: v.id,
    hash: variantHash(recipe, v),
    info: { name: `"${v.name}"`, displayname: `"${v.name}"`, author: `"${author} (variant: Greed Island)"`, "pal.defaults": String(v.palette) },
    constants: {
      Data: { life: String(v.data.life), attack: String(v.data.attack), defence: String(v.data.defence) },
      Size: { xscale: String(v.scale), yscale: String(v.scale) },
      Velocity: v.velocity,
    },
    generatedBy: "pnpm roster:variants",
  });
  return { id: v.id, defPath: r.defPath, status: r.status };
}
