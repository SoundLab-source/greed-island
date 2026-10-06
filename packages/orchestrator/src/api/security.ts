/**
 * Protection for a public site (docs/MVP.md step 3): rate limits per client
 * address, a cap on open live-update connections, and security headers.
 * Everything is in memory: one server process serves the whole site.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";

export interface RateRule {
  /** Requests allowed per window, per client address. */
  limit: number;
  windowMs: number;
}

export interface RateLimitConfig {
  /** New anonymous players (POST /api/session). */
  sessions: RateRule;
  /** Sign-in emails asked for (POST /api/auth/email), on top of the per-address limit. */
  signInEmails: RateRule;
  /** Bets placed. */
  bets: RateRule;
  /** Every API call. */
  api: RateRule;
  /** Live-update connections open at once (GET /api/stream). */
  streamsPerClient: number;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  sessions: { limit: 20, windowMs: HOUR },
  signInEmails: { limit: 10, windowMs: HOUR },
  bets: { limit: 60, windowMs: MINUTE },
  api: { limit: 600, windowMs: MINUTE },
  streamsPerClient: 10,
};

/** Rate limits from the environment: on by default; GI_RATE_LIMITS=off turns them off. */
export function loadRateLimits(env: NodeJS.ProcessEnv = process.env): RateLimitConfig | null {
  return env["GI_RATE_LIMITS"] === "off" ? null : DEFAULT_RATE_LIMITS;
}

/** Fixed-window counters per key. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  /** Counts one request; false when the key is over its limit for this window. */
  take(key: string, rule: RateRule): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= rule.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      if (this.windows.size > 50_000) this.sweep(t, rule.windowMs);
      return true;
    }
    w.count++;
    return w.count <= rule.limit;
  }

  /** Seconds until the key's window resets. */
  retryAfter(key: string, rule: RateRule): number {
    const w = this.windows.get(key);
    return w ? Math.max(1, Math.ceil((w.start + rule.windowMs - this.now()) / 1000)) : 1;
  }

  private sweep(t: number, windowMs: number): void {
    for (const [k, w] of this.windows) if (t - w.start >= windowMs) this.windows.delete(k);
  }
}

function ruleFor(req: FastifyRequest, cfg: RateLimitConfig): [string, RateRule] | null {
  const url = req.url.split("?")[0]!;
  if (req.method === "POST" && url === "/api/session") return ["session", cfg.sessions];
  if (req.method === "POST" && url === "/api/auth/email") return ["email", cfg.signInEmails];
  if (req.method === "POST" && /^\/api\/fights\/[^/]+\/bets$/.test(url)) return ["bet", cfg.bets];
  return null;
}

/** Rate limits and the live-connection cap, as request hooks. */
export function installRateLimits(app: FastifyInstance, cfg: RateLimitConfig, now: () => number = Date.now): void {
  const limiter = new RateLimiter(now);
  const open = new Map<string, number>();
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    const ip = req.ip;
    const checks: [string, RateRule][] = [["api", cfg.api]];
    const specific = ruleFor(req, cfg);
    if (specific) checks.push(specific);
    for (const [name, rule] of checks) {
      const key = `${name}:${ip}`;
      if (!limiter.take(key, rule)) {
        reply.header("retry-after", String(limiter.retryAfter(key, rule)));
        return reply.status(429).send({ error: "RATE_LIMITED", message: "too many requests: wait a little and try again" });
      }
    }
    if (req.method === "GET" && req.url.split("?")[0] === "/api/stream") {
      const n = open.get(ip) ?? 0;
      if (n >= cfg.streamsPerClient) return reply.status(429).send({ error: "RATE_LIMITED", message: "too many live connections from this address" });
      open.set(ip, n + 1);
      req.raw.on("close", () => {
        const left = (open.get(ip) ?? 1) - 1;
        if (left <= 0) open.delete(ip);
        else open.set(ip, left);
      });
    }
  });
}

/**
 * Security headers on every response. The content policy allows only our
 * own scripts (no inline ones), the Twitch player and chat in frames, and
 * images from anywhere over https (NFT pictures) or from memory (`blob:`: the
 * submit and staff pages fetch submitted images with the session header and
 * show them that way). Camera access is off, except for the local preview
 * (GI_LOCAL_VIDEO), where the watch page plays OBS's Virtual Camera.
 */
export function installSecurityHeaders(app: FastifyInstance, opts: { https: boolean; camera?: boolean }): void {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    "frame-src 'self' https://player.twitch.tv https://www.twitch.tv https://embed.twitch.tv",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("content-security-policy", csp);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "strict-origin-when-cross-origin");
    // The camera only for the local preview (GI_LOCAL_VIDEO): the watch page plays OBS's Virtual Camera.
    reply.header("permissions-policy", `camera=${opts.camera ? "(self)" : "()"}, microphone=(), geolocation=()`);
    reply.header("cross-origin-opener-policy", "same-origin");
    if (opts.https) reply.header("strict-transport-security", "max-age=31536000");
    return payload;
  });
}
