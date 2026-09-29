/**
 * Exhibition challenges (DESIGN §5, docs/PHASE2.md step 5). An owner
 * challenges another owner's character; the challenged owner accepts or
 * declines before it expires; accepted challenges wait for the exhibition
 * segment and are booked oldest first. Free: no Salt changes hands, and
 * everyone bets on the fight as usual.
 */
import { NotFoundError, withRetry, type Db, type Tx } from "@greed-island/db";
import {
  challengeProblem,
  challengeTransition,
  LedgerRuleError,
  OPEN_CHALLENGE_STATUSES,
  type ChallengeActor,
  type Config,
} from "@greed-island/shared";

type ChallengeRow = Awaited<ReturnType<Tx["challenge"]["findUniqueOrThrow"]>>;

/** Expire unanswered challenges past their deadline. */
export async function expireChallenges(db: Db | Tx, now: Date): Promise<number> {
  const { count } = await db.challenge.updateMany({ where: { status: "PENDING", expiresAt: { lte: now } }, data: { status: "EXPIRED", closedAt: now } });
  return count;
}

async function side(tx: Tx, characterId: string) {
  const c = await tx.character.findUnique({ where: { id: characterId }, include: { fighter: { select: { enabled: true } } } });
  if (!c) throw new NotFoundError("no such character");
  return { id: c.id, fighterId: c.fighterId, ownerUserId: c.ownerUserId, enabled: c.enabled && c.fighter.enabled };
}

export interface SendChallengeInput {
  userId: string;
  /** Your character. */
  challengerCharacterId: string;
  /** Another player's character. */
  challengedCharacterId: string;
}

/** Send a challenge. Sending the same one again while it's open returns it (replayed). */
export async function sendChallenge(db: Db, config: Config, input: SendChallengeInput, now = new Date()): Promise<{ challenge: ChallengeRow; replayed: boolean }> {
  const { userId } = input;
  return withRetry(db, async (tx) => {
    // One player's challenges at a time, so the open-challenge count holds.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7104, hashtext(${userId}))`;
    await expireChallenges(tx, now);
    const [mine, theirs] = [await side(tx, input.challengerCharacterId), await side(tx, input.challengedCharacterId)];
    const open = await tx.challenge.findFirst({
      where: {
        status: { in: [...OPEN_CHALLENGE_STATUSES] },
        OR: [
          { challengerCharacterId: mine.id, challengedCharacterId: theirs.id },
          { challengerCharacterId: theirs.id, challengedCharacterId: mine.id },
        ],
      },
    });
    if (open?.challengerUserId === userId && open.challengerCharacterId === mine.id) return { challenge: open, replayed: true };
    if (open) throw new LedgerRuleError("NOT_ELIGIBLE", "these two characters already have an open challenge");
    const openSent = await tx.challenge.count({ where: { challengerUserId: userId, status: { in: [...OPEN_CHALLENGE_STATUSES] } } });
    const problem = challengeProblem({ userId, challenger: mine, challenged: theirs, openSent }, config.exhibitions);
    if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
    const challenge = await tx.challenge.create({
      data: {
        challengerUserId: userId,
        challengerCharacterId: mine.id,
        challengedUserId: theirs.ownerUserId!,
        challengedCharacterId: theirs.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + config.exhibitions.challengeTtlMs),
      },
    });
    return { challenge, replayed: false };
  });
}

export type ChallengeAnswer = "ACCEPT" | "DECLINE" | "CANCEL";

/** Accept or decline (the challenged owner), or cancel (the challenger, until it's booked). */
export async function answerChallenge(db: Db, input: { userId: string; challengeId: string; action: ChallengeAnswer }, now = new Date()): Promise<ChallengeRow> {
  const { userId, challengeId, action } = input;
  const result = await withRetry(db, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "challenge" WHERE "id" = ${challengeId}::uuid FOR UPDATE`;
    const c = rows.length ? await tx.challenge.findUniqueOrThrow({ where: { id: challengeId } }) : null;
    const actor: ChallengeActor | null = !c ? null : c.challengerUserId === userId ? "challenger" : c.challengedUserId === userId ? "challenged" : null;
    // Other players' challenges look the same as missing ones.
    if (!c || !actor) throw new NotFoundError("no such challenge");
    if (c.status === "PENDING" && c.expiresAt <= now) {
      await tx.challenge.update({ where: { id: c.id }, data: { status: "EXPIRED", closedAt: now } });
      return { expired: true as const };
    }
    const t = challengeTransition(c.status, action, actor);
    if (!t.ok) throw new LedgerRuleError("NOT_ELIGIBLE", t.error);
    if (action === "ACCEPT") {
      const [a, b] = [await side(tx, c.challengerCharacterId), await side(tx, c.challengedCharacterId)];
      if (!a.enabled || !b.enabled) throw new LedgerRuleError("NOT_ELIGIBLE", "both characters must be active on the stream");
    }
    const updated = await tx.challenge.update({
      where: { id: c.id },
      data: { status: t.to, ...(t.to === "ACCEPTED" ? { acceptedAt: now } : { closedAt: now }) },
    });
    return { expired: false as const, updated };
  });
  // Expiring is committed; then report it.
  if (result.expired) throw new LedgerRuleError("NOT_ELIGIBLE", "the challenge expired");
  return result.updated;
}

/**
 * The oldest accepted challenge whose characters are both active, locked for
 * booking, or null. Challenges with an inactive character wait in the queue.
 */
export async function nextAcceptedChallenge(tx: Tx): Promise<ChallengeRow | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT ch."id" FROM "challenge" ch
    JOIN "character" a ON a."id" = ch."challenger_character_id"
    JOIN "fighter" fa ON fa."id" = a."fighter_id"
    JOIN "character" b ON b."id" = ch."challenged_character_id"
    JOIN "fighter" fb ON fb."id" = b."fighter_id"
    WHERE ch."status" = 'ACCEPTED' AND a."enabled" AND b."enabled" AND fa."enabled" AND fb."enabled"
    ORDER BY ch."accepted_at", ch."id"
    LIMIT 1
    FOR UPDATE OF ch`;
  return rows[0] ? tx.challenge.findUniqueOrThrow({ where: { id: rows[0].id } }) : null;
}
