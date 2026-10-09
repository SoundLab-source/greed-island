import { ARCHETYPES, RARITIES } from "@greed-island/shared";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "use lowercase letters, digits, - and _");

/** A .def path relative to IKEMEN_DIR that can't escape it. */
const defPath = z
  .string()
  .regex(/\.def$/i, "must point to a .def file")
  .refine((p) => !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split(/[\\/]/).includes(".."), "must be a relative path inside IKEMEN_DIR");

export const FighterEntry = z.object({
  id: slug,
  displayName: z.string().min(1),
  archetype: z.enum(ARCHETYPES),
  /** Shop price multiplier (DESIGN §8). */
  rarity: z.enum(RARITIES).default("COMMON"),
  def: defPath,
  /** Who made it and what the license allows. Required: never stream unlicensed art. */
  license: z.string().min(1),
  /** The license allows commercial use (false unless known). GI_COMMERCIAL_ONLY=true keeps only these on stream. */
  commercialUse: z.boolean().default(false),
  enabled: z.boolean().default(true),
  /** Groups it belongs to (e.g. "meme"), for GI_ROSTER_ONLY: a stream of just those, like a private meme demo. */
  tags: z.array(slug).default([]),
  notes: z.string().optional(),
});

export const StageEntry = z.object({
  id: slug,
  displayName: z.string().min(1),
  def: defPath,
  license: z.string().min(1),
  /** The license allows commercial use (false unless known). */
  commercialUse: z.boolean().default(false),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export const CharacterEntry = z.object({
  /** Stable key; renaming it creates a new character with a fresh rating. */
  key: slug,
  fighter: slug,
  name: z.string().min(1),
  palette: z.number().int().min(1).max(12).default(1),
  enabled: z.boolean().default(true),
});

export const RosterFile = z
  .object({
    fighters: z.array(FighterEntry),
    stages: z.array(StageEntry),
    characters: z.array(CharacterEntry),
  })
  .superRefine((roster, ctx) => {
    const dupes = (items: { id?: string; key?: string }[], field: "id" | "key", path: string) => {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        const v = item[field]!;
        if (seen.has(v)) ctx.addIssue({ code: "custom", message: `duplicate ${field} "${v}"`, path: [path, i, field] });
        seen.add(v);
      });
    };
    dupes(roster.fighters, "id", "fighters");
    dupes(roster.stages, "id", "stages");
    dupes(roster.characters, "key", "characters");
    const fighterIds = new Set(roster.fighters.map((f) => f.id));
    roster.characters.forEach((c, i) => {
      if (!fighterIds.has(c.fighter)) {
        ctx.addIssue({ code: "custom", message: `unknown fighter "${c.fighter}"`, path: ["characters", i, "fighter"] });
      }
    });
  });

export type FighterEntry = z.infer<typeof FighterEntry>;
export type StageEntry = z.infer<typeof StageEntry>;
export type CharacterEntry = z.infer<typeof CharacterEntry>;
export type Roster = z.infer<typeof RosterFile>;

/**
 * GI_COMMERCIAL_ONLY: fighters and stages whose license doesn't allow
 * commercial use are disabled, so only cleared content is on stream. Stages
 * are only filtered when at least one cleared stage is left (fights need one).
 */
export function commercialOnly(roster: Roster): Roster {
  const note = "license doesn't allow commercial use (GI_COMMERCIAL_ONLY=true)";
  const off = <T extends { commercialUse: boolean; enabled: boolean }>(x: T): T => (x.commercialUse || !x.enabled ? x : { ...x, enabled: false, notes: note });
  const clearedStage = roster.stages.some((s) => s.commercialUse && s.enabled);
  return { ...roster, fighters: roster.fighters.map(off), stages: clearedStage ? roster.stages.map(off) : roster.stages };
}

/**
 * GI_ROSTER_ONLY (comma-separated tags or fighter ids): every other fighter is switched off for this run, e.g.
 * GI_ROSTER_ONLY=meme for a demo of the meme characters. The next sync without it switches them back on.
 */
export function onlyFighters(roster: Roster, wanted: readonly string[]): Roster {
  const keep = new Set(wanted);
  const note = `not in GI_ROSTER_ONLY=${wanted.join(",")}`;
  return { ...roster, fighters: roster.fighters.map((f) => (!f.enabled || keep.has(f.id) || f.tags.some((t) => keep.has(t)) ? f : { ...f, enabled: false, notes: note })) };
}

export class RosterError extends Error {
  override name = "RosterError";
}

export function parseRoster(data: unknown): Roster {
  const result = RosterFile.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new RosterError(`roster.json is invalid:\n${lines.join("\n")}`);
  }
  return result.data;
}

export const ROSTER_PATH = new URL("../../roster.json", import.meta.url);

export async function loadRoster(path: string | URL = ROSTER_PATH): Promise<Roster> {
  const text = await readFile(path, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new RosterError(`roster.json is not valid JSON: ${(err as Error).message}`);
  }
  return parseRoster(json);
}
