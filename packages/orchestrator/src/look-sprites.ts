/**
 * NFT looks on the fighter's sprites (docs/PHASE3.md "NFTs as fighters"): a
 * look's own character in IKEMEN_DIR/chars/gi-look-<look id>/, which plays the
 * fighter's files in the NFT's main colours (`lookFiles`). Built when the look
 * is applied, and again at start-up for every look being worn (unchanged
 * builds aren't rewritten), so a fresh engine folder gets them back from the
 * stored NFT images.
 */
import type { Db } from "@greed-island/db";
import { defFiles, hashFiles, lookFiles, readPng, writeCharacter } from "@greed-island/engine";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LookImageType, LookStore } from "./look-images.ts";

/** A look's character id and .def, from the look's id (ours, never typed by anyone). */
export function lookCharacterId(lookId: string): string {
  const hex = lookId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`bad look id ${lookId}`);
  return `gi-look-${hex}`;
}

export function lookDefPath(lookId: string): string {
  const id = lookCharacterId(lookId);
  return `chars/${id}/${id}.def`;
}

export interface LookSpritesInput {
  lookId: string;
  /** The fighter's .def, relative to IKEMEN_DIR. */
  fighterDefPath: string;
  /** The colour the character wears. */
  palette: number;
  image: Uint8Array;
  imageType: LookImageType;
}

export type LookSpritesResult = { defPath: string; colors: string[] } | { problem: string };

/** Build a look's character. Problems (not a PNG, not one of our fighters...) come back in words; the look then shows without them. */
export async function buildLookSprites(ikemenDir: string, input: LookSpritesInput): Promise<LookSpritesResult> {
  if (input.imageType !== "png") return { problem: "the fighter's colours can only be taken from a PNG image" };
  const m = /^chars\/(gi-[a-z0-9-]+)\/[A-Za-z0-9_.-]+\.def$/.exec(input.fighterDefPath);
  if (!m) return { problem: "its fighter isn't one of Greed Island's own characters" };
  const dir = m[1]!;
  try {
    const def = await readFile(path.join(ikemenDir, input.fighterDefPath), "latin1");
    const sprite = defFiles(def).get("sprite");
    if (!sprite || !/^[A-Za-z0-9_.-]+$/.test(sprite)) return { problem: "its fighter's sprite file isn't in its folder" };
    const sff = await readFile(path.join(ikemenDir, "chars", dir, sprite));
    const id = lookCharacterId(input.lookId);
    const out = lookFiles(id, { dir, def, sff, palette: input.palette }, readPng(input.image));
    const built = await writeCharacter(ikemenDir, id, { files: out.files, hash: hashFiles(out.files) }, { look: input.lookId, fighter: input.fighterDefPath, generatedBy: "NFT look" });
    return { defPath: built.defPath, colors: out.colors };
  } catch (e) {
    return { problem: `the fighter's colours couldn't be changed (${(e as Error).message})` };
  }
}

/**
 * Build every worn look's character again (at start-up): from its stored
 * image, on the fighter and colour its character has now. Returns what
 * couldn't be rebuilt, for the log.
 */
export async function syncLookSprites(db: Db, ikemenDir: string, looks: LookStore): Promise<string[]> {
  const worn = await db.nftLook.findMany({
    where: { removedAt: null, defPath: { not: null } },
    select: { id: true, name: true, imageSha256: true, imageType: true, character: { select: { palette: true, fighter: { select: { defPath: true } } } } },
  });
  const problems: string[] = [];
  for (const look of worn) {
    const type = look.imageType as LookImageType;
    const image = await looks.read(look.imageSha256, type).catch(() => null);
    const r = image
      ? await buildLookSprites(ikemenDir, { lookId: look.id, fighterDefPath: look.character.fighter.defPath, palette: look.character.palette, image, imageType: type })
      : { problem: "its stored image is missing" };
    if ("problem" in r) problems.push(`look ${look.name} (${look.id}): ${r.problem}`);
  }
  return problems;
}
