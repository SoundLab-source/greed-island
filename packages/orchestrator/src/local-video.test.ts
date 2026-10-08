import { describe, expect, it } from "vitest";
import { gameCrop } from "@greed-island/engine";
import { ObsLocalVideo, loadLocalVideo } from "./local-video.ts";
import type { ObsClient, ObsConfig } from "./obs.ts";

const cfg: ObsConfig = { url: "ws://obs", password: null, fightScene: "Fight", bettingScene: "Betting", reconnectMs: 10 };

/** A stand-in OBS that records requests and answers the ones the local video sends. `windowWorks` says whether a window capture shows frames. */
function fakeObs(opts: { camera?: boolean; windowWorks?: boolean } = {}) {
  const sent: { type: string; data?: Record<string, unknown> }[] = [];
  let camera = opts.camera ?? false;
  let inputs = ["Game capture", "Overlay: fight bar"];
  let created: Record<string, unknown> = {};
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
      };
      return answers[type]!() as T;
    },
    close: () => {},
  };
  return { sent, connect: async () => client, created: () => created };
}

const retina = { window: { x: 224, y: 170, width: 1280, height: 748, id: 177389 }, screen: { width: 1728, height: 1117 } };

describe("local video preview", () => {
  it("is off unless GI_LOCAL_VIDEO is true", () => {
    expect(loadLocalVideo({})).toBe(false);
    expect(loadLocalVideo({ GI_LOCAL_VIDEO: "true" })).toBe(true);
    expect(loadLocalVideo({ GI_LOCAL_VIDEO: "1" })).toBe(false);
  });

  it("crops a Retina screen capture to the game's picture, title bar left out", () => {
    // A 1280 x 748 point window: 720 of picture under a 28-point title bar; the capture is in pixels (2x).
    expect(gameCrop(retina.window, retina.screen, { width: 3456, height: 2234 })).toEqual({ cropLeft: 448, cropTop: 396, cropRight: 448, cropBottom: 398 });
  });

  it("switches the Virtual Camera on and captures the fight's window, title bar cut off", async () => {
    const obs = fakeObs();
    const video = new ObsLocalVideo(cfg, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await video.cropToGame()).toBe("window");
    expect(obs.sent.map((s) => s.type)).toContain("StartVirtualCam");
    // Created again on this window (keeping its display), at the bottom of the Fight scene.
    expect(obs.created()).toEqual({ display_uuid: "D1", type: 1, window: 177389, show_cursor: false });
    expect(obs.sent.find((s) => s.type === "SetSceneItemIndex")!.data).toMatchObject({ sceneName: "Fight", sceneItemIndex: 0 });
    // A 1280 x 748 point window captured at 2560 x 1496 pixels: 56 pixels of title bar.
    expect(obs.sent.at(-1)!.data!["sceneItemTransform"]).toMatchObject({ cropTop: 56, cropLeft: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: 1920, boundsHeight: 1080 });
    // The same window next time: nothing to change.
    expect(await video.cropToGame()).toBe("unchanged");
  });

  it("falls back to the whole screen cropped to the window when the window capture shows nothing", async () => {
    const obs = fakeObs({ windowWorks: false });
    const video = new ObsLocalVideo(cfg, { findWindow: async () => retina, connect: obs.connect, log: () => {}, settleMs: 50 });
    expect(await video.cropToGame()).toBe("screen");
    expect(obs.created()).toMatchObject({ type: 0 });
    expect(obs.sent.at(-1)!.data!["sceneItemTransform"]).toMatchObject({ cropLeft: 448, cropTop: 396, cropRight: 448, cropBottom: 398 });
  });

  it("gives up quietly when no game window appears", async () => {
    const obs = fakeObs({ camera: true });
    const video = new ObsLocalVideo(cfg, { findWindow: async () => null, connect: obs.connect, log: () => {}, windowWaitMs: 30, windowPollMs: 10 });
    expect(await video.cropToGame()).toBe("no window");
    expect(obs.sent).toEqual([]);
  });

  it("says once, not every fight, when OBS can't be reached, and again after it's worked", async () => {
    let closed = true;
    const obs = fakeObs();
    const logs: string[] = [];
    const video = new ObsLocalVideo(cfg, { findWindow: async () => retina, connect: () => (closed ? Promise.reject(new Error("connection closed (1006)")) : obs.connect()), log: (m) => logs.push(m), settleMs: 50 });
    expect(await video.cropToGame()).toBe("failed");
    expect(await video.cropToGame()).toBe("failed");
    expect(logs).toEqual(["Local video: couldn't point OBS at the game (connection closed (1006)); trying again each fight"]);
    closed = false;
    expect(await video.cropToGame()).toBe("window");
    closed = true;
    await video.cropToGame();
    expect(logs).toHaveLength(2);
  });

  it("keeps trying to switch the camera on while OBS is closed", async () => {
    let tries = 0;
    const logs: string[] = [];
    const video = new ObsLocalVideo(cfg, { connect: async () => (tries++, Promise.reject(new Error("closed"))), log: (m) => logs.push(m), retryMs: 5 });
    await video.ensureCamera();
    await new Promise((r) => setTimeout(r, 30));
    video.stop();
    expect(tries).toBeGreaterThan(1);
    expect(logs[0]).toMatch(/Virtual Camera/);
  });
});
