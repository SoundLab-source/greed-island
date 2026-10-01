/**
 * Each fight leaves a folder of artifacts in runs/<fightId>/ (logs, events,
 * config): about 70 KB, so a stream running around the clock adds roughly
 * 30 MB a day. Folders older than the keep period are deleted; only folders
 * named like a fight id are touched (runs/templates and anything else stays).
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const FIGHT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function pruneRuns(runsDir: string, keepMs: number, now = Date.now()): Promise<number> {
  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory() || !FIGHT_ID.test(e.name)) continue;
    const dir = path.join(runsDir, e.name);
    const { mtimeMs } = await stat(dir);
    if (now - mtimeMs > keepMs) {
      await rm(dir, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}

/** GI_RUNS_KEEP_DAYS (default 7): how long fight artifacts are kept. */
export function runsKeepMs(env: NodeJS.ProcessEnv = process.env): number {
  const days = Number(env["GI_RUNS_KEEP_DAYS"] ?? 7);
  if (!Number.isFinite(days) || days <= 0) throw new Error(`GI_RUNS_KEEP_DAYS must be a positive number, got "${env["GI_RUNS_KEEP_DAYS"]}"`);
  return days * 86_400_000;
}
