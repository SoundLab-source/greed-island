/**
 * Betting on a fight: the ledger's placeBet plus the fight-level rules —
 * the fight must be BETTING_OPEN (checked FOR SHARE inside the bet's
 * transaction, so a bet can't slip in after LOCK), and owners of a character
 * in the fight are capped (DESIGN §6). Tournament fights are bet with the
 * tournament's T-Salt; a player's first tournament bet gives them their T-Salt.
 */
import { LedgerRuleError, MAIN_BOOK, playerName, tournamentBook, type Salt, type Side } from "@greed-island/shared";
import { grantTournamentSalt, placeBet, type BetView, type Db, type PlaceBetResult } from "@greed-island/db";
import type { Config } from "@greed-island/shared";
import type { FightBus } from "./bus.ts";

export interface FightBetInput {
  userId: string;
  fightId: string;
  side: Side;
  stake: Salt;
  idempotencyKey: string;
}

export async function placeFightBet(db: Db, config: Config, input: FightBetInput): Promise<PlaceBetResult> {
  const fight = await db.fight.findUnique({
    where: { id: input.fightId },
    select: {
      side1Character: { select: { ownerUserId: true } },
      side2Character: { select: { ownerUserId: true } },
      tournamentMatch: { select: { tournamentId: true } },
    },
  });
  if (!fight) throw new LedgerRuleError("NOT_ELIGIBLE", "no such fight");
  const tournamentId = fight.tournamentMatch?.tournamentId;
  if (tournamentId) await grantTournamentSalt(db, input.userId, tournamentId, config.tournaments);
  const isOwner = [fight.side1Character.ownerUserId, fight.side2Character.ownerUserId].includes(input.userId);
  return placeBet(
    db,
    {
      ...input,
      ownerCap: isOwner ? config.odds.ownerBetCap : undefined,
      book: tournamentId ? tournamentBook(tournamentId) : MAIN_BOOK,
      guard: async (tx) => {
        const rows = await tx.$queryRaw<{ state: string }[]>`SELECT "state"::text AS state FROM "fight" WHERE "id" = ${input.fightId}::uuid FOR SHARE`;
        if (rows[0]?.state !== "BETTING_OPEN") throw new LedgerRuleError("NOT_ELIGIBLE", "betting is closed for this fight");
      },
    },
    config.economy,
  );
}

/**
 * Tell everyone watching about a bet once it's committed: who (bots marked) and how much, and which side
 * only when sides show live (Config.bets; otherwise everyone sees the sides once betting closes).
 */
export async function announceBet(db: Db, config: Config, bus: FightBus, bet: BetView): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: bet.userId }, select: { id: true, displayName: true, kind: true } });
  bus.publish({
    type: "bet",
    fightId: bet.fightId,
    betId: bet.id,
    name: playerName(user),
    bot: user.kind === "BOT",
    stake: bet.stake,
    side: config.bets.sidesLive ? bet.side : null,
    at: new Date().toISOString(),
  });
}
