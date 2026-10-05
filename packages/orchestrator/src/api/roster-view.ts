/**
 * The roster gallery (GET /api/roster, apps/web/roster.html): every fighter
 * on the stream with its outfits (the house characters, one per palette),
 * how they've done, and its special moves and throws as built
 * (numbers.json in its character folder, written by pnpm templates:build).
 */
import type { Db } from "@greed-island/db";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface RosterMove {
  name: string;
  kind: string;
}

export interface RosterFighter {
  id: string;
  name: string;
  archetype: string;
  rarity: string;
  /** Where the art and code come from (roster.json's licence note). */
  credit: string;
  outfits: { characterId: string; name: string; palette: number; tier: string; rating: number; record: { wins: number; losses: number } }[];
  /** Player-owned copies. */
  owned: number;
  /** Special moves and throws, or empty when the fighter has no numbers file (e.g. not built by templates:build). */
  specials: RosterMove[];
  life: number | null;
}

/** A built fighter's numbers file, if it's inside IKEMEN_DIR/chars. */
async function readNumbers(ikemenDir: string | undefined, defPath: string): Promise<{ life?: number; moves?: { name: string; kind: string }[] } | null> {
  if (!ikemenDir) return null;
  const chars = path.resolve(ikemenDir, "chars");
  const file = path.resolve(ikemenDir, path.dirname(defPath), "numbers.json");
  if (!file.startsWith(chars + path.sep)) return null;
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export async function rosterView(db: Db, ikemenDir?: string): Promise<RosterFighter[]> {
  const fighters = await db.fighter.findMany({
    where: { enabled: true },
    orderBy: [{ archetype: "asc" }, { displayName: "asc" }],
    include: { characters: { where: { enabled: true }, orderBy: [{ palette: "asc" }, { createdAt: "asc" }] } },
  });
  return Promise.all(
    fighters.map(async (f) => {
      const numbers = await readNumbers(ikemenDir, f.defPath);
      const house = f.characters.filter((c) => c.ownerKind === "HOUSE");
      return {
        id: f.id,
        name: f.displayName,
        archetype: f.archetype,
        rarity: f.rarity,
        credit: f.licenseNote,
        outfits: house.map((c) => ({ characterId: c.id, name: c.name, palette: c.palette, tier: c.tier, rating: Math.round(c.rating), record: { wins: c.wins, losses: c.losses } })),
        owned: f.characters.length - house.length,
        specials: (numbers?.moves ?? []).filter((m) => m.kind !== "normal").map((m) => ({ name: m.name, kind: m.kind })),
        life: typeof numbers?.life === "number" ? numbers.life : null,
      };
    }),
  );
}
