import { createUser } from "@greed-island/db";
import { createTestFight, economy, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { pulse } from "./pulse.ts";

const db = useTestDb();
const DAY = 86_400_000;
const now = new Date("2026-11-16T12:00:00Z");
const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * 3_600_000);

async function player(kind: "ANONYMOUS" | "BOT" = "ANONYMOUS") {
  return (await createUser(db, kind === "BOT" ? { kind, displayName: "Botty" } : { kind }, economy)).user.id;
}
// One fight per bet: a player bets once a fight.
async function bet(userId: string, placedAt: Date, stake = 10n) {
  const fightId = await createTestFight(db);
  const f = await db.fight.findUniqueOrThrow({ where: { id: fightId } });
  await db.fight.update({ where: { id: fightId }, data: { state: "SETTLED", winnerSide: 1, winnerCharacterId: f.side1CharacterId, closedAt: placedAt } });
  await db.bet.create({ data: { userId, fightId, side: 1, stake: stake.toString(), status: "WON", returned: (stake * 2n).toString(), placedAt } });
}

describe("the pulse", () => {
  it("is all zeros with no bets", async () => {
    const p = await pulse(db, now);
    expect(p.windows.map((w) => w.bettors)).toEqual([0, 0, 0]);
    expect(p.fights).toEqual({ settled: 0, bettorsPerFight: 0 });
    expect(p.cameBack).toEqual({ players: 0, returned: 0 });
    expect(p.days).toHaveLength(14);
    expect(p.days[0]).toEqual({ day: "2026-11-16", bettors: 0, bets: 0, staked: 0n, newBettors: 0 });
  });

  it("counts players, new and returning, leaves bots out, and sees who came back", async () => {
    const regular = await player(), newcomer = await player(), oneOff = await player(), bot = await player("BOT");
    // The regular first bet 5 days ago and came back today; the one-off bet 4 days ago only; the newcomer bet today.
    await bet(regular, ago(5));
    await bet(regular, ago(0, 2), 50n);
    await bet(oneOff, ago(4));
    await bet(newcomer, ago(0, 1), 30n);
    await bet(newcomer, ago(0, 0.5), 20n);
    await bet(bot, ago(0, 1), 999n);

    const p = await pulse(db, now);
    const [day, week, before] = p.windows;
    expect(day).toMatchObject({ bettors: 2, bets: 3, staked: 100n, newBettors: 1, returning: 1 });
    expect(week).toMatchObject({ bettors: 3, bets: 5, staked: 120n, newBettors: 3, returning: 0 });
    expect(before).toMatchObject({ bettors: 0, bets: 0 });
    // Six settled fights in the week (the bot's too), five human bets.
    expect(p.fights).toEqual({ settled: 6, bettorsPerFight: 0.8 });
    // First bets 5 and 4 days ago: the regular came back, the one-off didn't.
    expect(p.cameBack).toEqual({ players: 2, returned: 1 });
    expect(p.days[0]).toEqual({ day: "2026-11-16", bettors: 2, bets: 3, staked: 100n, newBettors: 1 });
    expect(p.days[4]).toMatchObject({ day: "2026-11-12", bettors: 1, newBettors: 1 });
    expect(p.days[5]).toMatchObject({ day: "2026-11-11", bettors: 1, newBettors: 1 });
  });
});
