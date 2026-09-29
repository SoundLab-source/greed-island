import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { accountKey, LedgerRuleError, MAIN_BOOK, tournamentBook } from "./ledger-plan.ts";
import { DEFAULT_TIERS, type Tier } from "./tiers.ts";
import {
  bettorPodium,
  bracketSize,
  DEFAULT_TOURNAMENTS,
  distanceToBand,
  firstRound,
  nextSlot,
  pickSeats,
  roundName,
  roundsFor,
  seedOrder,
  tournamentTier,
  type SeatCandidate,
} from "./tournaments.ts";

const cand = (id: string, tier: Tier, rating: number, owned = false): SeatCandidate => ({ characterId: id, tier, rating, owned });

describe("tier rotation", () => {
  it("goes S, A, B, P and repeats", () => {
    expect([1, 2, 3, 4, 5, 6].map(tournamentTier)).toEqual(["S", "A", "B", "P", "S", "A"]);
  });
});

describe("pickSeats", () => {
  it("seats the tier's players' characters first, then house, then the nearest house fillers, seeded by rating", () => {
    const seats = pickSeats(
      [
        cand("own-s", "S", 1760, true),
        cand("house-s1", "S", 1900),
        cand("house-s2", "S", 1800),
        cand("house-a-high", "A", 1740),
        cand("house-a-low", "A", 1610),
        cand("own-a", "A", 1745, true), // owned but outside the tier: never a filler
        cand("house-x", "X", 2500), // X never plays
        cand("house-p", "P", 1200),
      ],
      "S",
      16,
      DEFAULT_TIERS,
    );
    // 5 eligible (3 in tier + 2 house fillers from A, closest first) -> a bracket of 4.
    expect(seats.map((s) => s.characterId)).toEqual(["house-s1", "house-s2", "own-s", "house-a-high"]);
  });

  it("uses the largest power of two, up to the maximum, and needs at least 2", () => {
    const many = Array.from({ length: 20 }, (_, i) => cand(`c${i}`, "B", 1500 + i));
    expect(pickSeats(many, "B", 16, DEFAULT_TIERS)).toHaveLength(16);
    expect(pickSeats(many.slice(0, 12), "B", 16, DEFAULT_TIERS)).toHaveLength(8);
    expect(pickSeats(many, "B", 4, DEFAULT_TIERS)).toHaveLength(4);
    expect(pickSeats(many.slice(0, 1), "B", 16, DEFAULT_TIERS)).toEqual([]);
    expect(pickSeats([cand("x", "X", 2000), cand("y", "X", 2100)], "S", 16, DEFAULT_TIERS)).toEqual([]);
  });

  it("keeps owned characters in the bracket even when house characters are stronger", () => {
    const pool = [...Array.from({ length: 8 }, (_, i) => cand(`h${i}`, "P", 1400 - i)), cand("mine", "P", 1100, true)];
    const seats = pickSeats(pool, "P", 8, DEFAULT_TIERS);
    expect(seats.map((s) => s.characterId)).toContain("mine");
    expect(seats.at(-1)!.characterId).toBe("mine"); // lowest seed
  });

  it("measures distance to a band", () => {
    expect(distanceToBand(1700, "S", DEFAULT_TIERS)).toBe(50);
    expect(distanceToBand(1800, "S", DEFAULT_TIERS)).toBe(0);
    expect(distanceToBand(1500, "P", DEFAULT_TIERS)).toBe(50);
    expect(distanceToBand(1500, "B", DEFAULT_TIERS)).toBe(0);
  });

  it("never seats X, never repeats, always a power of two (property)", () => {
    const tier = fc.constantFrom<Tier>("P", "B", "A", "S", "X");
    fc.assert(
      fc.property(fc.array(fc.record({ tier, rating: fc.integer({ min: 1000, max: 2200 }), owned: fc.boolean() }), { maxLength: 40 }), fc.constantFrom<"P" | "B" | "A" | "S">("P", "B", "A", "S"), (rows, t) => {
        const seats = pickSeats(rows.map((r, i) => ({ characterId: `c${i}`, ...r })), t, 16, DEFAULT_TIERS);
        expect(new Set(seats.map((s) => s.characterId)).size).toBe(seats.length);
        expect(seats.every((s) => s.tier !== "X")).toBe(true);
        expect([0, 2, 4, 8, 16]).toContain(seats.length);
        // Owned characters only ever come from the tournament's tier.
        expect(seats.every((s) => !s.owned || s.tier === t)).toBe(true);
      }),
    );
  });
});

describe("bracket", () => {
  it("seeds so the top seeds meet last", () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(firstRound(16)).toEqual([
      [1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11],
    ]);
    expect(firstRound(2)).toEqual([[1, 2]]);
  });

  it("moves winners to the right slot and names rounds", () => {
    expect(roundsFor(16)).toBe(4);
    expect(nextSlot(1, 0, 16)).toEqual({ round: 2, slot: 0, side: 1 });
    expect(nextSlot(1, 1, 16)).toEqual({ round: 2, slot: 0, side: 2 });
    expect(nextSlot(1, 7, 16)).toEqual({ round: 2, slot: 3, side: 2 });
    expect(nextSlot(4, 0, 16)).toBeNull();
    expect([1, 2, 3, 4].map((r) => roundName(r, 16))).toEqual(["round of 16", "quarter-final", "semi-final", "final"]);
    expect(roundName(1, 2)).toBe("final");
    expect(bracketSize(15)).toBe(8);
    expect(bracketSize(0)).toBe(0);
  });
});

describe("bettorPodium", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, m));
  it("ranks balances above the starting amount, earlier joiner first on a tie, top 3", () => {
    const podium = bettorPodium(
      [
        { userId: "flat", balance: 1_000n, joinedAt: at(0) },
        { userId: "late", balance: 1_500n, joinedAt: at(9) },
        { userId: "early", balance: 1_500n, joinedAt: at(1) },
        { userId: "big", balance: 4_000n, joinedAt: at(5) },
        { userId: "small", balance: 1_001n, joinedAt: at(2) },
        { userId: "broke", balance: 0n, joinedAt: at(3) },
      ],
      DEFAULT_TOURNAMENTS,
    );
    expect(podium.map((p) => p.userId)).toEqual(["big", "early", "late"]);
    expect(bettorPodium([{ userId: "flat", balance: 1_000n, joinedAt: at(0) }], DEFAULT_TOURNAMENTS)).toEqual([]);
    expect(bettorPodium([{ userId: "a", balance: 2_000n, joinedAt: at(0) }], { ...DEFAULT_TOURNAMENTS, podium: 0 })).toEqual([]);
  });
});

describe("T-Salt books", () => {
  it("keeps main-book keys and gives each tournament its own", () => {
    expect(accountKey({ kind: "USER", userId: "u1" })).toBe("user:u1:SALT");
    expect(accountKey({ kind: "USER", userId: "u1" }, MAIN_BOOK)).toBe("user:u1:SALT");
    const book = tournamentBook("t9");
    expect(accountKey({ kind: "USER", userId: "u1" }, book)).toBe("user:u1:TSALT:t9");
    expect(accountKey({ kind: "ESCROW", fightId: "f1", side: 2 }, book)).toBe("escrow:f1:2:TSALT:t9");
    expect(accountKey({ kind: "HOUSE" }, book)).toBe("house:TSALT:t9");
    expect(accountKey({ kind: "ISSUANCE" }, book)).toBe("issuance:TSALT:t9");
    expect(() => accountKey({ kind: "SINK" }, book)).toThrow(LedgerRuleError);
  });
});
