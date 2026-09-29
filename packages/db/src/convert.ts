import { parseSalt, type Salt } from "@greed-island/shared";
import { createHash } from "node:crypto";

type DecimalLike = { isInteger(): boolean; toFixed(digits: number): string };
type NumericLike = DecimalLike | string | number | bigint;

/** numeric(20,0) from Prisma (Decimal, or raw-query value) → bigint. */
export function toSalt(value: NumericLike): Salt {
  if (typeof value === "object") {
    if (!value.isInteger()) throw new Error(`expected an integer Salt amount, got ${value.toFixed(20)}`);
    return parseSalt(value.toFixed(0));
  }
  return parseSalt(value);
}

/** bigint → value Prisma accepts for a Decimal column, without going through float. */
export function fromSalt(value: Salt): string {
  return value.toString();
}

/** Stable hash of a request body, used to detect idempotency-key reuse. */
export function requestHash(body: Record<string, unknown>): string {
  const json = JSON.stringify(body, (_k, v: unknown) => (typeof v === "bigint" ? `${v}n` : v));
  return createHash("sha256").update(json).digest("hex");
}
