import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import { DEFAULT_SEASONS, nextSeasonWindow, rankCharacters, rankPlayers, seasonChampion, topBettor } from "./seasons.ts";

const cfg = DEFAULT_SEASONS;
const WEEK = 7 * 86_400_000;

describe("nextSeasonWindow", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("starts the first season now, for 8 weeks", () => {
    expect(nextSeasonWindow(null, now, cfg)).toEqual({ startsAt: now, endsAt: new Date(now.getTime() + 8 * WEEK) });
  });

  it("starts the next season where the last one ended, with no gap", () => {
    const ended = new Date(now.getTime() - 3_600_000);
    expect(nextSeasonWindow(ended, now, cfg)).toEqual({ startsAt: ended, endsAt: new Date(ended.getTime() + 8 * WEEK) });
  });

  it("starts now after a break longer than a season, instead of empty seasons", () => {
    const longAgo = new Date(now.getTime() - 9 * WEEK);
    expect(nextSeasonWindow(longAgo, now, cfg).startsAt).toEqual(now);
  });

  it("always covers now, and never starts before the last season ended (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: -20 * WEEK, max: 0 }), fc.integer({ min: 3_600_000, max: 20 * WEEK }), (endedOffset, lengthMs) => {
        const ended = new Date(now.getTime() + endedOffset);
        const w = nextSeasonWindow(ended, now, { ...cfg, lengthMs });
        expect(w.startsAt.getTime()).toBeGreaterThanOrEqual(ended.getTime());
        expect(w.startsAt.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(w.endsAt.getTime()).toBeGreaterThan(now.getTime());
        expect(w.endsAt.getTime() - w.startsAt.getTime()).toBe(lengthMs);
      }),
    );
  });
});

describe("rankings and titles", () => {
  const p = (userId: string, saltWon: bigint, bets: number) => ({ userId, saltWon, bets });

  it("ranks players by Salt won, then bets, then id", () => {
    const ranked = rankPlayers([p("c", 50n, 3), p("a", 200n, 12), p("b", 50n, 9), p("d", -40n, 30)]);
    expect(ranked.map((r) => [r.rank, r.userId])).toEqual([[1, "a"], [2, "b"], [3, "c"], [4, "d"]]);
  });

  it("gives Top Bettor to the best player with enough bets who came out ahead", () => {
    expect(topBettor(rankPlayers([p("lucky", 900n, 2), p("steady", 300n, 15)]), cfg)?.userId).toBe("steady");
    expect(topBettor(rankPlayers([p("loser", -5n, 40), p("even", 0n, 40)]), cfg)).toBeNull();
    expect(topBettor([], cfg)).toBeNull();
  });

  it("ranks characters by rating and crowns the best with enough fights", () => {
    const c = (characterId: string, rating: number, wins: number, losses: number) => ({ characterId, rating, wins, losses });
    const ranked = rankCharacters([c("rookie", 1900, 2, 0), c("vet", 1800, 12, 6), c("mid", 1500, 7, 7)]);
    expect(ranked.map((r) => r.characterId)).toEqual(["rookie", "vet", "mid"]);
    expect(seasonChampion(ranked, cfg)?.characterId).toBe("vet");
    expect(seasonChampion(ranked, { ...cfg, minFights: 100 })).toBeNull();
  });

  it("ranks are 1..n and never go up in Salt won (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ userId: fc.uuid(), saltWon: fc.bigInt({ min: -10_000n, max: 10_000n }), bets: fc.nat(50) }), { maxLength: 30 }), (stats) => {
        const ranked = rankPlayers(stats);
        expect(ranked.map((r) => r.rank)).toEqual(stats.map((_, i) => i + 1));
        for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1]!.saltWon >= ranked[i]!.saltWon).toBe(true);
      }),
    );
  });
});

describe("season config", () => {
  it("reads the season length in weeks and the title thresholds", () => {
    expect(loadConfig({}).seasons).toEqual(DEFAULT_SEASONS);
    const c = loadConfig({ GI_SEASON_WEEKS: "2", GI_SEASON_MIN_FIGHTS: "5", GI_SEASON_MIN_BETS: "3" }).seasons;
    expect(c).toMatchObject({ lengthMs: 2 * WEEK, minFights: 5, minBets: 3 });
    expect(() => loadConfig({ GI_SEASON_WEEKS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_SEASON_MIN_BETS: "1.5" })).toThrow(ConfigError);
  });
});
