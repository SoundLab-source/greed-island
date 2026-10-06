/**
 * T-Salt (docs/PHASE2.md step 6): every player gets a fresh balance for each
 * tournament, from that tournament's own issuance account. It lives in the
 * tournament's book and never moves to the main balance (a database trigger
 * rejects any transaction that crosses books).
 */
import { accountKey, planGrant, tournamentBook, type Salt, type TournamentConfig } from "@greed-island/shared";
import type { Db, Tx } from "./client.ts";
import { requestHash, toSalt } from "./convert.ts";
import { getBalance, postTransaction, withIdempotency } from "./ledger.ts";

/** Give the player their T-Salt for this tournament, once. Returns their T-Salt balance. */
export async function grantTournamentSalt(db: Db, userId: string, tournamentId: string, cfg: TournamentConfig): Promise<Salt> {
  const key = `tgrant:${tournamentId}:${userId}`;
  const hash = requestHash({ op: "tgrant", userId, tournamentId });
  const book = tournamentBook(tournamentId);
  return withIdempotency<Salt>(db, key, hash, {
    // No lock needed: a duplicate hits the unique key and replays.
    run: async (tx) => {
      await postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind: "TOURNAMENT_GRANT", userId, postings: planGrant(userId, cfg.startingBalance), book });
      return getBalance(tx, userId, book);
    },
    replay: (tx) => getBalance(tx, userId, book),
  });
}

/** The player's T-Salt in a tournament, or null before they've joined it (first bet). */
export async function tournamentBalance(db: Db | Tx, userId: string, tournamentId: string): Promise<Salt | null> {
  const account = await db.account.findUnique({ where: { key: accountKey({ kind: "USER", userId }, tournamentBook(tournamentId)) }, select: { balance: true } });
  return account ? toSalt(account.balance) : null;
}

/** Every player's T-Salt in a tournament with when they joined, for the podium and leaderboards (bot players aren't ranked). */
export async function tournamentBalances(db: Db | Tx, tournamentId: string): Promise<{ userId: string; balance: Salt; joinedAt: Date }[]> {
  const rows = await db.account.findMany({
    where: { tournamentId, kind: "USER", user: { kind: { not: "BOT" } } },
    select: { userId: true, balance: true, createdAt: true },
  });
  return rows.map((r) => ({ userId: r.userId!, balance: toSalt(r.balance), joinedAt: r.createdAt }));
}
