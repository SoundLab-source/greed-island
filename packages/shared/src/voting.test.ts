import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import { ballotResult, castProblem, DEFAULT_VOTING, voterProblem, votingOpensAt } from "./voting.ts";

const DAY = 86_400_000;
const cfg = DEFAULT_VOTING;

describe("voting window", () => {
  it("opens 2 weeks before the season ends, never before it starts", () => {
    const startsAt = new Date("2026-10-01T00:00:00Z");
    expect(votingOpensAt({ startsAt, endsAt: new Date(startsAt.getTime() + 56 * DAY) }, cfg)).toEqual(new Date(startsAt.getTime() + 42 * DAY));
    expect(votingOpensAt({ startsAt, endsAt: new Date(startsAt.getTime() + 7 * DAY) }, cfg)).toEqual(startsAt);
  });
});

describe("who can vote", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const ok = { emailVerified: true, createdAt: new Date(now.getTime() - 30 * DAY), bets: 25, now };

  it("needs a verified email, a 14-day-old account and 20 bets", () => {
    expect(voterProblem(ok, cfg)).toBeNull();
    expect(voterProblem({ ...ok, emailVerified: false }, cfg)).toMatch(/add your email/);
    expect(voterProblem({ ...ok, createdAt: new Date(now.getTime() - 3 * DAY) }, cfg)).toMatch(/14 days old \(yours: 2026-12-12\)/);
    expect(voterProblem({ ...ok, bets: 19 }, cfg)).toMatch(/place 20 bets to vote \(you have 19\)/);
    expect(voterProblem({ ...ok, createdAt: new Date(now.getTime() - 14 * DAY), bets: 20 }, cfg)).toBeNull();
  });

  it("gives 3 votes, at most one per fighter", () => {
    const vote = { open: true, onBallot: true, alreadyVoted: false, used: 2 };
    expect(castProblem(vote, cfg)).toBeNull();
    expect(castProblem({ ...vote, used: 3 }, cfg)).toMatch(/all 3 votes/);
    expect(castProblem({ ...vote, alreadyVoted: true }, cfg)).toMatch(/already voted/);
    expect(castProblem({ ...vote, onBallot: false }, cfg)).toMatch(/isn't on this ballot/);
    expect(castProblem({ ...vote, open: false }, cfg)).toMatch(/isn't open/);
  });
});

describe("ballotResult", () => {
  const at = (d: number) => new Date(Date.UTC(2026, 9, d));

  it("elects the top 2 by votes, ties to the one sent first, and never with no votes", () => {
    const r = ballotResult(
      [
        { submissionId: "c", votes: 5, firstSubmittedAt: at(3) },
        { submissionId: "a", votes: 9, firstSubmittedAt: at(5) },
        { submissionId: "b", votes: 5, firstSubmittedAt: at(1) },
        { submissionId: "d", votes: 0, firstSubmittedAt: at(1) },
      ],
      cfg,
    );
    expect(r.map((x) => [x.submissionId, x.rank, x.elected])).toEqual([["a", 1, true], ["b", 2, true], ["c", 3, false], ["d", 4, false]]);
    expect(ballotResult([{ submissionId: "x", votes: 0, firstSubmittedAt: at(1) }], cfg)[0]!.elected).toBe(false);
  });

  it("elects at most the configured number, all with votes (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ submissionId: fc.uuid(), votes: fc.nat(50), firstSubmittedAt: fc.date({ noInvalidDate: true }) }), { maxLength: 12 }), fc.integer({ min: 1, max: 4 }), (counts, n) => {
        const r = ballotResult(counts, { ...cfg, electedPerSeason: n });
        const elected = r.filter((x) => x.elected);
        expect(elected.length).toBeLessThanOrEqual(n);
        for (const e of elected) expect(e.votes).toBeGreaterThan(0);
        for (let i = 1; i < r.length; i++) expect(r[i - 1]!.votes).toBeGreaterThanOrEqual(r[i]!.votes);
      }),
    );
  });
});

describe("voting config", () => {
  it("reads its settings", () => {
    expect(loadConfig({}).voting).toEqual(DEFAULT_VOTING);
    expect(loadConfig({ GI_VOTING_DAYS: "7", GI_VOTES_PER_VOTER: "5", GI_VOTER_MIN_AGE_DAYS: "0", GI_VOTER_MIN_BETS: "0", GI_ELECTED_PER_SEASON: "3" }).voting).toEqual({
      windowMs: 7 * DAY,
      votesPerVoter: 5,
      minAccountAgeMs: 0,
      minBets: 0,
      electedPerSeason: 3,
    });
    expect(() => loadConfig({ GI_VOTING_DAYS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_VOTES_PER_VOTER: "0" })).toThrow(ConfigError);
  });
});
