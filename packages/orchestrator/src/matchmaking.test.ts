import { seededRandom } from "@greed-island/engine";
import type { Tier } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_CYCLE, nextPosition, type CyclePosition } from "./cycle.ts";
import { DEFAULT_MATCHMAKING, pickMatch, pickStage, type Candidate, type Rng } from "./matchmaking.ts";

function rng(seed = "mm"): Rng {
  const r = seededRandom(seed);
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
}
const c = (id: string, rating: number, tier: Tier = "B", fighterId = id): Candidate => ({
  characterId: id,
  fighterId,
  tier,
  rating: { rating, deviation: 60, volatility: 0.06 },
});

describe("pickMatch", () => {
  it("pairs within a tier and prefers close fights", () => {
    const pool = [c("a", 1500), c("b", 1510), c("far", 1590)];
    for (let i = 0; i < 50; i++) {
      const p = pickMatch(pool, [], rng(`close${i}`), { ...DEFAULT_MATCHMAKING, upsetRate: 0 })!;
      expect(p.kind).toBe("CLOSE");
      expect(p.chanceSide1Bp).toBeGreaterThanOrEqual(4_000n);
      expect(p.chanceSide1Bp).toBeLessThanOrEqual(6_000n);
    }
  });

  it("never pairs across tiers when a same-tier pair exists", () => {
    const pool = [c("a", 1500, "B"), c("b", 1500, "B"), c("s", 1500, "S")];
    for (let i = 0; i < 30; i++) {
      const p = pickMatch(pool, [], rng(`tier${i}`))!;
      expect(p.sides[1].tier).toBe(p.sides[2].tier);
    }
  });

  it("books deliberate upset bouts at roughly the configured rate", () => {
    const pool = [c("a", 1500), c("b", 1505), c("big", 1800), c("small", 1300)];
    const r = rng("upsets");
    let upsets = 0;
    for (let i = 0; i < 1000; i++) if (pickMatch(pool, [], r, { ...DEFAULT_MATCHMAKING, upsetRate: 0.2 })!.kind === "UPSET") upsets++;
    expect(upsets).toBeGreaterThan(150);
    expect(upsets).toBeLessThan(250);
  });

  it("uses the most lopsided pair for upsets", () => {
    const pool = [c("a", 1500), c("b", 1505), c("big", 1800), c("small", 1300)];
    const p = pickMatch(pool, [], rng(), { ...DEFAULT_MATCHMAKING, upsetRate: 1 })!;
    expect(new Set([p.sides[1].characterId, p.sides[2].characterId])).toEqual(new Set(["big", "small"]));
  });

  it("falls back to the nearest pair when nothing is in the band", () => {
    const pool = [c("a", 1300), c("b", 1700), c("c", 2100)];
    const p = pickMatch(pool, [], rng(), { ...DEFAULT_MATCHMAKING, upsetRate: 0 })!;
    expect(p.kind).toBe("NEAREST");
  });

  it("never books a mirror match (same fighter design)", () => {
    const pool = [c("red", 1500, "B", "kfm"), c("blue", 1500, "B", "kfm")];
    expect(pickMatch(pool, [], rng())).toBeNull();
  });

  it("avoids immediate rematches", () => {
    const pool = [c("a", 1500), c("b", 1500), c("c", 1500)];
    for (let i = 0; i < 30; i++) {
      const p = pickMatch(pool, [["a", "b"]], rng(`rm${i}`), { ...DEFAULT_MATCHMAKING, rematchCooldown: 1 })!;
      expect([p.sides[1].characterId, p.sides[2].characterId].sort()).not.toEqual(["a", "b"]);
    }
    // Once the cooldown has passed, the pair is allowed again.
    expect(pickMatch([c("a", 1500), c("b", 1500)], [["x", "y"], ["a", "b"]], rng(), { ...DEFAULT_MATCHMAKING, rematchCooldown: 1 })).not.toBeNull();
  });

  it("prefers a same-tier pair that met recently over a cross-tier mismatch, but never an immediate rematch", () => {
    // Two tiers with two characters each: only two same-tier pairs exist.
    const pool = [c("a1", 1700, "A"), c("a2", 1690, "A"), c("p1", 1300, "P"), c("p2", 1310, "P")];
    // a1-a2 met two fights ago (inside the 3-fight window), p1-p2 fought last.
    const p = pickMatch(pool, [["p1", "p2"], ["a1", "p1"], ["a1", "a2"]], rng(), { ...DEFAULT_MATCHMAKING, rematchCooldown: 3, upsetRate: 0 })!;
    expect(p.kind).toBe("CLOSE");
    expect(new Set([p.sides[1].characterId, p.sides[2].characterId])).toEqual(new Set(["a1", "a2"]));
    // Fresh same-tier pairs still win over recently used ones.
    const q = pickMatch([...pool, c("a3", 1695, "A", "a3")], [["p1", "p2"], ["a1", "a2"]], rng("fresh"), { ...DEFAULT_MATCHMAKING, rematchCooldown: 3, upsetRate: 0 })!;
    expect([q.sides[1].characterId, q.sides[2].characterId]).toContain("a3");
  });

  it("falls back across tiers when configured, else returns null", () => {
    const pool = [c("a", 1400, "P"), c("b", 1500, "B"), c("s", 1800, "S")];
    const p = pickMatch(pool, [], rng())!;
    expect(p.kind).toBe("CROSS_TIER");
    expect(new Set([p.sides[1].characterId, p.sides[2].characterId])).toEqual(new Set(["a", "b"]));
    expect(pickMatch(pool, [], rng(), { ...DEFAULT_MATCHMAKING, crossTierFallback: false })).toBeNull();
  });

  it("randomizes corners and reports side 1's chance", () => {
    const pool = [c("fav", 1560), c("dog", 1500)];
    const sides = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = pickMatch(pool, [], rng(`corner${i}`))!;
      sides.add(p.sides[1].characterId);
      if (p.sides[1].characterId === "fav") expect(p.chanceSide1Bp).toBeGreaterThan(5_000n);
      else expect(p.chanceSide1Bp).toBeLessThan(5_000n);
    }
    expect(sides).toEqual(new Set(["fav", "dog"]));
  });

  it("returns null with fewer than two candidates", () => {
    expect(pickMatch([c("a", 1500)], [], rng())).toBeNull();
    expect(pickStage([], rng())).toBeNull();
  });
});

describe("cycle", () => {
  it("runs 100 matchmaking, a 16-character tournament (15 fights), then 25 exhibitions, and repeats", () => {
    let pos: CyclePosition | null = null;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 140; i++) {
      pos = nextPosition(pos, DEFAULT_CYCLE);
      if (pos.cycle === 1) counts[pos.segment] = (counts[pos.segment] ?? 0) + 1;
    }
    expect(counts).toEqual({ MATCHMAKING: 100, TOURNAMENT: 15, EXHIBITION: 25 });
    expect(nextPosition(pos, DEFAULT_CYCLE)).toEqual({ cycle: 2, segment: "MATCHMAKING", index: 0 });
  });

  it("skips empty segments", () => {
    const cfg = { matchmakingFights: 2, tournamentSize: 0, exhibitionFights: 0 };
    expect(nextPosition({ cycle: 1, segment: "MATCHMAKING", index: 1 }, cfg)).toEqual({ cycle: 2, segment: "MATCHMAKING", index: 0 });
  });
});
