import { describe, expect, it } from "vitest";
import { isProduction, productionProblems } from "./production.ts";

const good = {
  GI_ENV: "production",
  GI_PUBLIC_URL: "https://greed-island.example",
  GI_SMTP_URL: "smtps://user:pass@smtp.example:465",
  GI_MAIL_FROM: "Greed Island <no-reply@greed-island.example>",
  ENGINE_MODE: "live",
  IKEMEN_DIR: "/opt/ikemen",
  DATABASE_URL: "postgresql://greed:greed@localhost:54329/greed_island",
};

describe("production start-up checks", () => {
  it("accepts a complete, safe setup", () => {
    expect(isProduction(good)).toBe(true);
    expect(isProduction({})).toBe(false);
    expect(productionProblems(good)).toEqual([]);
  });

  it("names every problem", () => {
    const problems = productionProblems({
      GI_PUBLIC_URL: "http://greed-island.example",
      ENGINE_MODE: "fake",
      GI_RATE_LIMITS: "off",
      GI_HOST: "0.0.0.0",
      DATABASE_URL: "postgresql://greed:greed@db.example:5432/greed_island",
    });
    const has = (s: string) => expect(problems.some((p) => p.includes(s))).toBe(true);
    has("must be an https://");
    has("GI_SMTP_URL");
    has("GI_MAIL_FROM");
    has("ENGINE_MODE must be live");
    has("IKEMEN_DIR");
    has("rate limits must stay on");
    has("GI_HOST=0.0.0.0");
    has("default password");
    expect(productionProblems({ ...good, GI_PUBLIC_URL: undefined, DATABASE_URL: "nope" }).length).toBe(2);
  });
});
