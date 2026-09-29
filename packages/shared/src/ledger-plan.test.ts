import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_ECONOMY, type EconomyConfig } from "./config.ts";
import {
  accountKey,
  assertBalanced,
  bailoutAmount,
  LedgerRuleError,
  planGrant,
  planPlaceBet,
  planSettlement,
  planVoid,
  type OpenBet,
  type Posting,
  type Side,
} from "./ledger-plan.ts";

const economy: EconomyConfig = { ...DEFAULT_ECONOMY, maxPayout: 5_000n };
const FIGHT = "fight-1";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof LedgerRuleError) return err.code;
    throw err;
  }
  return undefined;
}

describe("planGrant", () => {
  it("moves Salt from issuance to the user", () => {
    const p = planGrant("u1", 400n);
    assertBalanced(p);
    expect(p.find((x) => x.account.kind === "USER")?.amount).toBe(400n);
  });

  it("rejects non-positive grants", () => {
    expect(code(() => planGrant("u1", 0n))).toBe("INVALID_AMOUNT");
  });
});

describe("bailoutAmount", () => {
  it("tops up to the floor", () => {
    expect(bailoutAmount(30n, 0n, 100n)).toBe(70n);
  });

  it("is refused at or above the floor, or with an open bet", () => {
    expect(code(() => bailoutAmount(100n, 0n, 100n))).toBe("NOT_ELIGIBLE");
    expect(code(() => bailoutAmount(0n, 50n, 100n))).toBe("NOT_ELIGIBLE");
  });
});

describe("planPlaceBet", () => {
  const base = { userId: "u1", fightId: FIGHT, betId: "b1", side: 1 as Side, available: 100n };

  it("escrows a new stake", () => {
    const p = planPlaceBet({ ...base, stake: 40n }, economy);
    assertBalanced(p);
    expect(p).toHaveLength(2);
  });

  it("lets the latest bet replace the previous one, counting the refund as available", () => {
    const p = planPlaceBet({ ...base, available: 0n, previous: { side: 1, stake: 100n }, side: 2, stake: 100n }, economy);
    assertBalanced(p);
    expect(p).toHaveLength(4);
  });

  it("returns no postings when the bet is unchanged", () => {
    expect(planPlaceBet({ ...base, previous: { side: 1, stake: 10n }, stake: 10n }, economy)).toEqual([]);
  });

  it("enforces limits and funds", () => {
    expect(code(() => planPlaceBet({ ...base, stake: 0n }, economy))).toBe("BELOW_MIN_BET");
    expect(code(() => planPlaceBet({ ...base, available: 10_000n, stake: 5_001n }, economy))).toBe("ABOVE_MAX_STAKE");
    expect(code(() => planPlaceBet({ ...base, stake: 101n }, economy))).toBe("INSUFFICIENT_FUNDS");
    expect(code(() => planPlaceBet({ ...base, side: 3 as Side, stake: 1n }, economy))).toBe("INVALID_SIDE");
  });
});

describe("planSettlement", () => {
  const bets: OpenBet[] = [
    { betId: "a", userId: "u1", side: 1, stake: 100n },
    { betId: "b", userId: "u2", side: 2, stake: 50n },
    { betId: "c", userId: "u3", side: 1, stake: 3n },
  ];

  it("pays winners at the locked multiplier, rounded down, and sweeps losers to the house", () => {
    const plan = planSettlement({ fightId: FIGHT, bets, winnerSide: 1, multiplierBp: { 1: 19_000n, 2: 19_000n }, maxPayout: 5_000n });
    assertBalanced(plan.postings);
    expect(plan.outcomes).toEqual([
      { betId: "a", status: "WON", returned: 190n },
      { betId: "b", status: "LOST", returned: 0n },
      { betId: "c", status: "WON", returned: 5n }, // 3 × 1.9 = 5.7 → 5
    ]);
    const house = plan.postings.filter((p) => p.account.kind === "HOUSE").reduce((s, p) => s + p.amount, 0n);
    expect(house).toBe(50n - 90n - 2n);
  });

  it("settles a one-sided fight normally", () => {
    const plan = planSettlement({ fightId: FIGHT, bets: [bets[0]!], winnerSide: 2, multiplierBp: { 1: 10_000n, 2: 10_000n }, maxPayout: 5_000n });
    assertBalanced(plan.postings);
    expect(plan.outcomes[0]?.status).toBe("LOST");
  });

  it("produces no house posting at exactly 1.00x", () => {
    const plan = planSettlement({ fightId: FIGHT, bets: [bets[0]!], winnerSide: 1, multiplierBp: { 1: 10_000n, 2: 10_000n }, maxPayout: 5_000n });
    expect(plan.postings.some((p) => p.account.kind === "HOUSE")).toBe(false);
  });
});

describe("planVoid", () => {
  it("refunds every stake in full", () => {
    const plan = planVoid(FIGHT, [
      { betId: "a", userId: "u1", side: 1, stake: 7n },
      { betId: "b", userId: "u2", side: 2, stake: 9n },
    ]);
    assertBalanced(plan.postings);
    expect(plan.outcomes.map((o) => o.returned)).toEqual([7n, 9n]);
  });
});

/**
 * In-memory model of the ledger: apply random bet / change / settle / void
 * sequences and check the invariants after every step.
 */
describe("property: random bet, settle and void sequences", () => {
  type Op = { user: number; side: Side; stake: bigint };
  const opArb = fc.record({
    user: fc.integer({ min: 0, max: 4 }),
    side: fc.constantFrom<Side>(1, 2),
    stake: fc.bigInt({ min: -5n, max: 6_000n }),
  });
  const fightArb = fc.record({
    ops: fc.array(opArb, { maxLength: 25 }),
    outcome: fc.oneof(
      fc.record({ kind: fc.constant("settle" as const), winner: fc.constantFrom<Side>(1, 2) }),
      fc.record({ kind: fc.constant("void" as const) }),
    ),
    bp1: fc.bigInt({ min: 10_000n, max: 200_000n }),
    bp2: fc.bigInt({ min: 10_000n, max: 200_000n }),
  });

  it("never breaks zero-sum, never overdraws, never pays above the cap", () => {
    fc.assert(
      fc.property(fc.array(fightArb, { minLength: 1, maxLength: 6 }), fc.array(fc.bigInt({ min: 0n, max: 3_000n }), { minLength: 5, maxLength: 5 }), (fights, starts) => {
        const balances = new Map<string, bigint>();
        const apply = (postings: Posting[]) => {
          if (postings.length > 0) assertBalanced(postings);
          for (const p of postings) {
            const k = accountKey(p.account);
            balances.set(k, (balances.get(k) ?? 0n) + p.amount);
          }
        };
        const users = starts.map((_, i) => `u${i}`);
        starts.forEach((amt, i) => {
          if (amt > 0n) apply(planGrant(users[i]!, amt));
        });

        fights.forEach((fight, f) => {
          const fightId = `f${f}`;
          const open = new Map<string, OpenBet>();
          for (const op of fight.ops as Op[]) {
            const userId = users[op.user]!;
            const prev = open.get(userId);
            const available = balances.get(accountKey({ kind: "USER", userId })) ?? 0n;
            let postings: Posting[];
            try {
              postings = planPlaceBet(
                { userId, fightId, betId: `${fightId}-${userId}`, side: op.side, stake: op.stake, previous: prev, available },
                economy,
              );
            } catch (err) {
              if (err instanceof LedgerRuleError) continue;
              throw err;
            }
            apply(postings);
            open.set(userId, { betId: `${fightId}-${userId}`, userId, side: op.side, stake: op.stake });
          }

          const bets = [...open.values()];
          const plan =
            fight.outcome.kind === "settle"
              ? planSettlement({ fightId, bets, winnerSide: fight.outcome.winner, multiplierBp: { 1: fight.bp1, 2: fight.bp2 }, maxPayout: economy.maxPayout })
              : planVoid(fightId, bets);
          apply(plan.postings);

          for (const o of plan.outcomes) expect(o.returned).toBeLessThanOrEqual(economy.maxPayout);
          for (const side of [1, 2] as const) {
            expect(balances.get(accountKey({ kind: "ESCROW", fightId, side })) ?? 0n).toBe(0n);
          }
        });

        let total = 0n;
        for (const [k, v] of balances) {
          total += v;
          if (k.startsWith("user:") || k.startsWith("escrow:")) expect(v).toBeGreaterThanOrEqual(0n);
        }
        expect(total).toBe(0n);
      }),
      { numRuns: 500 },
    );
  });
});
