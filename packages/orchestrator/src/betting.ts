/**
 * Betting on a fight: the ledger's placeBet plus the fight-level rules —
 * the fight must be BETTING_OPEN (checked FOR SHARE inside the bet's
 * transaction, so a bet can't slip in after LOCK), and owners of a character
 * in the fight are capped (DESIGN §6). Tournament fights are bet with the
 * tournament's T-Salt; a player's first tournament bet gives them their T-Salt.
 */
import { LedgerRuleError, MAIN_BOOK, tournamentBook, type Salt, type Side } from "@greed-island/shared";
import { grantTournamentSalt, placeBet, type Db, type PlaceBetResult } from "@greed-island/db";
import type { Config } from "@greed-island/shared";

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
