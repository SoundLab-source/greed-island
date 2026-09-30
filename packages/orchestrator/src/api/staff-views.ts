/**
 * Read models for staff (docs/PHASE3.md step 1): the review queue, the staff
 * log, the staff list and search. Only served to staff; emails only to admins.
 */
import type { Db, Prisma } from "@greed-island/db";
import { automaticName, hasPermission, permissionsOf, playerName, type UserRole } from "@greed-island/shared";

type ReviewWithRefs = Prisma.ReviewItemGetPayload<{
  include: { submittedBy: true; decidedBy: true; character: { include: { fighter: true; owner: true } }; submission: true };
}>;

function reviewView(r: ReviewWithRefs) {
  const c = r.character;
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    submittedBy: { id: r.submittedByUserId, name: playerName(r.submittedBy) },
    character: c
      ? {
          id: c.id,
          name: c.name,
          fighter: c.fighter.displayName,
          automaticName: c.serial !== null ? automaticName(c.fighter.displayName, c.serial) : null,
          tier: c.tier,
          owner: c.owner ? playerName(c.owner) : "House",
          /** The requester no longer owns it (approving would fail). */
          ownerChanged: c.ownerUserId !== r.submittedByUserId,
        }
      : null,
    proposedName: r.proposedName,
    previousName: r.previousName,
    /** FIGHTER_SUBMISSION: open it with GET /api/submissions/:id for the details and images. */
    submission: r.submission
      ? { id: r.submission.id, number: r.submission.number, status: r.submission.status, community: r.submission.community, fighterName: r.submission.fighterName, archetype: r.submission.archetype }
      : null,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy ? { id: r.decidedBy.id, name: playerName(r.decidedBy) } : null,
    note: r.note,
  };
}

const reviewInclude = { submittedBy: true, decidedBy: true, character: { include: { fighter: true, owner: true } }, submission: true } as const;

/** Waiting requests oldest first, then the latest decisions. */
export async function reviewQueue(db: Db, take = 50) {
  const [pending, decided] = await Promise.all([
    db.reviewItem.findMany({ where: { status: "PENDING" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take, include: reviewInclude }),
    db.reviewItem.findMany({ where: { status: { not: "PENDING" } }, orderBy: [{ decidedAt: "desc" }, { id: "desc" }], take: 20, include: reviewInclude }),
  ]);
  return { pending: pending.map(reviewView), recent: decided.map(reviewView) };
}

/** The staff log, newest first. */
export async function staffLog(db: Db, take = 100) {
  const rows = await db.staffAction.findMany({ orderBy: { id: "desc" }, take, include: { actor: true, targetUser: true, character: true } });
  return rows.map((a) => ({
    id: a.id.toString(),
    at: a.createdAt,
    kind: a.kind,
    by: a.actor ? { id: a.actor.id, name: playerName(a.actor), role: a.actorRole } : { id: null, name: "server command line", role: null },
    player: a.targetUser ? { id: a.targetUser.id, name: playerName(a.targetUser) } : null,
    character: a.character ? { id: a.character.id, name: a.character.name } : null,
    reviewId: a.reviewItemId,
    detail: a.detail,
  }));
}

/** Current staff. Emails only for admins (they appoint and remove by email). */
export async function staffMembers(db: Db, viewerRole: UserRole) {
  const staff = await db.user.findMany({ where: { role: { not: "PLAYER" } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  return staff.map((u) => ({ id: u.id, name: playerName(u), role: u.role, email: hasPermission(viewerRole, "manage_moderators") ? u.email : null }));
}

/** Find players (display name, or an exact email) and characters (name) to moderate. */
export async function staffSearch(db: Db, q: string) {
  const text = q.trim();
  if (text.length < 2) return { players: [], characters: [] };
  const [players, characters] = await Promise.all([
    db.user.findMany({
      where: { OR: [{ displayName: { contains: text, mode: "insensitive" } }, { email: text.toLowerCase() }, ...(/^[0-9a-f-]{36}$/i.test(text) ? [{ id: text }] : [])] },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    db.character.findMany({ where: { name: { contains: text, mode: "insensitive" } }, orderBy: { name: "asc" }, take: 20, include: { fighter: true, owner: true } }),
  ]);
  return {
    players: players.map((u) => ({ id: u.id, name: playerName(u), displayName: u.displayName, kind: u.kind, role: u.role, createdAt: u.createdAt })),
    characters: characters.map((c) => {
      const auto = c.serial !== null ? automaticName(c.fighter.displayName, c.serial) : null;
      return { id: c.id, name: c.name, fighter: c.fighter.displayName, owner: c.owner ? playerName(c.owner) : "House", automaticName: auto, customName: auto !== null && c.name !== auto };
    }),
  };
}

/** A player's own view of their latest name request for a character. */
export async function latestNameRequest(db: Db, characterId: string) {
  const r = await db.reviewItem.findFirst({ where: { characterId, kind: "CHARACTER_NAME" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return r ? { id: r.id, name: r.proposedName, status: r.status, note: r.note, createdAt: r.createdAt, decidedAt: r.decidedAt } : null;
}

/** Names a character had before an approved rename, oldest first. */
export async function formerNames(db: Db, characterId: string): Promise<string[]> {
  const rows = await db.reviewItem.findMany({ where: { characterId, kind: "CHARACTER_NAME", status: "APPROVED" }, orderBy: { decidedAt: "asc" }, select: { previousName: true } });
  return [...new Set(rows.map((r) => r.previousName!))];
}

export function staffInfo(role: UserRole) {
  return { role, permissions: permissionsOf(role) };
}
