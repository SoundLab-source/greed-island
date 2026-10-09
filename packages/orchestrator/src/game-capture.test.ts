import { describe, expect, it } from "vitest";
import { gameCrop } from "@greed-island/engine";
import { ObsGameCapture, loadFollowGame, loadLocalVideo } from "./game-capture.ts";
import { FightBus } from "./bus.ts";
import type { ObsClient, ObsConfig } from "./obs.ts";

const cfg: ObsConfig = { url: "ws://obs", password: null, fightScene: "Fight", bettingScene: "Betting", reconnectMs: 10 };

/** A stand-in OBS that records requests and answers the ones the local video sends. `windowWorks` says whether a window capture shows frames. */
function fakeObs(opts: { camera?: boolean; windowWorks?: boolean } = {}) {
  const sent: { type: string; data?: Record<string, unknown> }[] = [];
  let camera = opts.camera ?? false;
  let inputs = ["Game capture", "Overlay: fight bar"];
  let created: Record<string, unknown> = {};
  let shown = true;
  const client: ObsClient = {
    request: async <T,>(type: string, data?: Record<string, unknown>) => {
      sent.push({ type, data });
      const size = created["type"] === 1 ? (opts.windowWorks === false ? [0, 0] : [2560, 1496]) : [3456, 2234];
      const answers: Record<string, () => unknown> = {
        GetVirtualCamStatus: () => ({ outputActive: camera }),
        StartVirtualCam: () => ((camera = true), {}),
        GetInputList: () => ({ inputs: inputs.map((inputName) => ({ inputName })) }),
        GetInputSettings: () => ({ inputKind: "screen_capture", inputSettings: { display_uuid: "D1", type: 0 } }),
        RemoveInput: () => ((inputs = inputs.filter((i) => i !== data!["inputName"])), {}),
        CreateInput: () => ((created = data!["inputSettings"] as Record<string, unknown>), inputs.push(String(data!["inputName"])), { sceneItemId: 7 }),
        SetSceneItemIndex: () => ({}),
        GetSceneItemTransform: () => ({ sceneItemTransform: { sourceWidth: size[0], sourceHeight: size[1] } }),
        SetSceneItemTransform: () => ({}),
        GetSceneItemId: () => ({ sceneItemId: 7 }),
        SetSceneItemEnabled: () => ((shown = Boolean(data!["sceneItemEnabled"])), {}),
      };
      return answers[type]!() as T;
    },
    close: () => {},
  };
  return { sent, connect: async () => client, created: () => created, shown: () => shown };
}

const retina = { window: { x: 224, y: 170, width: 1280, height: 748, id: 177389 }, screen: { width: 1728, height: 1117 } };

/** The local preview: Virtual Camera on, and the whole screen is fine as a fallback (it stays on this computer). */
const preview = { virtualCamera: true, screenFallback: true };
/** Streaming from a Mac in use: no camera, and never the whole screen. */
const stream = { virtualCamera: false, screenFallback: false };

describe("OBS films the game", () => {
  it("is off unless GI_LOCAL_VIDEO is true", () => {
    expect(loadLocalVideo({})).toBe(false);
    expect(loadLocalVideo({ GI_LOCAL_VIDEO: "true" })).toBe(true);
    expect(loadLocalVideo({ GI_LOCAL_VIDEO: "1" })).toBe(false);
  });

  it("follows the game unless GI_OBS_FOLLOW_GAME is false", () => {
    expect(loadFollowGame({})).toBe(true);
    expect(loadFollowGame({ GI_OBS_FOLLOW_GAME: "false" })).toBe(false);
  });

  it("films the fight's window for the stream, without the Virtual Camera", async () => {
    const obs = fakeObs();
    const capture = new ObsGameCapture(cfg, stream, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await capture.cropToGame()).toBe("window");
    expect(obs.sent.map((s) => s.type)).not.toContain("StartVirtualCam");
    expect(obs.sent.map((s) => s.type)).not.toContain("GetVirtualCamStatus");
    expect(obs.created()).toMatchObject({ type: 1, window: 177389 });
    // Hidden while it looked for the window, shown once the window is in it.
    const shows = obs.sent.filter((s) => s.type === "SetSceneItemEnabled").map((s) => s.data!["sceneItemEnabled"]);
    expect(shows).toEqual([false, true]);
    expect(obs.shown()).toBe(true);
  });

  it("never films the whole screen for the stream: shows no picture instead, and says so once", async () => {
    const obs = fakeObs({ windowWorks: false });
    const logs: string[] = [];
    const capture = new ObsGameCapture(cfg, stream, { findWindow: async () => retina, connect: obs.connect, log: (m) => logs.push(m), settleMs: 50 });
    expect(await capture.cropToGame()).toBe("hidden");
    expect(obs.created()).toMatchObject({ type: 1 });
    expect(obs.sent.some((s) => s.type === "CreateInput" && (s.data!["inputSettings"] as Record<string, unknown>)["type"] === 0)).toBe(false);
    expect(obs.shown()).toBe(false);
    expect(await capture.cropToGame()).toBe("hidden");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/never your whole screen/);
  });

  it("hides the capture as soon as it starts, before any fight, when the whole screen isn't safe", async () => {
    const obs = fakeObs();
    const capture = new ObsGameCapture(cfg, stream, { findWindow: async () => null, connect: obs.connect, log: () => {} });
    capture.start(new FightBus());
    await new Promise((r) => setTimeout(r, 20));
    capture.stop();
    expect(obs.shown()).toBe(false);
  });

  it("films the whole screen cropped to the game for the stream when the game is kept in front", async () => {
    const obs = fakeObs({ windowWorks: false });
    const capture = new ObsGameCapture(cfg, { virtualCamera: false, screenFallback: true }, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await capture.cropToGame()).toBe("screen");
    expect(obs.created()).toMatchObject({ type: 0 });
    expect(obs.shown()).toBe(true);
  });

  it("crops a Retina screen capture to the game's picture, title bar left out", () => {
    // A 1280 x 748 point window: 720 of picture under a 28-point title bar; the capture is in pixels (2x).
    expect(gameCrop(retina.window, retina.screen, { width: 3456, height: 2234 })).toEqual({ cropLeft: 448, cropTop: 396, cropRight: 448, cropBottom: 398 });
  });

  it("switches the Virtual Camera on and captures the fight's window, title bar cut off", async () => {
    const obs = fakeObs();
    const video = new ObsGameCapture(cfg, preview, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await video.cropToGame()).toBe("window");
    expect(obs.sent.map((s) => s.type)).toContain("StartVirtualCam");
    // Created again on this window (keeping its display), at the bottom of the Fight scene.
    expect(obs.created()).toEqual({ display_uuid: "D1", type: 1, window: 177389, show_cursor: false });
    expect(obs.sent.find((s) => s.type === "SetSceneItemIndex")!.data).toMatchObject({ sceneName: "Fight", sceneItemIndex: 0 });
    // A 1280 x 748 point window captured at 2560 x 1496 pixels: 56 pixels of title bar.
    expect(obs.sent.findLast((s) => s.type === "SetSceneItemTransform")!.data!["sceneItemTransform"]).toMatchObject({ cropTop: 56, cropLeft: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: 1920, boundsHeight: 1080 });
    // The same window next time: nothing to change.
    expect(await video.cropToGame()).toBe("unchanged");
  });

  it("falls back to the whole screen cropped to the window when the window capture shows nothing", async () => {
    const obs = fakeObs({ windowWorks: false });
    const video = new ObsGameCapture(cfg, preview, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await video.cropToGame()).toBe("screen");
    expect(obs.created()).toMatchObject({ type: 0 });
    expect(obs.sent.findLast((s) => s.type === "SetSceneItemTransform")!.data!["sceneItemTransform"]).toMatchObject({ cropLeft: 448, cropTop: 396, cropRight: 448, cropBottom: 398 });
  });

  it("gives up quietly when no game window appears", async () => {
    const obs = fakeObs({ camera: true });
    const video = new ObsGameCapture(cfg, preview, { findWindow: async () => null, connect: obs.connect, log: () => {}, windowWaitMs: 30, windowPollMs: 10 });
    expect(await video.cropToGame()).toBe("no window");
    expect(obs.sent).toEqual([]);
  });

  it("says once, not every fight, when OBS can't be reached, and again after it's worked", async () => {
    let closed = true;
    const obs = fakeObs();
    const logs: string[] = [];
    const video = new ObsGameCapture(cfg, preview, { findWindow: async () => retina, connect: () => (closed ? Promise.reject(new Error("connection closed (1006)")) : obs.connect()), log: (m) => logs.push(m), settleMs: 50 });
    expect(await video.cropToGame()).toBe("failed");
    expect(await video.cropToGame()).toBe("failed");
    expect(logs).toEqual(["OBS: couldn't point the capture at the game (connection closed (1006)); trying again each fight"]);
    closed = false;
    expect(await video.cropToGame()).toBe("window");
    closed = true;
    await video.cropToGame();
    expect(logs).toHaveLength(2);
  });

  it("keeps trying to switch the camera on while OBS is closed", async () => {
    let tries = 0;
    const logs: string[] = [];
    const video = new ObsGameCapture(cfg, preview, { connect: async () => (tries++, Promise.reject(new Error("closed"))), log: (m) => logs.push(m), retryMs: 5 });
    await video.ensureCamera();
    await new Promise((r) => setTimeout(r, 30));
    video.stop();
    expect(tries).toBeGreaterThan(1);
    expect(logs[0]).toMatch(/Virtual Camera/);
  });
});
