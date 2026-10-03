/**
 * Building a submitted fighter from its own art (docs/PHASE3.md "Fighters
 * from their own art"): find the sprite sheet drawn on its archetype's guide,
 * build the character on the template into IKEMEN_DIR/chars/gi-sub-<number>/
 * (with its portrait as the lifebar faces and an outfit per alternate colour
 * sheet), and give the automatic checks its numbers and the template's to
 * compare.
 */
import { communityFiles, fighterNumbers, guideLayout, GuideError, readPng, TEMPLATES, writeCharacter, type CheckFighter, type FighterNumbers } from "@greed-island/engine";
import type { Archetype } from "@greed-island/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SubmissionStore } from "./submission-store.ts";

export interface OwnArtInput {
  id: string;
  number: number;
  fighterName: string;
  community: string;
  archetype: Archetype;
  /** The submission's sprite sheets. */
  sprites: readonly ImageFile[];
  /** Its portrait: the lifebar faces (without one, they're cut from the fighter's stance). */
  portrait?: ImageFile | null;
  /** Its alternate colour sheets, oldest first: one more palette each. */
  alternates?: readonly ImageFile[];
}

export interface ImageFile {
  sha256: string;
  width: number;
  height: number;
}

export type OwnArtResult =
  /** Built: check this character, against its template's numbers. */
  | { kind: "built"; fighter: CheckFighter; numbers: { fighter: FighterNumbers; template: FighterNumbers } | null; outfits: number }
  /** A sheet is drawn on the guide, but something in it has to be fixed. */
  | { kind: "problems"; problems: string[] }
  /** No sprite sheet is drawn on the guide. */
  | { kind: "none"; problem: string };

export type OwnArtBuilder = (input: OwnArtInput) => Promise<OwnArtResult>;

/** The character id of a submission's build: ours, from its number (never from anything typed). */
export function submissionCharacterId(number: number): string {
  if (!Number.isInteger(number) || number < 1) throw new Error(`bad submission number ${number}`);
  return `gi-sub-${number}`;
}

export function createOwnArtBuilder(ikemenDir: string, store: SubmissionStore): OwnArtBuilder {
  return async (sub) => {
    const spec = TEMPLATES.find((t) => t.archetype === sub.archetype);
    if (!spec) return { kind: "none", problem: `there is no ${sub.archetype.toLowerCase().replace("_", "-")} template to draw on yet` };
    const layout = guideLayout(spec);
    const sheet = sub.sprites.find((f) => f.width === layout.width && f.height === layout.height);
    if (!sheet) {
      return { kind: "none", problem: `none of its sprite sheets is drawn on the ${spec.name} guide (${layout.width}x${layout.height} pixels, from the submit page), so it can't be built from its own art` };
    }
    const id = submissionCharacterId(sub.number);
    // A file the PNG reader can't read is a problem with that image, like any other.
    const problems: string[] = [];
    const read = async (label: string, f: ImageFile) => {
      try {
        return readPng(await store.read(sub.id, f.sha256));
      } catch (e) {
        if (!/PNG|bit depth|interlace/i.test((e as Error).message)) throw e;
        problems.push(`${label}: it can't be read (${(e as Error).message}): save it again as an ordinary PNG`);
        return null;
      }
    };
    const page = await read("its sprite sheet", sheet);
    const portrait = sub.portrait ? await read("its portrait", sub.portrait) : null;
    const alternates = [];
    for (const [i, f] of (sub.alternates ?? []).entries()) alternates.push(await read(`its alternate colour sheet ${i + 1}`, f));
    let out;
    try {
      out = page && communityFiles(spec, page, { id, name: sub.fighterName, credit: `Art: ${sub.community} (submission #${sub.number})` }, { ...(portrait ? { portrait } : {}), alternates: alternates.filter((a) => a !== null) });
    } catch (e) {
      if (e instanceof GuideError) return { kind: "problems", problems: [...problems, ...e.problems] };
      throw e;
    }
    if (!out || problems.length) return { kind: "problems", problems };
    const built = await writeCharacter(ikemenDir, id, out, { submission: String(sub.number), template: spec.id, generatedBy: "submission checks" });
    const template = await readFile(path.join(ikemenDir, "chars", spec.id, "numbers.json"), "utf8").then((t) => JSON.parse(t) as FighterNumbers).catch(() => null);
    return { kind: "built", fighter: { id, name: sub.fighterName, defPath: built.defPath }, numbers: template ? { fighter: fighterNumbers(spec, out.reach), template } : null, outfits: 1 + alternates.length };
  };
}
