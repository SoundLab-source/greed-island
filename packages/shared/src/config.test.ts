import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_ECONOMY, loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("uses defaults when env is empty", () => {
    expect(loadConfig({}).economy).toEqual(DEFAULT_ECONOMY);
    expect(DEFAULT_ECONOMY.startingBalance).toBe(400n);
  });

  it("reads integer overrides", () => {
    const cfg = loadConfig({ GI_STARTING_BALANCE: "1000", GI_MAX_PAYOUT: "25" });
    expect(cfg.economy.startingBalance).toBe(1000n);
    expect(cfg.economy.maxPayout).toBe(25n);
  });

  it("reads what's shown of bets: sides live and the big bet called out on stream", () => {
    expect(loadConfig({}).bets).toEqual({ sidesLive: false, bigBet: 1000n });
    expect(loadConfig({ GI_BETS_LIVE: "true", GI_BIG_BET: "5000" }).bets).toEqual({ sidesLive: true, bigBet: 5000n });
    expect(() => loadConfig({ GI_BIG_BET: "lots" })).toThrow(ConfigError);
  });

  it("rejects fractional amounts", () => {
    expect(() => loadConfig({ GI_DAILY_GRANT: "10.5" })).toThrow(ConfigError);
  });

  it("reads tier and rating overrides and validates them", () => {
    const cfg = loadConfig({ GI_TIER_S: "1900", GI_GLICKO_TAU: "0.7" });
    expect(cfg.tiers.thresholds.S).toBe(1900);
    expect(cfg.ratings.tau).toBe(0.7);
    expect(() => loadConfig({ GI_TIER_A: "1400" })).toThrow();
    expect(() => loadConfig({ GI_TIER_B: "abc" })).toThrow(ConfigError);
  });

  it("rejects inconsistent limits", () => {
    expect(() => loadConfig({ GI_MIN_BET: "10", GI_MAX_PAYOUT: "5" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_MIN_BET: "0" })).toThrow(ConfigError);
  });
});
