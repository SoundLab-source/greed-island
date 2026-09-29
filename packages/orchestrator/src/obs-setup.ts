/**
 * `pnpm obs:setup` logic: create the Fight and Betting scenes with a screen
 * capture and the stream overlay in a running OBS (docs/SETUP.md §5). Only
 * adds what's missing; never deletes or changes existing sources.
 */
import type { ObsClient } from "./obs.ts";

export const CANVAS = { width: 1920, height: 1080, fps: 60 } as const;

/** Screen capture input kinds by platform, most preferred first (checked against what OBS reports). */
export const CAPTURE_KINDS = ["screen_capture", "display_capture", "monitor_capture", "xshm_input", "pipewire-screen-capture-source"];

export interface ObsSetupOptions {
  fightScene: string;
  bettingScene: string;
  /** Overlay page URL for each scene. */
  overlayUrl: (scene: "fight" | "betting") => string;
  /**
   * Settings for a new screen capture source. macOS's `screen_capture`
   * captures nothing until a display is chosen (`display_uuid`); see
   * macDisplayCaptureSettings.
   */
  captureSettings?: (inputKind: string) => Promise<Record<string, unknown>>;
  log?: (line: string) => void;
}

/**
 * macOS: capture the main display. OBS leaves `display_uuid` empty by
 * default, which captures nothing ("Invalid target display ID: 0" in its
 * log). The display's UUID comes from CoreGraphics through macOS's built-in
 * JavaScript automation (osascript), so no extra tools are needed. Asking
 * OBS for its display list instead crashed OBS 32.2.2 (docs/obs-notes.md).
 */
export async function macDisplayCaptureSettings(inputKind: string): Promise<Record<string, unknown>> {
  if (process.platform !== "darwin" || inputKind !== "screen_capture") return {};
  const { execFile } = await import("node:child_process");
  const script =
    'ObjC.import("CoreGraphics"); ObjC.import("ColorSync");' +
    "ObjC.castRefToObject($.CFUUIDCreateString(null, $.CGDisplayCreateUUIDFromDisplayID($.CGMainDisplayID()))).js";
  const uuid = await new Promise<string>((resolve, reject) =>
    execFile("osascript", ["-l", "JavaScript", "-e", script], { timeout: 10_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))),
  );
  if (!/^[0-9A-F-]{36}$/i.test(uuid)) throw new Error(`unexpected display id "${uuid}"`);
  return { type: 0, display_uuid: uuid };
}

export async function setupObsScenes(obs: ObsClient, opts: ObsSetupOptions): Promise<void> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const { width: WIDTH, height: HEIGHT, fps } = CANVAS;
  const version = await obs.request<{ obsVersion: string; obsWebSocketVersion: string; platformDescription: string }>("GetVersion");
  log(`Connected to OBS ${version.obsVersion} (obs-websocket ${version.obsWebSocketVersion}) on ${version.platformDescription}`);

  const { inputKinds } = await obs.request<{ inputKinds: string[] }>("GetInputKindList");
  if (!inputKinds.includes("browser_source")) throw new Error("this OBS has no Browser source (browser_source); install the full OBS build");
  const capture = CAPTURE_KINDS.find((k) => inputKinds.includes(k));
  if (!capture) throw new Error(`no screen capture source found; OBS offers: ${inputKinds.join(", ")}`);
  const { defaultInputSettings } = await obs.request<{ defaultInputSettings: Record<string, unknown> }>("GetInputDefaultSettings", { inputKind: "browser_source" });
  for (const key of ["url", "width", "height"]) {
    if (!(key in defaultInputSettings)) throw new Error(`the Browser source has no "${key}" setting; this OBS version isn't supported by obs:setup`);
  }

  // A 1920x1080 canvas, matching the overlay's layout.
  try {
    await obs.request("SetVideoSettings", { baseWidth: WIDTH, baseHeight: HEIGHT, outputWidth: WIDTH, outputHeight: HEIGHT, fpsNumerator: fps, fpsDenominator: 1 });
    log(`Canvas set to ${WIDTH}x${HEIGHT} at ${fps} fps`);
  } catch (err) {
    log(`Canvas left as it is (${(err as Error).message}); stop streaming or recording to change it`);
  }

  const { scenes } = await obs.request<{ scenes: { sceneName: string }[] }>("GetSceneList");
  const have = new Set(scenes.map((s) => s.sceneName));
  for (const scene of [opts.fightScene, opts.bettingScene]) {
    if (have.has(scene)) log(`Scene "${scene}": already there`);
    else {
      await obs.request("CreateScene", { sceneName: scene });
      log(`Scene "${scene}": created`);
    }
  }

  const { inputs } = await obs.request<{ inputs: { inputName: string }[] }>("GetInputList");
  const existing = new Set(inputs.map((i) => i.inputName));
  const add = async (sceneName: string, inputName: string, inputKind: string, inputSettings: Record<string, unknown>) => {
    if (existing.has(inputName)) {
      log(`  "${inputName}": already there (not changed)`);
      return;
    }
    await obs.request("CreateInput", { sceneName, inputName, inputKind, inputSettings });
    // Fill the canvas, keeping the source's shape.
    const { sceneItemId } = await obs.request<{ sceneItemId: number }>("GetSceneItemId", { sceneName, sourceName: inputName });
    await obs.request("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: { positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: WIDTH, boundsHeight: HEIGHT },
    });
    log(`  "${inputName}": added`);
  };
  log(`Scene "${opts.fightScene}":`);
  let captureSettings: Record<string, unknown> = {};
  if (!existing.has("Game capture")) {
    try {
      captureSettings = (await opts.captureSettings?.(capture)) ?? {};
    } catch (err) {
      log(`  Couldn't pick a display automatically (${(err as Error).message}): in OBS, open "Game capture" and choose your screen`);
    }
  }
  await add(opts.fightScene, "Game capture", capture, captureSettings);
  await add(opts.fightScene, "Overlay: fight bar", "browser_source", { url: opts.overlayUrl("fight"), width: WIDTH, height: HEIGHT });
  log(`Scene "${opts.bettingScene}":`);
  await add(opts.bettingScene, "Overlay: betting screen", "browser_source", { url: opts.overlayUrl("betting"), width: WIDTH, height: HEIGHT });
  await obs.request("SetCurrentProgramScene", { sceneName: opts.bettingScene });
  await refreshOverlays(obs, log);
}

/**
 * Reload every Browser source showing the overlay. A browser source doesn't
 * retry by itself, so one created while `pnpm dev` wasn't running stays blank
 * until it's refreshed.
 */
export async function refreshOverlays(obs: ObsClient, log: (line: string) => void = (l) => console.log(l)): Promise<number> {
  const { inputs } = await obs.request<{ inputs: { inputName: string }[] }>("GetInputList", { inputKind: "browser_source" });
  let refreshed = 0;
  for (const { inputName } of inputs) {
    const { inputSettings } = await obs.request<{ inputSettings: { url?: string } }>("GetInputSettings", { inputName });
    if (!inputSettings.url?.includes("/overlay.html")) continue;
    await obs.request("PressInputPropertiesButton", { inputName, propertyName: "refreshnocache" });
    refreshed++;
  }
  log(`Reloaded ${refreshed} overlay source${refreshed === 1 ? "" : "s"}`);
  return refreshed;
}
