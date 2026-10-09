/**
 * MUGEN characters from the web (MUGEN Archive and the like), brought into
 * IKEMEN_DIR/chars. Only the recipe (mugen.json: which file, its checksum,
 * where it came from, the name and archetype we give it) is committed; the
 * downloads stay in mugen/ and the character folders in IKEMEN_DIR, outside
 * git like all characters. None of them is cleared for commercial use, so
 * their roster entries say so and GI_COMMERCIAL_ONLY keeps them off stream.
 */
import { ARCHETYPES } from "@greed-island/shared";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { MARKER } from "../ikemen/derive.ts";
import { iniValue, parseIni, patchIni } from "../roster/ini.ts";
import type { CharacterEntry, FighterEntry } from "../roster/schema.ts";
import { TEMPLATES } from "../templates/index.ts";
import { writeFxPack, FX_DEF } from "../fx/pack.ts";
import { AI_VERSION, hasOwnAi, insertIntoMinus1, loadOrder, minus1Host, mugenAi, type AiAttack } from "./ai.ts";
import { GAGS, gagAir, gagStates, gagTriggers, type Gag } from "./gags.ts";
import type { CodeFile } from "./cheats.ts";
import { mugenCard } from "./card.ts";

/** What the marker remembers of the recipe beyond the archive, so a new AI, AI choice, stats, gags or patches reinstall the character. */
const aiTag = (entry: MugenEntry) =>
  `${entry.ai}:${AI_VERSION}:${JSON.stringify(entry.data ?? {})}:${createHash("sha256").update(gagStates(entry.gags) + gagAir(entry.gags)).digest("hex").slice(0, 12)}` +
  (entry.patches.length ? `:${createHash("sha256").update(JSON.stringify(entry.patches)).digest("hex").slice(0, 12)}` : "");

const run = promisify(execFile);

export const MugenEntry = z.object({
  /** Folder under chars/ and roster id. */
  id: z.string().regex(/^mugen-[a-z0-9-]+$/, "ids start with mugen- and use lowercase letters, digits and -"),
  /** The name on stream (the character's own displayname is often a joke that doesn't fit). */
  name: z.string().min(1).max(24),
  archetype: z.enum(ARCHETYPES),
  /** The downloaded archive, in mugen/ at the repo root. */
  file: z.string().min(1).refine((f) => !/[\\/]/.test(f), "a file name, not a path"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** The character's .def inside the archive, when it holds more than one. */
  def: z.string().optional(),
  source: z.string().url(),
  author: z.string().min(1),
  /** Whose AI fights: ours (mugen/ai.ts), the character's own, or ours only when it has none ("auto"). */
  ai: z.enum(["auto", "ours", "own"]).default("auto"),
  /** [Data] values to set in its constants, like our fighters' numbers: the balance knob (and the fix for boosted stats). */
  data: z.object({ life: z.number().int().min(100).max(3000), attack: z.number().int().min(10).max(300), defence: z.number().int().min(10).max(300) }).partial().optional(),
  /** Moves of our own added to it (mugen/gags.ts), e.g. "explosion". */
  gags: z.array(z.enum(GAGS)).default([]),
  /**
   * Exact text replacements in its own files (a settings block, say: switching off instant kills), each found exactly
   * once or the import stops. `file` is inside the character's folder (any capitals); text is compared byte for byte.
   */
  patches: z.array(z.object({ file: z.string().min(1), find: z.string().min(1), replace: z.string(), why: z.string().min(1) })).default([]),
  /** Roster tags (e.g. "meme", for GI_ROSTER_ONLY). */
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/)).default([]),
  notes: z.string().optional(),
});

/** A stage (mugen/stages.ts installs it). */
export const MugenStage = z.object({
  /** Folder under stages/ and roster id. */
  id: z.string().regex(/^mugen-[a-z0-9-]+$/, "ids start with mugen- and use lowercase letters, digits and -"),
  /** The name we show (the stage's [Info] name gets it too). */
  name: z.string().min(1).max(40),
  /** The downloaded archive, in mugen/ at the repo root. */
  file: z.string().min(1).refine((f) => !/[\\/]/.test(f), "a file name, not a path"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** The stage's .def inside the archive, when it holds more than one. */
  def: z.string().optional(),
  source: z.string().url(),
  author: z.string().min(1),
  notes: z.string().optional(),
});
export type MugenStage = z.infer<typeof MugenStage>;

export const MugenRecipe = z.object({ characters: z.array(MugenEntry), stages: z.array(MugenStage).default([]) }).superRefine((r, ctx) => {
  const ids = new Set<string>();
  r.characters.forEach((c, i) => {
    if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${c.id}`, path: ["characters", i, "id"] });
    ids.add(c.id);
  });
  const stageIds = new Set<string>();
  r.stages.forEach((s, i) => {
    if (stageIds.has(s.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${s.id}`, path: ["stages", i, "id"] });
    stageIds.add(s.id);
  });
});

export type MugenEntry = z.infer<typeof MugenEntry>;
export const MUGEN_PATH = new URL("../../mugen.json", import.meta.url);

export async function loadMugen(file: string | URL = MUGEN_PATH): Promise<z.infer<typeof MugenRecipe>> {
  return MugenRecipe.parse(JSON.parse(await readFile(file, "utf8")));
}

/** Archive entries that would land outside the folder they're unpacked into (or are links). */
export function unsafeEntries(entries: readonly string[]): string[] {
  return entries.filter((e) => {
    // tar lists bytes outside ASCII (a Japanese folder name, say) as \ooo octal escapes: those are letters, not separators.
    const p = e.replace(/\\[0-7]{3}/g, "_").replace(/\\/g, "/");
    return p.startsWith("/") || /^[a-z]:/i.test(p) || p.split("/").includes("..");
  });
}

/**
 * Unpack an archive (zip, rar, 7z: macOS and Linux tar read them through libarchive) into `dest`, after checking
 * every entry stays inside it. Many MUGEN characters are Japanese, with file names in Shift-JIS that a modern file
 * system refuses as they are: those are read as Shift-JIS (CP932) on a second try, and if some name still can't be
 * written, what did unpack is kept (such files are readmes in practice) and the problems are returned.
 */
export async function unpack(archive: string, dest: string): Promise<string[]> {
  const { stdout } = await run("tar", ["-tf", archive], { maxBuffer: 64 * 1024 * 1024 });
  const bad = unsafeEntries(stdout.split("\n").filter(Boolean));
  if (bad.length) throw new Error(`${path.basename(archive)}: entries outside the folder: ${bad.slice(0, 3).join(", ")}`);
  let problems: string[] = [];
  for (const extra of [[], ["--options", "hdrcharset=CP932"]]) {
    await rm(dest, { recursive: true, force: true });
    await mkdir(dest, { recursive: true });
    try {
      await run("tar", ["-xf", archive, ...extra, "-C", dest], { maxBuffer: 64 * 1024 * 1024 });
      return [];
    } catch (e) {
      problems = String((e as { stderr?: string }).stderr ?? e).split("\n").filter((l) => l && !/Error exit delayed/.test(l));
    }
  }
  return problems;
}

export async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** Every file under `dir`, relative to it with / separators. */
export async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/**
 * Programs and scripts a character never needs (its .cmd files are command lists, not Windows batch files): left
 * out of the installed character, so nothing runnable from a download sits in the engine folder.
 */
export const PROGRAM_FILES = /\.(exe|dll|bat|com|scr|msi|vbs|ps1|sh|command|app|jar|js|lnk|reg|pif)$/i;

/** .def files are ASCII or latin1 in practice; latin1 keeps every byte. */
const readDef = (file: string) => readFile(file, "latin1");

/** The character .defs among `files` (they name constants, states or commands). */
export async function characterDefs(dir: string, files: readonly string[]): Promise<string[]> {
  const defs: string[] = [];
  for (const f of files.filter((f) => /\.def$/i.test(f))) {
    const ini = parseIni(await readDef(path.join(dir, f)));
    if (["cns", "st", "cmd"].some((k) => iniValue(ini, "Files", k) !== undefined)) defs.push(f);
  }
  return defs;
}

/** [Files] keys that name a file next to the .def (stcommon is the engine's own common1.cns). */
const FILE_KEYS = /^(sprite|anim|sound|cmd|cns|st\d*|ai|pal\d+|movelist)$/i;

/**
 * The [Files] names a .def gives, matched to the files really there: a name written in other capitals is replaced
 * with the real one (macOS doesn't mind, but a Linux stream machine would not find it). Returns the changes and
 * the names that match nothing at all.
 */
export function fixFileNames(defText: string, files: readonly string[]): { text: string; changed: Record<string, string>; missing: string[] } {
  const files_ = parseIni(defText).get("files") ?? new Map<string, string>();
  const byLower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const changed: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, value] of files_) {
    if (!FILE_KEYS.test(key) || !value) continue;
    const want = value.replace(/\\/g, "/");
    if (files.includes(want)) continue;
    const real = byLower.get(want.toLowerCase());
    if (real) changed[key] = real;
    else missing.push(`${key} = ${value}`);
  }
  return { text: Object.keys(changed).length ? patchIni(defText, "Files", changed) : defText, changed, missing };
}

/** The code files a .def names (constants, states, commands), for the cheat scanner. */
export async function codeFiles(defPath: string): Promise<CodeFile[]> {
  const dir = path.dirname(defPath);
  const files = parseIni(await readDef(defPath)).get("files") ?? new Map<string, string>();
  const names = [...new Set([...files].filter(([k, v]) => /^(cns|st\d*|cmd)$/i.test(k) && v).map(([, v]) => v.replace(/\\/g, "/")))];
  const out: CodeFile[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    if (existsSync(file)) out.push({ name, text: await readFile(file, "latin1") });
  }
  return out;
}

export interface Installed {
  defPath: string;
  status: "installed" | "unchanged";
  changed: Record<string, string>;
  missing: string[];
  /** Ours (with the attacks it uses), the character's own, or none: no attack of its own to drive (a gag character), left to the engine. */
  ai?: { by: "ours"; attacks: AiAttack[] } | { by: "own" } | { by: "none" };
  /** Program files in the download that were left out. */
  removed?: string[];
  /** Files the archive holds that couldn't be unpacked (odd file names); the rest was. */
  unpackProblems?: string[];
}

/**
 * Our AI into the installed character (unless it has its own and the recipe doesn't ask for ours): written into
 * the file holding its [Statedef -1], with reach measured from its .air file.
 */
async function addAi(dir: string, defText: string, entry: MugenEntry): Promise<Installed["ai"]> {
  const ini = parseIni(defText);
  const files = ini.get("files") ?? new Map<string, string>();
  const code: CodeFile[] = [];
  for (const name of loadOrder(files)) if (existsSync(path.join(dir, name)) && !code.some((c) => c.name === name)) code.push({ name, text: await readFile(path.join(dir, name), "latin1") });
  if (entry.ai === "own" || (entry.ai === "auto" && hasOwnAi(code))) return { by: "own" };
  const anim = files.get("anim");
  const air = anim && existsSync(path.join(dir, anim)) ? await readFile(path.join(dir, anim), "latin1") : "";
  const cns = files.get("cns");
  const constants = cns && existsSync(path.join(dir, cns)) ? parseIni(await readFile(path.join(dir, cns), "latin1")) : new Map();
  const front = Number(iniValue(constants, "Size", "ground.front") ?? 16);
  const localcoord = Number((iniValue(ini, "Info", "localcoord") ?? "320").split(",")[0]);
  const spec = TEMPLATES.find((t) => t.archetype === entry.archetype)!.ai;
  const ai = mugenAi({ files: code, air, front: Number.isFinite(front) ? front : 16, scale: (localcoord || 320) / 320, ai: spec });
  // Ours turns off the engine's random presses, so without attacks to drive it would only stand there.
  if (ai.attacks.length === 0) return { by: "none" };
  await writeFile(path.join(dir, ai.file), ai.text, "latin1");
  return { by: "ours", attacks: ai.attacks };
}

/**
 * Our gags into the installed character: their states in a file of their own (the next free st key), their
 * animation appended to its .air, the AI's triggers at the top of its [Statedef -1], and our effect pack (built
 * by installMugen) in its [Files] fx. Returns the new .def text.
 */
async function addGags(dir: string, defText: string, gags: readonly Gag[]): Promise<string> {
  const files = parseIni(defText).get("files") ?? new Map<string, string>();
  const stKey = Array.from({ length: 99 }, (_, i) => `st${i + 1}`).find((k) => !files.has(k))!;
  await writeFile(path.join(dir, "gi-gags.cns"), gagStates(gags), "latin1");
  const anim = files.get("anim");
  if (anim && existsSync(path.join(dir, anim))) {
    const air = await readFile(path.join(dir, anim), "latin1");
    await writeFile(path.join(dir, anim), air + gagAir(gags, air.includes("\r\n") ? "\r\n" : "\n"), "latin1");
  }
  const code: CodeFile[] = [];
  for (const name of loadOrder(files)) if (existsSync(path.join(dir, name)) && !code.some((c) => c.name === name)) code.push({ name, text: await readFile(path.join(dir, name), "latin1") });
  const host = minus1Host(code);
  const file = code.find((c) => c.name === host);
  if (file) await writeFile(path.join(dir, file.name), insertIntoMinus1(file.text, gagTriggers(gags)), "latin1");
  const fx = files.get("fx");
  return patchIni(defText, "Files", { [stKey]: "gi-gags.cns", fx: fx ? `${fx}, ${FX_DEF}` : FX_DEF });
}

/**
 * Install one recipe entry from its archive into IKEMEN_DIR/chars/<id>/: unpacked into a temporary folder, the
 * character's folder moved in with its .def renamed to <id>.def, its file names fixed and our name as its
 * displayname. Skipped when the same archive is already installed under the same name; never touches a folder
 * without our marker.
 */
export async function installMugen(ikemenDir: string, entry: MugenEntry, archive: string): Promise<Installed> {
  const sum = await sha256(archive);
  if (sum !== entry.sha256) throw new Error(`${entry.file}: checksum ${sum} does not match the recipe's ${entry.sha256}`);
  const dest = path.join(ikemenDir, "chars", entry.id);
  const marker = path.join(dest, MARKER);
  const defPath = `chars/${entry.id}/${entry.id}.def`;
  // Our effect pack, for characters with gags: rebuilt when it changes (its sound downloaded, say), installed or not.
  if (entry.gags.length) await writeFxPack(ikemenDir);
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { sha256?: string; name?: string; ai?: string };
    if (previous.sha256 === entry.sha256 && previous.name === entry.name && previous.ai === aiTag(entry)) {
      // Installed before pictures existed: add only the picture.
      const card = path.join(dest, "card.png");
      if (!existsSync(card)) {
        const png = await mugenCard(path.join(dest, `${entry.id}.def`));
        if (png) await writeFile(card, png);
      }
      return { defPath, status: "unchanged", changed: {}, missing: [] };
    }
  }
  const tmp = `${dest}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  try {
    const unpackProblems = await unpack(archive, tmp);
    const found = await listFiles(tmp);
    const removed = found.filter((f) => PROGRAM_FILES.test(f));
    for (const f of removed) await rm(path.join(tmp, f), { force: true });
    const all = found.filter((f) => !PROGRAM_FILES.test(f));
    const defs = await characterDefs(tmp, all);
    const def = entry.def ? defs.find((d) => d.toLowerCase() === entry.def!.toLowerCase()) : defs.length === 1 ? defs[0] : undefined;
    if (!def) throw new Error(`${entry.file}: ${defs.length ? `${defs.length} characters inside (${defs.join(", ")}); say which with "def"` : "no character .def inside"}`);
    // The character's own folder becomes chars/<id>/.
    const charDir = path.posix.dirname(def);
    const root = charDir === "." ? tmp : path.join(tmp, charDir);
    const inFolder = all.filter((f) => charDir === "." || f.startsWith(`${charDir}/`)).map((f) => (charDir === "." ? f : f.slice(charDir.length + 1)));
    const fixed = fixFileNames(await readDef(path.join(tmp, def)), inFolder);
    const staged = `${tmp}-char`;
    await rm(staged, { recursive: true, force: true });
    await cp(root, staged, { recursive: true });
    await rm(path.join(staged, path.posix.basename(def)));
    // The game's health bar shows the .def's displayname, so it carries our name too.
    let defText = patchIni(fixed.text, "Info", { displayname: `"${entry.name}"` });
    const ai = await addAi(staged, fixed.text, entry);
    if (entry.gags.length) defText = await addGags(staged, defText, entry.gags);
    await writeFile(path.join(staged, `${entry.id}.def`), defText, "latin1");
    if (entry.patches.length) await applyPatches(staged, entry);
    const cns = parseIni(fixed.text).get("files")?.get("cns");
    if (entry.data && cns && existsSync(path.join(staged, cns))) {
      const text = await readFile(path.join(staged, cns), "latin1");
      await writeFile(path.join(staged, cns), patchIni(text, "Data", Object.fromEntries(Object.entries(entry.data).map(([k, v]) => [k, String(v)]))), "latin1");
    }
    // The website's picture of it.
    const card = await mugenCard(path.join(staged, `${entry.id}.def`));
    if (card) await writeFile(path.join(staged, "card.png"), card);
    await writeFile(path.join(staged, MARKER), JSON.stringify({ id: entry.id, name: entry.name, sha256: entry.sha256, ai: aiTag(entry), source: entry.source, generatedBy: "pnpm mugen:import" }, null, 2) + "\n");
    await rm(dest, { recursive: true, force: true });
    await rename(staged, dest);
    return { defPath, status: "installed", changed: fixed.changed, missing: fixed.missing, ai, ...(removed.length ? { removed } : {}), ...(unpackProblems.length ? { unpackProblems } : {}) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await rm(`${tmp}-char`, { recursive: true, force: true });
  }
}

/** The recipe's patches, into the staged character's files: each `find` must be there exactly once. */
export async function applyPatches(dir: string, entry: Pick<MugenEntry, "id" | "patches">): Promise<void> {
  const files = await listFiles(dir);
  for (const p of entry.patches) {
    const name = files.find((f) => f.toLowerCase() === p.file.toLowerCase().replace(/\\/g, "/"));
    if (!name) throw new Error(`${entry.id}: patch "${p.why}": no file ${p.file}`);
    const text = await readFile(path.join(dir, name), "latin1");
    const count = text.split(p.find).length - 1;
    if (count !== 1) throw new Error(`${entry.id}: patch "${p.why}": ${JSON.stringify(p.find)} is in ${name} ${count} times, not once`);
    await writeFile(path.join(dir, name), text.replace(p.find, () => p.replace), "latin1");
  }
}

/** Roster entries for an imported character: never cleared for commercial use, one character in its first colours. */
export function rosterEntries(entry: MugenEntry, defPath: string): { fighter: FighterEntry; character: CharacterEntry } {
  return {
    fighter: {
      id: entry.id,
      displayName: entry.name,
      archetype: entry.archetype,
      rarity: "RARE",
      def: defPath,
      license: `MUGEN character by ${entry.author}, from ${entry.source}. Not cleared for commercial use (fan-made, often from commercial games); off stream while GI_COMMERCIAL_ONLY=true.`,
      commercialUse: false,
      enabled: true,
      tags: entry.tags,
      notes: "Added by pnpm mugen:import (mugen.json).",
    },
    character: { key: entry.id, fighter: entry.id, name: entry.name, palette: 1, enabled: true },
  };
}
