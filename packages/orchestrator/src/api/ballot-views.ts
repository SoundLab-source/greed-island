/**
 * Read model for a season's ballot (docs/PHASE3.md step 5). While voting is
 * open, vote counts are hidden; once it closes, they're published with the
 * ranking and who was elected. Fighters on a ballot are public, including
 * their images.
 */
import type { Db } from "@greed-island/db";
import { votingOpensAt, type Config } from "@greed-island/shared";
import { voterProblemFor } from "../voting.ts";

export async function ballotView(db: Db, config: Config, seasonNumber: number | null, viewerId?: string, now = new Date()) {
  const season =
    seasonNumber === null ? await db.season.findFirst({ where: { status: "RUNNING" } }) : await db.season.findUnique({ where: { number: seasonNumber } });
  if (!season) return null;
  const ballot = await db.ballot.findUnique({
    where: { seasonId: season.id },
    include: { entries: { include: { submission: { include: { files: { where: { role: "PORTRAIT" }, select: { id: true } } } } } } },
  });
  if (!ballot) {
    return {
      seasonNumber: season.number,
      status: season.status === "RUNNING" ? ("UPCOMING" as const) : ("NONE" as const),
      opensAt: votingOpensAt(season, config.voting),
      closesAt: season.endsAt,
      /** Approved fighters waiting for a ballot (this one, if approved before voting opens). */
      waiting: await db.submission.count({ where: { status: "APPROVED", ballotEntry: null } }),
      entries: [],
      me: null,
    };
  }
  const closed = ballot.status === "CLOSED";
  const votingOpen = !closed && now >= ballot.opensAt && now < ballot.closesAt;
  const entries = ballot.entries
    .map((e) => ({
      submissionId: e.submissionId,
      number: e.submission.number,
      fighterName: e.submission.fighterName,
      community: e.submission.community,
      archetype: e.submission.archetype,
      description: e.submission.description,
      portraitFileId: e.submission.files[0]?.id ?? null,
      /** Published when voting closes. */
      result: closed ? { votes: e.votes!, rank: e.rank!, elected: e.elected! } : null,
    }))
    .sort((a, b) => (a.result && b.result ? a.result.rank - b.result.rank : a.number - b.number));
  let me = null;
  if (viewerId && votingOpen) {
    const problem = await voterProblemFor(db, config, viewerId, now);
    const votedFor = (await db.vote.findMany({ where: { ballotId: ballot.id, userId: viewerId }, select: { submissionId: true } })).map((v) => v.submissionId);
    me = { eligible: problem === null, reason: problem, votedFor, votesLeft: Math.max(0, config.voting.votesPerVoter - votedFor.length) };
  }
  return {
    seasonNumber: season.number,
    status: ballot.status,
    votingOpen,
    opensAt: ballot.opensAt,
    closesAt: ballot.closesAt,
    votesPerVoter: config.voting.votesPerVoter,
    electedPerSeason: config.voting.electedPerSeason,
    entries,
    me,
  };
}
