import { describe, expect, it } from "vitest";
import { recapLines, type Recap } from "./recap.ts";

const empty: Recap = { since: new Date(0), bets: { settled: 0, won: 0, saltNet: 0n, upsets: 0, biggest: null }, fighters: [], ownerRewards: 0n, titles: [], champions: [] };

describe("recap lines", () => {
  it("say nothing when nothing happened", () => {
    expect(recapLines(empty)).toEqual([]);
  });

  it("put the player's own fighters first, then their calls, titles and a champion", () => {
    const r: Recap = {
      ...empty,
      fighters: [{ name: "Grey Monk #1", wins: 3, losses: 1, tierNow: "A", tierBefore: "B", titles: ["10 Wins"] }],
      ownerRewards: 150n,
      bets: { settled: 70, won: 41, saltNet: 2300n, upsets: 3, biggest: { amount: 900n, fightNumber: 12 } },
      titles: ["Called It"],
      champions: [{ tournament: 8, name: "Free Loot" }],
    };
    expect(recapLines(r, 9)).toEqual([
      "Grey Monk #1 won 3 of 4, moved up to A tier, earned 10 Wins",
      "Your fighters earned you 150 Salt in wins",
      "You called 41 of 70 fights, 3 upsets among them (+2,300 Salt)",
      "You earned the title Called It",
      "Free Loot won Tournament #8",
    ]);
    expect(recapLines(r)).toHaveLength(4);
  });

  it("say losses plainly", () => {
    expect(recapLines({ ...empty, bets: { settled: 1, won: 0, saltNet: -50n, upsets: 0, biggest: null } })).toEqual(["You called 0 of 1 fight (−50 Salt)"]);
    expect(recapLines({ ...empty, fighters: [{ name: "X", wins: 0, losses: 2, tierNow: "P", tierBefore: "B", titles: [] }] })).toEqual(["X won 0 of 2, moved down to P tier"]);
  });
});
