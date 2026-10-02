import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_LIMITS, installRateLimits, installSecurityHeaders, loadRateLimits, RateLimiter } from "./security.ts";

describe("rate limits", () => {
  it("counts requests per key in fixed windows", () => {
    let t = 0;
    const limiter = new RateLimiter(() => t);
    const rule = { limit: 2, windowMs: 1000 };
    expect([limiter.take("a", rule), limiter.take("a", rule), limiter.take("a", rule)]).toEqual([true, true, false]);
    expect(limiter.take("b", rule)).toBe(true);
    expect(limiter.retryAfter("a", rule)).toBe(1);
    t = 1000;
    expect(limiter.take("a", rule)).toBe(true);
  });

  it("are on unless GI_RATE_LIMITS=off", () => {
    expect(loadRateLimits({})).toEqual(DEFAULT_RATE_LIMITS);
    expect(loadRateLimits({ GI_RATE_LIMITS: "off" })).toBeNull();
  });

  it("answer 429 with Retry-After once a client is over a limit, per route", async () => {
    const app = Fastify();
    installRateLimits(app, { ...DEFAULT_RATE_LIMITS, sessions: { limit: 2, windowMs: 60_000 } });
    app.post("/api/session", async () => ({ ok: true }));
    app.get("/api/me", async () => ({ ok: true }));
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ method: "POST", url: "/api/session" })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    const limited = await app.inject({ method: "POST", url: "/api/session" });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(limited.json().error).toBe("RATE_LIMITED");
    expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(200); // other routes still work
    expect((await app.inject({ method: "POST", url: "/api/session", remoteAddress: "10.0.0.2" })).statusCode).toBe(200); // other clients too
    await app.close();
  });
});

describe("security headers", () => {
  it("send a strict content policy, and HSTS only over https", async () => {
    const app = Fastify();
    installSecurityHeaders(app, { https: true });
    app.get("/", async () => "hi");
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.headers["content-security-policy"]).not.toContain("unsafe-eval");
    expect(res.headers["content-security-policy"]).toContain("https://player.twitch.tv");
    // Submitted images are fetched with the session header and shown as blob: URLs (submit and staff pages).
    expect(res.headers["content-security-policy"]).toContain("img-src 'self' data: blob: https:");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    await app.close();
    const plain = Fastify();
    installSecurityHeaders(plain, { https: false });
    plain.get("/", async () => "hi");
    expect((await plain.inject({ method: "GET", url: "/" })).headers["strict-transport-security"]).toBeUndefined();
    await plain.close();
  });
});
