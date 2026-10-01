import { mkdir, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pruneRuns, runsKeepMs } from "./prune-runs.ts";

let dir: string;
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("pruneRuns", () => {
  it("deletes old fight folders only", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "gi-runs-"));
    const old = "11111111-2222-3333-4444-555555555555";
    const fresh = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    for (const name of [old, fresh, "templates"]) await mkdir(path.join(dir, name));
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 86_400_000);
    await utimes(path.join(dir, old), tenDaysAgo, tenDaysAgo);
    await utimes(path.join(dir, "templates"), tenDaysAgo, tenDaysAgo);
    expect(await pruneRuns(dir, runsKeepMs({}), now)).toBe(1);
    expect((await readdir(dir)).sort()).toEqual([fresh, "templates"]);
    expect(await pruneRuns(path.join(dir, "missing"), 1, now)).toBe(0);
  });

  it("reads the keep period", () => {
    expect(runsKeepMs({ GI_RUNS_KEEP_DAYS: "2" })).toBe(2 * 86_400_000);
    expect(() => runsKeepMs({ GI_RUNS_KEEP_DAYS: "-1" })).toThrow(/positive/);
  });
});
