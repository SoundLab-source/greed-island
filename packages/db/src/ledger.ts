import { accountKey, assertBalanced, type AccountRef, type Posting, type Salt } from "@greed-island/shared";
import { Prisma, type Db, type Tx } from "./client.ts";
import { fromSalt, toSalt } from "./convert.ts";
import type { TxnKind } from "./generated/prisma/client.ts";

export class IdempotencyKeyReusedError extends Error {
  override name = "IdempotencyKeyReusedError";
  constructor(readonly key: string) {
    super(`idempotency key "${key}" was already used for a different request`);
  }
}

export class NotFoundError extends Error {
  override name = "NotFoundError";
}

const MAX_ATTEMPTS = 4;

/**
 * Postgres errors worth retrying: deadlock and serialization failures, plus
 * (inside withIdempotency) a unique violation from two concurrent requests
 * racing on the same idempotency key. The retry then sees the stored txn.
 */
function isRetryable(err: unknown, uniqueRace = false): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return uniqueRace;
    if (err.code === "P2034") return true;
  }
  const text = String((err as { message?: unknown })?.message ?? "");
  return /40P01|40001|deadlock detected|could not serialize/.test(text);
}

export interface IdempotentOp<T> {
  /**
   * Take the row/advisory locks the operation needs. Runs before the key
   * check, so concurrent duplicates queue here and then see the stored txn.
   */
  lock?: (tx: Tx) => Promise<void>;
  run: (tx: Tx) => Promise<T>;
  replay: (tx: Tx, txnId: string) => Promise<T>;
}

/**
 * Run an operation in one DB transaction, at most once per idempotency key.
 * If the key already exists with the same request hash, `replay` runs instead;
 * with a different hash, IdempotencyKeyReusedError is thrown.
 */
export async function withIdempotency<T>(db: Db, key: string, hash: string, op: IdempotentOp<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await op.lock?.(tx);
        const existing = await tx.ledgerTxn.findUnique({
          where: { idempotencyKey: key },
          select: { id: true, requestHash: true },
        });
        if (existing) {
          if (existing.requestHash !== hash) throw new IdempotencyKeyReusedError(key);
          return op.replay(tx, existing.id);
        }
        return op.run(tx);
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetryable(err, true)) continue;
      throw err;
    }
  }
}

/** Retry a plain transaction on deadlock or serialization failure. */
export async function withRetry<T>(db: Db, body: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(body);
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetryable(err)) continue;
      throw err;
    }
  }
}

/** Create any missing accounts and return their ids by key. */
export async function ensureAccounts(tx: Tx, refs: readonly AccountRef[]): Promise<Map<string, string>> {
  const byKey = new Map<string, AccountRef>();
  for (const ref of refs) byKey.set(accountKey(ref), ref);
  for (const [key, ref] of byKey) {
    const userId = ref.kind === "USER" ? ref.userId : null;
    const fightId = ref.kind === "ESCROW" ? ref.fightId : null;
    const side = ref.kind === "ESCROW" ? ref.side : null;
    await tx.$executeRaw`
      INSERT INTO "account" ("key", "kind", "user_id", "fight_id", "side")
      VALUES (${key}, ${ref.kind}::"AccountKind", ${userId}::uuid, ${fightId}::uuid, ${side}::smallint)
      ON CONFLICT ("key") DO NOTHING`;
  }
  const rows = await tx.account.findMany({ where: { key: { in: [...byKey.keys()] } }, select: { id: true, key: true } });
  return new Map(rows.map((r) => [r.key, r.id]));
}

export interface PostTxnInput {
  idempotencyKey: string;
  requestHash: string;
  kind: TxnKind;
  userId?: string | undefined;
  fightId?: string | undefined;
  postings: readonly Posting[];
}

/**
 * Write one balanced ledger transaction. Balances are updated by a database
 * trigger, which also rejects any overdraft of a user or escrow account.
 */
export async function postTransaction(tx: Tx, input: PostTxnInput): Promise<string> {
  if (input.postings.length > 0) assertBalanced(input.postings);
  const ids = await ensureAccounts(
    tx,
    input.postings.map((p) => p.account),
  );
  const txn = await tx.ledgerTxn.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      kind: input.kind,
      userId: input.userId ?? null,
      fightId: input.fightId ?? null,
    },
    select: { id: true },
  });
  if (input.postings.length > 0) {
    await tx.ledgerEntry.createMany({
      data: input.postings.map((p) => ({
        txnId: txn.id,
        accountId: ids.get(accountKey(p.account))!,
        amount: fromSalt(p.amount),
        betId: p.betId ?? null,
      })),
    });
  }
  return txn.id;
}

/** Advisory-lock namespace for per-fight ledger locks (two-int form, separate from bigint locks). */
const FIGHT_LOCK_CLASS = 7101;

/**
 * Per-fight transaction lock. Bets take it shared; settlement and void take it
 * exclusive, so no bet can commit while a fight is being closed, or after.
 */
export async function lockFight(tx: Tx, fightId: string, mode: "shared" | "exclusive"): Promise<void> {
  if (mode === "shared") {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${FIGHT_LOCK_CLASS}::int, hashtext(${fightId}))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FIGHT_LOCK_CLASS}::int, hashtext(${fightId}))`;
  }
}

/** True once the fight has been settled or voided in the ledger. */
export async function isFightClosed(tx: Tx, fightId: string): Promise<boolean> {
  const count = await tx.ledgerTxn.count({ where: { idempotencyKey: { in: [`settle:${fightId}`, `void:${fightId}`] } } });
  return count > 0;
}

/** Lock the user's SALT account row for the rest of the transaction and return its balance. */
export async function lockUserAccount(tx: Tx, userId: string): Promise<Salt> {
  const key = accountKey({ kind: "USER", userId });
  const rows = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
    SELECT "balance" FROM "account" WHERE "key" = ${key} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new NotFoundError(`no account for user ${userId}`);
  return toSalt(row.balance);
}

export async function getBalance(db: Db | Tx, userId: string): Promise<Salt> {
  const account = await db.account.findUnique({
    where: { key: accountKey({ kind: "USER", userId }) },
    select: { balance: true },
  });
  if (!account) throw new NotFoundError(`no account for user ${userId}`);
  return toSalt(account.balance);
}

/** Sum of the user's stakes on fights that haven't settled or voided yet. */
export async function openStakes(tx: Db | Tx, userId: string): Promise<Salt> {
  const agg = await tx.bet.aggregate({ where: { userId, status: "OPEN" }, _sum: { stake: true } });
  return agg._sum.stake ? toSalt(agg._sum.stake) : 0n;
}
