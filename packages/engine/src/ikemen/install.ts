/** Locating the IKEMEN binary and installing the event mod. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iniValue, parseIni } from "../roster/ini.ts";

/** The mod as committed in this repo. */
export const MOD_SOURCE = fileURLToPath(new URL("../../../../ikemen/mods/salty_events.lua", import.meta.url));
export const MOD_TARGET = path.join("external", "mods", "salty_events.lua");

const BINARIES: Record<string, string[]> = {
  darwin: [
    "I.K.E.M.E.N-Go.app/Contents/MacOS/Ikemen_GO_MacOSARM",
    "I.K.E.M.E.N-Go.app/Contents/MacOS/Ikemen_GO_MacOS",
    "Ikemen_GO_MacOSARM",
    "Ikemen_GO_MacOS",
    "bin/Ikemen_GO_MacOSARM",
    "bin/Ikemen_GO_MacOS",
  ],
  linux: ["Ikemen_GO_Linux", "bin/Ikemen_GO_Linux"],
  win32: ["Ikemen_GO.exe"],
};

/** IKEMEN_BIN if set, else the first known binary inside the install. */
export function findIkemenBinary(ikemenDir: string, env: NodeJS.ProcessEnv = process.env, platform = process.platform): string | null {
  const override = env["IKEMEN_BIN"];
  if (override) return existsSync(override) ? override : null;
  for (const rel of BINARIES[platform] ?? []) {
    const candidate = path.join(ikemenDir, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

export async function isModInstalled(ikemenDir: string): Promise<boolean> {
  const target = path.join(ikemenDir, MOD_TARGET);
  return existsSync(target) && (await sha256(target)) === (await sha256(MOD_SOURCE));
}

export async function installMod(ikemenDir: string): Promise<string> {
  const target = path.join(ikemenDir, MOD_TARGET);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(MOD_SOURCE, target);
  return target;
}

/** The fighter's base life from its constants file ([Data] life), default 1000. */
export async function readBaseLife(ikemenDir: string, defPath: string): Promise<number> {
  const defFile = path.join(ikemenDir, defPath);
  const def = parseIni(await readFile(defFile, "latin1"));
  const cns = iniValue(def, "Files", "cns");
  if (!cns) return 1000;
  const constants = parseIni(await readFile(path.join(path.dirname(defFile), cns), "latin1"));
  const life = Number(iniValue(constants, "Data", "life"));
  return Number.isFinite(life) && life > 0 ? life : 1000;
}
