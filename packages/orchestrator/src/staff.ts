/**
 * Staff roles and the review queue (docs/PHASE3.md step 1). Owners ask for
 * custom character names; a moderator or admin approves or rejects them.
 * Staff can also reset a player's display name or a character's custom
 * name, and admins appoint moderators. Every staff action goes in the
 * append-only staff log. Roles are read fresh on every action, so a removed
 * moderator loses access at once.
 */
import { NotFoundError, withRetry, type Db, type Tx } from "@greed-island/db";
import {
  automaticName,
  characterNameProblem,
  hasPermission,
  LedgerRuleError,
  MAX_SUBMISSION_NOTE_LENGTH,
  nameKey,
  normalizeCharacterName,
  reasonProblem,
  renameProblem,
  reviewNoteProblem,
  reviewProblem,
  roleChangeProblem,
  submissionTransition,
  type Config,
  type ReviewDecision,
  type StaffPermission,
  type SubmissionStatus,
  type UserRole,
} from "@greed-island/shared";

type ReviewRow = Awaited<ReturnType<Tx["reviewItem"]["findUniqueOrThrow"]>>;

/** Not allowed for this account (HTTP 403). */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}

function refuse(problem: string | null): void {
  if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
}

function cleanNote(note: string | null | undefined): string | null {
  const n = note?.trim();
  return n ? n : null;
}

/** The account, if it has this permission now. */
export async function requireStaff(db: Db | Tx, userId: string, permission: StaffPermission): Promise<{ id: string; role: UserRole }> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!u || !hasPermission(u.role, permission)) throw new ForbiddenError("this is for staff only");
  return u;
}

/** Requests and approvals of the same name take turns, so two characters (or submitted fighters) can't end up with it. */
export async function lockName(tx: Tx, name: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7105, hashtext(${nameKey(name)}))`;
}

async function lockCharacter(tx: Tx, characterId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "character" WHERE "id" = ${characterId}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundError("no such character");
  return tx.character.findUniqueOrThrow({ where: { id: characterId }, include: { fighter: { select: { displayName: true } } } });
}

const NO_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Whether a name is in use, ignoring case: by another character, a fighter,
 * a submitted fighter that's open, approved or elected, or (for new requests) another
 * character's name request that's waiting.
 */
export async function nameTaken(
  tx: Tx,
  name: string,
  opts: { exceptCharacterId?: string; exceptSubmissionId?: string; includePending: boolean },
): Promise<boolean> {
  const key = nameKey(name);
  const character = opts.exceptCharacterId ?? NO_ID;
  const submission = opts.exceptSubmissionId ?? NO_ID;
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM "character" WHERE lower("name") = ${key} AND "id" <> ${character}::uuid
    UNION ALL
    SELECT 1 FROM "fighter" WHERE lower("display_name") = ${key}
    UNION ALL
    SELECT 1 FROM "submission"
    WHERE lower("fighter_name") = ${key} AND "id" <> ${submission}::uuid
      AND "status" IN ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'ELECTED')
    UNION ALL
    SELECT 1 FROM "review_item"
    WHERE ${opts.includePending} AND "kind" = 'CHARACTER_NAME' AND "status" = 'PENDING'
      AND lower("proposed_name") = ${key} AND "character_id" <> ${character}::uuid
    LIMIT 1`;
  return rows.length > 0;
}

/**
 * An owner asks for a custom name; it waits in the review queue. Asking for
 * the same name again while it waits returns the same request (replayed).
 */
export async function requestCharacterName(
  db: Db,
  config: Config,
  input: { userId: string; characterId: string; name: string },
  now = new Date(),
): Promise<{ request: ReviewRow; replayed: boolean }> {
  const { userId, characterId } = input;
  const name = normalizeCharacterName(input.name);
  refuse(characterNameProblem(name));
  return withRetry(db, async (tx) => {
    await lockName(tx, name);
    const c = await lockCharacter(tx, characterId);
    const pending = await tx.reviewItem.findFirst({ where: { characterId, kind: "CHARACTER_NAME", status: "PENDING" } });
    if (pending && pending.submittedByUserId === userId && pending.proposedName === name) return { request: pending, replayed: true };
    const lastApproved = await tx.reviewItem.findFirst({
      where: { characterId, kind: "CHARACTER_NAME", status: "APPROVED" },
      orderBy: { decidedAt: "desc" },
      select: { decidedAt: true },
    });
    refuse(
      renameProblem(
        { userId, ownerUserId: c.ownerUserId, pending: pending !== null, lastApprovedAt: lastApproved?.decidedAt ?? null, currentName: c.name, name, now },
        config.staff,
      ),
    );
    if (await nameTaken(tx, name, { exceptCharacterId: characterId, includePending: true })) refuse("that name is taken");
    const request = await tx.reviewItem.create({ data: { kind: "CHARACTER_NAME", submittedByUserId: userId, characterId, proposedName: name, createdAt: now } });
    return { request, replayed: false };
  });
}

async function lockReview(tx: Tx, reviewId: string): Promise<ReviewRow | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "review_item" WHERE "id" = ${reviewId}::uuid FOR UPDATE`;
  return rows.length ? tx.reviewItem.findUniqueOrThrow({ where: { id: reviewId } }) : null;
}

/** The player takes back their own request while it waits. */
export async function withdrawRequest(db: Db, input: { userId: string; reviewId: string }, now = new Date()): Promise<ReviewRow> {
  return withRetry(db, async (tx) => {
    const item = await lockReview(tx, input.reviewId);
    // Other players' requests look the same as missing ones.
    if (!item || item.submittedByUserId !== input.userId) throw new NotFoundError("no such request");
    if (item.status !== "PENDING") refuse(`this request was already ${item.status.toLowerCase()}`);
    if (item.kind === "FIGHTER_SUBMISSION") refuse("withdraw the submission itself");
    return tx.reviewItem.update({ where: { id: item.id }, data: { status: "WITHDRAWN", decidedAt: now } });
  });
}

/**
 * A moderator or admin decides a request. A custom name is approved (the
 * character is renamed from its next fight; fights already booked keep the
 * name they were booked with) or rejected. A fighter submission is approved
 * (it goes on to the ballot), sent back for changes, or rejected for good.
 */
export async function decideReview(
  db: Db,
  input: { reviewerId: string; reviewId: string; decision: ReviewDecision; note?: string | null },
  now = new Date(),
): Promise<ReviewRow> {
  const { reviewerId, decision } = input;
  const note = cleanNote(input.note);
  refuse(reviewNoteProblem(decision, note, MAX_SUBMISSION_NOTE_LENGTH));
  return withRetry(db, async (tx) => {
    const reviewer = await requireStaff(tx, reviewerId, "review");
    const item = await lockReview(tx, input.reviewId);
    if (!item) throw new NotFoundError("no such request");
    refuse(reviewProblem({ status: item.status, reviewerId, reviewerRole: reviewer.role, submitterId: item.submittedByUserId }));
    const decided = { decidedAt: now, decidedByUserId: reviewerId, note };
    const logged = { actorUserId: reviewerId, actorRole: reviewer.role, targetUserId: item.submittedByUserId, characterId: item.characterId, reviewItemId: item.id, createdAt: now };
    if (item.kind === "FIGHTER_SUBMISSION") return decideSubmissionTx(tx, item, decision, { decided, logged, now });

    refuse(reviewNoteProblem(decision, note));
    if (decision === "REQUEST_CHANGES") refuse("only fighter submissions can be sent back for changes: approve or reject the name");
    const name = item.proposedName!;
    if (decision === "REJECT") {
      const updated = await tx.reviewItem.update({ where: { id: item.id }, data: { status: "REJECTED", ...decided } });
      await tx.staffAction.create({ data: { ...logged, kind: "REVIEW_REJECTED", detail: { kind: item.kind, name, note } } });
      return updated;
    }
    await lockName(tx, name);
    const c = await lockCharacter(tx, item.characterId!);
    if (c.ownerUserId !== item.submittedByUserId) refuse("the character has a different owner now: reject this request");
    if (await nameTaken(tx, name, { exceptCharacterId: c.id, includePending: false })) refuse("another character has this name now: reject this request");
    await tx.character.update({ where: { id: c.id }, data: { name } });
    const updated = await tx.reviewItem.update({ where: { id: item.id }, data: { status: "APPROVED", previousName: c.name, ...decided } });
    await tx.staffAction.create({ data: { ...logged, kind: "REVIEW_APPROVED", detail: { kind: item.kind, name, previousName: c.name, note } } });
    return updated;
  });
}

const DECISION_OUTCOME = {
  APPROVE: { action: "APPROVE", review: "APPROVED", log: "REVIEW_APPROVED" },
  REJECT: { action: "REJECT", review: "REJECTED", log: "REVIEW_REJECTED" },
  REQUEST_CHANGES: { action: "REQUEST_CHANGES", review: "CHANGES_REQUESTED", log: "REVIEW_CHANGES_REQUESTED" },
} as const;

async function decideSubmissionTx(
  tx: Tx,
  item: ReviewRow,
  decision: ReviewDecision,
  ctx: {
    decided: { decidedAt: Date; decidedByUserId: string; note: string | null };
    logged: { actorUserId: string; actorRole: UserRole; targetUserId: string; characterId: string | null; reviewItemId: string; createdAt: Date };
    now: Date;
  },
): Promise<ReviewRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "submission" WHERE "id" = ${item.submissionId}::uuid FOR UPDATE`;
  if (!rows.length) throw new NotFoundError("no such submission");
  const sub = await tx.submission.findUniqueOrThrow({ where: { id: item.submissionId! } });
  const outcome = DECISION_OUTCOME[decision];
  const t = submissionTransition(sub.status, outcome.action);
  if (!t.ok) refuse(t.error);
  if (decision === "APPROVE") {
    await lockName(tx, sub.fighterName);
    if (await nameTaken(tx, sub.fighterName, { exceptSubmissionId: sub.id, includePending: false })) {
      refuse("a fighter or character has this name now: ask for changes");
    }
  }
  const to = (t as { to: SubmissionStatus }).to;
  await tx.submission.update({ where: { id: sub.id }, data: { status: to, closedAt: to === "CHANGES_REQUESTED" ? null : ctx.now } });
  const updated = await tx.reviewItem.update({ where: { id: item.id }, data: { status: outcome.review, ...ctx.decided } });
  await tx.staffAction.create({
    data: {
      ...ctx.logged,
      kind: outcome.log,
      detail: { kind: item.kind, submission: sub.number, fighterName: sub.fighterName, community: sub.community, note: ctx.decided.note },
    },
  });
  return updated;
}

/** Staff clear a player's display name (they show as "Anon-…" again). */
export async function resetDisplayName(db: Db, input: { actorId: string; userId: string; note: string }, now = new Date()): Promise<void> {
  const note = cleanNote(input.note);
  refuse(reasonProblem(note));
  await withRetry(db, async (tx) => {
    const actor = await requireStaff(tx, input.actorId, "reset_names");
    const rows = await tx.$queryRaw<{ display_name: string | null }[]>`SELECT "display_name" FROM "user" WHERE "id" = ${input.userId}::uuid FOR UPDATE`;
    if (!rows[0]) throw new NotFoundError("no such player");
    const previous = rows[0].display_name;
    if (previous === null) refuse("this player has no display name to reset");
    await tx.user.update({ where: { id: input.userId }, data: { displayName: null } });
    await tx.staffAction.create({
      data: { actorUserId: actor.id, actorRole: actor.role, kind: "DISPLAY_NAME_RESET", targetUserId: input.userId, detail: { previousName: previous, note }, createdAt: now },
    });
  });
}

/** Staff put an owned character's custom name back to its automatic one ("Grey Monk #1"). */
export async function resetCharacterName(db: Db, input: { actorId: string; characterId: string; note: string }, now = new Date()): Promise<string> {
  const note = cleanNote(input.note);
  refuse(reasonProblem(note));
  return withRetry(db, async (tx) => {
    const actor = await requireStaff(tx, input.actorId, "reset_names");
    const c = await lockCharacter(tx, input.characterId);
    if (c.ownerKind !== "USER" || c.serial === null) refuse("house characters are named in roster.json");
    const name = automaticName(c.fighter.displayName, c.serial!);
    if (c.name === name) refuse("this character already has its automatic name");
    await tx.character.update({ where: { id: c.id }, data: { name } });
    await tx.staffAction.create({
      data: { actorUserId: actor.id, actorRole: actor.role, kind: "CHARACTER_NAME_RESET", targetUserId: c.ownerUserId, characterId: c.id, detail: { name, previousName: c.name, note }, createdAt: now },
    });
    return name;
  });
}

export type RoleTarget = { userId: string } | { email: string };

/**
 * Set an account's role. `actorId` null means the server's command line
 * (pnpm staff:role), which can set any role; otherwise an admin appointing
 * or removing a moderator. Setting the role it already has changes nothing.
 */
export async function setRole(
  db: Db,
  input: { actorId: string | null; target: RoleTarget; role: UserRole; note?: string | null },
  now = new Date(),
): Promise<{ userId: string; from: UserRole; to: UserRole; changed: boolean }> {
  const note = cleanNote(input.note);
  if (note && note.length > 200) refuse("a note is at most 200 characters");
  return withRetry(db, async (tx) => {
    const actor = input.actorId === null ? null : await tx.user.findUnique({ where: { id: input.actorId }, select: { id: true, role: true } });
    if (input.actorId !== null && (!actor || !hasPermission(actor.role, "manage_moderators"))) {
      throw new ForbiddenError("only an admin can appoint or remove moderators");
    }
    const where = "userId" in input.target ? { id: input.target.userId } : { email: input.target.email.trim().toLowerCase() };
    const found = await tx.user.findUnique({ where, select: { id: true } });
    if (!found) throw new NotFoundError("userId" in input.target ? "no such player" : "no account with that email");
    await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
    const target = await tx.user.findUniqueOrThrow({ where: { id: found.id } });
    refuse(
      roleChangeProblem({
        actor: actor ? { kind: "user", id: actor.id, role: actor.role } : { kind: "cli" },
        target: { id: target.id, role: target.role, emailVerified: target.emailVerifiedAt !== null },
        to: input.role,
      }),
    );
    if (target.role === input.role) return { userId: target.id, from: target.role, to: input.role, changed: false };
    await tx.user.update({ where: { id: target.id }, data: { role: input.role } });
    await tx.staffAction.create({
      data: { actorUserId: actor?.id ?? null, actorRole: actor?.role ?? null, kind: "ROLE_SET", targetUserId: target.id, detail: { from: target.role, to: input.role, note }, createdAt: now },
    });
    return { userId: target.id, from: target.role, to: input.role, changed: true };
  });
}
