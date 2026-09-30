import { DEFAULT_STATS, type EngineEvent } from "@greed-island/shared";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FightSpec } from "../types.ts";
import { installMod } from "./install.ts";
import { createIkemenSource } from "./runner.ts";

let root: string;
let ikemenDir: string;
let runsDir: string;
let binary: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "gi-runner-"));
  ikemenDir = path.join(root, "ikemen");
  runsDir = path.join(root, "runs");
  for (const rel of ["chars/a/a.def", "chars/b/b.def", "stages/s.def"]) {
    await mkdir(path.dirname(path.join(ikemenDir, rel)), { recursive: true });
    await writeFile(path.join(ikemenDir, rel), "[Info]\n");
  }
  await mkdir(path.join(ikemenDir, "chars", "c"), { recursive: true });
  await writeFile(path.join(ikemenDir, "chars", "c", "c.def"), "[Info]\nname = C\n[Files]\ncns = c.cns\n");
  await writeFile(path.join(ikemenDir, "chars", "c", "c.cns"), "[Data]\nlife = 1000\nattack = 100\ndefence = 100\n");
  await installMod(ikemenDir);
  const stub = fileURLToPath(new URL("./test/stub-engine.mjs", import.meta.url));
  binary = path.join(root, "fake-ikemen");
  await writeFile(binary, `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`);
  await chmod(binary, 0o755);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const spec = (fightId: string, stage = "stages/s.def"): FightSpec => ({
  fightId,
  sides: {
    1: { characterId: "c1", fighterId: "a", defPath: "chars/a/a.def", palette: 1, stats: { ...DEFAULT_STATS } },
    2: { characterId: "c2", fighterId: "b", defPath: "chars/b/b.def", palette: 2, stats: { ...DEFAULT_STATS } },
  },
  stage: { id: "s", defPath: stage },
  roundsToWin: 2,
});

function source(mode: string, timeoutMs = 10_000, extra: Partial<Parameters<typeof createIkemenSource>[0]> = {}) {
  return createIkemenSource({
    mode: "sim",
    ikemenDir,
    runsDir,
    timeoutMs,
    pollMs: 20,
    killGraceMs: 200,
    postMatchGraceMs: 300,
    env: { ...process.env, IKEMEN_BIN: binary, STUB_MODE: mode },
    ...extra,
  });
}

describe("ikemen runner", () => {
  it("streams events and finishes; saves all artifacts; runs in IKEMEN_DIR", async () => {
    const events: EngineEvent[] = [];
    const outcome = await source("ok").run(spec("ok"), { onEvent: (e) => events.push(e) });
    expect(outcome).toMatchObject({ kind: "finished", winnerSide: 1 });
    expect(events.map((e) => e.type)).toEqual(["match_start", "round_start", "round_end", "round_start", "round_end", "round_start", "round_end", "match_end"]);
    const dir = path.join(runsDir, "ok");
    expect(await readFile(path.join(dir, "stdout.log"), "utf8")).toContain(`stub cwd=`);
    expect(await readFile(path.join(dir, "config.ini"), "utf8")).toContain("salty_events");
    expect(JSON.parse(await readFile(path.join(dir, "argv.json"), "utf8")).argv).toContain("-salty.events");
    expect(JSON.parse(await readFile(path.join(dir, "result.json"), "utf8"))).toMatchObject({ outcome: { kind: "finished" }, source: "events" });
  });

  it("reports a crash when the engine exits without match_end", async () => {
    const outcome = await source("crash").run(spec("crash"));
    expect(outcome).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/exit code 3/) });
    expect(await readFile(path.join(runsDir, "crash", "stderr.log"), "utf8")).toContain("simulated crash");
  });

  it("kills a hung engine (escalating to SIGKILL) and reports a timeout", async () => {
    const started = Date.now();
    const outcome = await source("hang", 500).run(spec("hang"));
    expect(outcome.kind).toBe("engine_timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("falls back to -log when the event mod wrote nothing", async () => {
    const outcome = await source("log-only").run(spec("log"));
    expect(outcome).toMatchObject({ kind: "finished", winnerSide: 2 });
    expect(JSON.parse(await readFile(path.join(runsDir, "log", "result.json"), "utf8")).source).toBe("log");
  });

  it("reports a closed game window as a stopped match, not a draw", async () => {
    const outcome = await source("closed").run(spec("closed"));
    expect(outcome).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/stopped before anyone won/) });
  });

  it("brings the game window forward once, only when asked", async () => {
    const pids: number[] = [];
    const activate = (pid: number) => pids.push(pid);
    await source("linger", 10_000, { bringToFront: true, bringToFrontDelayMs: 20, activate }).run(spec("front"));
    expect(pids).toHaveLength(1);
    expect(pids[0]).toBeGreaterThan(0);
    await source("linger", 10_000, { activate }).run(spec("no-front"));
    expect(pids).toHaveLength(1);
    // A game that's already gone isn't activated.
    await source("ok", 10_000, { bringToFront: true, bringToFrontDelayMs: 2_000, activate }).run(spec("gone"));
    expect(pids).toHaveLength(1);
  });

  it("treats unreadable event lines as a crash", async () => {
    const outcome = await source("garbage").run(spec("garbage"));
    expect(outcome).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/unreadable event line/) });
  });

  it("keeps the result when the engine lingers after match_end", async () => {
    expect(await source("linger").run(spec("linger"))).toMatchObject({ kind: "finished", winnerSide: 1 });
  });

  it("launches a copy with scaled attack/defense for upgraded stats, and passes life as flags", async () => {
    const upgraded = spec("upgraded");
    upgraded.sides[1] = { ...upgraded.sides[1], defPath: "chars/c/c.def", stats: { ...DEFAULT_STATS, attackPct: 115, defensePct: 108, lifePct: 120 } };
    expect(await source("ok").run(upgraded)).toMatchObject({ kind: "finished" });
    const argv = JSON.parse(await readFile(path.join(runsDir, "upgraded", "argv.json"), "utf8"));
    const copy = argv.loadoutCopies["1"];
    expect(copy).toMatchObject({ from: "chars/c/c.def", attack: 115, defence: 108 });
    expect(argv.argv[argv.argv.indexOf("-p1") + 1]).toBe(copy.defPath);
    expect(argv.argv[argv.argv.indexOf("-p1.lifeMax") + 1]).toBe("1200");
    expect(argv.ignoredStats).toEqual({ 1: [], 2: [] });
    const cns = await readFile(path.join(ikemenDir, path.dirname(copy.defPath), "c.cns"), "latin1");
    expect(cns).toContain("attack = 115");
    expect(cns).toContain("defence = 108");
  });

  it("refuses to launch when a file is missing (IKEMEN would use a dummy)", async () => {
    const outcome = await source("ok").run(spec("missing", "stages/nope.def"));
    expect(outcome).toMatchObject({ kind: "engine_crash", detail: expect.stringMatching(/preflight: missing stages\/nope.def/) });
  });
});
