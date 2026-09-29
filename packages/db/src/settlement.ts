import {
  LedgerRuleError,
  MAIN_BOOK,
  planSettlement,
  type Book,
  planVoid,
  type BetOutcome,
  type OpenBet,
  type Plan,
  type Salt,
  type Side,
} from "@greed-island/shared";
import type { Db, Prisma, Tx } from "./client.ts";
import { requestHash, toSalt } from "./convert.ts";
import type { TxnKind } from "./generated/prisma/client.ts";
import { lockFight, postTransaction, runIdempotent, withIdempotency, type IdempotentOp } from "./ledger.ts";

export interface SettleFightInput {
  fightId: string;
  winnerSide: Side;
  /** Locked multipliers in basis points (>= 10_000). */
  multiplierBp: Readonly<Record<Side, bigint>>;
  maxPayout: Salt;
  /** The fight's book: main Salt, or its tournament's T-Salt. */
  book?: Book | undefined;
}

async function lockOpenBets(tx: Tx, fightId: string): Promise<OpenBet[]> {
  const rows = await tx.$queryRaw<{ id: string; user_id: string; side: number; stake: Prisma.Decimal }[]>`
    SELECT "id", "user_id", "side", "stake" FROM "bet"
    WHERE "fight_id" = ${fightId}::uuid AND "status" = 'OPEN'
    ORDER BY "placed_at", "id"
    FOR UPDATE`;
  return rows.map((r) => ({ betId: r.id, userId: r.user_id, side: r.side as Side, stake: toSalt(r.stake) }));
}

async function outcomesFromBets(tx: Tx, fightId: string): Promise<BetOutcome[]> {
  const bets = await tx.bet.findMany({ where: { fightId }, orderBy: [{ placedAt: "asc" }, { id: "asc" }] });
  return bets.flatMap((b) =>
    b.status === "OPEN" ? [] : [{ betId: b.id, status: b.status, returned: b.returned === null ? 0n : toSalt(b.returned) }],
  );
}

/** Settle and void are mutually exclusive for a fight, and each happens once. */
function closeFightOp(
  fightId: string,
  kind: Extract<TxnKind, "SETTLE" | "VOID">,
  hashBody: Record<string, unknown>,
  plan: (bets: OpenBet[]) => Plan,
  book: Book,
): { key: string; hash: string; op: IdempotentOp<BetOutcome[]> } {
  const key = `${kind.toLowerCase()}:${fightId}`;
  const otherKey = `${kind === "SETTLE" ? "void" : "settle"}:${fightId}`;
  const hash = requestHash({ op: key, ...hashBody });
  return {
    key,
    hash,
    op: {
      lock: (tx) => lockFight(tx, fightId, "exclusive"),
      run: async (tx) => {
        if (await tx.ledgerTxn.findUnique({ where: { idempotencyKey: otherKey }, select: { id: true } })) {
          throw new LedgerRuleError("NOT_ELIGIBLE", `fight ${fightId} is already closed (${otherKey})`);
        }
        const { postings, outcomes } = plan(await lockOpenBets(tx, fightId));
        await postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind, fightId, postings, book });
        for (const o of outcomes) {
          await tx.bet.update({ where: { id: o.betId }, data: { status: o.status, returned: o.returned.toString() } });
        }
        return outcomes;
      },
      replay: (tx) => outcomesFromBets(tx, fightId),
    },
  };
}

function settleOp(input: SettleFightInput) {
  const { fightId, winnerSide, multiplierBp, maxPayout } = input;
  return closeFightOp(
    fightId,
    "SETTLE",
    { winnerSide, bp1: multiplierBp[1], bp2: multiplierBp[2], maxPayout },
    (bets) => planSettlement({ fightId, bets, winnerSide, multiplierBp, maxPayout }),
    input.book ?? MAIN_BOOK,
  );
}

function voidOp(fightId: string, book: Book) {
  return closeFightOp(fightId, "VOID", {}, (bets) => planVoid(fightId, bets), book);
}

/** Pay winners at the locked multipliers and move losing stakes to the house. */
export function settleFightLedger(db: Db, input: SettleFightInput): Promise<BetOutcome[]> {
  const { key, hash, op } = settleOp(input);
  return withIdempotency(db, key, hash, op);
}

/** settleFightLedger inside the caller's transaction (e.g. the fight's SETTLED transition). */
export function settleFightLedgerTx(tx: Tx, input: SettleFightInput): Promise<BetOutcome[]> {
  const { key, hash, op } = settleOp(input);
  return runIdempotent(tx, key, hash, op);
}

/** Refund every open bet on the fight in full. */
export function voidFightLedger(db: Db, fightId: string, book: Book = MAIN_BOOK): Promise<BetOutcome[]> {
  const { key, hash, op } = voidOp(fightId, book);
  return withIdempotency(db, key, hash, op);
}

/** voidFightLedger inside the caller's transaction. */
export function voidFightLedgerTx(tx: Tx, fightId: string, book: Book = MAIN_BOOK): Promise<BetOutcome[]> {
  const { key, hash, op } = voidOp(fightId, book);
  return runIdempotent(tx, key, hash, op);
}
