/**
 * Salt amounts are integers held as `bigint`. Never use `number` for balances,
 * stakes or payouts.
 */
export type Salt = bigint;

/** Multipliers are stored as integer basis points: 1.9x = 19_000n. */
export const BP_SCALE = 10_000n;

export class MoneyError extends Error {
  override name = "MoneyError";
}

/**
 * Parse an integer Salt amount from user or config input. Rejects fractions,
 * exponents, unsafe JS numbers and anything that isn't a plain integer.
 */
export function parseSalt(value: string | number | bigint): Salt {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError(`Salt amount must be a safe integer, got ${value}`);
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new MoneyError(`Salt amount must be an integer string, got "${value}"`);
  }
  return BigInt(trimmed);
}

export function minSalt(a: Salt, b: Salt): Salt {
  return a < b ? a : b;
}

export function sumSalt(values: Iterable<Salt>): Salt {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/**
 * Payout for a winning bet: stake × multiplier, rounded down, capped at
 * `maxPayout`. Whatever rounding drops stays with the house.
 */
export function payoutFor(stake: Salt, multiplierBp: bigint, maxPayout: Salt): Salt {
  if (stake <= 0n) throw new MoneyError(`stake must be positive, got ${stake}`);
  if (multiplierBp < BP_SCALE) {
    throw new MoneyError(`multiplier below 1.00x (${multiplierBp} bp) would pay a winner less than their stake`);
  }
  return minSalt((stake * multiplierBp) / BP_SCALE, maxPayout);
}
