// `pnpm dev`: the orchestrator plus the API, SSE stream and dev page, in one
// process. ENGINE_MODE=fake (default, no IKEMEN) or live (needs IKEMEN_DIR).
import { createDb, loadRepoEnv } from "@greed-island/db";
import { createFakeSource, createIkemenSource, loadEngineConfig, type EventSource } from "@greed-island/engine";
import { loadConfig } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import { buildServer } from "../api/server.ts";
import { FightBus } from "../bus.ts";
import { loadOrchestratorConfig } from "../config.ts";
import { acquireOrchestratorLock } from "../lock.ts";
import { Orchestrator } from "../orchestrator.ts";
import { reconcile } from "../reconcile.ts";

loadRepoEnv();
const config = loadConfig();
const orch = loadOrchestratorConfig();
const engine = loadEngineConfig();

let source: EventSource;
if (engine.mode === "fake") {
  source = createFakeSource({ seed: randomUUID(), eventDelayMs: 700, drawRoundRate: 0.05, timeoutMs: 5_000 });
} else if (engine.mode === "live") {
  if (!engine.ikemenDir) throw new Error("ENGINE_MODE=live needs IKEMEN_DIR in .env");
  source = createIkemenSource({
    mode: "live",
    ikemenDir: engine.ikemenDir,
    runsDir: engine.runsDir,
    timeoutMs: engine.timeoutMs,
    aiLevel: engine.aiLevel,
    extraArgs: engine.extraArgs,
  });
} else {
  throw new Error("ENGINE_MODE=sim is only for roster:smoke; use fake or live");
}

const db = createDb();
const lock = await acquireOrchestratorLock(process.env["DATABASE_URL"]!);
const bus = new FightBus();
const deps = { db, config, orch, bus, now: () => new Date() };
for (const a of await reconcile(deps)) console.log(`reconciled fight #${a.number}: ${a.from} → ${a.to}`);

const app = await buildServer({ db, config, bus });
const host = process.env["GI_HOST"] ?? "127.0.0.1";
const port = Number(process.env["GI_PORT"] ?? 3000);
await app.listen({ host, port });
console.log(`Greed Island dev server: http://${host === "0.0.0.0" ? "localhost" : host}:${port}  (engine: ${engine.mode}, betting window ${orch.bettingWindowMs / 1000}s)`);

const orchestrator = new Orchestrator({ ...deps, source, log: (m) => console.log(m) });
const running = orchestrator.run();

let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  console.log("stopping (the current fight is voided and refunded)…");
  orchestrator.stop();
  await running;
  await app.close();
  await lock.release();
  await db.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
