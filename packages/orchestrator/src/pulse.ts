/**
 * The pulse (staff.html): how many people are betting, and whether they come back. Numbers to tell whether a change
 * to the site brought players in or kept them, without any tracking beyond the bets themselves: a "player" here is
 * anyone who placed a bet (bots never count), and days are UTC days.
 */
import { toSalt, type Db, type Prisma } from "@greed-island/db";

const DAY = 86_400_000;

export interface PulseWindow {
  label: string;
  /** Players who bet in the window, the bets they placed, and the Salt staked (tournament T-Salt left out). */
  bettors: number;
  bets: number;
  staked: bigint;
  /** Players whose first bet ever was in the window, and those who had bet before it. */
  newBettors: number;
  returning: number;
}

export interface PulseDay {
  /** YYYY-MM-DD, UTC. */
  day: string;
  bettors: number;
  bets: number;
  staked: bigint;
  newBettors: number;
}

export interface Pulse {
  windows: PulseWindow[];
  /** Fights settled in the last 7 days, and the players betting on each on average. */
  fights: { settled: number; bettorsPerFight: number };
  /** Players whose first bet was 2 to 8 days ago, and how many of them bet again on a later day. */
  cameBack: { players: number; returned: number };
  /** The last 14 days, newest first. */
  days: PulseDay[];
}

const num = (v: bigint | number | null) => Number(v ?? 0);

export async function pulse(db: Db, now = new Date()): Promise<Pulse> {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);
  const window = async (label: string, from: Date, to: Date): Promise<PulseWindow> => {
    const [r] = await db.$queryRaw<{ bettors: bigint; bets: bigint; staked: Prisma.Decimal; new_bettors: bigint; returning: bigint }[]>`
      WITH firsts AS (
        SELECT b."user_id", MIN(b."placed_at") AS first_at
        FROM "bet" b JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
        GROUP BY b."user_id"
      ), w AS (
        SELECT b."user_id", b."stake", (f."tournament_match_id" IS NOT NULL) AS tsalt
        FROM "bet" b
        JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
        JOIN "fight" f ON f."id" = b."fight_id"
        WHERE b."placed_at" >= ${from} AND b."placed_at" < ${to}
      )
      SELECT COUNT(DISTINCT w."user_id") AS bettors, COUNT(*) AS bets,
             COALESCE(SUM(w."stake") FILTER (WHERE NOT w.tsalt), 0) AS staked,
             COUNT(DISTINCT w."user_id") FILTER (WHERE fi.first_at >= ${from}) AS new_bettors,
             COUNT(DISTINCT w."user_id") FILTER (WHERE fi.first_at < ${from}) AS returning
      FROM w JOIN firsts fi ON fi."user_id" = w."user_id"`;
    return { label, bettors: num(r?.bettors ?? 0n), bets: num(r?.bets ?? 0n), staked: r ? toSalt(r.staked) : 0n, newBettors: num(r?.new_bettors ?? 0n), returning: num(r?.returning ?? 0n) };
  };
  const windows = [
    await window("Last 24 hours", at(DAY), now),
    await window("Last 7 days", at(7 * DAY), now),
    await window("The 7 days before", at(14 * DAY), at(7 * DAY)),
  ];

  const [f] = await db.$queryRaw<{ settled: bigint; bettors: bigint }[]>`
    SELECT COUNT(DISTINCT f."id") AS settled, COUNT(b."id") AS bettors
    FROM "fight" f
    LEFT JOIN "bet" b ON b."fight_id" = f."id" AND b."user_id" IN (SELECT "id" FROM "user" WHERE "kind" <> 'BOT')
    WHERE f."state" = 'SETTLED' AND f."closed_at" >= ${at(7 * DAY)} AND f."closed_at" < ${now}`;
  const settled = num(f?.settled ?? 0n);

  // A UTC day: the cohort is everyone whose first bet fell on a day 2 to 8 days back; they came back if they bet on a later day.
  const today = Math.floor(now.getTime() / DAY) * DAY;
  const [c] = await db.$queryRaw<{ players: bigint; returned: bigint }[]>`
    WITH firsts AS (
      SELECT b."user_id", date_trunc('day', MIN(b."placed_at") AT TIME ZONE 'UTC') AS first_day
      FROM "bet" b JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
      GROUP BY b."user_id"
    )
    SELECT COUNT(*) AS players,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "bet" b2 WHERE b2."user_id" = fi."user_id" AND b2."placed_at" < ${now}
               AND date_trunc('day', b2."placed_at" AT TIME ZONE 'UTC') > fi.first_day)) AS returned
    FROM firsts fi
    WHERE fi.first_day >= (${new Date(today - 8 * DAY)}::timestamptz AT TIME ZONE 'UTC')
      AND fi.first_day < (${new Date(today - 2 * DAY)}::timestamptz AT TIME ZONE 'UTC')`;

  const rows = await db.$queryRaw<{ day: Date; bettors: bigint; bets: bigint; staked: Prisma.Decimal; new_bettors: bigint }[]>`
    WITH firsts AS (
      SELECT b."user_id", MIN(b."placed_at") AS first_at
      FROM "bet" b JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
      GROUP BY b."user_id"
    )
    SELECT date_trunc('day', b."placed_at" AT TIME ZONE 'UTC') AS day,
           COUNT(DISTINCT b."user_id") AS bettors, COUNT(*) AS bets,
           COALESCE(SUM(b."stake") FILTER (WHERE f."tournament_match_id" IS NULL), 0) AS staked,
           COUNT(DISTINCT b."user_id") FILTER (WHERE fi.first_at = b."placed_at") AS new_bettors
    FROM "bet" b
    JOIN "user" u ON u."id" = b."user_id" AND u."kind" <> 'BOT'
    JOIN "fight" f ON f."id" = b."fight_id"
    JOIN firsts fi ON fi."user_id" = b."user_id"
    WHERE b."placed_at" >= ${new Date(today - 13 * DAY)} AND b."placed_at" < ${now}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [isoDay(r.day), r]));
  const days: PulseDay[] = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(today - i * DAY).toISOString().slice(0, 10);
    const r = byDay.get(day);
    days.push({ day, bettors: num(r?.bettors ?? 0n), bets: num(r?.bets ?? 0n), staked: r ? toSalt(r.staked) : 0n, newBettors: num(r?.new_bettors ?? 0n) });
  }

  return {
    windows,
    fights: { settled, bettorsPerFight: settled ? Math.round((num(f!.bettors) / settled) * 10) / 10 : 0 },
    cameBack: { players: num(c?.players ?? 0n), returned: num(c?.returned ?? 0n) },
    days,
  };
}

// date_trunc on a timestamp without time zone comes back as a Date read as UTC.
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
