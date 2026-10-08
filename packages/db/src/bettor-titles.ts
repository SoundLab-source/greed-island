/**
 * Bettor titles (docs/ENGAGEMENT.md §2; the rules are shared bettors.ts): Called It, Iron Read, Loyal and
 * Contrarian, earned by playing and kept for good. Awarded inside the settlement transaction, right after the bets are
 * settled, to every player (not bots) whose bet on the fight counts as a call; each row records the fight that earned
 * it. `backfillBettorTitles` awards them for fights settled before they existed.
 */
import { BETTOR_TITLE_CODES, bettorTitlesEarned, playerName, type BettorConfig, type BettorTitleCode } from "@greed-island/shared";
import type { Db, Tx } from "./client.ts";
import { fromSalt } from "./convert.ts";

export interface AwardedBettorTitle {
  userId: string;
  name: string;
  code: BettorTitleCode;
  fightId: string;
}

const CODES = [...BETTOR_TITLE_CODES];

/** Award the bettor titles a settled fight earned. Call after the fight's bets are settled, in the same transaction. */
export async function awardBettorTitles(tx: Tx, input: { fightId: string; cfg: BettorConfig; earnedAt: Date }): Promise<AwardedBettorTitle[]> {
  const { fightId, cfg } = input;
  const odds = await tx.fightOdds.findUnique({ where: { fightId }, select: { chanceBp1: true, chanceBp2: true } });
  if (!odds) return [];
  const fighterOf = new Map((await tx.fightLoadout.findMany({ where: { fightId }, select: { side: true, fighterId: true } })).map((l) => [l.side, l.fighterId]));
  const bets = await tx.bet.findMany({
    where: { fightId, status: { in: ["WON", "LOST"] }, stake: { gte: fromSalt(cfg.minCallStake) }, user: { kind: { not: "BOT" } } },
    orderBy: { placedAt: "asc" },
    select: { userId: true, side: true, status: true, returned: true, user: { select: { id: true, displayName: true } } },
  });
  const min = fromSalt(cfg.minCallStake);
  const awarded: AwardedBettorTitle[] = [];
  for (const b of bets) {
    const held = new Set<string>((await tx.playerTitle.findMany({ where: { userId: b.userId, code: { in: CODES } }, select: { code: true } })).map((t) => t.code));
    if (held.size === CODES.length) continue;
    const fighterId = fighterOf.get(b.side);
    if (!fighterId) continue;
    // The player's latest calls, newest first, for the run of right ones.
    const recent = await tx.$queryRaw<{ won: boolean }[]>`
      SELECT (b."status" = 'WON') AS won FROM "bet" b JOIN "fight" f ON f."id" = b."fight_id"
      WHERE b."user_id" = ${b.userId}::uuid AND b."status" IN ('WON', 'LOST') AND b."stake" >= ${min}::numeric
      ORDER BY f."number" DESC LIMIT ${cfg.ironReadStreak}`;
    let streak = 0;
    while (streak < recent.length && recent[streak]!.won) streak++;
    const [onFighter] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "bet" b JOIN "fight_loadout" l ON l."fight_id" = b."fight_id" AND l."side" = b."side"
      WHERE b."user_id" = ${b.userId}::uuid AND b."status" IN ('WON', 'LOST') AND b."stake" >= ${min}::numeric AND l."fighter_id" = ${fighterId}`;
    const [contrarian] = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "bet" b JOIN "fight_odds" o ON o."fight_id" = b."fight_id"
      WHERE b."user_id" = ${b.userId}::uuid AND b."status" = 'WON' AND b."stake" >= ${min}::numeric
        AND ((b."side" = 1 AND o."pool1" < o."pool2") OR (b."side" = 2 AND o."pool2" < o."pool1"))`;
    const codes = bettorTitlesEarned(
      {
        won: b.status === "WON",
        chanceBp: b.side === 1 ? odds.chanceBp1 : odds.chanceBp2,
        streak,
        callsOnFighter: Number(onFighter?.n ?? 0),
        contrarianWins: Number(contrarian?.n ?? 0),
      },
      held,
      cfg,
    );
    for (const code of codes) {
      await tx.playerTitle.create({ data: { userId: b.userId, code, fightId, balance: b.returned ?? "0", earnedAt: input.earnedAt } });
      awarded.push({ userId: b.userId, name: playerName(b.user), code, fightId });
    }
  }
  return awarded;
}

/**
 * Award bettor titles for fights settled before they existed, by replaying every counted call in fight order.
 * Safe to run more than once: titles a player already has are skipped. Returns how many were added.
 */
export async function backfillBettorTitles(db: Db, cfg: BettorConfig): Promise<number> {
  const min = fromSalt(cfg.minCallStake);
  const calls = await db.$queryRaw<{ user_id: string; fight_id: string; closed_at: Date | null; won: boolean; returned: string; chance_bp: number; fighter_id: string; against: boolean }[]>`
    SELECT b."user_id", b."fight_id", f."closed_at", (b."status" = 'WON') AS won, COALESCE(b."returned", 0)::text AS returned,
           CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END AS chance_bp, l."fighter_id",
           CASE WHEN b."side" = 1 THEN o."pool1" < o."pool2" ELSE o."pool2" < o."pool1" END AS against
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED'
    JOIN "fight_odds" o ON o."fight_id" = b."fight_id"
    JOIN "fight_loadout" l ON l."fight_id" = b."fight_id" AND l."side" = b."side"
    JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
    WHERE b."status" IN ('WON', 'LOST') AND b."stake" >= ${min}::numeric
    ORDER BY f."number", b."placed_at"`;
  const held = new Map<string, Set<string>>();
  for (const t of await db.playerTitle.findMany({ where: { code: { in: CODES } }, select: { userId: true, code: true } })) {
    held.set(t.userId, (held.get(t.userId) ?? new Set()).add(t.code));
  }
  const state = new Map<string, { streak: number; onFighter: Map<string, number>; contrarian: number }>();
  const rows: { userId: string; code: BettorTitleCode; fightId: string; balance: string; earnedAt: Date }[] = [];
  for (const c of calls) {
    const s = state.get(c.user_id) ?? { streak: 0, onFighter: new Map<string, number>(), contrarian: 0 };
    state.set(c.user_id, s);
    s.streak = c.won ? s.streak + 1 : 0;
    s.onFighter.set(c.fighter_id, (s.onFighter.get(c.fighter_id) ?? 0) + 1);
    if (c.won && c.against) s.contrarian++;
    const mine = held.get(c.user_id) ?? new Set<string>();
    held.set(c.user_id, mine);
    const codes = bettorTitlesEarned({ won: c.won, chanceBp: c.chance_bp, streak: s.streak, callsOnFighter: s.onFighter.get(c.fighter_id)!, contrarianWins: s.contrarian }, mine, cfg);
    for (const code of codes) {
      mine.add(code);
      rows.push({ userId: c.user_id, code, fightId: c.fight_id, balance: c.returned, earnedAt: c.closed_at ?? new Date() });
    }
  }
  if (!rows.length) return 0;
  return (await db.playerTitle.createMany({ data: rows, skipDuplicates: true })).count;
}
