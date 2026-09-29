import { bailoutAmount, planGrant, type EconomyConfig, type Salt } from "@greed-island/shared";
import { createSession } from "./auth.ts";
import type { Db, Tx } from "./client.ts";
import { requestHash } from "./convert.ts";
import type { User } from "./generated/prisma/client.ts";
import { ensureAccounts, getBalance, lockUserAccount, openStakes, postTransaction, withIdempotency, withRetry } from "./ledger.ts";

export type NewUser = { kind: "ANONYMOUS" } | { kind: "EMAIL"; email: string; displayName?: string };

export interface CreatedUser {
  user: User;
  balance: Salt;
  /** Returned once for anonymous players (their only way back in); only its hash is stored. */
  sessionToken?: string;
}

/** createUser inside the caller's transaction. */
export async function createUserTx(tx: Tx, input: NewUser, economy: EconomyConfig): Promise<CreatedUser> {
  const user = await tx.user.create({
    data:
      input.kind === "EMAIL"
        ? { kind: "EMAIL", email: input.email.trim().toLowerCase(), displayName: input.displayName ?? null }
        : { kind: "ANONYMOUS" },
  });
  await ensureAccounts(tx, [{ kind: "USER", userId: user.id }]);
  if (economy.startingBalance > 0n) {
    await postTransaction(tx, {
      idempotencyKey: `grant:start:${user.id}`,
      requestHash: requestHash({ op: "grant:start", userId: user.id }),
      kind: "GRANT_START",
      userId: user.id,
      postings: planGrant(user.id, economy.startingBalance),
    });
  }
  const balance = await getBalance(tx, user.id);
  if (input.kind === "ANONYMOUS") return { user, balance, sessionToken: await createSession(tx, user.id) };
  return { user, balance };
}

/** Create a user, their SALT account and the starting grant in one transaction. */
export async function createUser(db: Db, input: NewUser, economy: EconomyConfig): Promise<CreatedUser> {
  return withRetry(db, (tx) => createUserTx(tx, input, economy));
}

export interface GrantResult {
  status: "GRANTED" | "ALREADY_CLAIMED";
  amount: Salt;
  balance: Salt;
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Daily grant: at most once per user per UTC calendar day. */
export async function claimDailyGrant(db: Db, userId: string, economy: EconomyConfig, now = new Date()): Promise<GrantResult> {
  const day = utcDate(now);
  const key = `grant:daily:${userId}:${day}`;
  const hash = requestHash({ op: "grant:daily", userId, day });
  return withIdempotency<GrantResult>(db, key, hash, {
    lock: async (tx) => {
      await lockUserAccount(tx, userId);
    },
    run: async (tx) => {
      await postTransaction(tx, {
        idempotencyKey: key,
        requestHash: hash,
        kind: "GRANT_DAILY",
        userId,
        postings: economy.dailyGrant > 0n ? planGrant(userId, economy.dailyGrant) : [],
      });
      return { status: "GRANTED", amount: economy.dailyGrant, balance: await getBalance(tx, userId) };
    },
    replay: async (tx) => ({ status: "ALREADY_CLAIMED", amount: 0n, balance: await getBalance(tx, userId) }),
  });
}

/**
 * Bailout: tops a broke user (no open bets, balance below the floor) back up
 * to the floor. Throws LedgerRuleError NOT_ELIGIBLE otherwise.
 */
export async function claimBailout(db: Db, userId: string, economy: EconomyConfig): Promise<GrantResult> {
  return withRetry(db, async (tx) => {
    const balance = await lockUserAccount(tx, userId);
    const amount = bailoutAmount(balance, await openStakes(tx, userId), economy.bailoutFloor);
    // The account row lock makes this count stable, so the key is unique per bailout.
    const n = (await tx.ledgerTxn.count({ where: { userId, kind: "BAILOUT" } })) + 1;
    await postTransaction(tx, {
      idempotencyKey: `bailout:${userId}:${n}`,
      requestHash: requestHash({ op: "bailout", userId, n }),
      kind: "BAILOUT",
      userId,
      postings: planGrant(userId, amount),
    });
    return { status: "GRANTED", amount, balance: balance + amount };
  });
}
