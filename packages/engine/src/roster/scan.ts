/**
 * Draft roster entries from an IKEMEN install's chars/ and stages/ folders.
 * The output is a starting point for a human: archetypes are guesses and
 * anything without a recognizable license is disabled.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { iniValue, parseIni, type IniSections } from "./ini.ts";
import type { FighterEntry, StageEntry } from "./schema.ts";

export interface ScanResult {
  fighters: FighterEntry[];
  stages: StageEntry[];
  warnings: string[];
}

export const UNKNOWN_LICENSE = "UNKNOWN: no license found in the files. Check before use.";

/** Recognize common license statements in a readme. Returns null if none found. */
export function detectLicense(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  if (/creative commons/i.test(t) && /non-?commercial/i.test(t)) return "Creative Commons Non-Commercial (per readme). Not for monetized use.";
  if (/creative commons/i.test(t)) return "Creative Commons (per readme; check which variant).";
  if (/public domain/i.test(t)) return "Public domain (per readme).";
  if (/\bMIT License\b/i.test(t)) return "MIT (per readme).";
  return null;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
}

async function readText(file: string): Promise<string> {
  // .def files are usually ASCII or UTF-8; latin1 never throws on odd bytes.
  const buf = await readFile(file);
  const utf8 = buf.toString("utf8");
  return utf8.includes("�") ? buf.toString("latin1") : utf8;
}

async function listDir(dir: string): Promise<{ name: string; isDir: boolean }[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** A character .def has [Files] pointing at its constants or states. */
function isCharacterDef(ini: IniSections): boolean {
  return ["cns", "st", "cmd"].some((k) => iniValue(ini, "Files", k) !== undefined);
}

async function scanCharacter(charsDir: string, folder: string, warnings: string[]): Promise<FighterEntry | null> {
  const dir = path.join(charsDir, folder);
  const files = await listDir(dir);
  const defs = files.filter((f) => !f.isDir && f.name.toLowerCase().endsWith(".def"));
  // Prefer <folder>.def, then any .def that looks like a character.
  const ordered = [...defs].sort((a, b) => Number(b.name.toLowerCase() === `${folder.toLowerCase()}.def`) - Number(a.name.toLowerCase() === `${folder.toLowerCase()}.def`));
  for (const def of ordered) {
    const ini = parseIni(await readText(path.join(dir, def.name)));
    if (!isCharacterDef(ini)) continue;
    const name = iniValue(ini, "Info", "displayname") ?? iniValue(ini, "Info", "name") ?? folder;
    const author = iniValue(ini, "Info", "author") ?? "unknown author";
    let license: string | null = null;
    for (const f of files) {
      if (!f.isDir && /^(readme|license|licence)/i.test(f.name) && /\.(txt|md)$/i.test(f.name)) {
        license = detectLicense(await readText(path.join(dir, f.name)));
        if (license) break;
      }
    }
    if (!license) warnings.push(`chars/${folder}: no license found; drafted as disabled`);
    return {
      id: slugify(folder),
      displayName: name,
      archetype: "ALL_ROUNDER",
      rarity: "COMMON",
      def: `chars/${folder}/${def.name}`,
      license: license ? `By ${author}. ${license}` : `By ${author}. ${UNKNOWN_LICENSE}`,
      // Never assumed: set it to true by hand once the license is checked.
      commercialUse: false,
      enabled: license !== null,
      notes: "Drafted by roster:scan. Archetype is a guess: set it by hand.",
    };
  }
  warnings.push(`chars/${folder}: no character .def found`);
  return null;
}

async function scanStage(stagesDir: string, file: string): Promise<StageEntry | null> {
  const ini = parseIni(await readText(path.join(stagesDir, file)));
  // Stage defs have [StageInfo] or [Camera]; other .defs (storyboards, chars) are skipped.
  if (!ini.has("stageinfo") && !ini.has("camera")) return null;
  const name = iniValue(ini, "Info", "displayname") ?? iniValue(ini, "Info", "name") ?? file.replace(/\.def$/i, "");
  const author = iniValue(ini, "Info", "author") ?? "unknown author";
  return {
    id: slugify(file.replace(/\.def$/i, "")),
    displayName: name,
    def: `stages/${file}`,
    license: `By ${author}. ${UNKNOWN_LICENSE}`,
    enabled: false,
    notes: "Drafted by roster:scan. Stages rarely state a license: confirm it, then enable.",
  };
}

export async function scanIkemen(ikemenDir: string): Promise<ScanResult> {
  const warnings: string[] = [];
  const fighters: FighterEntry[] = [];
  const charsDir = path.join(ikemenDir, "chars");
  for (const entry of await listDir(charsDir)) {
    if (!entry.isDir) continue;
    const fighter = await scanCharacter(charsDir, entry.name, warnings);
    if (fighter) fighters.push(fighter);
  }
  const stages: StageEntry[] = [];
  const stagesDir = path.join(ikemenDir, "stages");
  for (const entry of await listDir(stagesDir)) {
    if (entry.isDir || !entry.name.toLowerCase().endsWith(".def")) continue;
    const stage = await scanStage(stagesDir, entry.name);
    if (stage) stages.push(stage);
  }
  if (fighters.length === 0) warnings.push(`no characters found under ${charsDir}`);
  if (stages.length === 0) warnings.push(`no stages found under ${stagesDir}`);
  return { fighters, stages, warnings };
}
