/**
 * Recaps (docs/ENGAGEMENT.md §5): what happened since a moment, for one player. The watch page asks for it when the
 * player comes back after a while ("While you were away: your fighter won 3 of 4...") and, after a long session, for
 * the session itself ("you called 41 of 70 fights, +2,300 Salt"). Honest numbers, nothing lost by being away, no
 * pressure: it only reads. `recapLines` is pure.
 */
import { toSalt, type Db, type Prisma } from "@greed-island/db";
import { PLAYER_TITLES, TITLES, type Config, type PlayerTitleCode, type TitleCode } from "@greed-island/shared";

export interface Recap {
  since: Date;
  /** Settled bets (Salt and T-Salt): how many, how many won, the Salt won minus staked (Salt only), upsets called. */
  bets: { settled: number; won: number; saltNet: bigint; upsets: number; biggest: { amount: bigint; fightNumber: number } | null };
  /** The player's own fighters: their record since, tier moves, titles earned. */
  fighters: { name: string; wins: number; losses: number; tierNow: string; tierBefore: string | null; titles: string[] }[];
  /** Owner rewards paid to the player since. */
  ownerRewards: bigint;
  /** Player titles earned since. */
  titles: string[];
  /** Tournaments finished since: their champions (newest first, at most 3). */
  champions: { tournament: number; name: string }[];
}

/** What happened since `since` (at most `maxDays` back). */
export async function recapFor(db: Db, config: Config, userId: string, since: Date, now = new Date(), maxDays = 7): Promise<Recap> {
  const from = new Date(Math.max(since.getTime(), now.getTime() - maxDays * 86_400_000));
  const bets = await db.$queryRaw<{ won: boolean; tsalt: boolean; stake: Prisma.Decimal; returned: Prisma.Decimal | null; chance: number | null; number: number }[]>`
    SELECT (b."status" = 'WON') AS won, (f."tournament_match_id" IS NOT NULL) AS tsalt, b."stake", b."returned", f."number",
           CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END AS chance
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED' AND f."closed_at" >= ${from}
    LEFT JOIN "fight_odds" o ON o."fight_id" = f."id"
    WHERE b."user_id" = ${userId}::uuid AND b."status" IN ('WON', 'LOST')`;
  let saltNet = 0n, upsets = 0;
  let biggest: Recap["bets"]["biggest"] = null;
  for (const b of bets) {
    const stake = toSalt(b.stake), back = b.returned ? toSalt(b.returned) : 0n;
    if (!b.tsalt) {
      saltNet += back - stake;
      if (b.won && (!biggest || back > biggest.amount)) biggest = { amount: back, fightNumber: b.number };
    }
    if (b.won && b.chance !== null && b.chance <= config.bettors.upsetChanceBp) upsets++;
  }

  const owned = await db.character.findMany({ where: { ownerUserId: userId }, select: { id: true, name: true, tier: true } });
  const fighters: Recap["fighters"] = [];
  for (const c of owned) {
    const fights = await db.fight.findMany({
      where: { state: "SETTLED", closedAt: { gte: from }, OR: [{ side1CharacterId: c.id }, { side2CharacterId: c.id }] },
      select: { winnerCharacterId: true },
    });
    const firstMove = await db.tierHistory.findFirst({ where: { characterId: c.id, createdAt: { gte: from } }, orderBy: { id: "asc" }, select: { fromTier: true } });
    const titles = await db.characterTitle.findMany({ where: { characterId: c.id, earnedAt: { gte: from } }, orderBy: { id: "asc" }, select: { code: true } });
    if (!fights.length && !titles.length && !firstMove) continue;
    const wins = fights.filter((f) => f.winnerCharacterId === c.id).length;
    fighters.push({
      name: c.name,
      wins,
      losses: fights.length - wins,
      tierNow: c.tier,
      tierBefore: firstMove && firstMove.fromTier !== c.tier ? firstMove.fromTier : null,
      titles: titles.map((t) => TITLES[t.code as TitleCode].label),
    });
  }

  const [reward] = await db.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT SUM(e."amount") AS total
    FROM "ledger_txn" t
    JOIN "ledger_entry" e ON e."txn_id" = t."id"
    JOIN "account" a ON a."id" = e."account_id" AND a."kind" = 'USER' AND a."user_id" = ${userId}::uuid
    WHERE t."kind" = 'OWNER_REWARD' AND t."created_at" >= ${from}`;
  const titles = await db.playerTitle.findMany({ where: { userId, earnedAt: { gte: from } }, orderBy: { id: "asc" }, select: { code: true } });
  const tournaments = await db.tournament.findMany({
    where: { status: "FINISHED", finishedAt: { gte: from } },
    orderBy: { number: "desc" },
    take: 3,
    select: { number: true, champion: { select: { name: true } } },
  });
  return {
    since: from,
    bets: { settled: bets.length, won: bets.filter((b) => b.won).length, saltNet, upsets, biggest },
    fighters,
    ownerRewards: reward?.total ? toSalt(reward.total) : 0n,
    titles: titles.map((t) => PLAYER_TITLES[t.code as PlayerTitleCode].label),
    champions: tournaments.filter((t) => t.champion).map((t) => ({ tournament: t.number, name: t.champion!.name })),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const salt = (n: bigint) => `${n < 0n ? "−" : "+"}${(n < 0n ? -n : n).toLocaleString("en-US")} Salt`;

/** The recap in a few plain lines, most personal first; empty when nothing happened. */
export function recapLines(r: Recap, max = 4): string[] {
  const lines: string[] = [];
  for (const f of r.fighters) {
    const record = f.wins + f.losses ? `won ${f.wins} of ${f.wins + f.losses}` : "";
    const tier = f.tierBefore ? `moved ${tierRank(f.tierNow) > tierRank(f.tierBefore) ? "up" : "down"} to ${f.tierNow} tier` : "";
    const titles = f.titles.length ? `earned ${f.titles.join(" and ")}` : "";
    const what = [record, tier, titles].filter(Boolean).join(", ");
    if (what) lines.push(`${f.name} ${what}`);
  }
  if (r.ownerRewards > 0n) lines.push(`Your fighters earned you ${r.ownerRewards.toLocaleString("en-US")} Salt in wins`);
  if (r.bets.settled) {
    const upsets = r.bets.upsets ? `, ${plural(r.bets.upsets, "upset")} among them` : "";
    lines.push(`You called ${r.bets.won} of ${plural(r.bets.settled, "fight")}${upsets} (${salt(r.bets.saltNet)})`);
  }
  if (r.titles.length) lines.push(`You earned the title${r.titles.length > 1 ? "s" : ""} ${r.titles.join(" and ")}`);
  for (const c of r.champions.slice(0, 1)) lines.push(`${c.name} won Tournament #${c.tournament}`);
  return lines.slice(0, max);
}

const TIER_ORDER = ["P", "B", "A", "S", "X"];
const tierRank = (t: string) => TIER_ORDER.indexOf(t);
