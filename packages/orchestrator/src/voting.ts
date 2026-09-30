/**
 * Voting (docs/PHASE3.md step 5). The season clock (seasons.ts) opens a
 * season's ballot when its voting window starts, with every approved
 * submission not yet on a ballot, and closes it when the season ends: counts
 * are published, the top ones are elected, the rest are not (their
 * communities can submit again). Votes are free and can be taken back until
 * voting closes; counts stay hidden until then.
 */
import { NotFoundError, withRetry, type Db, type Prisma, type Tx } from "@greed-island/db";
import { ballotResult, castProblem, LedgerRuleError, voterProblem, votingOpensAt, type Config } from "@greed-island/shared";
import type { BusEvent } from "./bus.ts";

type SeasonRow = Prisma.SeasonGetPayload<object>;
type BallotRow = Prisma.BallotGetPayload<object>;

function refuse(problem: string | null): void {
  if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
}

/** Open the running season's ballot once its voting window starts (if there's anything to vote on). */
export async function openBallotIfDue(tx: Tx, config: Config, season: SeasonRow, now: Date): Promise<BusEvent[]> {
  const opensAt = votingOpensAt(season, config.voting);
  if (now < opensAt || now >= season.endsAt) return [];
  if (await tx.ballot.findUnique({ where: { seasonId: season.id }, select: { id: true } })) return [];
  // Approved before voting opened and not on an earlier ballot, oldest first.
  const approved = await tx.submission.findMany({ where: { status: "APPROVED", ballotEntry: null }, orderBy: { number: "asc" } });
  if (!approved.length) return [];
  const ballot = await tx.ballot.create({ data: { seasonId: season.id, opensAt, closesAt: season.endsAt, createdAt: now } });
  await tx.ballotEntry.createMany({ data: approved.map((s) => ({ ballotId: ballot.id, submissionId: s.id })) });
  return [
    {
      type: "ballot",
      status: "OPENED",
      seasonNumber: season.number,
      closesAt: season.endsAt.toISOString(),
      fighters: approved.map((s) => ({ name: s.fighterName, community: s.community })),
    },
  ];
}

/** Count the season's ballot (if it has one), elect the winners and close it. */
export async function closeBallot(tx: Tx, config: Config, season: SeasonRow, now: Date): Promise<BusEvent[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ballot" WHERE "season_id" = ${season.id}::uuid AND "status" = 'OPEN' FOR UPDATE`;
  if (!rows[0]) return [];
  const ballotId = rows[0].id;
  const counts = await tx.$queryRaw<{ submission_id: string; votes: bigint; first_submitted_at: Date }[]>`
    SELECT e."submission_id",
           (SELECT COUNT(*) FROM "vote" v WHERE v."ballot_id" = e."ballot_id" AND v."submission_id" = e."submission_id") AS votes,
           (SELECT MIN(r."created_at") FROM "review_item" r WHERE r."submission_id" = e."submission_id") AS first_submitted_at
    FROM "ballot_entry" e
    WHERE e."ballot_id" = ${ballotId}::uuid`;
  const result = ballotResult(
    counts.map((c) => ({ submissionId: c.submission_id, votes: Number(c.votes), firstSubmittedAt: c.first_submitted_at })),
    config.voting,
  );
  for (const r of result) {
    await tx.ballotEntry.update({ where: { ballotId_submissionId: { ballotId, submissionId: r.submissionId } }, data: { votes: r.votes, rank: r.rank, elected: r.elected } });
    await tx.submission.update({ where: { id: r.submissionId }, data: { status: r.elected ? "ELECTED" : "NOT_ELECTED" } });
  }
  await tx.ballot.update({ where: { id: ballotId }, data: { status: "CLOSED", closedAt: now } });
  const subs = new Map((await tx.submission.findMany({ where: { id: { in: result.map((r) => r.submissionId) } } })).map((s) => [s.id, s]));
  return [
    {
      type: "ballot",
      status: "CLOSED",
      seasonNumber: season.number,
      results: result.map((r) => ({ name: subs.get(r.submissionId)!.fighterName, community: subs.get(r.submissionId)!.community, votes: r.votes, elected: r.elected })),
    },
  ];
}

/** The running season's ballot, while voting is open. */
async function openBallot(tx: Tx, now: Date): Promise<BallotRow> {
  const ballot = await tx.ballot.findFirst({ where: { status: "OPEN", season: { status: "RUNNING" } } });
  if (!ballot || now < ballot.opensAt) refuse("voting isn't open");
  if (now >= ballot!.closesAt) refuse("voting has closed; the results come with the next fight");
  return ballot!;
}

/** Why this account can't vote now, or null. */
export async function voterProblemFor(db: Db | Tx, config: Config, userId: string, now: Date): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, createdAt: true } });
  if (!user) return "sign in first";
  const bets = await db.bet.count({ where: { userId } });
  return voterProblem({ emailVerified: user.emailVerifiedAt !== null, createdAt: user.createdAt, bets, now }, config.voting);
}

/** Vote for a fighter on the open ballot. Voting again for the same fighter returns the same vote (replayed). */
export async function castVote(db: Db, config: Config, input: { userId: string; submissionId: string }, now = new Date()): Promise<{ replayed: boolean }> {
  return withRetry(db, async (tx) => {
    const ballot = await openBallot(tx, now);
    // One account's votes take turns, so the count holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7109, hashtext(${`${ballot.id}:${input.userId}`}))`;
    refuse(await voterProblemFor(tx, config, input.userId, now));
    const mine = await tx.vote.findMany({ where: { ballotId: ballot.id, userId: input.userId }, select: { submissionId: true } });
    if (mine.some((v) => v.submissionId === input.submissionId)) return { replayed: true };
    const onBallot = (await tx.ballotEntry.findUnique({ where: { ballotId_submissionId: { ballotId: ballot.id, submissionId: input.submissionId } } })) !== null;
    refuse(castProblem({ open: true, onBallot, alreadyVoted: false, used: mine.length }, config.voting));
    await tx.vote.create({ data: { ballotId: ballot.id, userId: input.userId, submissionId: input.submissionId, createdAt: now } });
    return { replayed: false };
  });
}

/** Take a vote back while voting is open. */
export async function retractVote(db: Db, input: { userId: string; submissionId: string }, now = new Date()): Promise<void> {
  await withRetry(db, async (tx) => {
    const ballot = await openBallot(tx, now);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7109, hashtext(${`${ballot.id}:${input.userId}`}))`;
    const { count } = await tx.vote.deleteMany({ where: { ballotId: ballot.id, userId: input.userId, submissionId: input.submissionId } });
    if (count === 0) throw new NotFoundError("you haven't voted for that fighter");
  });
}
