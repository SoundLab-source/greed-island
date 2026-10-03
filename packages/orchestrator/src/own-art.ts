/**
 * Building a submitted fighter from its own art (docs/PHASE3.md "Fighters
 * from their own art"): find the sprite sheet drawn on its archetype's guide,
 * build the character on the template into IKEMEN_DIR/chars/gi-sub-<number>/
 * (with its portrait as the lifebar faces, an outfit per alternate colour
 * sheet, and its own intros and win poses), and give the automatic checks its
 * numbers and the template's to compare.
 */
import { communityFiles, fighterNumbers, guideLayout, GuideError, numbered, readPng, TEMPLATES, writeCharacter, type CheckFighter, type FighterNumbers } from "@greed-island/engine";
import type { Db, Prisma } from "@greed-island/db";
import type { Archetype } from "@greed-island/shared";
import { existsSync } from "node:fs";
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
  /** Its intros and win poses, oldest first, drawn on the pose guide. */
  intros?: readonly ImageFile[];
  wins?: readonly ImageFile[];
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

/** The images a build uses, as a query selects them (`OWN_ART_FILES`). */
export const OWN_ART_FILES = {
  where: { role: { in: ["SPRITES", "PORTRAIT", "PALETTE", "INTRO", "WIN_POSE"] } },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  select: { role: true, sha256: true, width: true, height: true },
} as const satisfies Prisma.Submission$filesArgs;

/** A submission and its images (selected with `OWN_ART_FILES`) as the builder's input. */
export function ownArtInput(sub: Omit<OwnArtInput, "sprites" | "portrait" | "alternates" | "intros" | "wins"> & { files: readonly ({ role: string } & ImageFile)[] }): OwnArtInput {
  const { files, ...rest } = sub;
  const image = ({ sha256, width, height }: ImageFile) => ({ sha256, width, height });
  const portrait = files.find((f) => f.role === "PORTRAIT");
  return {
    ...rest,
    sprites: files.filter((f) => f.role === "SPRITES").map(image),
    portrait: portrait ? image(portrait) : null,
    alternates: files.filter((f) => f.role === "PALETTE").map(image),
    intros: files.filter((f) => f.role === "INTRO").map(image),
    wins: files.filter((f) => f.role === "WIN_POSE").map(image),
  };
}

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
    const poses = async (label: string, files: readonly ImageFile[] = []) => {
      const out = [];
      for (const [i, f] of files.slice(0, 2).entries()) out.push(await read(numbered(label, i, Math.min(files.length, 2)), f));
      return out;
    };
    const intros = await poses("its intro", sub.intros);
    const wins = await poses("its win pose", sub.wins);
    let out;
    try {
      out = page && communityFiles(spec, page, { id, name: sub.fighterName, credit: `Art: ${sub.community} (submission #${sub.number})` }, {
        ...(portrait ? { portrait } : {}),
        alternates: alternates.filter((a) => a !== null),
        intros: intros.filter((a) => a !== null),
        wins: wins.filter((a) => a !== null),
      });
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

/**
 * Build released fighters' characters again where their folder is missing (a
 * new or cleaned-up engine folder), from the submissions' stored images, so a
 * fight never launches a character that isn't there. Returns problems, for
 * the log.
 */
export async function syncCommunityBuilds(db: Db, ikemenDir: string, build: OwnArtBuilder): Promise<string[]> {
  const released = await db.release.findMany({
    orderBy: { createdAt: "asc" },
    select: { fighter: { select: { id: true, defPath: true } }, submission: { select: { id: true, number: true, archetype: true, fighterName: true, community: true, files: OWN_ART_FILES } } },
  });
  const problems: string[] = [];
  for (const { fighter, submission } of released) {
    const id = submissionCharacterId(submission.number);
    if (fighter.defPath !== `chars/${id}/${id}.def` || existsSync(path.join(ikemenDir, fighter.defPath))) continue;
    const r = await build(ownArtInput(submission));
    if (r.kind !== "built") problems.push(`${fighter.id} (submission #${submission.number}) couldn't be built again: ${r.kind === "none" ? r.problem : r.problems.join("; ")}`);
  }
  return problems;
}
