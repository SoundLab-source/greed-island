import { createUser } from "@greed-island/db";
import { createTestFight, economy, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { todaysTopWinners } from "./bettor-stats.ts";

const db = useTestDb();
const now = new Date("2026-11-16T15:00:00Z");

/** A settled fight (side 1 wins) closed at `at`, with these bets written straight in. */
async function fight(at: Date, bets: { userId: string; side: 1 | 2; stake: bigint; returned: bigint }[]): Promise<void> {
  const id = await createTestFight(db);
  const f = await db.fight.findUniqueOrThrow({ where: { id } });
  await db.fight.update({ where: { id }, data: { state: "SETTLED", winnerSide: 1, winnerCharacterId: f.side1CharacterId, closedAt: at } });
  for (const b of bets) {
    await db.bet.create({ data: { userId: b.userId, fightId: id, side: b.side, stake: b.stake.toString(), status: b.side === 1 ? "WON" : "LOST", returned: b.returned.toString() } });
  }
}

describe("today's top winners", () => {
  it("ranks players by Salt won today, leaving out bots, yesterday and anyone behind", async () => {
    const user = async (name: string, kind: "ANONYMOUS" | "BOT" = "ANONYMOUS") => {
      const { user: u } = await createUser(db, kind === "BOT" ? { kind, displayName: name } : { kind }, economy);
      await db.user.update({ where: { id: u.id }, data: { displayName: name } });
      return u.id;
    };
    const [ann, bo, cy, bot] = [await user("Ann"), await user("Bo"), await user("Cy"), await user("Botty", "BOT")];
    expect(await todaysTopWinners(db, now)).toEqual({ day: "2026-11-16", rows: [] });
    await fight(new Date("2026-11-15T23:59:00Z"), [{ userId: cy, side: 1, stake: 100n, returned: 10_000n }]); // yesterday
    await fight(new Date("2026-11-16T09:00:00Z"), [
      { userId: ann, side: 1, stake: 100n, returned: 300n },
      { userId: bo, side: 1, stake: 50n, returned: 100n },
      { userId: cy, side: 2, stake: 80n, returned: 0n },
      { userId: bot, side: 1, stake: 1000n, returned: 3000n },
    ]);
    await fight(new Date("2026-11-16T10:00:00Z"), [
      { userId: ann, side: 2, stake: 40n, returned: 0n },
      { userId: bo, side: 1, stake: 100n, returned: 250n },
    ]);
    const top = await todaysTopWinners(db, now);
    expect(top.rows).toEqual([
      { rank: 1, name: "Bo", profit: 200n, bets: 2 },
      { rank: 2, name: "Ann", profit: 160n, bets: 2 },
    ]);
  });
});
