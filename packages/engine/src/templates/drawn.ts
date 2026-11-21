/**
 * Fighters drawn on the parts guide (rig/parts-sheet.ts): each is one PNG in
 * art/parts/ (committed: our own art) listed in packages/engine/drawn-fighters.json,
 * posed with a rig move set. `pnpm rig:import <drawing.png> --add "Name"`
 * checks a drawing, copies it in and adds it here and to roster.json.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rigFighter } from "../rig/fighter.ts";
import { readPartsSheet } from "../rig/parts-sheet.ts";
import { BRAWLER_MOVE_SET } from "./margin-call.ts";
import type { TemplateSpec } from "./spec.ts";

export interface DrawnFighterEntry {
  id: string;
  name: string;
  /** From the repo root, e.g. art/parts/hedge-hog.png. */
  file: string;
  sha256: string;
  /** Who drew it. */
  artist: string;
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const DRAWN_LIST = path.join(REPO_ROOT, "packages", "engine", "drawn-fighters.json");

/** A drawn fighter from its PNG's bytes, on the Brawler's move set (the only rig move set so far). */
export function drawnFighter(entry: DrawnFighterEntry, bytes: Uint8Array): TemplateSpec {
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== entry.sha256) throw new Error(`${entry.file}: checksum ${sha} does not match drawn-fighters.json`);
  const { design, problems } = readPartsSheet(bytes);
  if (problems.length) throw new Error(`${entry.file}: ${problems.join("; ")}`);
  // His specials keep the Brawler's plain names; the poses and effects are the move set's.
  const moves = Object.fromEntries(Object.entries(BRAWLER_MOVE_SET.moves).map(([state, m]) => [state, { poses: m.poses, strike: m.strike }]));
  return rigFighter({ ...BRAWLER_MOVE_SET, moves, id: entry.id, name: entry.name, design, outfits: [], credit: `Drawn by ${entry.artist} on the Greed Island parts guide (${entry.file})` });
}

export function loadDrawnFighters(file = DRAWN_LIST): TemplateSpec[] {
  const list = JSON.parse(readFileSync(file, "utf8")) as { fighters: DrawnFighterEntry[] };
  return list.fighters.map((e) => drawnFighter(e, readFileSync(path.join(REPO_ROOT, e.file))));
}
