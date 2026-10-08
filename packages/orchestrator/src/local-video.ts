/**
 * Local preview of the fights inside the watch page (GI_LOCAL_VIDEO=true, on
 * the machine running OBS; docs/SETUP.md §5): OBS's Virtual Camera carries
 * what OBS shows (the Fight and Betting scenes the scene switcher picks), and
 * the watch page plays that camera instead of the Twitch player. Nothing goes
 * online. When each fight's window opens, OBS's capture is pointed at it
 * (`cropToGame`). Requests: GetVirtualCamStatus, StartVirtualCam,
 * GetInputList, GetInputSettings, RemoveInput, CreateInput,
 * SetSceneItemIndex, GetSceneItemTransform (sourceWidth, sourceHeight) and
 * SetSceneItemTransform (cropLeft, cropTop, cropRight, cropBottom, bounds);
 * obs-websocket protocol.md and src/utils/Obs_ObjectHelper.cpp.
 */
import { gameCrop, gameWindow, titleBarCrop } from "@greed-island/engine";
import type { FightBus } from "./bus.ts";
import { connectObs, type ObsClient, type ObsConfig } from "./obs.ts";
import { CANVAS } from "./obs-setup.ts";

/** GI_LOCAL_VIDEO: "true" shows OBS's Virtual Camera on the watch page instead of Twitch. */
export function loadLocalVideo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GI_LOCAL_VIDEO"]?.trim().toLowerCase() === "true";
}

/** The screen capture's name in the Fight scene (`pnpm obs:setup`). */
export const CAPTURE_SOURCE = "Game capture";

export interface LocalVideoDeps {
  findWindow?: typeof gameWindow;
  connect?: (cfg: Pick<ObsConfig, "url" | "password">) => Promise<ObsClient>;
  log?: (message: string) => void;
  /** How long to look for a fight's window after the fight starts, and how often. */
  windowWaitMs?: number;
  windowPollMs?: number;
  /** Wait between attempts to switch the Virtual Camera on while OBS is closed. */
  retryMs?: number;
  /** How long a re-created capture gets to show its first frame. */
  settleMs?: number;
}

export class ObsLocalVideo {
  private unsubscribe: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private cameraOn = false;
  private waitingReported = false;
  private lastCrop = "";
  /** The last failure to point OBS at the game, so one that repeats every fight (OBS closed) is said once. */
  private lastFailure: string | null = null;
  private readonly findWindow: typeof gameWindow;
  private readonly connect: NonNullable<LocalVideoDeps["connect"]>;
  private readonly log: (message: string) => void;

  constructor(
    private readonly cfg: ObsConfig,
    private readonly deps: LocalVideoDeps = {},
  ) {
    this.findWindow = deps.findWindow ?? gameWindow;
    this.connect = deps.connect ?? ((c) => connectObs(c));
    this.log = deps.log ?? ((m) => console.log(m));
  }

  /** Switch the Virtual Camera on (retrying until OBS is open), and crop to each fight's window. */
  start(bus: FightBus): void {
    this.unsubscribe = bus.subscribe((e) => {
      if (e.type === "fight_state" && e.state === "IN_PROGRESS") void this.cropToGame();
    });
    void this.ensureCamera();
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.retry) clearTimeout(this.retry);
  }

  /** Make sure OBS's Virtual Camera is on; if OBS can't be reached, try again later. */
  async ensureCamera(): Promise<void> {
    if (this.stopped || this.cameraOn) return;
    try {
      await this.withObs(async (obs) => this.cameraIn(obs));
    } catch (err) {
      if (!this.waitingReported) this.log(`Local video: can't switch on OBS's Virtual Camera yet (${(err as Error).message}); will keep trying`);
      this.waitingReported = true;
      if (!this.stopped) this.retry = setTimeout(() => void this.ensureCamera(), this.deps.retryMs ?? 15_000);
    }
  }

  /**
   * Wait for the fight's window, then point OBS at it. A window capture of just the game is best (it sees the
   * window even behind other apps), but OBS only finds windows it listed when the source was created (its
   * macOS capture builds that list on creation and in its Properties box, not on a settings change:
   * obs-studio plugins/mac-capture/mac-sck-video-capture.m), so the source is created again for each fight's
   * window. If that captures nothing, it falls back to the whole screen cropped to where the window is.
   */
  async cropToGame(): Promise<"window" | "screen" | "unchanged" | "no window" | "failed"> {
    const until = Date.now() + (this.deps.windowWaitMs ?? 10_000);
    let found = await this.findWindow();
    while (!found && Date.now() < until && !this.stopped) {
      await new Promise((r) => setTimeout(r, this.deps.windowPollMs ?? 500));
      found = await this.findWindow();
    }
    if (!found) return "no window";
    const where = found;
    const key = JSON.stringify(where.window);
    if (key === this.lastCrop) return "unchanged";
    try {
      const how = await this.withObs(async (obs) => {
        await this.cameraIn(obs);
        const settled = this.deps.settleMs ?? 2_000;
        if (where.window.id) {
          const item = await this.recreateCapture(obs, { type: 1, window: where.window.id, show_cursor: false });
          const size = await this.sourceSize(obs, item, settled);
          if (size) {
            await this.place(obs, item, titleBarCrop(where.window, size));
            this.lastCrop = key;
            return "window";
          }
          this.log("Local video: OBS's window capture shows nothing; filming the whole screen instead (keep the game in front)");
        }
        const item = await this.recreateCapture(obs, { type: 0 });
        const size = await this.sourceSize(obs, item, settled);
        if (!size) throw new Error(`"${CAPTURE_SOURCE}" isn't capturing anything`);
        await this.place(obs, item, gameCrop(where.window, where.screen, size));
        this.lastCrop = key;
        return "screen" as const;
      });
      this.lastFailure = null;
      return how;
    } catch (err) {
      const why = (err as Error).message;
      if (why !== this.lastFailure) this.log(`Local video: couldn't point OBS at the game (${why}); trying again each fight`);
      this.lastFailure = why;
      return "failed";
    }
  }

  /** Remove the capture source and create it again with these settings (keeping its others, like the display), at the bottom of the Fight scene. */
  private async recreateCapture(obs: ObsClient, settings: Record<string, unknown>): Promise<number> {
    const exists = async () => (await obs.request<{ inputs: { inputName: string }[] }>("GetInputList")).inputs.some((i) => i.inputName === CAPTURE_SOURCE);
    let kind = "screen_capture";
    let old: Record<string, unknown> = {};
    if (await exists()) {
      const current = await obs.request<{ inputKind: string; inputSettings: Record<string, unknown> }>("GetInputSettings", { inputName: CAPTURE_SOURCE });
      kind = current.inputKind;
      old = current.inputSettings;
      await obs.request("RemoveInput", { inputName: CAPTURE_SOURCE });
      // OBS removes a source a moment later.
      for (let i = 0; i < 50 && (await exists()); i++) await new Promise((r) => setTimeout(r, 100));
    }
    const { sceneItemId } = await obs.request<{ sceneItemId: number }>("CreateInput", { sceneName: this.cfg.fightScene, inputName: CAPTURE_SOURCE, inputKind: kind, inputSettings: { ...old, ...settings } });
    await obs.request("SetSceneItemIndex", { sceneName: this.cfg.fightScene, sceneItemId, sceneItemIndex: 0 });
    return sceneItemId;
  }

  /** The capture's size once it has frames (null if none came within `waitMs`). */
  private async sourceSize(obs: ObsClient, sceneItemId: number, waitMs: number): Promise<{ width: number; height: number } | null> {
    const until = Date.now() + waitMs;
    for (;;) {
      const { sceneItemTransform: t } = await obs.request<{ sceneItemTransform: { sourceWidth: number; sourceHeight: number } }>("GetSceneItemTransform", { sceneName: this.cfg.fightScene, sceneItemId });
      if (t.sourceWidth && t.sourceHeight) return { width: t.sourceWidth, height: t.sourceHeight };
      if (Date.now() >= until) return null;
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private async place(obs: ObsClient, sceneItemId: number, crop: Record<string, number>): Promise<void> {
    await obs.request("SetSceneItemTransform", {
      sceneName: this.cfg.fightScene,
      sceneItemId,
      sceneItemTransform: { ...crop, positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: CANVAS.width, boundsHeight: CANVAS.height },
    });
  }

  /** Checked every fight, so a restarted OBS gets its camera back. */
  private async cameraIn(obs: ObsClient): Promise<void> {
    const { outputActive } = await obs.request<{ outputActive: boolean }>("GetVirtualCamStatus");
    if (!outputActive) await obs.request("StartVirtualCam");
    if (!this.cameraOn || !outputActive) this.log("Local video: OBS's Virtual Camera is on (the watch page shows it instead of Twitch)");
    this.cameraOn = true;
  }

  private async withObs<T>(fn: (obs: ObsClient) => Promise<T>): Promise<T> {
    const obs = await this.connect({ url: this.cfg.url, password: this.cfg.password });
    try {
      return await fn(obs);
    } finally {
      obs.close();
    }
  }
}
