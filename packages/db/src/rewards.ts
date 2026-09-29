/**
 * Owner rewards (docs/PHASE2.md step 5): Salt from issuance to a character's
 * owner when it wins on stream. Tournament fights don't pay them (tournaments
 * have their own prizes). Runs inside the settlement transaction, once per
 * fight (idempotency key `owner-reward:<fightId>`).
 */
import { planGrant, type EconomyConfig, type Salt } from "@greed-island/shared";
import type { Tx } from "./client.ts";
import { requestHash } from "./convert.ts";
import { postTransaction } from "./ledger.ts";

export interface OwnerRewardInput {
  fightId: string;
  winnerCharacterId: string;
  segment: "MATCHMAKING" | "TOURNAMENT" | "EXHIBITION";
}

export interface OwnerReward {
  userId: string;
  amount: Salt;
}

/** Pay the winner's owner, if it has one. Returns null when nothing is paid. */
export async function payOwnerRewardTx(tx: Tx, input: OwnerRewardInput, economy: EconomyConfig): Promise<OwnerReward | null> {
  if (economy.ownerReward === 0n || input.segment === "TOURNAMENT") return null;
  const c = await tx.character.findUniqueOrThrow({ where: { id: input.winnerCharacterId }, select: { ownerUserId: true } });
  if (!c.ownerUserId) return null;
  const key = `owner-reward:${input.fightId}`;
  await postTransaction(tx, {
    idempotencyKey: key,
    requestHash: requestHash({ op: "owner-reward", fightId: input.fightId, userId: c.ownerUserId, amount: economy.ownerReward }),
    kind: "OWNER_REWARD",
    userId: c.ownerUserId,
    fightId: input.fightId,
    postings: planGrant(c.ownerUserId, economy.ownerReward),
  });
  return { userId: c.ownerUserId, amount: economy.ownerReward };
}
