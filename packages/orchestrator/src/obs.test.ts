import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket as ServerSocket } from "ws";
import { FightBus } from "./bus.ts";
import { connectObs, loadObsConfig, ObsSceneSwitcher, obsAuthentication, sceneForState, type ObsClient, type ObsConfig } from "./obs.ts";
import { setupObsScenes } from "./obs-setup.ts";
import type { FightState } from "./state-machine.ts";

/**
 * A stand-in for OBS's WebSocket server, following the obs-websocket 5
 * protocol doc: Hello (with auth challenge when a password is set), then
 * Identify, Identified, and SetCurrentProgramScene requests.
 */
class FakeObs {
  readonly server: WebSocketServer;
  readonly scenes: string[] = [];
  readonly identifies: Record<string, unknown>[] = [];
  protocols: string[] = [];
  private sockets = new Set<ServerSocket>();

  constructor(
    private readonly password: string | null,
    private readonly known = ["Fight", "Betting"],
    port = 0,
  ) {
    this.server = new WebSocketServer({ port, handleProtocols: (p) => (p.has("obswebsocket.json") ? "obswebsocket.json" : false) });
    this.server.on("connection", (ws, req) => {
      this.sockets.add(ws);
      this.protocols.push(String(req.headers["sec-websocket-protocol"]));
      const salt = "c2FsdA==";
      const challenge = "Y2hhbGxlbmdl";
      ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.5.2", rpcVersion: 1, ...(password ? { authentication: { challenge, salt } } : {}) } }));
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw)) as { op: number; d: Record<string, unknown> };
        if (msg.op === 1) {
          this.identifies.push(msg.d);
          // The documented algorithm, written out independently of the code under test.
          const secret = password ? createHash("sha256").update(password + salt).digest("base64") : null;
          const expected = secret ? createHash("sha256").update(secret + challenge).digest("base64") : undefined;
          if (msg.d["authentication"] !== expected) return ws.close(4009, "Authentication failed.");
          ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        }
        if (msg.op === 6) {
          const name = (msg.d["requestData"] as { sceneName: string }).sceneName;
          const ok = this.known.includes(name);
          if (ok) this.scenes.push(name);
          ws.send(
            JSON.stringify({
              op: 7,
              d: {
                requestType: msg.d["requestType"],
                requestId: msg.d["requestId"],
                requestStatus: ok ? { result: true, code: 100 } : { result: false, code: 600, comment: `No source was found by the name of \`${name}\`.` },
              },
            }),
          );
        }
      });
    });
  }

  get url() {
    return `ws://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close() {
    for (const s of this.sockets) s.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const until = async (check: () => boolean, ms = 2_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await sleep(10);
  }
};

const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const c of cleanup.splice(0).reverse()) await c();
});

function setup(obs: FakeObs, over: Partial<ObsConfig> = {}) {
  const bus = new FightBus();
  const logs: string[] = [];
  const switcher = new ObsSceneSwitcher({ url: obs.url, password: null, fightScene: "Fight", bettingScene: "Betting", reconnectMs: 30, ...over }, (m) => logs.push(m));
  switcher.start(bus);
  cleanup.push(() => switcher.stop());
  const state = (s: FightState) => bus.publish({ type: "fight_state", fightId: "f", number: 1, state: s, version: 0 });
  return { bus, logs, state };
}

describe("sceneForState", () => {
  it("shows the fight only while the engine runs", () => {
    expect(sceneForState("IN_PROGRESS")).toBe("fight");
    for (const s of ["BETTING_OPEN", "SETTLED", "VOIDED"] as const) expect(sceneForState(s)).toBe("betting");
    for (const s of ["BOOKED", "LOCKED", "SETTLING", "VOIDING"] as const) expect(sceneForState(s)).toBeNull();
  });
});

describe("obsAuthentication", () => {
  it("follows the documented two-step hash and depends on every input", () => {
    const a = obsAuthentication("pw", "salt", "challenge");
    expect(a).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(obsAuthentication("pw2", "salt", "challenge")).not.toBe(a);
    expect(obsAuthentication("pw", "salt2", "challenge")).not.toBe(a);
    expect(obsAuthentication("pw", "salt", "challenge2")).not.toBe(a);
  });
});

describe("loadObsConfig", () => {
  it("is off without a URL and has default scene names", () => {
    expect(loadObsConfig({})).toBeNull();
    expect(loadObsConfig({ GI_OBS_URL: "ws://127.0.0.1:4455" })).toMatchObject({ password: null, fightScene: "Fight", bettingScene: "Betting" });
    expect(loadObsConfig({ GI_OBS_URL: "ws://x:1", GI_OBS_PASSWORD: "pw", GI_OBS_FIGHT_SCENE: "Game" })).toMatchObject({ password: "pw", fightScene: "Game" });
  });
});

describe("ObsSceneSwitcher", () => {
  it("authenticates, then switches scenes as fights start and end", async () => {
    const obs = new FakeObs("hunter2");
    cleanup.push(() => obs.close());
    const { logs, state } = setup(obs, { password: "hunter2" });
    await until(() => logs.some((l) => l.startsWith("OBS: connected")));
    expect(obs.protocols).toEqual(["obswebsocket.json"]);
    expect(obs.identifies[0]).toMatchObject({ rpcVersion: 1, eventSubscriptions: 0 });
    for (const s of ["BOOKED", "BETTING_OPEN", "LOCKED", "IN_PROGRESS", "SETTLING", "SETTLED", "BOOKED", "BETTING_OPEN"] as const) state(s);
    await until(() => obs.scenes.length >= 3);
    await sleep(50);
    // One request per change: a repeated "betting" isn't sent again.
    expect(obs.scenes).toEqual(["Betting", "Fight", "Betting"]);
  });

  it("keeps trying until OBS is up, then shows the scene it missed", async () => {
    const probe = new FakeObs(null);
    const port = (probe.server.address() as AddressInfo).port;
    const url = probe.url;
    await probe.close();
    const bus = new FightBus();
    const logs: string[] = [];
    const switcher = new ObsSceneSwitcher({ url, password: null, fightScene: "Fight", bettingScene: "Betting", reconnectMs: 30 }, (m) => logs.push(m));
    switcher.start(bus);
    cleanup.push(() => switcher.stop());
    bus.publish({ type: "fight_state", fightId: "f", number: 1, state: "IN_PROGRESS", version: 0 });
    await until(() => logs.some((l) => l.includes("can't connect")));
    await sleep(100);
    // Reported once, not on every retry.
    expect(logs.filter((l) => l.includes("can't connect"))).toHaveLength(1);
    const obs = new FakeObs(null, undefined, port);
    cleanup.push(() => obs.close());
    await until(() => obs.scenes.length === 1);
    expect(obs.scenes).toEqual(["Fight"]);
  });

  it("reports a wrong password and a missing scene without crashing", async () => {
    const locked = new FakeObs("right");
    cleanup.push(() => locked.close());
    const a = setup(locked, { password: "wrong" });
    await until(() => a.logs.some((l) => l.includes("wrong password")));

    const obs = new FakeObs(null, ["Betting"]);
    cleanup.push(() => obs.close());
    const b = setup(obs);
    await until(() => b.logs.some((l) => l.startsWith("OBS: connected")));
    b.state("IN_PROGRESS");
    await until(() => b.logs.some((l) => l.includes(`couldn't show scene "Fight"`)));
    b.state("SETTLED");
    await until(() => obs.scenes.length === 1);
    expect(obs.scenes).toEqual(["Betting"]);

    const open = new FakeObs("pw");
    cleanup.push(() => open.close());
    const c = setup(open);
    await until(() => c.logs.some((l) => l.includes("asks for a password")));
  });
});

describe("connectObs", () => {
  it("sends requests and returns their data, or a clear error", async () => {
    const server = new WebSocketServer({ port: 0, handleProtocols: () => "obswebsocket.json" });
    cleanup.push(() => new Promise<void>((r) => server.close(() => r())));
    server.on("connection", (ws) => {
      ws.send(JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
      ws.on("message", (raw) => {
        const m = JSON.parse(String(raw)) as { op: number; d: Record<string, unknown> };
        if (m.op === 1) ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
        if (m.op === 6) {
          const ok = m.d["requestType"] === "GetVersion";
          ws.send(
            JSON.stringify({
              op: 7,
              d: {
                requestType: m.d["requestType"],
                requestId: m.d["requestId"],
                requestStatus: ok ? { result: true, code: 100 } : { result: false, code: 204, comment: "Your request type is not valid." },
                ...(ok ? { responseData: { obsVersion: "32.2.2" } } : {}),
              },
            }),
          );
        }
      });
    });
    const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const obs = await connectObs({ url, password: null });
    cleanup.push(() => obs.close());
    expect(await obs.request("GetVersion")).toEqual({ obsVersion: "32.2.2" });
    await expect(obs.request("Nope")).rejects.toMatchObject({ name: "ObsRequestError", requestType: "Nope", code: 204 });
  });

  it("rejects a wrong password", async () => {
    const obs = new FakeObs("right");
    cleanup.push(() => obs.close());
    await expect(connectObs({ url: obs.url, password: "wrong" })).rejects.toThrow(/wrong password/);
  });
});

describe("setupObsScenes", () => {
  /** An in-memory OBS that answers the requests setup uses. */
  function memoryObs(kinds = ["browser_source", "screen_capture", "coreaudio_input_capture"]) {
    const scenes = new Map<string, string[]>([["Scene", []]]);
    const inputs = new Map<string, { kind: string; settings: Record<string, unknown> }>();
    const transforms: Record<string, unknown>[] = [];
    const refreshed: string[] = [];
    let program = "Scene";
    const calls: string[] = [];
    const client: ObsClient = {
      close: () => {},
      request: async <T,>(type: string, d: Record<string, unknown> = {}): Promise<T> => {
        calls.push(type);
        const r = (v: unknown) => v as T;
        switch (type) {
          case "GetVersion":
            return r({ obsVersion: "32.2.2", obsWebSocketVersion: "5.6.3", platformDescription: "macOS" });
          case "GetInputKindList":
            return r({ inputKinds: kinds });
          case "GetInputDefaultSettings":
            return r({ defaultInputSettings: { url: "", width: 800, height: 600, css: "" } });
          case "SetVideoSettings":
            return r({});
          case "GetSceneList":
            return r({ scenes: [...scenes.keys()].map((sceneName) => ({ sceneName })) });
          case "CreateScene":
            scenes.set(String(d["sceneName"]), []);
            return r({});
          case "GetInputList":
            return r({ inputs: [...inputs.entries()].filter(([, v]) => !d["inputKind"] || v.kind === d["inputKind"]).map(([inputName]) => ({ inputName })) });
          case "GetInputSettings":
            return r({ inputSettings: inputs.get(String(d["inputName"]))!.settings });
          case "PressInputPropertiesButton":
            refreshed.push(`${String(d["inputName"])}:${String(d["propertyName"])}`);
            return r({});
          case "CreateInput":
            inputs.set(String(d["inputName"]), { kind: String(d["inputKind"]), settings: d["inputSettings"] as Record<string, unknown> });
            scenes.get(String(d["sceneName"]))!.push(String(d["inputName"]));
            return r({});
          case "GetSceneItemId":
            return r({ sceneItemId: scenes.get(String(d["sceneName"]))!.indexOf(String(d["sourceName"])) + 1 });
          case "SetSceneItemTransform":
            transforms.push(d);
            return r({});
          case "SetCurrentProgramScene":
            program = String(d["sceneName"]);
            return r({});
          default:
            throw new Error(`unexpected ${type}`);
        }
      },
    };
    return { client, scenes, inputs, transforms, calls, refreshed, program: () => program };
  }
  const opts = { fightScene: "Fight", bettingScene: "Betting", overlayUrl: (s: string) => `http://127.0.0.1:3000/overlay.html?scene=${s}`, log: () => {} };

  it("adds both scenes with the capture under the fight bar and the betting screen, filling the canvas", async () => {
    const obs = memoryObs();
    await setupObsScenes(obs.client, opts);
    expect(obs.scenes.get("Fight")).toEqual(["Game capture", "Overlay: fight bar"]);
    expect(obs.scenes.get("Betting")).toEqual(["Overlay: betting screen"]);
    expect(obs.inputs.get("Game capture")!.kind).toBe("screen_capture");
    expect(obs.inputs.get("Overlay: fight bar")).toEqual({ kind: "browser_source", settings: { url: "http://127.0.0.1:3000/overlay.html?scene=fight", width: 1920, height: 1080 } });
    expect(obs.transforms).toHaveLength(3);
    expect(obs.transforms[0]).toMatchObject({ sceneItemTransform: { boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: 1920, boundsHeight: 1080 } });
    expect(obs.program()).toBe("Betting");
    // Both overlay sources are reloaded (not the screen capture), every run.
    expect(obs.refreshed).toEqual(["Overlay: fight bar:refreshnocache", "Overlay: betting screen:refreshnocache"]);
    // Running it again adds nothing.
    const before = obs.calls.length;
    await setupObsScenes(obs.client, opts);
    expect(obs.calls.slice(before)).not.toContain("CreateInput");
    expect(obs.calls.slice(before)).not.toContain("CreateScene");
  });

  it("stops with a clear message when OBS lacks a browser or screen capture source", async () => {
    await expect(setupObsScenes(memoryObs(["screen_capture"]).client, opts)).rejects.toThrow(/Browser source/);
    await expect(setupObsScenes(memoryObs(["browser_source"]).client, opts)).rejects.toThrow(/no screen capture source/);
  });
});
