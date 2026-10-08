import { seededRandom } from "@greed-island/engine";
import type { Tier } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { bookingModeFor, DEFAULT_CYCLE, nextPosition, type CyclePosition } from "./cycle.ts";
import { DEFAULT_MATCHMAKING, pairingFor, pickMatch, pickRivalry, pickShowcase, pickStage, type Candidate, type Rng } from "./matchmaking.ts";

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

  it("favours owned characters, with house characters filling in", () => {
    const pool = [c("own1", 1500), c("own2", 1505), c("house1", 1500), c("house2", 1505)].map((x) => ({ ...x, owned: x.characterId.startsWith("own") }));
    const r = rng("owned");
    const involving = { owned: 0, house: 0 };
    for (let i = 0; i < 2000; i++) {
      const p = pickMatch(pool, [], r, { ...DEFAULT_MATCHMAKING, upsetRate: 0 })!;
      involving[p.sides[1].owned || p.sides[2].owned ? "owned" : "house"]++;
    }
    // 6 pairs: own1-own2 (weight 5), four mixed (3 each), house1-house2 (1) → house-only ≈ 1/18.
    expect(involving.house / 2000).toBeGreaterThan(0.02);
    expect(involving.house / 2000).toBeLessThan(0.1);
  });

  it("returns null with fewer than two candidates", () => {
    expect(pickMatch([c("a", 1500)], [], rng())).toBeNull();
    expect(pickStage([], rng())).toBeNull();
  });
});

describe("pickShowcase", () => {
  const roster = [
    c("x1", 1900, "X"),
    c("s1", 1800, "S"),
    c("s2", 1780, "S"),
    c("a1", 1650, "A"),
    c("p1", 1300, "P"),
    { ...c("own", 2000, "S"), owned: true },
  ];

  it("pairs house characters from the strongest few, across tiers, X first", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = pickShowcase(roster, [], rng(`sc${i}`), 3)!;
      expect(p.kind).toBe("SHOWCASE");
      for (const s of [p.sides[1], p.sides[2]]) seen.add(s.characterId);
    }
    // Pool of 3: X first, then the two best S. Never the owned character or the weaker ones.
    expect([...seen].sort()).toEqual(["s1", "s2", "x1"]);
  });

  it("follows the no-mirror and no-immediate-rematch rules", () => {
    const pool = [c("a", 1800, "S", "kfm"), c("b", 1790, "S", "kfm"), c("d", 1700, "A", "crane")];
    for (let i = 0; i < 50; i++) {
      const p = pickShowcase(pool, [["a", "d"]], rng(`m${i}`), 3)!;
      const ids = [p.sides[1].characterId, p.sides[2].characterId].sort();
      expect(ids).toEqual(["b", "d"]);
    }
    expect(pickShowcase([c("a", 1800, "S")], [], rng(), 3)).toBeNull();
    expect(pickShowcase(roster, [], rng(), 1)).toBeNull();
  });

  it("gives a fixed pairing its chance and random corners", () => {
    const corners = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = pairingFor(c("a", 1700), c("b", 1500), "CHALLENGE", rng(`p${i}`));
      expect(p.kind).toBe("CHALLENGE");
      const aSide = p.sides[1].characterId === "a" ? 1 : 2;
      expect(aSide === 1 ? p.chanceSide1Bp : 10_000n - p.chanceSide1Bp).toBeGreaterThan(5_000n);
      corners.add(p.sides[1].characterId);
    }
    expect(corners.size).toBe(2);
  });
});

describe("pickRivalry", () => {
  const pool = [c("a", 1800, "S"), c("b", 1500, "B"), c("d", 1600, "A"), c("e", 1400, "P", "kfm"), c("f", 1410, "P", "kfm")];
  const met = (a: string, b: string, winsA: number, winsB: number) => ({ a, b, winsA, winsB });

  it("books a rematch of rivals: 4+ meetings, records at most one win apart, across tiers", () => {
    const meetings = [met("a", "b", 3, 2), met("a", "d", 2, 2), met("b", "d", 4, 1), met("a", "e", 1, 1)];
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const p = pickRivalry(pool, meetings, [], rng(`rv${i}`))!;
      expect(p.kind).toBe("RIVALRY");
      seen.add([p.sides[1].characterId, p.sides[2].characterId].sort().join("-"));
    }
    // b-d is one-sided (4-1) and a-e have met only twice.
    expect([...seen].sort()).toEqual(["a-b", "a-d"]);
  });

  it("skips pairs inside the rematch cooldown, inactive characters and mirror matches", () => {
    expect(pickRivalry(pool, [met("a", "b", 3, 2)], [["x", "y"], ["b", "a"]], rng())).toBeNull();
    expect(pickRivalry(pool, [met("a", "b", 3, 2)], [["x", "y"], ["p", "q"], ["r", "s"], ["b", "a"]], rng())).toMatchObject({ kind: "RIVALRY" });
    expect(pickRivalry(pool, [met("a", "gone", 3, 3)], [], rng())).toBeNull();
    expect(pickRivalry(pool, [met("e", "f", 3, 3)], [], rng())).toBeNull();
    expect(pickRivalry(pool, [], [], rng())).toBeNull();
  });
});

describe("cycle", () => {
  it("books each segment in its own mode", () => {
    expect(bookingModeFor("EXHIBITION")).toBe("EXHIBITION");
    expect(bookingModeFor("MATCHMAKING")).toBe("MATCHMAKING");
    expect(bookingModeFor("TOURNAMENT")).toBe("TOURNAMENT");
  });

  it("keeps the tournament segment going until the bracket is decided", () => {
    const cfg = { matchmakingFights: 1, tournamentSize: 16, exhibitionFights: 1 };
    const done = new Set<number>();
    const next = (p: CyclePosition | null) => nextPosition(p, cfg, (c) => done.has(c));
    let pos = next(null);
    expect(pos).toEqual({ cycle: 1, segment: "MATCHMAKING", index: 0 });
    pos = next(pos);
    expect(pos).toEqual({ cycle: 1, segment: "TOURNAMENT", index: 0 });
    // A voided fight needs a replay: far more than 15 fights is fine.
    for (let i = 0; i < 30; i++) pos = next(pos);
    expect(pos).toEqual({ cycle: 1, segment: "TOURNAMENT", index: 30 });
    done.add(1);
    expect((pos = next(pos))).toEqual({ cycle: 1, segment: "EXHIBITION", index: 0 });
    expect(next(pos)).toEqual({ cycle: 2, segment: "MATCHMAKING", index: 0 });
    // A tournament that couldn't be filled is skipped.
    done.add(2);
    expect(next({ cycle: 2, segment: "MATCHMAKING", index: 0 })).toEqual({ cycle: 2, segment: "EXHIBITION", index: 0 });
    // Size below 2 turns tournaments off.
    expect(nextPosition({ cycle: 3, segment: "MATCHMAKING", index: 0 }, { ...cfg, tournamentSize: 1 }, () => false)).toMatchObject({ segment: "EXHIBITION" });
  });

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
