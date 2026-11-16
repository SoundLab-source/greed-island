/**
 * Follow a fighter (docs/ENGAGEMENT.md §4): players follow fighters (the design: all its outfits and owned copies) and
 * the site gives them a heads-up when one is about to fight (shared follows.ts `followHeadsUp`, put on the fight view
 * for the viewer). Following is free, capped (GI_FOLLOW_MAX) and touches no Salt. Bots don't follow anyone.
 */
import type { Db } from "@greed-island/db";
import { followProblem, LedgerRuleError, type FollowConfig } from "@greed-island/shared";

export interface FollowedFighter {
  fighterId: string;
  name: string;
  archetype: string;
  /** Its first house outfit, for a link to a profile (null when it has none). */
  profileId: string | null;
  followedAt: Date;
}

/** Follow a fighter. Following one already followed changes nothing. Null when there's no such fighter. */
export async function followFighter(db: Db, userId: string, fighterId: string, config: FollowConfig, now = new Date()): Promise<{ following: true; added: boolean } | null> {
  return db.$transaction(async (tx) => {
    // One player's follows are counted and added one at a time, so two quick clicks can't pass the cap together.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`follow:${userId}`}))`;
    const fighter = await tx.fighter.findUnique({ where: { id: fighterId }, select: { enabled: true } });
    if (!fighter) return null;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { kind: true } });
    if (user.kind === "BOT") throw new LedgerRuleError("NOT_ELIGIBLE", "bots don't follow fighters");
    const already = await tx.fighterFollow.findUnique({ where: { userId_fighterId: { userId, fighterId } }, select: { userId: true } });
    const count = await tx.fighterFollow.count({ where: { userId } });
    const problem = followProblem({ alreadyFollowing: Boolean(already), count, fighterEnabled: fighter.enabled }, config);
    if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
    if (already) return { following: true as const, added: false };
    await tx.fighterFollow.create({ data: { userId, fighterId, followedAt: now } });
    return { following: true as const, added: true };
  });
}

/** Stop following a fighter (fine when the player wasn't following it). */
export async function unfollowFighter(db: Db, userId: string, fighterId: string): Promise<{ following: false; removed: boolean }> {
  const r = await db.fighterFollow.deleteMany({ where: { userId, fighterId } });
  return { following: false, removed: r.count > 0 };
}

/** The fighters a player follows, most recently followed first. */
export async function myFollows(db: Db, userId: string): Promise<FollowedFighter[]> {
  const rows = await db.fighterFollow.findMany({
    where: { userId },
    orderBy: [{ followedAt: "desc" }, { fighterId: "asc" }],
    select: {
      followedAt: true,
      fighter: {
        select: {
          id: true,
          displayName: true,
          archetype: true,
          characters: { where: { ownerKind: "HOUSE" }, orderBy: [{ palette: "asc" }, { createdAt: "asc" }], take: 1, select: { id: true } },
        },
      },
    },
  });
  return rows.map((r) => ({ fighterId: r.fighter.id, name: r.fighter.displayName, archetype: r.fighter.archetype, profileId: r.fighter.characters[0]?.id ?? null, followedAt: r.followedAt }));
}

/** The ids of the fighters a player follows. */
export async function followedIds(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.fighterFollow.findMany({ where: { userId }, select: { fighterId: true } });
  return new Set(rows.map((r) => r.fighterId));
}

/** How many players follow a fighter. */
export async function followerCount(db: Db, fighterId: string): Promise<number> {
  return db.fighterFollow.count({ where: { fighterId } });
}
