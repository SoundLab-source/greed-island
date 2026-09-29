/**
 * OBS scene switching (docs/SETUP.md §5): while a fight is being fought, OBS
 * shows the fight scene (game capture plus the overlay's HUD); the rest of
 * the time, the betting scene. Talks to the obs-websocket v5 server built
 * into OBS (protocol: obsproject/obs-websocket docs/generated/protocol.md;
 * notes in docs/obs-notes.md). Off unless GI_OBS_URL is set. OBS being closed
 * or misconfigured is logged, never fatal: the stream keeps running.
 */
import { createHash, randomUUID } from "node:crypto";
import type { FightBus } from "./bus.ts";
import type { FightState } from "./state-machine.ts";

export interface ObsConfig {
  /** e.g. ws://127.0.0.1:4455 (OBS: Tools → WebSocket Server Settings). */
  url: string;
  password: string | null;
  fightScene: string;
  bettingScene: string;
  /** Wait between reconnection attempts. */
  reconnectMs: number;
}

export function loadObsConfig(env: NodeJS.ProcessEnv = process.env): ObsConfig | null {
  const url = env["GI_OBS_URL"]?.trim();
  if (!url) return null;
  return {
    url,
    password: env["GI_OBS_PASSWORD"] || null,
    fightScene: env["GI_OBS_FIGHT_SCENE"]?.trim() || "Fight",
    bettingScene: env["GI_OBS_BETTING_SCENE"]?.trim() || "Betting",
    reconnectMs: 5_000,
  };
}

/** obs-websocket 5 authentication: base64(sha256(base64(sha256(password + salt)) + challenge)). */
export function obsAuthentication(password: string, salt: string, challenge: string): string {
  const b64sha = (s: string) => createHash("sha256").update(s).digest("base64");
  return b64sha(b64sha(password + salt) + challenge);
}

/**
 * Which scene a fight state calls for. The fight scene only while the engine
 * runs; the betting scene when betting opens and once the fight is over.
 * Other states (booked, locked, settling, voiding) keep what's on screen.
 */
export function sceneForState(state: FightState): "fight" | "betting" | null {
  switch (state) {
    case "IN_PROGRESS":
      return "fight";
    case "BETTING_OPEN":
    case "SETTLED":
    case "VOIDED":
      return "betting";
    default:
      return null;
  }
}

/** obs-websocket op codes used here. */
const OP = { Hello: 0, Identify: 1, Identified: 2, Request: 6, RequestResponse: 7 } as const;
/** WebSocketCloseCode::AuthenticationFailed. */
const AUTH_FAILED = 4009;

type Socket = Pick<WebSocket, "send" | "close" | "readyState"> & {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type SocketFactory = (url: string, protocol: string) => Socket;

const defaultSocket: SocketFactory = (url, protocol) => new WebSocket(url, protocol) as unknown as Socket;

export class ObsSceneSwitcher {
  private socket: Socket | null = null;
  private identified = false;
  /** The scene OBS should show, and the last one we asked it for (null: unknown). */
  private wanted: string | null = null;
  private requested: string | null = null;
  private stopped = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Only report "can't reach OBS" once until it connects again. */
  private reported = false;
  private readonly pending = new Map<string, string>();

  constructor(
    private readonly cfg: ObsConfig,
    private readonly log: (message: string) => void = (m) => console.log(m),
    private readonly openSocket: SocketFactory = defaultSocket,
  ) {}

  /** Follow the fight states on the bus and connect to OBS. */
  start(bus: FightBus): void {
    this.unsubscribe = bus.subscribe((e) => {
      if (e.type !== "fight_state") return;
      const scene = sceneForState(e.state);
      if (scene) this.show(scene === "fight" ? this.cfg.fightScene : this.cfg.bettingScene);
    });
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.unsubscribe?.();
    this.socket?.close(1000);
  }

  private show(scene: string): void {
    this.wanted = scene;
    this.flush();
  }

  private flush(): void {
    if (!this.identified || !this.socket || this.wanted === null || this.wanted === this.requested) return;
    const requestId = randomUUID();
    this.pending.set(requestId, this.wanted);
    this.requested = this.wanted;
    this.send({ op: OP.Request, d: { requestType: "SetCurrentProgramScene", requestId, requestData: { sceneName: this.wanted } } });
  }

  private send(message: unknown): void {
    this.socket?.send(JSON.stringify(message));
  }

  private connect(): void {
    if (this.stopped) return;
    let socket: Socket;
    try {
      socket = this.openSocket(this.cfg.url, "obswebsocket.json");
    } catch (err) {
      this.report(`OBS: bad GI_OBS_URL ${this.cfg.url}: ${(err as Error).message}`);
      return;
    }
    this.socket = socket;
    this.identified = false;
    this.requested = null;
    socket.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as { op: number; d: Record<string, unknown> });
      } catch (err) {
        this.log(`OBS: unreadable message (${(err as Error).message})`);
      }
    };
    socket.onerror = () => {};
    socket.onclose = (ev) => {
      if (this.socket === socket) this.socket = null;
      const wasConnected = this.identified;
      this.identified = false;
      if (ev.code === AUTH_FAILED) this.report("OBS: wrong password (check GI_OBS_PASSWORD against OBS → Tools → WebSocket Server Settings), will keep trying");
      else if (wasConnected) this.log("OBS: disconnected, will retry");
      else this.report(`OBS: can't connect to ${this.cfg.url} (is OBS open with its WebSocket server on?), will keep trying`);
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), this.cfg.reconnectMs);
    };
  }

  private report(message: string): void {
    if (this.reported) return;
    this.reported = true;
    this.log(message);
  }

  private onMessage(msg: { op: number; d: Record<string, unknown> }): void {
    switch (msg.op) {
      case OP.Hello: {
        const auth = msg.d["authentication"] as { challenge: string; salt: string } | undefined;
        if (auth && !this.cfg.password) {
          this.report("OBS asks for a password: set GI_OBS_PASSWORD");
          this.socket?.close(1000);
          return;
        }
        // eventSubscriptions 0: we only send requests, so no events are needed.
        this.send({
          op: OP.Identify,
          d: { rpcVersion: 1, eventSubscriptions: 0, ...(auth ? { authentication: obsAuthentication(this.cfg.password!, auth.salt, auth.challenge) } : {}) },
        });
        return;
      }
      case OP.Identified:
        this.identified = true;
        this.reported = false;
        this.log(`OBS: connected (scenes "${this.cfg.fightScene}" and "${this.cfg.bettingScene}")`);
        this.flush();
        return;
      case OP.RequestResponse: {
        const id = String(msg.d["requestId"]);
        const scene = this.pending.get(id);
        this.pending.delete(id);
        const status = msg.d["requestStatus"] as { result: boolean; code: number; comment?: string };
        if (scene !== undefined && !status.result) {
          this.log(`OBS: couldn't show scene "${scene}" (${status.comment ?? `code ${status.code}`})`);
          // Try again on the next change.
          if (this.requested === scene) this.requested = null;
        }
        return;
      }
      default:
        return;
    }
  }
}

export class ObsRequestError extends Error {
  override name = "ObsRequestError";
  constructor(
    readonly requestType: string,
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ObsClient {
  request<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>): Promise<T>;
  close(): void;
}

/**
 * A one-off connection for scripts (e.g. `pnpm obs:setup`): connect,
 * identify, then send requests and await their responses.
 */
export function connectObs(cfg: Pick<ObsConfig, "url" | "password">, openSocket: SocketFactory = defaultSocket, timeoutMs = 10_000): Promise<ObsClient> {
  return new Promise((resolve, reject) => {
    const socket = openSocket(cfg.url, "obswebsocket.json");
    const waiting = new Map<string, { type: string; resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    const send = (m: unknown) => socket.send(JSON.stringify(m));
    const timer = setTimeout(() => {
      socket.close(1000);
      reject(new Error(`OBS didn't answer at ${cfg.url} within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const client: ObsClient = {
      request: <T>(requestType: string, requestData?: Record<string, unknown>) =>
        new Promise<T>((res, rej) => {
          const requestId = randomUUID();
          waiting.set(requestId, { type: requestType, resolve: res as (v: unknown) => void, reject: rej });
          send({ op: OP.Request, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } });
        }),
      close: () => socket.close(1000),
    };
    socket.onerror = () => {};
    socket.onclose = (ev) => {
      clearTimeout(timer);
      const why = ev.code === AUTH_FAILED ? "wrong password (GI_OBS_PASSWORD)" : `connection closed (${ev.code}${ev.reason ? `: ${ev.reason}` : ""})`;
      reject(new Error(`OBS: ${why}`));
      for (const w of waiting.values()) w.reject(new Error(`OBS: ${why}`));
      waiting.clear();
    };
    socket.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as { op: number; d: Record<string, unknown> };
      if (msg.op === OP.Hello) {
        const auth = msg.d["authentication"] as { challenge: string; salt: string } | undefined;
        if (auth && !cfg.password) {
          socket.close(1000);
          reject(new Error("OBS asks for a password: set GI_OBS_PASSWORD"));
          return;
        }
        send({ op: OP.Identify, d: { rpcVersion: 1, eventSubscriptions: 0, ...(auth ? { authentication: obsAuthentication(cfg.password!, auth.salt, auth.challenge) } : {}) } });
      } else if (msg.op === OP.Identified) {
        clearTimeout(timer);
        resolve(client);
      } else if (msg.op === OP.RequestResponse) {
        const w = waiting.get(String(msg.d["requestId"]));
        if (!w) return;
        waiting.delete(String(msg.d["requestId"]));
        const status = msg.d["requestStatus"] as { result: boolean; code: number; comment?: string };
        if (status.result) w.resolve(msg.d["responseData"] ?? {});
        else w.reject(new ObsRequestError(w.type, status.code, `${w.type}: ${status.comment ?? `code ${status.code}`}`));
      }
    };
  });
}
