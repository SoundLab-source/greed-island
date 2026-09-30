/**
 * Voting (DESIGN §11, docs/PHASE3.md step 5). Approved fighter submissions go
 * on the season's ballot when voting opens (the last 2 weeks of the season).
 * Eligible accounts (verified email, old enough, active enough) get 3 votes,
 * at most 1 per fighter, and can change them until voting closes. Counts are
 * hidden until the end, then published; the top 2 with at least one vote are
 * elected (ties go to the one sent for review first) and released at the next
 * season (step 6). Pure rules; defaults answer DESIGN §15.
 */

export interface VotingConfig {
  /** Voting runs for this long before the season ends. */
  windowMs: number;
  /** Votes each eligible account has per ballot (at most one per fighter). */
  votesPerVoter: number;
  /** Account age needed to vote. */
  minAccountAgeMs: number;
  /** Bets placed needed to vote (Salt or T-Salt). */
  minBets: number;
  /** Fighters elected per season. */
  electedPerSeason: number;
}

export const DEFAULT_VOTING: Readonly<VotingConfig> = Object.freeze({
  windowMs: 14 * 86_400_000,
  votesPerVoter: 3,
  minAccountAgeMs: 14 * 86_400_000,
  minBets: 20,
  electedPerSeason: 2,
});

/** When voting opens in a season ending at `endsAt` (never before the season starts). */
export function votingOpensAt(season: { startsAt: Date; endsAt: Date }, cfg: VotingConfig): Date {
  return new Date(Math.max(season.startsAt.getTime(), season.endsAt.getTime() - cfg.windowMs));
}

/** Why this account can't vote, or null. */
export function voterProblem(input: { emailVerified: boolean; createdAt: Date; bets: number; now: Date }, cfg: VotingConfig): string | null {
  if (!input.emailVerified) return "add your email first (the sign-in link) to vote";
  const eligibleAt = input.createdAt.getTime() + cfg.minAccountAgeMs;
  if (eligibleAt > input.now.getTime()) {
    return `accounts can vote once they're ${Math.round(cfg.minAccountAgeMs / 86_400_000)} days old (yours: ${new Date(eligibleAt).toISOString().slice(0, 10)})`;
  }
  if (input.bets < cfg.minBets) return `place ${cfg.minBets} bets to vote (you have ${input.bets})`;
  return null;
}

/** Why this vote can't be cast, or null. */
export function castProblem(input: { open: boolean; onBallot: boolean; alreadyVoted: boolean; used: number }, cfg: VotingConfig): string | null {
  if (!input.open) return "voting isn't open";
  if (!input.onBallot) return "that fighter isn't on this ballot";
  if (input.alreadyVoted) return "you already voted for this fighter";
  if (input.used >= cfg.votesPerVoter) return `you've used all ${cfg.votesPerVoter} votes; take one back to vote for another fighter`;
  return null;
}

export interface BallotCount {
  submissionId: string;
  votes: number;
  /** First sent for review: breaks ties. */
  firstSubmittedAt: Date;
}

/** Final ranking: most votes, then sent for review first. The top ones with at least one vote are elected. */
export function ballotResult<T extends BallotCount>(counts: readonly T[], cfg: VotingConfig): (T & { rank: number; elected: boolean })[] {
  return [...counts]
    .sort((a, b) => b.votes - a.votes || a.firstSubmittedAt.getTime() - b.firstSubmittedAt.getTime() || (a.submissionId < b.submissionId ? -1 : 1))
    .map((c, i) => ({ ...c, rank: i + 1, elected: i < cfg.electedPerSeason && c.votes > 0 }));
}
