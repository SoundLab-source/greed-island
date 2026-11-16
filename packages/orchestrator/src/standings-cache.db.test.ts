import { createTestFight, useTestDb } from "@greed-island/db/test";
import { describe, expect, it } from "vitest";
import { settledMark, untilNextSettle } from "./standings-cache.ts";

const db = useTestDb();

async function settle(fightId: string, at: Date): Promise<void> {
  const f = await db.fight.findUniqueOrThrow({ where: { id: fightId } });
  await db.fight.update({ where: { id: fightId }, data: { state: "SETTLED", winnerSide: 1, winnerCharacterId: f.side1CharacterId, closedAt: at } });
}

describe("standings kept until the next fight settles", () => {
  it("works the answer out again only after a fight settles", async () => {
    let runs = 0;
    const compute = async () => ++runs;
    expect(await settledMark(db)).toBe("none");
    expect(await untilNextSettle(db, "t", compute)).toBe(1);
    expect(await untilNextSettle(db, "t", compute)).toBe(1);

    const open = await createTestFight(db); // a fight that hasn't settled changes nothing
    expect(await untilNextSettle(db, "t", compute)).toBe(1);

    await settle(open, new Date("2026-11-01T10:00:00Z"));
    expect(await untilNextSettle(db, "t", compute)).toBe(2);
    expect(await untilNextSettle(db, "t", compute)).toBe(2);
    // Another name has its own answer.
    expect(await untilNextSettle(db, "other", async () => "x")).toBe("x");

    await settle(await createTestFight(db), new Date("2026-11-01T10:02:00Z"));
    expect(await untilNextSettle(db, "t", compute)).toBe(3);
  });

  it("shares one computation between requests at the same time and forgets a failure", async () => {
    let runs = 0;
    const slow = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 20));
      return runs;
    };
    const [a, b] = await Promise.all([untilNextSettle(db, "s", slow), untilNextSettle(db, "s", slow)]);
    expect([a, b, runs]).toEqual([1, 1, 1]);

    await settle(await createTestFight(db), new Date("2026-11-02T10:00:00Z"));
    await expect(untilNextSettle(db, "s", async () => { throw new Error("db down"); })).rejects.toThrow("db down");
    expect(await untilNextSettle(db, "s", async () => 7)).toBe(7);
  });
});
