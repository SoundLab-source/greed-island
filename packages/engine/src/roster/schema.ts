import { ARCHETYPES } from "@greed-island/shared";
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
  def: defPath,
  /** Who made it and what the license allows. Required: never stream unlicensed art. */
  license: z.string().min(1),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export const StageEntry = z.object({
  id: slug,
  displayName: z.string().min(1),
  def: defPath,
  license: z.string().min(1),
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
