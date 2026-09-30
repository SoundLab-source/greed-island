/**
 * Seasonal release (DESIGN §11, docs/PHASE3.md step 6). Fighters elected in a
 * season's vote join the roster when the next season starts: a new community
 * fighter (its own name, archetype and community), a house character of it
 * that debuts in the next tournament, and First Edition copies in the shop,
 * where it's always offered during its debut season. Until its archetype's
 * template exists, the fighter plays with a stand-in engine character of the
 * same archetype. Pure rules.
 */
import type { Archetype } from "./character.ts";

/** Community fighters are rare in the shop (a First Edition is worth more). */
export const COMMUNITY_RARITY = "RARE" as const;

/** A fighter id from its name: "community-" + lower-case words with hyphens, made unique with a number. */
export function communityFighterId(name: string, taken: ReadonlySet<string>): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "fighter";
  let id = `community-${slug}`;
  for (let n = 2; taken.has(id); n++) id = `community-${slug}-${n}`;
  return id;
}

/** Fighter templates (packages/engine/src/templates) have roster ids starting with this. */
export const TEMPLATE_ID_PREFIX = "gi-tpl-";

/**
 * The engine character a new fighter plays with until its own art is built
 * in: its archetype's template if the roster has it, else the first enabled
 * roster fighter of the same archetype (by id), else any enabled roster
 * fighter (preferring Kung Fu Man), or null if there are none.
 */
export function pickStandIn<T extends { id: string; archetype: Archetype }>(fighters: readonly T[], archetype: Archetype): T | null {
  const sorted = [...fighters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    sorted.find((f) => f.archetype === archetype && f.id.startsWith(TEMPLATE_ID_PREFIX)) ??
    sorted.find((f) => f.archetype === archetype) ??
    sorted.find((f) => f.id === "kfm") ??
    sorted[0] ??
    null
  );
}
