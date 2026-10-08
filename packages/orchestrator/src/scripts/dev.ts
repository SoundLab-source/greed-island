// `pnpm dev`: the orchestrator plus the API, SSE stream and dev page, in one
// process. ENGINE_MODE=fake (default, no IKEMEN) or live (needs IKEMEN_DIR).
import { createDb, loadAuthConfig, loadRepoEnv } from "@greed-island/db";
import { createFakeSource, createIkemenSource, loadEngineConfig, pruneRuns, runsKeepMs, type EventSource } from "@greed-island/engine";
import { loadConfig } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadRateLimits } from "../api/security.ts";
import { buildServer, loadTwitchChannel } from "../api/server.ts";
import { loadMailer } from "../mail.ts";
import { FightBus } from "../bus.ts";
import { loadOrchestratorConfig } from "../config.ts";
import { acquireOrchestratorLock } from "../lock.ts";
import { loadObsConfig, ObsSceneSwitcher } from "../obs.ts";
import { loadLocalVideo, ObsLocalVideo } from "../local-video.ts";
import { BotPlayers, loadBotCount } from "../bots.ts";
import { Orchestrator } from "../orchestrator.ts";
import { isProduction, productionProblems } from "../production.ts";
import { reconcile } from "../reconcile.ts";
import { createCheckRunner } from "../submission-checks.ts";
import { loadLookStore } from "../look-images.ts";
import { syncLookSprites } from "../look-sprites.ts";
import { createOwnArtBuilder, syncCommunityBuilds } from "../own-art.ts";
import { loadSubmissionStore } from "../submission-store.ts";

loadRepoEnv();
if (isProduction()) {
  const problems = productionProblems();
  if (problems.length) {
    console.error(`GI_ENV=production, but these settings aren't ready for a public site:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/DEPLOY.md.`);
    process.exit(1);
  }
}
const config = loadConfig();
/** GI_TRUST_PROXY: "loopback" (default: a tunnel or proxy on this machine), "true", "false", or proxy addresses separated by commas. */
function loadTrustProxy(): boolean | string[] | string {
  const v = process.env["GI_TRUST_PROXY"]?.trim();
  if (!v) return "loopback";
  if (v === "true" || v === "false") return v === "true";
  return v.split(",").map((x) => x.trim()).filter(Boolean);
}
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
    bringToFront: engine.bringToFront,
    sound: engine.sound,
  });
} else {
  throw new Error("ENGINE_MODE=sim is only for roster:smoke; use fake or live");
}

// Fight artifacts (runs/<fightId>/, and runs/checks/<fightId>/ from the submission checks) are kept
// GI_RUNS_KEEP_DAYS days (default 7), checked hourly.
const keepRuns = runsKeepMs();
const checkRunsDir = path.join(engine.runsDir, "checks");
const prune = () =>
  Promise.all([engine.runsDir, checkRunsDir].map((dir) => pruneRuns(dir, keepRuns).then((n) => n && console.log(`pruned ${n} old fight folder${n === 1 ? "" : "s"} from ${dir}`))))
    .catch((e) => console.warn(`couldn't prune ${engine.runsDir}: ${e.message}`));
await prune();
const pruneTimer = setInterval(prune, 3_600_000);

const db = createDb();
const lock = await acquireOrchestratorLock(process.env["DATABASE_URL"]!, (err) => {
  console.error(`lost the database connection that holds the orchestrator lock (${err.message}); stopping so the supervisor can restart (the fight in progress is voided on restart)`);
  void shutdown(1);
});
const bus = new FightBus();
const deps = { db, config, orch, bus, now: () => new Date() };
for (const a of await reconcile(deps)) console.log(`reconciled fight #${a.number}: ${a.from} → ${a.to}`);

// Characters built from stored images, built again when missing (a new or cleaned-up engine folder) before
// the first fight: released fighters drawn by their communities, then NFT looks (which use those fighters' files).
const submissionStore = loadSubmissionStore();
if (engine.ikemenDir) {
  for (const problem of await syncCommunityBuilds(db, engine.ikemenDir, createOwnArtBuilder(engine.ikemenDir, submissionStore))) console.warn(`community fighter: ${problem}`);
  for (const problem of await syncLookSprites(db, engine.ikemenDir, loadLookStore())) console.warn(`NFT look: ${problem}`);
}

const host = process.env["GI_HOST"] ?? "127.0.0.1";
const port = Number(process.env["GI_PORT"] ?? 3000);
const publicUrl = process.env["GI_PUBLIC_URL"] ?? `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;
// The automatic checks on submitted fighters (docs/PHASE3.md step 4) run fast sim fights in the
// background, a few at a time, whatever engine the stream itself uses.
const checkParallel = Number(process.env["GI_CHECK_PARALLEL"] ?? 2);
if (!Number.isInteger(checkParallel) || checkParallel < 1 || checkParallel > 16) throw new Error(`GI_CHECK_PARALLEL must be a whole number from 1 to 16, got "${process.env["GI_CHECK_PARALLEL"]}"`);
const checks = config.checks.enabled
  ? createCheckRunner(
      db,
      {
        source: engine.ikemenDir
          ? createIkemenSource({ mode: "sim", ikemenDir: engine.ikemenDir, runsDir: checkRunsDir, timeoutMs: engine.simTimeoutMs, aiLevel: engine.aiLevel, simSpeed: 100, extraArgs: engine.extraArgs })
          : null,
        settings: config.checks,
        parallel: checkParallel,
        // A submission whose sprite sheet is drawn on its archetype's guide is built and checked as itself.
        ...(engine.ikemenDir ? { ownArt: createOwnArtBuilder(engine.ikemenDir, submissionStore) } : {}),
      },
      {
        onDone: (c) => console.log(`submission check ${c.status.toLowerCase()}${c.error ? `: ${c.error}` : ""}`),
        onError: (e) => console.error(`submission checks: ${(e as Error).message}`),
      },
    )
  : null;
const app = await buildServer({ db, config, bus, mailer: loadMailer(), publicUrl, auth: loadAuthConfig(), twitchChannel: loadTwitchChannel(), localVideo: loadLocalVideo(), ikemenDir: engine.ikemenDir, rateLimits: loadRateLimits(), trustProxy: loadTrustProxy(), submissionStore, ...(checks ? { onCheckQueued: checks.poke } : {}) });
await app.listen({ host, port });
console.log(`Greed Island dev server: http://${host === "0.0.0.0" ? "localhost" : host}:${port}  (engine: ${engine.mode}, betting window ${orch.bettingWindowMs / 1000}s)`);

console.log(`Player site: ${publicUrl}/ · stream overlay for OBS: ${publicUrl}/overlay.html (see docs/SETUP.md §5) · dev page: ${publicUrl}/dev.html`);

// Optional: switch OBS scenes between fight and betting (GI_OBS_URL).
const obsConfig = loadObsConfig();
const obs = obsConfig ? new ObsSceneSwitcher(obsConfig) : null;
obs?.start(bus);
// The local preview: OBS's Virtual Camera on the watch page, cropped to each fight's window.
const localVideo = obsConfig && loadLocalVideo() ? new ObsLocalVideo(obsConfig) : null;
if (loadLocalVideo() && !obsConfig) console.log("GI_LOCAL_VIDEO needs OBS: set GI_OBS_URL (and GI_OBS_PASSWORD)");
localVideo?.start(bus);

await checks?.start();

// Bot players bet on every fight so the watch page is never empty (GI_BOTS, 0 turns them off).
const botCount = loadBotCount();
const bots = botCount > 0 ? new BotPlayers({ db, config, bus, count: botCount, log: (m) => console.warn(m) }) : null;
await bots?.ensure();
bots?.start();
if (bots) console.log(`${botCount} bot players bet alongside everyone (GI_BOTS)`);

const orchestrator = new Orchestrator({ ...deps, source, log: (m) => console.log(m) });
const running = orchestrator.run();

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  // Never hang on the way out (e.g. the database is down): give up after 10 s.
  setTimeout(() => process.exit(code || 1), 10_000).unref();
  console.log("stopping (the current fight is voided and refunded)…");
  orchestrator.stop();
  clearInterval(pruneTimer);
  // Each step on its own: one failing (say, the database is gone) mustn't skip the rest.
  const step = (p: Promise<unknown> | unknown) => Promise.resolve(p).catch((e: Error) => console.error(`while stopping: ${e.message}`));
  await step(running);
  await step(checks?.stop());
  obs?.stop();
  localVideo?.stop();
  bots?.stop();
  await step(app.close());
  await step(lock.release());
  await step(db.$disconnect());
  process.exit(code);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
// Closing the Terminal window it runs in (e.g. "Start Greed Island.command").
process.on("SIGHUP", () => void shutdown());
