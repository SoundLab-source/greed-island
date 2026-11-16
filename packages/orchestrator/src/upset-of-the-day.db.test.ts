import { createTestFight, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { todaysUpset } from "./bettor-stats.ts";

const db = useTestDb();
const now = new Date("2026-11-16T15:00:00Z");

/** A settled fight closed at `at`, won by `winner`, whose side 1 had `chance1Bp` when bets locked. */
async function fight(at: Date, winner: 1 | 2, chance1Bp: number) {
  const id = await createTestFight(db);
  const f = await db.fight.findUniqueOrThrow({ where: { id } });
  await db.fight.update({ where: { id }, data: { state: "SETTLED", winnerSide: winner, winnerCharacterId: winner === 1 ? f.side1CharacterId : f.side2CharacterId, closedAt: at } });
  const chance2Bp = 10_000 - chance1Bp;
  const mult = (c: number) => Math.round((10_000 * 10_000 * 0.95) / c);
  await db.fightOdds.create({
    data: {
      fightId: id, modelChanceBp1: chance1Bp, modelChanceBp2: chance2Bp, blendWeightBp: 0, chanceBp1: chance1Bp, chanceBp2: chance2Bp,
      multiplierBp1: mult(chance1Bp), multiplierBp2: mult(chance2Bp), pool1: "0", pool2: "0", cappedPool1: "0", cappedPool2: "0", bettors: 0,
    },
  });
  return (await db.fight.findUniqueOrThrow({ where: { id } })).number;
}

describe("today's upset", () => {
  it("is the day's winner with the lowest chance, if below 40%", async () => {
    expect(await todaysUpset(db, now)).toBeNull();
    await fight(new Date("2026-11-15T22:00:00Z"), 1, 1000); // yesterday: a bigger upset, but not today
    await fight(new Date("2026-11-16T09:00:00Z"), 2, 7000); // the underdog won at 30%
    expect(await todaysUpset(db, now)).toMatchObject({ chancePct: 30 });
    const big = await fight(new Date("2026-11-16T10:00:00Z"), 1, 1800); // at 18%
    await fight(new Date("2026-11-16T11:00:00Z"), 1, 8000); // the favourite won: no upset
    const u = await todaysUpset(db, now);
    expect(u).toEqual({ number: big, winner: expect.any(String), loser: expect.any(String), chancePct: 18, multiplier: "5.28x" });
    expect(u!.winner).not.toBe(u!.loser);
  });
});
