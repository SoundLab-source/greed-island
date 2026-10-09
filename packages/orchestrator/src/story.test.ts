import { describe, expect, it } from "vitest";
import { fightBreakdown, fightStory, streakOf, styleEdge, type RoundRecord, type StoryFacts } from "./story.ts";

const facts = (more: Partial<StoryFacts> = {}, sides: Partial<Record<1 | 2, Partial<StoryFacts["sides"][1]>>> = {}): StoryFacts => ({
  sides: {
    1: { name: "Free Loot", archetype: "GRAPPLER", debut: false, streak: null, tier: "A", tierAfter: null, ...sides[1] },
    2: { name: "Big Cheese", archetype: "RUSHDOWN", debut: false, streak: null, tier: "A", tierAfter: null, ...sides[2] },
  },
  headToHead: { fights: 0, wins: { 1: 0, 2: 0 }, lastWinner: null },
  chancePct: { 1: 50, 2: 50 },
  multiplier: { 1: "1.90x", 2: "1.90x" },
  tournamentRound: null,
  styleEdge: null,
  result: null,
  ...more,
});

describe("the announcer", () => {
  it("says the most interesting things first, at most three", () => {
    const s = fightStory(
      facts({ headToHead: { fights: 4, wins: { 1: 0, 2: 4 }, lastWinner: 2 }, chancePct: { 1: 18, 2: 82 }, multiplier: { 1: "5.10x", 2: "1.15x" } }, { 2: { streak: { kind: "W", n: 7 } } }),
    );
    expect(s.lines).toEqual(["Free Loot has never beaten Big Cheese (0-4)", "Big Cheese is on a 7-fight win streak", "Upset alert: Free Loot is an 18% underdog, paying 5.10×"]);
    expect(s.headline).toBeNull();
  });

  it("calls debuts, tournament finals, rivalries, rematches, even fights and which style tends to win", () => {
    expect(fightStory(facts({ tournamentRound: "final" }, { 1: { debut: true } })).lines.slice(0, 2)).toEqual(["Tournament final: the winner takes the title", "First fight ever for Free Loot"]);
    // A community fighter's first fight says who voted it in instead.
    expect(fightStory(facts({}, { 1: { debut: true, communityDebut: "Pixel Monks" } })).lines[0]).toBe("Community debut: Free Loot, voted in by Pixel Monks");
    expect(fightStory(facts({ headToHead: { fights: 5, wins: { 1: 3, 2: 2 }, lastWinner: 2 } })).lines[0]).toBe("Rivalry: Free Loot leads Big Cheese 3-2");
    expect(fightStory(facts({ headToHead: { fights: 4, wins: { 1: 2, 2: 2 }, lastWinner: 1 } })).lines[0]).toBe("Rivalry: all square at 2-2");
    expect(fightStory(facts({ headToHead: { fights: 1, wins: { 1: 0, 2: 1 }, lastWinner: 2 } })).lines[0]).toBe("Rematch: Big Cheese won their last meeting");
    expect(fightStory(facts()).lines).toEqual(["Dead even: 50% to 50%"]);
    const edge = fightStory(facts({ styleEdge: { winner: "ZONER", loser: "HEAVY", pct: 61, fights: 80 }, chancePct: { 1: 40, 2: 60 } }));
    expect(edge.lines).toEqual(["Sages beat Bruisers 61% of the time on this roster"]);
    // Losing runs are said plainly (no "due for a win").
    expect(fightStory(facts({}, { 1: { streak: { kind: "L", n: 5 } } })).lines[0]).toBe("Free Loot has lost 5 in a row");
    expect(fightStory(facts({ chancePct: { 1: 20, 2: 80 } })).lines[0]).toMatch(/^Upset alert: Free Loot is a 20% underdog/);
  });

  it("shouts one headline after the fight: an upset first, then a broken streak, a promotion, a streak, a debut win", () => {
    const won = (more: Partial<StoryFacts>, sides: Parameters<typeof facts>[1] = {}) => fightStory(facts({ result: { winnerSide: 1 }, ...more }, sides)).headline;
    expect(won({ chancePct: { 1: 22, 2: 78 }, multiplier: { 1: "4.30x", 2: "1.20x" } }, { 2: { streak: { kind: "W", n: 5 } } })).toEqual({ kind: "upset", text: "UPSET! Free Loot wins at 22%, paying 4.30×" });
    expect(won({}, { 2: { streak: { kind: "W", n: 5 } } })).toEqual({ kind: "streak-broken", text: "STREAK BROKEN: Big Cheese's 5-fight run is over" });
    expect(won({}, { 1: { tierAfter: "S" } })).toEqual({ kind: "promoted", text: "Free Loot moves up to S tier!" });
    expect(won({}, { 1: { streak: { kind: "W", n: 2 } } })).toEqual({ kind: "streak", text: "Free Loot makes it 3 in a row" });
    expect(won({}, { 1: { debut: true } })).toEqual({ kind: "debut-win", text: "Free Loot wins on debut!" });
    expect(won({})).toBeNull();
  });

  it("lights a flame by a name on a win streak of 3 or more, grown or put out by the result", () => {
    const hot = { 1: { streak: { kind: "W" as const, n: 4 } }, 2: { streak: { kind: "W" as const, n: 2 } } };
    expect(fightStory(facts({}, hot)).flames).toEqual({ 1: 4, 2: 0 });
    expect(fightStory(facts({ result: { winnerSide: 1 } }, hot)).flames).toEqual({ 1: 5, 2: 0 });
    expect(fightStory(facts({ result: { winnerSide: 2 } }, hot)).flames).toEqual({ 1: 0, 2: 3 });
    expect(fightStory(facts({}, { 1: { streak: { kind: "L", n: 6 } } })).flames).toEqual({ 1: 0, 2: 0 });
  });

  it("counts streaks and finds a style's edge only when the data is big and clear enough", () => {
    expect(streakOf(["W", "W", "W", "L", "W"])).toEqual({ kind: "W", n: 3 });
    expect(streakOf(["L"])).toEqual({ kind: "L", n: 1 });
    expect(streakOf([])).toBeNull();
    const wins = { ZONER: { HEAVY: 61 }, HEAVY: { ZONER: 39, GRAPPLER: 20 }, GRAPPLER: { HEAVY: 19 } };
    expect(styleEdge(wins, "HEAVY", "ZONER")).toEqual({ winner: "ZONER", loser: "HEAVY", pct: 61, fights: 100 });
    expect(styleEdge(wins, "HEAVY", "GRAPPLER")).toBeNull(); // 39 fights: not enough
    expect(styleEdge({ ZONER: { HEAVY: 52 }, HEAVY: { ZONER: 48 } }, "ZONER", "HEAVY")).toBeNull(); // too close to call
    expect(styleEdge(wins, "ZONER", "ZONER")).toBeNull();
  });
});

describe("the post-fight breakdown", () => {
  const names = { 1: "Free Loot", 2: "Big Cheese" } as const;
  const r = (round: number, winnerSide: 0 | 1 | 2, more: Partial<RoundRecord> = {}): RoundRecord => ({ round, winnerSide, reason: "ko", life: null, low: null, firstHit: null, ticks: null, ...more });

  it("says why it was won, most telling first, at most three lines", () => {
    const rounds = [
      r(1, 2, { life: { 1: 0, 2: 400 }, low: { 1: 0, 2: 400 }, firstHit: 2, ticks: 2400 }),
      r(2, 1, { life: { 1: 1000, 2: 0 }, low: { 1: 1000, 2: 0 }, firstHit: 1, ticks: 900 }),
      r(3, 1, { life: { 1: 120, 2: 0 }, low: { 1: 80, 2: 0 }, firstHit: 2, ticks: 3000 }),
    ];
    // A comeback from 8% outranks a perfect round.
    expect(fightBreakdown(rounds, names, 1)).toEqual(["Came back from 8% life to win round 3", "Free Loot won round 2 without taking a hit", "Won the deciding round with just 12% life left"]);
    expect(fightBreakdown(rounds, names, 1, 5).slice(3)).toEqual(["Lost the first round, then won the next two", "Knocked out Big Cheese in 15 seconds in round 2"]);
  });

  it("counts first hits and rounds won on the clock", () => {
    const hitFirst = [r(1, 1, { firstHit: 1, reason: "time" }), r(2, 1, { firstHit: 1 })];
    expect(fightBreakdown(hitFirst, names, 1)).toEqual(["Landed the first hit in every round", "Won round 1 on the clock"]);
    const neverFirst = [r(1, 2, { firstHit: 1 }), r(2, 2, { firstHit: 1 })];
    expect(fightBreakdown(neverFirst, names, 2)).toEqual(["Won without landing the first hit in any round"]);
  });

  it("says only what older fights' rounds hold, and nothing for a plain win", () => {
    expect(fightBreakdown([r(1, 2), r(2, 1), r(3, 1)], names, 1)).toEqual(["Lost the first round, then won the next two"]);
    expect(fightBreakdown([r(1, 1), r(2, 1)], names, 1)).toEqual([]);
    expect(fightBreakdown([r(1, 1, { life: { 1: 640, 2: 0 } }), r(2, 1, { life: { 1: 520, 2: 0 } })], names, 1)).toEqual(["Finished with 52% life left"]);
  });

  it("tells of a signature move: a finish with it, a round won with it, landing it again and again", () => {
    const r = (round: number, winnerSide: 1 | 2, signatures: [number, number], signatureKo: 0 | 1 | 2) =>
      ({ round, winnerSide, reason: "ko", life: { 1: 500, 2: 500 }, low: null, firstHit: null, ticks: null, signatures: { 1: signatures[0], 2: signatures[1] }, signatureKo }) as RoundRecord;
    const names = { 1: "Slash Fund", 2: "Small Change" } as const;
    const moves = { 1: "Budget Cut", 2: "Cash Advance" };
    expect(fightBreakdown([r(1, 1, [4, 0], 0), r(2, 1, [6, 0], 1)], names, 1, 3, moves)).toContain("Finished Small Change with Budget Cut");
    expect(fightBreakdown([r(1, 1, [4, 0], 0), r(2, 1, [6, 0], 1)], names, 1, 3, moves)).toContain("Landed Budget Cut 10 times");
    expect(fightBreakdown([r(1, 1, [1, 0], 1), r(2, 2, [0, 1], 0), r(3, 1, [1, 0], 0)], names, 1, 5, moves)).toContain("Won round 1 with Budget Cut");
    // No name for the move (not one of ours): nothing said.
    expect(fightBreakdown([r(1, 1, [9, 0], 1)], names, 1, 5).join(" ")).not.toMatch(/Budget Cut|with undefined/);
  });
});
