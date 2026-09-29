/**
 * Pure ledger rules: given the current positions, decide which postings a
 * grant, bet, settlement or void produces. No I/O here; `@greed-island/db`
 * applies the plans inside one database transaction.
 */
import type { EconomyConfig } from "./config.ts";
import { payoutFor, sumSalt, type Salt } from "./money.ts";

export type Asset = "SALT";
export type Side = 1 | 2;
export const SIDES: readonly Side[] = [1, 2];

export type AccountRef =
  | { kind: "USER"; userId: string }
  | { kind: "ESCROW"; fightId: string; side: Side }
  | { kind: "HOUSE" }
  | { kind: "ISSUANCE" };

export function accountKey(ref: AccountRef, asset: Asset = "SALT"): string {
  switch (ref.kind) {
    case "USER":
      return `user:${ref.userId}:${asset}`;
    case "ESCROW":
      return `escrow:${ref.fightId}:${ref.side}:${asset}`;
    case "HOUSE":
      return `house:${asset}`;
    case "ISSUANCE":
      return `issuance:${asset}`;
  }
}

/** Only these account kinds may hold a negative balance. */
export function mayGoNegative(kind: AccountRef["kind"]): boolean {
  return kind === "HOUSE" || kind === "ISSUANCE";
}

export interface Posting {
  account: AccountRef;
  /** Signed, non-zero. Positive credits the account, negative debits it. */
  amount: Salt;
  betId?: string;
}

export type LedgerRuleCode =
  | "INVALID_SIDE"
  | "INVALID_AMOUNT"
  | "BELOW_MIN_BET"
  | "ABOVE_MAX_STAKE"
  | "INSUFFICIENT_FUNDS"
  | "NOT_ELIGIBLE"
  | "UNBALANCED";

export class LedgerRuleError extends Error {
  override name = "LedgerRuleError";
  constructor(
    readonly code: LedgerRuleCode,
    message: string,
  ) {
    super(message);
  }
}

export function isSide(value: unknown): value is Side {
  return value === 1 || value === 2;
}

/** Throws unless every posting is non-zero and they sum to zero. */
export function assertBalanced(postings: readonly Posting[]): void {
  for (const p of postings) {
    if (p.amount === 0n) throw new LedgerRuleError("UNBALANCED", "zero-amount posting");
  }
  const total = sumSalt(postings.map((p) => p.amount));
  if (total !== 0n) {
    throw new LedgerRuleError("UNBALANCED", `postings sum to ${total}, expected 0`);
  }
}

/** Salt created by the system (starting balance, daily grant, bailout). */
export function planGrant(userId: string, amount: Salt): Posting[] {
  if (amount <= 0n) throw new LedgerRuleError("INVALID_AMOUNT", `grant must be positive, got ${amount}`);
  return [
    { account: { kind: "ISSUANCE" }, amount: -amount },
    { account: { kind: "USER", userId }, amount },
  ];
}

/** Amount that tops `balance` up to the bailout floor, or throws if not broke. */
export function bailoutAmount(balance: Salt, openStakes: Salt, floor: Salt): Salt {
  if (openStakes > 0n) {
    throw new LedgerRuleError("NOT_ELIGIBLE", "bailout is unavailable while you have an open bet");
  }
  if (balance >= floor) {
    throw new LedgerRuleError("NOT_ELIGIBLE", `balance ${balance} is not below the bailout floor ${floor}`);
  }
  return floor - balance;
}

export interface PlaceBetInput {
  userId: string;
  fightId: string;
  betId: string;
  side: Side;
  stake: Salt;
  /** The user's current bet on this fight, if any. Only the latest bet counts. */
  previous?: { side: Side; stake: Salt } | undefined;
  /** The user's available balance before this change. */
  available: Salt;
}

/**
 * Postings for placing or changing a bet: refund the previous stake (if any)
 * and escrow the new one. Returns [] when nothing changes.
 */
export function planPlaceBet(input: PlaceBetInput, economy: EconomyConfig): Posting[] {
  const { userId, fightId, betId, side, stake, previous, available } = input;
  if (!isSide(side)) throw new LedgerRuleError("INVALID_SIDE", `side must be 1 or 2, got ${String(side)}`);
  if (stake < economy.minBet) {
    throw new LedgerRuleError("BELOW_MIN_BET", `minimum bet is ${economy.minBet}`);
  }
  if (stake > economy.maxPayout) {
    throw new LedgerRuleError("ABOVE_MAX_STAKE", `maximum bet is ${economy.maxPayout}`);
  }
  const refundable = previous?.stake ?? 0n;
  if (available + refundable < stake) {
    throw new LedgerRuleError("INSUFFICIENT_FUNDS", `balance ${available + refundable} is less than stake ${stake}`);
  }
  if (previous && previous.side === side && previous.stake === stake) return [];

  const user: AccountRef = { kind: "USER", userId };
  const postings: Posting[] = [];
  if (previous) {
    postings.push(
      { account: { kind: "ESCROW", fightId, side: previous.side }, amount: -previous.stake, betId },
      { account: user, amount: previous.stake, betId },
    );
  }
  postings.push(
    { account: user, amount: -stake, betId },
    { account: { kind: "ESCROW", fightId, side }, amount: stake, betId },
  );
  return postings;
}

export interface OpenBet {
  betId: string;
  userId: string;
  side: Side;
  stake: Salt;
}

export interface SettleInput {
  fightId: string;
  bets: readonly OpenBet[];
  winnerSide: Side;
  /** Locked multiplier per side, in basis points (>= 10_000). */
  multiplierBp: Readonly<Record<Side, bigint>>;
  maxPayout: Salt;
}

export interface BetOutcome {
  betId: string;
  status: "WON" | "LOST" | "REFUNDED";
  /** Salt returned to the user: payout for WON, stake for REFUNDED, 0 for LOST. */
  returned: Salt;
}

export interface Plan {
  postings: Posting[];
  outcomes: BetOutcome[];
}

/**
 * Fixed-odds settlement. Each winning bet is paid from its own escrowed stake
 * plus the house; all losing stakes move to the house.
 */
export function planSettlement(input: SettleInput): Plan {
  const { fightId, bets, winnerSide, multiplierBp, maxPayout } = input;
  if (!isSide(winnerSide)) throw new LedgerRuleError("INVALID_SIDE", `winner must be 1 or 2`);
  const postings: Posting[] = [];
  const outcomes: BetOutcome[] = [];
  const house: AccountRef = { kind: "HOUSE" };
  let losingTotal = 0n;
  const loserSide: Side = winnerSide === 1 ? 2 : 1;

  for (const bet of bets) {
    if (bet.side === winnerSide) {
      const payout = payoutFor(bet.stake, multiplierBp[winnerSide], maxPayout);
      const fromHouse = payout - bet.stake;
      postings.push(
        { account: { kind: "ESCROW", fightId, side: winnerSide }, amount: -bet.stake, betId: bet.betId },
        { account: { kind: "USER", userId: bet.userId }, amount: payout, betId: bet.betId },
      );
      if (fromHouse !== 0n) postings.push({ account: house, amount: -fromHouse, betId: bet.betId });
      outcomes.push({ betId: bet.betId, status: "WON", returned: payout });
    } else {
      losingTotal += bet.stake;
      outcomes.push({ betId: bet.betId, status: "LOST", returned: 0n });
    }
  }
  if (losingTotal > 0n) {
    postings.push(
      { account: { kind: "ESCROW", fightId, side: loserSide }, amount: -losingTotal },
      { account: house, amount: losingTotal },
    );
  }
  assertBalancedIfAny(postings);
  return { postings, outcomes };
}

/** Void: every stake goes back to its owner in full, no margin. */
export function planVoid(fightId: string, bets: readonly OpenBet[]): Plan {
  const postings: Posting[] = [];
  const outcomes: BetOutcome[] = [];
  for (const bet of bets) {
    postings.push(
      { account: { kind: "ESCROW", fightId, side: bet.side }, amount: -bet.stake, betId: bet.betId },
      { account: { kind: "USER", userId: bet.userId }, amount: bet.stake, betId: bet.betId },
    );
    outcomes.push({ betId: bet.betId, status: "REFUNDED", returned: bet.stake });
  }
  assertBalancedIfAny(postings);
  return { postings, outcomes };
}

function assertBalancedIfAny(postings: readonly Posting[]): void {
  if (postings.length > 0) assertBalanced(postings);
}
