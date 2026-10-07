/**
 * MUGEN stages from the web (MUGEN Archive and the like), brought into IKEMEN_DIR/stages/<id>/ by `pnpm mugen:import`
 * like the characters (mugen.json "stages"; the downloads in mugen/, outside git). A stage is a .def with [BGdef]
 * (its sprites) and usually [Music]; no code. The engine looks for `spr` and `bgmusic` next to the .def first, then
 * in its own folder and data/ (bgmusic also under sound/): Ikemen-GO src/common.go SearchFile, src/stage.go
 * ("spr" with dirs def, "", "data/") and src/music.go (bgmusic, default dir "sound/"). Stages written for MUGEN's
 * folders name their music as "sound/<file>" though the file came in the archive next to the .def, so those
 * paths are pointed at the file that's really there. None is cleared for commercial use.
 */
import { existsSync } from "node:fs";
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MARKER } from "../ikemen/derive.ts";
import { parseIni, patchIni } from "../roster/ini.ts";
import type { StageEntry } from "../roster/schema.ts";
import { listFiles, PROGRAM_FILES, sha256, unpack, type MugenStage } from "./import.ts";


const readDef = (file: string) => readFile(file, "latin1");
const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2");

/** The stage .defs among `files` (they have a [BGdef] section). */
export async function stageDefs(dir: string, files: readonly string[]): Promise<string[]> {
  const defs: string[] = [];
  for (const f of files.filter((f) => /\.def$/i.test(f))) if (parseIni(await readDef(path.join(dir, f))).has("bgdef")) defs.push(f);
  return defs;
}

/**
 * Point the stage's sprite and music paths at files really in its folder (`files`, relative to the .def): a path
 * that doesn't match one (other capitals, or MUGEN's sound/ folder) is replaced by the file with the same name.
 * Returns the changes and the paths that match nothing.
 */
export function fixStagePaths(defText: string, files: readonly string[]): { text: string; changed: Record<string, string>; missing: string[] } {
  const ini = parseIni(defText);
  const byLower = new Map(files.map((f) => [f.toLowerCase(), f]));
  const byName = new Map(files.map((f) => [path.posix.basename(f).toLowerCase(), f]));
  const changed: Record<string, string> = {};
  const missing: string[] = [];
  let text = defText;
  const fix = (section: string, keys: (k: string) => boolean) => {
    const patch: Record<string, string> = {};
    for (const [key, raw] of ini.get(section.toLowerCase()) ?? []) {
      if (!keys(key)) continue;
      const want = unquote(raw.split(";")[0]!).replace(/\\/g, "/");
      if (!want || files.includes(want)) continue;
      const real = byLower.get(want.toLowerCase()) ?? byName.get(path.posix.basename(want).toLowerCase());
      if (real) patch[key] = `"${real}"`;
      else missing.push(`${key} = ${raw}`);
    }
    if (Object.keys(patch).length) {
      text = patchIni(text, section, patch);
      Object.assign(changed, patch);
    }
  };
  fix("BGdef", (k) => k === "spr");
  fix("Music", (k) => k.startsWith("bgmusic"));
  return { text, changed, missing };
}

export interface InstalledStage {
  defPath: string;
  status: "installed" | "unchanged";
  changed: Record<string, string>;
  missing: string[];
  removed?: string[];
}

/** Install one stage into stages/<id>/ (its .def as <id>.def, paths fixed, our name). Never touches a folder without our marker. */
export async function installMugenStage(ikemenDir: string, entry: MugenStage, archive: string): Promise<InstalledStage> {
  const sum = await sha256(archive);
  if (sum !== entry.sha256) throw new Error(`${entry.file}: checksum ${sum} does not match the recipe's ${entry.sha256}`);
  const dest = path.join(ikemenDir, "stages", entry.id);
  const marker = path.join(dest, MARKER);
  const defPath = `stages/${entry.id}/${entry.id}.def`;
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { sha256?: string; name?: string };
    if (previous.sha256 === entry.sha256 && previous.name === entry.name) return { defPath, status: "unchanged", changed: {}, missing: [] };
  }
  const tmp = `${dest}.tmp-${process.pid}`;
  const staged = `${tmp}-stage`;
  try {
    const problems = await unpack(archive, tmp);
    if (problems.length) throw new Error(`${entry.file}: couldn't unpack: ${problems[0]}`);
    const found = await listFiles(tmp);
    const removed = found.filter((f) => PROGRAM_FILES.test(f));
    const all = found.filter((f) => !PROGRAM_FILES.test(f));
    const defs = await stageDefs(tmp, all);
    const def = entry.def ? defs.find((d) => d.toLowerCase() === entry.def!.toLowerCase()) : defs.length === 1 ? defs[0] : undefined;
    if (!def) throw new Error(`${entry.file}: ${defs.length ? `${defs.length} stages inside (${defs.join(", ")}); say which with "def"` : "no stage .def inside"}`);
    // The stage's own folder becomes stages/<id>/.
    const dir = path.posix.dirname(def);
    const inFolder = all.filter((f) => dir === "." || f.startsWith(`${dir}/`)).map((f) => (dir === "." ? f : f.slice(dir.length + 1)));
    const fixed = fixStagePaths(await readDef(path.join(tmp, def)), inFolder);
    if (fixed.missing.some((m) => m.startsWith("spr"))) throw new Error(`${entry.file}: its sprites aren't in the archive (${fixed.missing.join(", ")})`);
    await rm(staged, { recursive: true, force: true });
    await cp(dir === "." ? tmp : path.join(tmp, dir), staged, { recursive: true });
    for (const f of removed) await rm(path.join(staged, dir === "." ? f : f.slice(dir.length + 1)), { force: true });
    await rm(path.join(staged, path.posix.basename(def)));
    await writeFile(path.join(staged, `${entry.id}.def`), patchIni(fixed.text, "Info", { name: `"${entry.name}"`, displayname: `"${entry.name}"` }), "latin1");
    await writeFile(path.join(staged, MARKER), JSON.stringify({ id: entry.id, name: entry.name, sha256: entry.sha256, source: entry.source, generatedBy: "pnpm mugen:import" }, null, 2) + "\n");
    await rm(dest, { recursive: true, force: true });
    await rename(staged, dest);
    return { defPath, status: "installed", changed: fixed.changed, missing: fixed.missing, ...(removed.length ? { removed } : {}) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await rm(staged, { recursive: true, force: true });
  }
}

/** The roster entry for an imported stage: never cleared for commercial use. */
export function stageRosterEntry(entry: MugenStage, defPath: string): StageEntry {
  return {
    id: entry.id,
    displayName: entry.name,
    def: defPath,
    license: `MUGEN stage by ${entry.author}, from ${entry.source}. Not cleared for commercial use (fan-made, often from commercial games); off stream while GI_COMMERCIAL_ONLY=true.`,
    commercialUse: false,
    enabled: true,
    notes: "Added by pnpm mugen:import (mugen.json stages).",
  };
}
