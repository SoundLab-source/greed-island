import { createUser } from "@greed-island/db";
import { createTestFight, economy, useTestDb } from "@greed-island/db/test";
import { loadConfig, type Config } from "@greed-island/shared";
import { describe, expect, it } from "vitest";
import { currentCallStreak } from "./bettor-stats.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy };

/** A settled fight (side 1 wins) with the player's bet on it, written straight in: only the bet rows matter here. */
async function call(userId: string, won: boolean, stake = 20n, settled = true): Promise<void> {
  const fightId = await createTestFight(db);
  const f = await db.fight.findUniqueOrThrow({ where: { id: fightId } });
  if (settled) await db.fight.update({ where: { id: fightId }, data: { state: "SETTLED", winnerSide: 1, winnerCharacterId: f.side1CharacterId, closedAt: new Date() } });
  await db.bet.create({ data: { userId, fightId, side: won ? 1 : 2, stake: stake.toString(), status: settled ? (won ? "WON" : "LOST") : "OPEN", returned: settled ? (won ? (stake * 2n).toString() : "0") : null } });
}

describe("the current run of right calls", () => {
  it("counts right calls back from the newest, up to the first wrong one", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, economy);
    expect(await currentCallStreak(db, config, user.id)).toBe(0);
    await call(user.id, true);
    await call(user.id, false);
    await call(user.id, true);
    await call(user.id, false, 5n); // under the call stake: not a call
    await call(user.id, true);
    await call(user.id, true, 20n, false); // not settled yet
    expect(await currentCallStreak(db, config, user.id)).toBe(2);
    await call(user.id, false);
    expect(await currentCallStreak(db, config, user.id)).toBe(0);
  });

  it("looks back only so far", async () => {
    const { user } = await createUser(db, { kind: "ANONYMOUS" }, economy);
    for (let i = 0; i < 4; i++) await call(user.id, true);
    expect(await currentCallStreak(db, config, user.id, 3)).toBe(3);
  });
});
