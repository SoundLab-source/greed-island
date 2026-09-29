// `pnpm obs:setup`: create the "Fight" and "Betting" scenes in a running OBS,
// with a screen capture and the stream overlay (docs/SETUP.md §5). Needs
// GI_OBS_URL and GI_OBS_PASSWORD in .env. Safe to re-run: it only adds what's
// missing and never deletes anything.
import { loadRepoEnv } from "@greed-island/db";
import { connectObs, loadObsConfig, ObsRequestError, type ObsClient } from "../obs.ts";
import { setupObsScenes } from "../obs-setup.ts";

loadRepoEnv();
const cfg = loadObsConfig();
if (!cfg) {
  console.error("Set GI_OBS_URL (and GI_OBS_PASSWORD) in .env first; see docs/SETUP.md §5.");
  process.exit(1);
}
const host = process.env["GI_HOST"] ?? "127.0.0.1";
const port = Number(process.env["GI_PORT"] ?? 3000);
// The overlay is always loaded from this machine's dev server, not the public site.
const overlayBase = process.env["GI_OVERLAY_URL"] ?? `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/overlay.html`;
const site = process.env["GI_OVERLAY_SITE"];

let obs: ObsClient | null = null;
try {
  obs = await connectObs(cfg);
  await setupObsScenes(obs, {
    fightScene: cfg.fightScene,
    bettingScene: cfg.bettingScene,
    overlayUrl: (scene) => `${overlayBase}?scene=${scene}${site ? `&site=${encodeURIComponent(site)}` : ""}`,
  });
  console.log(`
Done. Next:
  1. macOS: allow Screen Recording for OBS (System Settings → Privacy & Security → Screen & System Audio Recording), then restart OBS.
  2. Run \`ENGINE_MODE=live pnpm dev\` (or plain \`pnpm dev\` to try the overlay with fake fights): OBS switches scenes by itself.
  3. The overlay loads from ${overlayBase}; it shows a blank page until \`pnpm dev\` is running.`);
} catch (err) {
  const e = err as Error;
  console.error(e instanceof ObsRequestError ? `OBS refused ${e.requestType}: ${e.message}` : e.message);
  if (e.message.includes("closed") || e.message.includes("didn't answer")) console.error("Is OBS open? Tools → WebSocket Server Settings must be enabled.");
  process.exitCode = 1;
} finally {
  obs?.close();
}
