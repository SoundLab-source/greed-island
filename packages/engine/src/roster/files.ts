import { existsSync } from "node:fs";
import path from "node:path";
import type { Roster } from "./schema.ts";

/** roster.json entries whose .def file is missing from the IKEMEN install. */
export function missingDefFiles(roster: Roster, ikemenDir: string): string[] {
  const entries = [...roster.fighters, ...roster.stages];
  return entries.filter((e) => !existsSync(path.join(ikemenDir, e.def))).map((e) => `${e.id}: ${e.def}`);
}
