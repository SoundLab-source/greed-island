/**
 * Bettors' numbers (docs/ENGAGEMENT.md §2, step 3): a player's own (the account page: win rate, best upset called,
 * biggest payout, favourite fighter, how they do by style, how close each bettor title is) and the "best calls"
 * boards (the rankings page): most upsets called this week, best win rate this season and the longest run of right
 * calls this season. The rules are shared bettors.ts; bots are never on a board.
 */
import { fromSalt, toSalt, type Db, type Prisma } from "@greed-island/db";
import { bettorStats, playerName, rankBoard, type Archetype, type BettorStats, type Config } from "@greed-island/shared";

/** A player's numbers from all their settled bets. */
export async function myBettorStats(db: Db, config: Config, userId: string): Promise<BettorStats & { minCallStake: bigint }> {
  const rows = await db.$queryRaw<
    { number: number; tsalt: boolean; won: boolean; stake: Prisma.Decimal; returned: Prisma.Decimal | null; chance_bp: number; multiplier_bp: number; fighter_id: string; fighter_name: string; archetype: Archetype; against: boolean }[]
  >`
    SELECT f."number", (f."tournament_match_id" IS NOT NULL) AS tsalt, (b."status" = 'WON') AS won, b."stake", b."returned",
           CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END AS chance_bp,
           CASE WHEN b."side" = 1 THEN o."multiplier_bp1" ELSE o."multiplier_bp2" END AS multiplier_bp,
           l."fighter_id", fr."display_name" AS fighter_name, fr."archetype"::text AS archetype,
           CASE WHEN b."side" = 1 THEN o."pool1" < o."pool2" ELSE o."pool2" < o."pool1" END AS against
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED'
    JOIN "fight_odds" o ON o."fight_id" = b."fight_id"
    JOIN "fight_loadout" l ON l."fight_id" = b."fight_id" AND l."side" = b."side"
    JOIN "fighter" fr ON fr."id" = l."fighter_id"
    WHERE b."user_id" = ${userId}::uuid AND b."status" IN ('WON', 'LOST')
    ORDER BY f."number"`;
  const stats = bettorStats(
    rows.map((r) => ({
      fightNumber: r.number,
      currency: r.tsalt ? "TSALT" : "SALT",
      won: r.won,
      stake: toSalt(r.stake),
      returned: r.returned === null ? 0n : toSalt(r.returned),
      chanceBp: r.chance_bp,
      multiplierBp: r.multiplier_bp,
      fighterId: r.fighter_id,
      fighterName: r.fighter_name,
      archetype: r.archetype,
      againstCrowd: r.against,
    })),
    config.bettors,
  );
  return { ...stats, minCallStake: config.bettors.minCallStake };
}

export interface BoardRow {
  rank: number;
  name: string;
  /** The board's number: upsets called, win rate (%) or the longest run. */
  value: number;
  /** What's behind it: the longest shot called (%), the calls made (win rate), or the right calls this season (runs). */
  detail: number;
}

export interface Board {
  rows: BoardRow[];
  me: BoardRow | null;
}

export interface CallBoards {
  /** The smallest stake that counts as a call. */
  minCallStake: bigint;
  upsets: Board & { days: number; upsetPct: number };
  winRate: Board & { minCalls: number; season: number | null };
  streak: Board & { season: number | null };
}

/** The three best-calls boards, with the viewer's own line. */
export async function callBoards(db: Db, config: Config, viewerId?: string, now = new Date()): Promise<CallBoards> {
  const cfg = config.bettors;
  const min = fromSalt(cfg.minCallStake);
  const n = cfg.boardSize;
  const users = new Map<string, string>();
  const named = async (ids: string[]) => {
    const missing = ids.filter((id) => !users.has(id));
    if (missing.length) for (const u of await db.user.findMany({ where: { id: { in: missing } }, select: { id: true, displayName: true } })) users.set(u.id, playerName(u));
  };
  const board = async <T extends { user_id: string }>(rows: T[], better: (a: T, b: T) => number, line: (r: T) => { value: number; detail: number }): Promise<Board> => {
    const ranked = rankBoard(rows, better, (r) => r.user_id);
    const mine = viewerId ? ranked.find((r) => r.user_id === viewerId) : undefined;
    await named([...ranked.slice(0, n), ...(mine ? [mine] : [])].map((r) => r.user_id));
    const show = (r: (typeof ranked)[number]): BoardRow => ({ rank: r.rank, name: users.get(r.user_id) ?? "?", ...line(r) });
    return { rows: ranked.slice(0, n).map(show), me: mine ? show(mine) : null };
  };

  // Upsets called in the last week: right calls on a side given the upset chance or less.
  const since = new Date(now.getTime() - cfg.upsetsWindowMs);
  const upsets = await db.$queryRaw<{ user_id: string; upsets: bigint; best: number }[]>`
    SELECT b."user_id", COUNT(*) AS upsets, MIN(CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END) AS best
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED' AND f."closed_at" >= ${since}
    JOIN "fight_odds" o ON o."fight_id" = b."fight_id"
    JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
    WHERE b."status" = 'WON' AND b."stake" >= ${min}::numeric
      AND (CASE WHEN b."side" = 1 THEN o."chance_bp1" ELSE o."chance_bp2" END) <= ${cfg.upsetChanceBp}
    GROUP BY b."user_id"`;

  // This season's calls: win rate (with enough calls) and the longest run of right ones.
  const season = await db.season.findFirst({ where: { status: "RUNNING" }, select: { number: true, startsAt: true, endsAt: true } });
  const from = season?.startsAt ?? new Date(0), to = season?.endsAt ?? now;
  const rates = await db.$queryRaw<{ user_id: string; calls: bigint; wins: bigint }[]>`
    SELECT b."user_id", COUNT(*) AS calls, COUNT(*) FILTER (WHERE b."status" = 'WON') AS wins
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED' AND f."closed_at" >= ${from} AND f."closed_at" < ${to}
    JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
    WHERE b."status" IN ('WON', 'LOST') AND b."stake" >= ${min}::numeric
    GROUP BY b."user_id"`;
  // Runs: each player's calls in fight order, grouped into runs of the same result (gaps and islands).
  const runs = await db.$queryRaw<{ user_id: string; best: bigint; right: bigint }[]>`
    WITH c AS (
      SELECT b."user_id", (b."status" = 'WON') AS won,
             ROW_NUMBER() OVER (PARTITION BY b."user_id" ORDER BY f."number")
               - ROW_NUMBER() OVER (PARTITION BY b."user_id", (b."status" = 'WON') ORDER BY f."number") AS grp
      FROM "bet" b
      JOIN "fight" f ON f."id" = b."fight_id" AND f."state" = 'SETTLED' AND f."closed_at" >= ${from} AND f."closed_at" < ${to}
      JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
      WHERE b."status" IN ('WON', 'LOST') AND b."stake" >= ${min}::numeric
    )
    SELECT "user_id", MAX(n) AS best, SUM(n) AS "right" FROM (
      SELECT "user_id", grp, won, COUNT(*) AS n FROM c GROUP BY "user_id", grp, won
    ) r WHERE won GROUP BY "user_id"`;

  const pct = (w: bigint, c: bigint) => Math.round((1000 * Number(w)) / Number(c)) / 10;
  const qualified = rates.filter((r) => Number(r.calls) >= cfg.winRateMinCalls);
  return {
    minCallStake: cfg.minCallStake,
    upsets: {
      days: Math.round(cfg.upsetsWindowMs / 86_400_000),
      upsetPct: cfg.upsetChanceBp / 100,
      ...(await board(upsets, (a, b) => Number(b.upsets) - Number(a.upsets) || a.best - b.best, (r) => ({ value: Number(r.upsets), detail: Math.round(r.best / 100) }))),
    },
    winRate: {
      minCalls: cfg.winRateMinCalls,
      season: season?.number ?? null,
      ...(await board(qualified, (a, b) => pct(b.wins, b.calls) - pct(a.wins, a.calls) || Number(b.calls) - Number(a.calls), (r) => ({ value: pct(r.wins, r.calls), detail: Number(r.calls) }))),
      // The viewer's own numbers even before they qualify.
      ...(viewerId && !qualified.some((r) => r.user_id === viewerId) ? { me: ownRate(rates.find((r) => r.user_id === viewerId), pct) } : {}),
    },
    streak: {
      season: season?.number ?? null,
      ...(await board(runs, (a, b) => Number(b.best) - Number(a.best), (r) => ({ value: Number(r.best), detail: Number(r.right) }))),
    },
  };
}

/** A not-yet-qualified viewer's win rate: no rank. */
function ownRate(r: { calls: bigint; wins: bigint } | undefined, pct: (w: bigint, c: bigint) => number): BoardRow | null {
  return r ? { rank: 0, name: "", value: pct(r.wins, r.calls), detail: Number(r.calls) } : null;
}
