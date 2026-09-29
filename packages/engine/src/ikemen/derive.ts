/**
 * Derived characters: a copy of a character folder inside IKEMEN_DIR/chars
 * with a few constants changed. Used for the house variants (roster:variants)
 * and for per-fight copies that carry attack/defense upgrades.
 * The engine reads [Data] life/attack/defence, [Size] and [Velocity] from the
 * character's own constants file (src/char.go:4012-4025, 4057-4058, 4112-4114).
 */
import { existsSync } from "node:fs";
import { cp, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { iniValue, parseIni, patchIni } from "../roster/ini.ts";

export const MARKER = ".greed-island-variant.json";

export interface DeriveSpec {
  /** Source character .def, relative to IKEMEN_DIR (e.g. chars/kfm/kfm.def). */
  srcDefPath: string;
  /** New folder name under chars/ (the .def becomes <destId>.def). */
  destId: string;
  /** Changes when the spec changes; an unchanged folder is reused as is. */
  hash: string;
  /** [Info] values to set in the .def. */
  info?: Record<string, string>;
  /** Constants to set, by section: { Data: { attack: "115" } }. */
  constants?: Record<string, Record<string, string>>;
  generatedBy: string;
}

export interface DeriveResult {
  defPath: string;
  status: "built" | "unchanged";
}

/** Build (or reuse) a derived character. Never touches a folder it didn't create. */
export async function deriveCharacter(ikemenDir: string, spec: DeriveSpec): Promise<DeriveResult> {
  const srcDef = path.join(ikemenDir, spec.srcDefPath);
  const src = path.dirname(srcDef);
  const dest = path.join(ikemenDir, "chars", spec.destId);
  const defPath = `chars/${spec.destId}/${spec.destId}.def`;
  const marker = path.join(dest, MARKER);
  if (!existsSync(srcDef)) throw new Error(`base character not found: ${spec.srcDefPath}`);
  if (existsSync(dest)) {
    if (!existsSync(marker)) throw new Error(`${dest} exists and wasn't made by Greed Island; not touching it`);
    const previous = JSON.parse(await readFile(marker, "utf8")) as { hash?: string };
    if (previous.hash === spec.hash) {
      const now = new Date();
      await utimes(marker, now, now); // counts as recently used for pruneDerived
      return { defPath, status: "unchanged" };
    }
    await rm(dest, { recursive: true });
  }
  // Build in a temporary folder first so a crash never leaves a half-built character.
  const tmp = `${dest}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  await cp(src, tmp, { recursive: true });
  const defFile = path.join(tmp, `${spec.destId}.def`);
  await rename(path.join(tmp, path.basename(srcDef)), defFile);

  // Files are latin1 so bytes outside ASCII survive unchanged.
  let def = await readFile(defFile, "latin1");
  if (spec.info && Object.keys(spec.info).length > 0) def = patchIni(def, "Info", spec.info);
  await writeFile(defFile, def, "latin1");

  const cnsName = iniValue(parseIni(def), "Files", "cns");
  if (!cnsName) throw new Error(`${spec.srcDefPath} has no [Files] cns entry`);
  const cnsFile = path.join(tmp, cnsName);
  let cns = await readFile(cnsFile, "latin1");
  for (const [section, values] of Object.entries(spec.constants ?? {})) {
    if (Object.keys(values).length > 0) cns = patchIni(cns, section, values);
  }
  await writeFile(cnsFile, cns, "latin1");
  await writeFile(path.join(tmp, MARKER), JSON.stringify({ id: spec.destId, hash: spec.hash, source: spec.srcDefPath, generatedBy: spec.generatedBy }, null, 2) + "\n");
  await rename(tmp, dest);
  return { defPath, status: "built" };
}

export interface BaseConstants {
  life: number;
  attack: number;
  defence: number;
}

/** A character's own [Data] life/attack/defence (MUGEN defaults 1000/100/100 when missing). */
export async function readConstants(ikemenDir: string, defPath: string): Promise<BaseConstants> {
  const defFile = path.join(ikemenDir, defPath);
  const def = parseIni(await readFile(defFile, "latin1"));
  const cns = iniValue(def, "Files", "cns");
  if (!cns) return { life: 1000, attack: 100, defence: 100 };
  const constants = parseIni(await readFile(path.join(path.dirname(defFile), cns), "latin1"));
  const num = (key: string, fallback: number) => {
    const n = Number(iniValue(constants, "Data", key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return { life: num("life", 1000), attack: num("attack", 100), defence: num("defence", 100) };
}

/** Delete all but the newest `keep` folders whose name starts with `prefix` (only ones we made). */
export async function pruneDerived(ikemenDir: string, prefix: string, keep: number): Promise<number> {
  const chars = path.join(ikemenDir, "chars");
  const entries = await readdir(chars, { withFileTypes: true }).catch(() => []);
  const ours: { dir: string; mtime: number }[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith(prefix)) continue;
    const marker = path.join(chars, e.name, MARKER);
    if (!existsSync(marker)) continue;
    ours.push({ dir: path.join(chars, e.name), mtime: (await stat(marker)).mtimeMs });
  }
  ours.sort((a, b) => b.mtime - a.mtime);
  const stale = ours.slice(keep);
  for (const s of stale) await rm(s.dir, { recursive: true, force: true });
  return stale.length;
}
