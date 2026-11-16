/**
 * The ledger's side of the weekly Salt report (shared `economyReport`, DESIGN §9): per week, the net change to
 * players' Salt by transaction kind, and how many players bet. Players are real accounts (bots left out), Salt only
 * (tournament T-Salt is its own book).
 */
import { economyReport, weekStart, type EconomyReport, type EconomyWeekInput } from "@greed-island/shared";
import type { Db } from "./client.ts";
import { toSalt } from "./convert.ts";
import type { Prisma } from "./generated/prisma/client.ts";

type Dec = Prisma.Decimal;

/** The last `weeks` weeks (the current one included), with players' Salt before them as the starting supply. */
export async function economyWeeks(db: Db, opts: { weeks?: number; now?: Date } = {}): Promise<{ weeks: EconomyWeekInput[]; startingSupply: bigint }> {
  const weeks = opts.weeks ?? 12;
  const now = opts.now ?? new Date();
  const flows = await db.$queryRaw<{ week: Date; kind: string; total: Dec }[]>`
    SELECT date_trunc('week', t."created_at" AT TIME ZONE 'UTC') AS week, t."kind"::text AS kind, SUM(e."amount") AS total
    FROM "ledger_entry" e
    JOIN "account" a ON a."id" = e."account_id"
    JOIN "user" u ON u."id" = a."user_id"
    JOIN "ledger_txn" t ON t."id" = e."txn_id"
    WHERE a."kind" = 'USER' AND a."asset" = 'SALT' AND u."kind" <> 'BOT'
      AND t."created_at" < ${now}
    GROUP BY 1, 2`;
  const active = await db.$queryRaw<{ week: Date; players: bigint }[]>`
    SELECT date_trunc('week', t."created_at" AT TIME ZONE 'UTC') AS week, COUNT(DISTINCT t."user_id") AS players
    FROM "ledger_txn" t JOIN "user" u ON u."id" = t."user_id"
    WHERE t."kind" = 'BET' AND u."kind" <> 'BOT' AND t."created_at" < ${now}
    GROUP BY 1`;

  // date_trunc on a timestamp without time zone comes back as a Date read as UTC: the Monday of each week.
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const byWeek = new Map<string, EconomyWeekInput>();
  const ensure = (d: Date) => {
    const k = key(d);
    let w = byWeek.get(k);
    if (!w) byWeek.set(k, (w = { week: new Date(`${k}T00:00:00Z`), byKind: {}, activePlayers: 0 }));
    return w;
  };
  for (const f of flows) {
    const w = ensure(f.week);
    w.byKind[f.kind] = (w.byKind[f.kind] ?? 0n) + toSalt(f.total);
  }
  for (const a of active) ensure(a.week).activePlayers = Number(a.players);

  // Every week in the window, quiet ones too, so growth is measured week to week.
  const thisMonday = weekStart(now);
  const first = new Date(thisMonday.getTime() - (weeks - 1) * 7 * 86_400_000);
  let startingSupply = 0n;
  const out: EconomyWeekInput[] = [];
  for (const [k, w] of byWeek) {
    if (w.week < first) {
      for (const v of Object.values(w.byKind)) startingSupply += v;
      byWeek.delete(k);
    }
  }
  for (let t = first.getTime(); t <= thisMonday.getTime(); t += 7 * 86_400_000) out.push(byWeek.get(key(new Date(t))) ?? { week: new Date(t), byKind: {}, activePlayers: 0 });
  return { weeks: out, startingSupply };
}

export async function economyReportFor(db: Db, opts: { weeks?: number; now?: Date; tolerancePct?: number } = {}): Promise<EconomyReport> {
  const { weeks, startingSupply } = await economyWeeks(db, opts);
  return economyReport(weeks, { startingSupply, ...(opts.tolerancePct !== undefined ? { tolerancePct: opts.tolerancePct } : {}) });
}
