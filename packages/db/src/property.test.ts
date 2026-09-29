/**
 * Property test against real Postgres: random, partly concurrent sequences of
 * bets, grants, bailouts, settlements and voids must never break the ledger.
 */
import { LedgerRuleError, type Side } from "@greed-island/shared";
import fc from "fast-check";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auditLedger } from "./audit.ts";
import { placeBet } from "./bets.ts";
import { IdempotencyKeyReusedError } from "./ledger.ts";
import { settleFightLedger, voidFightLedger } from "./settlement.ts";
import { economy as baseEconomy, resetDb, useTestDb } from "./test/db.ts";
import { claimBailout, claimDailyGrant, createUser } from "./users.ts";

const db = useTestDb();

// A low cap so that capped payouts happen often (400 Salt × up to 8x).
const economy = { ...baseEconomy, maxPayout: 600n };

const USERS = 3;
const FIGHTS = 3;

type Op =
  | { t: "bet"; user: number; fight: number; side: Side; stake: bigint; key: number }
  | { t: "daily"; user: number; day: number }
  | { t: "bailout"; user: number }
  | { t: "settle"; fight: number; winner: Side; bp1: bigint; bp2: bigint }
  | { t: "void"; fight: number };

const side = fc.constantFrom<Side>(1, 2);
const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ t: fc.constant("bet" as const), user: fc.nat(USERS - 1), fight: fc.nat(FIGHTS - 1), side, stake: fc.bigInt({ min: -2n, max: 700n }), key: fc.nat(6) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("daily" as const), user: fc.nat(USERS - 1), day: fc.nat(2) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("bailout" as const), user: fc.nat(USERS - 1) }) },
  { weight: 2, arbitrary: fc.record({ t: fc.constant("settle" as const), fight: fc.nat(FIGHTS - 1), winner: side, bp1: fc.bigInt({ min: 10_000n, max: 80_000n }), bp2: fc.bigInt({ min: 10_000n, max: 80_000n }) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant("void" as const), fight: fc.nat(FIGHTS - 1) }) },
);

/** Business-rule rejections are expected outcomes; anything else is a bug. */
function expected(err: unknown): boolean {
  return err instanceof LedgerRuleError || err instanceof IdempotencyKeyReusedError;
}

describe("property: ledger under random concurrent operations", () => {
  it("keeps every invariant", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.array(opArb, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 10 }), async (batches) => {
        await resetDb(db);
        const users = await Promise.all(Array.from({ length: USERS }, () => createUser(db, { kind: "ANONYMOUS" }, economy)));
        const userIds = users.map((u) => u.user.id);
        const fightIds = Array.from({ length: FIGHTS }, () => randomUUID());

        const run = (op: Op): Promise<unknown> => {
          switch (op.t) {
            case "bet":
              return placeBet(db, { userId: userIds[op.user]!, fightId: fightIds[op.fight]!, side: op.side, stake: op.stake, idempotencyKey: `k${op.key}` }, economy);
            case "daily":
              return claimDailyGrant(db, userIds[op.user]!, economy, new Date(Date.UTC(2026, 8, 29 + op.day, 12)));
            case "bailout":
              return claimBailout(db, userIds[op.user]!, economy);
            case "settle":
              return settleFightLedger(db, { fightId: fightIds[op.fight]!, winnerSide: op.winner, multiplierBp: { 1: op.bp1, 2: op.bp2 }, maxPayout: economy.maxPayout });
            case "void":
              return voidFightLedger(db, fightIds[op.fight]!);
          }
        };

        // Ops within a batch run concurrently; batches run in order.
        for (const batch of batches) {
          const results = await Promise.allSettled(batch.map(run));
          for (const r of results) {
            if (r.status === "rejected" && !expected(r.reason)) throw r.reason;
          }
        }

        const report = await auditLedger(db);
        expect(report.problems).toEqual([]);
        const won = await db.bet.findMany({ where: { status: "WON" } });
        for (const b of won) expect(BigInt(b.returned!.toFixed(0))).toBeLessThanOrEqual(economy.maxPayout);
      }),
      { numRuns: 40 },
    );
  });
});
