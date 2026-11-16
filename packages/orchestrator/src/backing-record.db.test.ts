import { createUser } from "@greed-island/db";
import { createTestFight, economy, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { backingRecord } from "./api/views.ts";

const db = useTestDb();

/** A fight between the two test characters, settled with the given side winning (or left open), and one bet on it. */
async function fight(userId: string, side: 1 | 2, winner: 1 | 2 | null) {
  const id = await createTestFight(db);
  const f = await db.fight.findUniqueOrThrow({ where: { id } });
  if (winner) await db.fight.update({ where: { id }, data: { state: "SETTLED", winnerSide: winner, winnerCharacterId: winner === 1 ? f.side1CharacterId : f.side2CharacterId, closedAt: new Date() } });
  await db.bet.create({ data: { userId, fightId: id, side, stake: "10", status: winner === null ? "OPEN" : winner === side ? "WON" : "LOST", returned: winner === null ? null : winner === side ? "20" : "0" } });
  return f;
}

describe("a player's record backing each side", () => {
  it("counts settled bets on each character, leaving out the fight being shown and other players", async () => {
    const me = (await createUser(db, { kind: "ANONYMOUS" }, economy)).user.id;
    const other = (await createUser(db, { kind: "ANONYMOUS" }, economy)).user.id;
    const first = await fight(me, 1, 1); // backed A, won
    await fight(me, 1, 2); // backed A, lost
    await fight(me, 2, 2); // backed B, won
    await fight(other, 2, 1); // someone else
    const now = await fight(me, 1, null); // the fight on screen, still open
    expect(await backingRecord(db, me, now.id, first.side1CharacterId, first.side2CharacterId)).toEqual({ 1: { wins: 1, losses: 1 }, 2: { wins: 1, losses: 0 } });
    // The same characters with the sides swapped: the record follows the character, not the side.
    expect(await backingRecord(db, me, now.id, first.side2CharacterId, first.side1CharacterId)).toEqual({ 1: { wins: 1, losses: 0 }, 2: { wins: 1, losses: 1 } });
    expect(await backingRecord(db, other, now.id, first.side1CharacterId, first.side2CharacterId)).toEqual({ 1: { wins: 0, losses: 0 }, 2: { wins: 0, losses: 1 } });
  });
});
