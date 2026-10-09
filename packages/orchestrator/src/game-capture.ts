/**
 * OBS films the game's window, not the whole screen (docs/obs-notes.md "Capturing only IKEMEN"): when each fight's
 * window opens, OBS's "Game capture" in the Fight scene is created again on that window, title bar cut off. That
 * films the game even behind other apps, so the Mac running the stream can be used meanwhile. On whenever OBS is
 * set up (GI_OBS_URL), on macOS; GI_OBS_FOLLOW_GAME=false leaves the capture as `pnpm obs:setup` made it.
 *
 * If a window capture shows nothing, the whole screen cropped to the game's window is filmed instead, but only when
 * that's safe: the game is kept in front (GI_GAME_TO_FRONT=true) or the picture stays on this computer (the local
 * preview). Otherwise the capture is hidden, so the stream never shows the rest of the screen; it's hidden too from
 * the moment a fight starts until its window is being filmed.
 *
 * The local preview (GI_LOCAL_VIDEO=true, on the machine running OBS; docs/SETUP.md §5) also switches on OBS's
 * Virtual Camera, which carries what OBS shows, and the watch page plays that camera instead of the Twitch player.
 * Nothing goes online.
 *
 * Requests: GetVirtualCamStatus, StartVirtualCam, GetInputList, GetInputSettings, RemoveInput, CreateInput,
 * SetSceneItemIndex, GetSceneItemTransform (sourceWidth, sourceHeight), SetSceneItemTransform (cropLeft, cropTop,
 * cropRight, cropBottom, bounds), GetSceneItemId and SetSceneItemEnabled; obs-websocket protocol.md and
 * src/utils/Obs_ObjectHelper.cpp.
 */
import { gameCrop, gameWindow, titleBarCrop } from "@greed-island/engine";
import type { FightBus } from "./bus.ts";
import { connectObs, type ObsClient, type ObsConfig } from "./obs.ts";
import { CANVAS } from "./obs-setup.ts";

/** GI_LOCAL_VIDEO: "true" shows OBS's Virtual Camera on the watch page instead of Twitch. */
export function loadLocalVideo(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GI_LOCAL_VIDEO"]?.trim().toLowerCase() === "true";
}

/** GI_OBS_FOLLOW_GAME: OBS films each fight's window (the default); "false" leaves the capture alone. */
export function loadFollowGame(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["GI_OBS_FOLLOW_GAME"]?.trim().toLowerCase() !== "false";
}

/** The screen capture's name in the Fight scene (`pnpm obs:setup`). */
export const CAPTURE_SOURCE = "Game capture";

export interface GameCaptureOptions {
  /** Switch on OBS's Virtual Camera for the watch page (the local preview). */
  virtualCamera: boolean;
  /** When a window capture shows nothing, film the whole screen cropped to the game instead of showing nothing. */
  screenFallback: boolean;
}

export interface GameCaptureDeps {
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

export class ObsGameCapture {
  private unsubscribe: (() => void) | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private cameraOn = false;
  private waitingReported = false;
  private lastCrop = "";
  /** The last failure to point OBS at the game, so one that repeats every fight (OBS closed) is said once. */
  private lastFailure: string | null = null;
  private readonly findWindow: typeof gameWindow;
  private readonly connect: NonNullable<GameCaptureDeps["connect"]>;
  private readonly log: (message: string) => void;
  /** Said once: the window capture showed nothing and the capture was hidden instead. */
  private hiddenReported = false;

  constructor(
    private readonly cfg: ObsConfig,
    private readonly opts: GameCaptureOptions,
    private readonly deps: GameCaptureDeps = {},
  ) {
    this.findWindow = deps.findWindow ?? gameWindow;
    this.connect = deps.connect ?? ((c) => connectObs(c));
    this.log = deps.log ?? ((m) => console.log(m));
  }

  /** Film each fight's window, and switch the Virtual Camera on for the local preview (retrying until OBS is open). */
  start(bus: FightBus): void {
    this.unsubscribe = bus.subscribe((e) => {
      if (e.type === "fight_state" && e.state === "IN_PROGRESS") void this.cropToGame();
    });
    if (this.opts.virtualCamera) void this.ensureCamera();
    // Until a fight's window is filmed, the capture may still be the whole screen `pnpm obs:setup` made.
    if (!this.opts.screenFallback) void this.withObs((obs) => this.show(obs, false)).catch(() => {});
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
      if (!this.waitingReported) this.log(`OBS: can't switch on the Virtual Camera yet (${(err as Error).message}); will keep trying`);
      this.waitingReported = true;
      if (!this.stopped) this.retry = setTimeout(() => void this.ensureCamera(), this.deps.retryMs ?? 15_000);
    }
  }

  /**
   * Wait for the fight's window, then point OBS at it. A window capture of just the game is best (it sees the
   * window even behind other apps), but OBS only finds windows it listed when the source was created (its
   * macOS capture builds that list on creation and in its Properties box, not on a settings change:
   * obs-studio plugins/mac-capture/mac-sck-video-capture.m), so the source is created again for each fight's
   * window. If that captures nothing: the whole screen cropped to where the window is, when that's safe
   * (`screenFallback`), or else no picture ("hidden").
   */
  async cropToGame(): Promise<"window" | "screen" | "hidden" | "unchanged" | "no window" | "failed"> {
    // The stream must never show the rest of the screen: hide the capture until this fight's window is in it.
    const hide = !this.opts.screenFallback;
    if (hide) await this.withObs((obs) => this.show(obs, false)).catch(() => {});
    const until = Date.now() + (this.deps.windowWaitMs ?? 10_000);
    let found = await this.findWindow();
    while (!found && Date.now() < until && !this.stopped) {
      await new Promise((r) => setTimeout(r, this.deps.windowPollMs ?? 500));
      found = await this.findWindow();
    }
    if (!found) return "no window";
    const where = found;
    const key = JSON.stringify(where.window);
    if (key === this.lastCrop) {
      if (hide) await this.withObs((obs) => this.show(obs, true)).catch(() => {});
      return "unchanged";
    }
    try {
      const how = await this.withObs(async (obs) => {
        if (this.opts.virtualCamera) await this.cameraIn(obs);
        const settled = this.deps.settleMs ?? 2_000;
        if (where.window.id) {
          const item = await this.recreateCapture(obs, { type: 1, window: where.window.id, show_cursor: false });
          const size = await this.sourceSize(obs, item, settled);
          if (size) {
            await this.place(obs, item, titleBarCrop(where.window, size));
            await this.show(obs, true);
            this.lastCrop = key;
            this.hiddenReported = false;
            return "window";
          }
        }
        if (!this.opts.screenFallback) {
          await this.show(obs, false);
          if (!this.hiddenReported) this.log("OBS: the window capture shows nothing, so the stream shows no picture of the fight (never your whole screen); GI_GAME_TO_FRONT=true films the screen with the game in front instead");
          this.hiddenReported = true;
          return "hidden" as const;
        }
        if (where.window.id) this.log("OBS: the window capture shows nothing; filming the whole screen instead (keep the game in front)");
        const item = await this.recreateCapture(obs, { type: 0 });
        const size = await this.sourceSize(obs, item, settled);
        if (!size) throw new Error(`"${CAPTURE_SOURCE}" isn't capturing anything`);
        await this.place(obs, item, gameCrop(where.window, where.screen, size));
        await this.show(obs, true);
        this.lastCrop = key;
        return "screen" as const;
      });
      this.lastFailure = null;
      return how;
    } catch (err) {
      const why = (err as Error).message;
      if (why !== this.lastFailure) this.log(`OBS: couldn't point the capture at the game (${why}); trying again each fight`);
      this.lastFailure = why;
      return "failed";
    }
  }

  /** Show or hide the capture in the Fight scene (nothing to do if it isn't there). */
  private async show(obs: ObsClient, visible: boolean): Promise<void> {
    const { inputs } = await obs.request<{ inputs: { inputName: string }[] }>("GetInputList");
    if (!inputs.some((i) => i.inputName === CAPTURE_SOURCE)) return;
    const { sceneItemId } = await obs.request<{ sceneItemId: number }>("GetSceneItemId", { sceneName: this.cfg.fightScene, sourceName: CAPTURE_SOURCE });
    await obs.request("SetSceneItemEnabled", { sceneName: this.cfg.fightScene, sceneItemId, sceneItemEnabled: visible });
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
    if (!this.cameraOn || !outputActive) this.log("OBS: the Virtual Camera is on (the watch page shows it instead of Twitch)");
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
