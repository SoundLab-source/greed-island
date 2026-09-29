/**
 * `live` and `sim` event sources: run IKEMEN GO for one fight and turn its
 * output into events and an outcome. Artifacts for every run are kept under
 * runs/<fightId>/: argv.json, config.ini, stdout.log, stderr.log, match.log
 * (-log output), events.ndjson and result.json.
 */
import { parseEngineEventLine, type EngineOutcome, type Side } from "@greed-island/shared";
import { spawn } from "node:child_process";
import { existsSync, openSync, closeSync } from "node:fs";
import { mkdir, open, writeFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { OutcomeTracker } from "../outcome.ts";
import type { EventSource, FightSpec, RunOptions } from "../types.ts";
import { buildArgs, runConfigIni, type RunPaths } from "./args.ts";
import { findIkemenBinary, isModInstalled, readBaseLife } from "./install.ts";
import { outcomeFromLog } from "./log.ts";

export interface IkemenSourceOptions {
  mode: "live" | "sim";
  ikemenDir: string;
  /** Absolute directory for per-fight artifacts. */
  runsDir: string;
  /** Kill the engine after this long (engine_timeout). */
  timeoutMs: number;
  aiLevel?: number;
  simSpeed?: number;
  extraArgs?: readonly string[];
  /** How often to read new events. */
  pollMs?: number;
  /** After match_end, how long to wait for the engine to exit before killing it. */
  postMatchGraceMs?: number;
  /** Between SIGTERM and SIGKILL. */
  killGraceMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** Reads complete lines appended to a file since the last call. */
class LineTail {
  private offset = 0;
  private partial = "";
  private handle: FileHandle | null = null;

  constructor(private readonly file: string) {}

  async read(): Promise<string[]> {
    if (!this.handle) {
      if (!existsSync(this.file)) return [];
      this.handle = await open(this.file, "r");
    }
    const lines: string[] = [];
    const buf = Buffer.alloc(64 * 1024);
    for (;;) {
      const { bytesRead } = await this.handle.read(buf, 0, buf.length, this.offset);
      if (bytesRead === 0) break;
      this.offset += bytesRead;
      const text = this.partial + buf.subarray(0, bytesRead).toString("utf8");
      const parts = text.split("\n");
      this.partial = parts.pop() ?? "";
      lines.push(...parts);
    }
    return lines;
  }

  async close(): Promise<void> {
    await this.handle?.close();
    this.handle = null;
  }
}

export function createIkemenSource(options: IkemenSourceOptions): EventSource {
  const pollMs = options.pollMs ?? 100;
  return {
    mode: options.mode,
    async run(spec: FightSpec, run: RunOptions = {}): Promise<EngineOutcome> {
      const dir = path.join(options.runsDir, spec.fightId);
      await mkdir(dir, { recursive: true });
      const paths: RunPaths = {
        events: path.join(dir, "events.ndjson"),
        log: path.join(dir, "match.log"),
        config: path.join(dir, "config.ini"),
        stats: path.join(dir, "stats.json"),
      };
      const finish = async (outcome: EngineOutcome, extra: Record<string, unknown> = {}) => {
        await writeFile(path.join(dir, "result.json"), JSON.stringify({ outcome, ...extra }, null, 2) + "\n");
        return outcome;
      };

      // Preflight: IKEMEN substitutes a dummy for a missing character instead
      // of failing, so check every file before launching.
      const binary = findIkemenBinary(options.ikemenDir, options.env);
      const missing = [spec.sides[1].defPath, spec.sides[2].defPath, spec.stage.defPath].filter(
        (rel) => !existsSync(path.join(options.ikemenDir, rel)),
      );
      if (!binary) return finish({ kind: "engine_crash", detail: `preflight: no IKEMEN binary in ${options.ikemenDir} (set IKEMEN_BIN)` });
      if (missing.length) return finish({ kind: "engine_crash", detail: `preflight: missing ${missing.join(", ")}` });
      if (!(await isModInstalled(options.ikemenDir))) {
        return finish({ kind: "engine_crash", detail: "preflight: event mod missing or outdated (run pnpm ikemen:install-mod)" });
      }

      const baseLife: Partial<Record<Side, number>> = {};
      for (const side of [1, 2] as const) {
        if (spec.sides[side].stats.lifePct !== 100) baseLife[side] = await readBaseLife(options.ikemenDir, spec.sides[side].defPath);
      }
      const built = buildArgs(spec, paths, { mode: options.mode, aiLevel: options.aiLevel ?? 8, simSpeed: options.simSpeed ?? 4, extraArgs: options.extraArgs ?? [] }, baseLife);
      await writeFile(paths.config, runConfigIni(spec.fightId));
      await writeFile(path.join(dir, "argv.json"), JSON.stringify({ binary, cwd: options.ikemenDir, argv: built.argv, ignoredStats: built.ignoredStats }, null, 2) + "\n");

      const outFd = openSync(path.join(dir, "stdout.log"), "w");
      const errFd = openSync(path.join(dir, "stderr.log"), "w");
      const tracker = new OutcomeTracker(spec.roundsToWin);
      const tail = new LineTail(paths.events);
      const startedAt = Date.now();
      let timedOut = false;
      let matchEndAt: number | null = null;

      const child = spawn(binary, built.argv, { cwd: options.ikemenDir, stdio: ["ignore", outFd, errFd], env: options.env ?? process.env });
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
        child.once("error", (error) => resolve({ code: null, signal: null, error }));
      });
      let exitInfo: Awaited<typeof exited> | null = null;
      void exited.then((info) => (exitInfo = info));

      const kill = async () => {
        if (exitInfo) return;
        child.kill("SIGTERM");
        const grace = sleep(options.killGraceMs ?? 3000).then(() => "grace" as const);
        if ((await Promise.race([exited.then(() => "exited" as const), grace])) === "grace") child.kill("SIGKILL");
        await exited;
      };

      const drain = async () => {
        for (const line of await tail.read()) {
          let event;
          try {
            event = parseEngineEventLine(line);
          } catch (err) {
            tracker.invalidate(`unreadable event line: ${line.slice(0, 200)} (${(err as Error).message.slice(0, 200)})`);
            continue;
          }
          if (!event) continue;
          tracker.push(event);
          if (event.type === "match_end" && matchEndAt === null) matchEndAt = Date.now();
          run.onEvent?.(event);
        }
      };

      try {
        while (!exitInfo) {
          await drain();
          if (run.signal?.aborted) {
            await kill();
            break;
          }
          if (Date.now() - startedAt > options.timeoutMs) {
            timedOut = true;
            await kill();
            break;
          }
          if (matchEndAt !== null && Date.now() - matchEndAt > (options.postMatchGraceMs ?? 30_000)) {
            await kill();
            break;
          }
          await Promise.race([exited, sleep(pollMs)]);
        }
        await exited;
        await drain();
      } finally {
        await tail.close();
        closeSync(outFd);
        closeSync(errFd);
      }

      const info = exitInfo as Awaited<typeof exited> | null;
      const exitDetail = info?.error
        ? `spawn failed: ${info.error.message}`
        : `exit code ${info?.code ?? "?"}${info?.signal ? `, signal ${info.signal}` : ""}`;
      const meta = { mode: options.mode, durationMs: Date.now() - startedAt, exit: exitDetail };

      if (timedOut) return finish({ kind: "engine_timeout", detail: `killed after ${options.timeoutMs} ms` }, meta);
      if (run.signal?.aborted) return finish({ kind: "engine_crash", detail: "aborted" }, meta);

      const outcome = tracker.outcome(exitDetail);
      if (outcome.kind === "engine_crash" && !tracker.finished && existsSync(paths.log)) {
        // Fallback: the Lua events are missing but the engine wrote -log.
        const fromLog = await outcomeFromLog(paths.log, spec.roundsToWin);
        if (fromLog) return finish(fromLog, { ...meta, source: "log" });
      }
      return finish(outcome, { ...meta, source: "events" });
    },
  };
}
