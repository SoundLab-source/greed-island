import type { Salt } from "@greed-island/shared";
import type { Db, Prisma } from "./client.ts";
import { toSalt } from "./convert.ts";

export interface AuditProblem {
  check: string;
  detail: string;
}

export interface AuditReport {
  ok: boolean;
  problems: AuditProblem[];
  stats: {
    transactions: number;
    accounts: number;
    /** Total Salt ever created (grants and bailouts). */
    issued: Salt;
    /** Salt held by users (available, not in escrow). */
    userBalances: Salt;
    /** Salt held in escrow for open bets. */
    escrow: Salt;
    /** House profit and loss: positive means the house is up. */
    house: Salt;
    /** Salt spent in the shop and on upgrades, out of circulation. */
    sink: Salt;
  };
}

type Dec = Prisma.Decimal;

/**
 * Re-derive the ledger's invariants from raw entries. Everything here should
 * also be impossible because of the database guards; the audit proves it.
 */
export async function auditLedger(db: Db): Promise<AuditReport> {
  const problems: AuditProblem[] = [];
  const add = (check: string, detail: string) => problems.push({ check, detail });

  const unbalanced = await db.$queryRaw<{ txn_id: string; asset: string; total: Dec }[]>`
    SELECT e."txn_id", a."asset"::text AS asset, SUM(e."amount") AS total
    FROM "ledger_entry" e JOIN "account" a ON a."id" = e."account_id"
    GROUP BY e."txn_id", a."asset"
    HAVING SUM(e."amount") <> 0`;
  for (const r of unbalanced) add("zero-sum", `txn ${r.txn_id} (${r.asset}) sums to ${toSalt(r.total)}`);

  const drift = await db.$queryRaw<{ key: string; cached: Dec; derived: Dec }[]>`
    SELECT a."key", a."balance" AS cached, COALESCE(SUM(e."amount"), 0) AS derived
    FROM "account" a LEFT JOIN "ledger_entry" e ON e."account_id" = a."id"
    GROUP BY a."id"
    HAVING a."balance" <> COALESCE(SUM(e."amount"), 0)`;
  for (const r of drift) add("cached-balance", `${r.key}: cached ${toSalt(r.cached)}, entries sum to ${toSalt(r.derived)}`);

  const negative = await db.$queryRaw<{ key: string; balance: Dec }[]>`
    SELECT "key", "balance" FROM "account"
    WHERE "kind" IN ('USER', 'ESCROW') AND "balance" < 0`;
  for (const r of negative) add("non-negative", `${r.key} is ${toSalt(r.balance)}`);

  const totals = await db.$queryRaw<{ asset: string; total: Dec }[]>`
    SELECT "asset"::text AS asset, SUM("balance") AS total FROM "account"
    GROUP BY "asset" HAVING SUM("balance") <> 0`;
  for (const r of totals) add("asset-total", `${r.asset} balances sum to ${toSalt(r.total)}, expected 0`);

  // Each escrow account must hold exactly the open stakes on its fight side.
  const escrow = await db.$queryRaw<{ fight_id: string; side: number; held: Dec; open: Dec }[]>`
    SELECT COALESCE(a."fight_id", b."fight_id") AS fight_id,
           COALESCE(a."side", b."side") AS side,
           COALESCE(a."balance", 0) AS held,
           COALESCE(b."open", 0) AS open
    FROM (SELECT "fight_id", "side", "balance" FROM "account" WHERE "kind" = 'ESCROW') a
    FULL JOIN (
      SELECT "fight_id", "side", SUM("stake") AS open FROM "bet" WHERE "status" = 'OPEN' GROUP BY "fight_id", "side"
    ) b ON a."fight_id" = b."fight_id" AND a."side" = b."side"
    WHERE COALESCE(a."balance", 0) <> COALESCE(b."open", 0)`;
  for (const r of escrow) {
    add("escrow-matches-bets", `fight ${r.fight_id} side ${r.side}: escrow ${toSalt(r.held)}, open stakes ${toSalt(r.open)}`);
  }

  const badBets = await db.$queryRaw<{ id: string; status: string }[]>`
    SELECT "id", "status"::text AS status FROM "bet"
    WHERE ("status" = 'OPEN') <> ("returned" IS NULL)`;
  for (const r of badBets) add("bet-state", `bet ${r.id} is ${r.status} but its returned amount is inconsistent`);

  const stuck = await db.$queryRaw<{ id: string; number: number; state: string; open: bigint }[]>`
    SELECT f."id", f."number", f."state"::text AS state, COUNT(b."id") AS open
    FROM "fight" f JOIN "bet" b ON b."fight_id" = f."id" AND b."status" = 'OPEN'
    WHERE f."state" IN ('SETTLED', 'VOIDED')
    GROUP BY f."id"`;
  for (const r of stuck) add("closed-fight-bets", `fight #${r.number} is ${r.state} but has ${r.open} open bet(s)`);

  const unclosed = await db.$queryRaw<{ number: number; state: string }[]>`
    SELECT f."number", f."state"::text AS state FROM "fight" f
    WHERE (f."state" = 'SETTLED' AND NOT EXISTS (SELECT 1 FROM "ledger_txn" t WHERE t."idempotency_key" = 'settle:' || f."id"))
       OR (f."state" = 'VOIDED' AND NOT EXISTS (SELECT 1 FROM "ledger_txn" t WHERE t."idempotency_key" = 'void:' || f."id"))`;
  for (const r of unclosed) add("fight-closed-in-ledger", `fight #${r.number} is ${r.state} but the ledger has no matching settle/void`);

  const sums = await db.$queryRaw<{ kind: string; total: Dec; n: bigint }[]>`
    SELECT "kind"::text AS kind, SUM("balance") AS total, COUNT(*) AS n FROM "account" GROUP BY "kind"`;
  const byKind = (k: string) => {
    const row = sums.find((s) => s.kind === k);
    return row ? toSalt(row.total) : 0n;
  };

  return {
    ok: problems.length === 0,
    problems,
    stats: {
      transactions: await db.ledgerTxn.count(),
      accounts: sums.reduce((n, s) => n + Number(s.n), 0),
      issued: -byKind("ISSUANCE"),
      userBalances: byKind("USER"),
      escrow: byKind("ESCROW"),
      house: byKind("HOUSE"),
      sink: byKind("SINK"),
    },
  };
}
