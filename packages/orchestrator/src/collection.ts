/**
 * The card collection (docs/ENGAGEMENT.md §3; the owner's "cards, part 2"): every fighter's card, greyed out until
 * the player has seen it fight, and marked once they've won a bet on it. "Seen" is a fight the watch page showed them
 * while it was on (it reports each one: `markSeen`) or any fight they bet on once it started; "backed" is a bet won on
 * it. Nothing here touches Salt: the collection is only a record of what someone has watched and called.
 */
import type { Db } from "@greed-island/db";

/** A finished fight still counts as seen for this long after it ended (a page that reports it late). */
export const SEEN_GRACE_MS = 10 * 60_000;

export type SeenResult = { recorded: number } | { recorded: 0; refused: "not-started" | "too-late" };

/** Record that the player watched this fight: both its fighters join their collection (a fighter is only kept once). */
export async function markSeen(db: Db, userId: string, fightId: string, now = new Date()): Promise<SeenResult | null> {
  const f = await db.fight.findUnique({
    where: { id: fightId },
    select: { startedAt: true, closedAt: true, side1Character: { select: { fighterId: true } }, side2Character: { select: { fighterId: true } } },
  });
  if (!f) return null;
  if (!f.startedAt) return { recorded: 0, refused: "not-started" };
  if (f.closedAt && now.getTime() - f.closedAt.getTime() > SEEN_GRACE_MS) return { recorded: 0, refused: "too-late" };
  const fighters = [...new Set([f.side1Character.fighterId, f.side2Character.fighterId])];
  const r = await db.fighterSeen.createMany({ data: fighters.map((fighterId) => ({ userId, fighterId, fightId, seenAt: now })), skipDuplicates: true });
  return { recorded: r.count };
}

export interface CollectionFighter {
  id: string;
  /** Its number on the roster (oldest first), as its card shows it. */
  number: number;
  name: string;
  archetype: string;
  rarity: string;
  /** Its first house outfit, for a link to a profile. */
  profileId: string | null;
  /** When the player first saw it fight. */
  seen: { at: Date } | null;
  /** Bets the player won on it. */
  backed: { wins: number } | null;
}

export interface Collection {
  total: number;
  seen: number;
  backed: number;
  fighters: CollectionFighter[];
}

type FighterRow = { id: string; displayName: string; archetype: string; rarity: string; enabled: boolean; profileId: string | null };

/**
 * Put the collection together: the roster's fighters (plus any retired one the player already has), each seen at the
 * earliest of the fights they watched or bet on, and backed by the bets they won on it (a bet won is on a fight that
 * went ahead, so it's always seen too).
 */
export function buildCollection(fighters: readonly FighterRow[], seen: ReadonlyMap<string, Date>, wins: ReadonlyMap<string, number>): Collection {
  const kept = fighters.filter((f) => f.enabled || seen.has(f.id) || wins.has(f.id));
  const list = kept.map((f, i) => {
    const at = seen.get(f.id);
    const won = wins.get(f.id) ?? 0;
    return { id: f.id, number: i + 1, name: f.displayName, archetype: f.archetype, rarity: f.rarity, profileId: f.profileId, seen: at ? { at } : null, backed: won ? { wins: won } : null };
  });
  return { total: list.length, seen: list.filter((f) => f.seen).length, backed: list.filter((f) => f.backed).length, fighters: list };
}

/** A player's collection. */
export async function collectionView(db: Db, userId: string): Promise<Collection> {
  // Oldest first, as the cards number them (cards.ts rosterNumber).
  const rows = await db.fighter.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, displayName: true, archetype: true, rarity: true, enabled: true, characters: { where: { ownerKind: "HOUSE" }, orderBy: [{ palette: "asc" }, { createdAt: "asc" }], take: 1, select: { id: true } } },
  });
  const fighters = rows.map(({ characters, ...f }) => ({ ...f, profileId: characters[0]?.id ?? null }));
  const seen = new Map<string, Date>();
  const note = (fighterId: string, at: Date) => {
    const before = seen.get(fighterId);
    if (!before || at < before) seen.set(fighterId, at);
  };
  for (const s of await db.fighterSeen.findMany({ where: { userId }, select: { fighterId: true, seenAt: true } })) note(s.fighterId, s.seenAt);
  // Every fight the player bet on that went ahead: both sides count as seen.
  const watched = await db.$queryRaw<{ fighter_id: string; at: Date }[]>`
    SELECT l."fighter_id", MIN(f."started_at") AS at
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."started_at" IS NOT NULL
    JOIN "fight_loadout" l ON l."fight_id" = f."id"
    WHERE b."user_id" = ${userId}::uuid
    GROUP BY l."fighter_id"`;
  for (const w of watched) note(w.fighter_id, w.at);
  const won = await db.$queryRaw<{ fighter_id: string; wins: bigint }[]>`
    SELECT l."fighter_id", COUNT(*) AS wins
    FROM "bet" b
    JOIN "fight_loadout" l ON l."fight_id" = b."fight_id" AND l."side" = b."side"
    WHERE b."user_id" = ${userId}::uuid AND b."status" = 'WON'
    GROUP BY l."fighter_id"`;
  return buildCollection(fighters, seen, new Map(won.map((w) => [w.fighter_id, Number(w.wins)])));
}
