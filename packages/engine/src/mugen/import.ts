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
import type { CodeFile } from "./cheats.ts";

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
  notes: z.string().optional(),
});

export const MugenRecipe = z.object({ characters: z.array(MugenEntry) }).superRefine((r, ctx) => {
  const ids = new Set<string>();
  r.characters.forEach((c, i) => {
    if (ids.has(c.id)) ctx.addIssue({ code: "custom", message: `duplicate id ${c.id}`, path: ["characters", i, "id"] });
    ids.add(c.id);
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
    const p = e.replace(/\\/g, "/");
    return p.startsWith("/") || /^[a-z]:/i.test(p) || p.split("/").includes("..");
  });
}

/**
 * Unpack an archive (zip, rar, 7z: macOS and Linux tar read them through libarchive) into `dest`, after checking
 * every entry stays inside it.
 */
export async function unpack(archive: string, dest: string): Promise<void> {
  const { stdout } = await run("tar", ["-tf", archive], { maxBuffer: 64 * 1024 * 1024 });
  const bad = unsafeEntries(stdout.split("\n").filter(Boolean));
  if (bad.length) throw new Error(`${path.basename(archive)}: entries outside the folder: ${bad.slice(0, 3).join(", ")}`);
  await mkdir(dest, { recursive: true });
  await run("tar", ["-xf", archive, "-C", dest], { maxBuffer: 64 * 1024 * 1024 });
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
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { sha256?: string; name?: string };
    if (previous.sha256 === entry.sha256 && previous.name === entry.name) return { defPath, status: "unchanged", changed: {}, missing: [] };
  }
  const tmp = `${dest}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  try {
    await unpack(archive, tmp);
    const all = await listFiles(tmp);
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
    await writeFile(path.join(staged, `${entry.id}.def`), patchIni(fixed.text, "Info", { displayname: `"${entry.name}"` }), "latin1");
    await writeFile(path.join(staged, MARKER), JSON.stringify({ id: entry.id, name: entry.name, sha256: entry.sha256, source: entry.source, generatedBy: "pnpm mugen:import" }, null, 2) + "\n");
    await rm(dest, { recursive: true, force: true });
    await rename(staged, dest);
    return { defPath, status: "installed", changed: fixed.changed, missing: fixed.missing };
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await rm(`${tmp}-char`, { recursive: true, force: true });
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
      notes: "Added by pnpm mugen:import (mugen.json).",
    },
    character: { key: entry.id, fighter: entry.id, name: entry.name, palette: 1, enabled: true },
  };
}
