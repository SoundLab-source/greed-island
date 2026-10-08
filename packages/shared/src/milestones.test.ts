import { describe, expect, it } from "vitest";
import { nextMilestones } from "./milestones.ts";

describe("owners' next milestones", () => {
  it("points a new character at First Blood and B tier", () => {
    expect(nextMilestones({ wins: 0, rating: 1500, tier: "B", titles: [] })).toEqual([
      { kind: "wins", text: "Win a fight for First Blood", reward: "the First Blood title", progress: 0 },
      { kind: "tier", text: "Rating 1600 for A tier: 100 to go", reward: "the A-Tier title and the Silver name plate", progress: 1 / 3 },
    ]);
  });

  it("counts wins from the last win title, and says nothing new is earned for a title already held", () => {
    const [wins, tier] = nextMilestones({ wins: 7, rating: 1712.4, tier: "A", titles: ["FIRST_BLOOD", "TIER_A", "TIER_S"] });
    expect(wins).toEqual({ kind: "wins", text: "3 more wins to 10 Wins", reward: "the 10 Wins title", progress: 6 / 9 });
    expect(tier).toEqual({ kind: "tier", text: "Rating 1750 for S tier: 38 to go", reward: null, progress: 112 / 150 });
    expect(nextMilestones({ wins: 99, rating: 1400, tier: "P", titles: [] })[0]!.text).toBe("1 more win to 100 Wins");
  });

  it("measures tier P from a band below B, and has nothing past 100 wins and S tier", () => {
    expect(nextMilestones({ wins: 3, rating: 1300, tier: "P", titles: [] })[1]).toMatchObject({ text: "Rating 1450 for B tier: 150 to go", progress: 0 });
    expect(nextMilestones({ wins: 3, rating: 1460, tier: "P", titles: [] })[1]).toMatchObject({ text: "Rating 1450 for B tier: there, it moves up after its next fight", progress: 1 });
    expect(nextMilestones({ wins: 140, rating: 1800, tier: "S", titles: [] })).toEqual([]);
    expect(nextMilestones({ wins: 140, rating: 1500, tier: "X", titles: [] })).toEqual([]);
  });

  it("uses the configured tier thresholds", () => {
    expect(nextMilestones({ wins: 100, rating: 1000, tier: "P", titles: [] }, { thresholds: { B: 1100, A: 1200, S: 1300 }, hysteresis: 25 })[0]!.text).toBe("Rating 1100 for B tier: 100 to go");
  });
});
