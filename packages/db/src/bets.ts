import { LedgerRuleError, planPlaceBet, type EconomyConfig, type Salt, type Side } from "@greed-island/shared";
import { randomUUID } from "node:crypto";
import type { Db } from "./client.ts";
import { requestHash, toSalt } from "./convert.ts";
import type { Bet, BetStatus } from "./generated/prisma/client.ts";
import { getBalance, isFightClosed, lockFight, lockUserAccount, postTransaction, withIdempotency } from "./ledger.ts";

export interface BetView {
  id: string;
  userId: string;
  fightId: string;
  side: Side;
  stake: Salt;
  status: BetStatus;
  returned: Salt | null;
}

export function toBetView(bet: Bet): BetView {
  return {
    id: bet.id,
    userId: bet.userId,
    fightId: bet.fightId,
    side: bet.side as Side,
    stake: toSalt(bet.stake),
    status: bet.status,
    returned: bet.returned === null ? null : toSalt(bet.returned),
  };
}

export interface PlaceBetInput {
  userId: string;
  fightId: string;
  side: Side;
  stake: Salt;
  /** Client-supplied; scoped per user, so two users can't collide. */
  idempotencyKey: string;
  /** Set by the caller when the user owns a character in this fight (odds.ownerBetCap). */
  ownerCap?: Salt | undefined;
}

export interface PlaceBetResult {
  bet: BetView;
  balance: Salt;
  /** True when this key was already processed and nothing new happened. */
  replayed: boolean;
}

/**
 * Place or change the user's bet on a fight. Only the latest bet counts: the
 * previous stake is refunded and the new one escrowed in the same transaction.
 * Rejected once the fight is settled or voided. (The BETTING_OPEN state check
 * is added with the fight table in build step 5.)
 */
export async function placeBet(db: Db, input: PlaceBetInput, economy: EconomyConfig): Promise<PlaceBetResult> {
  const { userId, fightId, side, stake } = input;
  const key = `bet:${userId}:${input.idempotencyKey}`;
  const hash = requestHash({ op: "bet", userId, fightId, side, stake });
  const where = { userId_fightId: { userId, fightId } };

  return withIdempotency<PlaceBetResult>(db, key, hash, {
    lock: async (tx) => {
      await lockFight(tx, fightId, "shared");
      await lockUserAccount(tx, userId);
    },
    run: async (tx) => {
      if (await isFightClosed(tx, fightId)) {
        throw new LedgerRuleError("NOT_ELIGIBLE", "betting on this fight is closed");
      }
      const available = await getBalance(tx, userId);
      const existing = await tx.bet.findUnique({ where });
      const betId = existing?.id ?? randomUUID();
      const postings = planPlaceBet(
        {
          userId,
          fightId,
          betId,
          side,
          stake,
          previous: existing ? { side: existing.side as Side, stake: toSalt(existing.stake) } : undefined,
          available,
          ownerCap: input.ownerCap,
        },
        economy,
      );
      if (postings.length === 0) {
        return { bet: toBetView(existing!), balance: available, replayed: false };
      }
      await postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind: "BET", userId, fightId, postings });
      const bet = await tx.bet.upsert({
        where,
        create: { id: betId, userId, fightId, side, stake: stake.toString() },
        update: { side, stake: stake.toString() },
      });
      return { bet: toBetView(bet), balance: await getBalance(tx, userId), replayed: false };
    },
    replay: async (tx) => {
      const bet = await tx.bet.findUniqueOrThrow({ where });
      return { bet: toBetView(bet), balance: await getBalance(tx, userId), replayed: true };
    },
  });
}

export async function listBets(db: Db, filter: { userId?: string; fightId?: string }): Promise<BetView[]> {
  const bets = await db.bet.findMany({ where: filter, orderBy: [{ placedAt: "desc" }, { id: "asc" }] });
  return bets.map(toBetView);
}
