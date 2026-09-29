import { DEFAULT_ECONOMY, DEFAULT_RATINGS, DEFAULT_TIERS, type EconomyConfig } from "@greed-island/shared";
import type { RatingSettings } from "../characters.ts";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../client.ts";
import { testDatabaseUrl } from "./env.ts";

export const economy: EconomyConfig = { ...DEFAULT_ECONOMY, maxPayout: 5_000n };
export const ratingSettings: RatingSettings = { ratings: DEFAULT_RATINGS, tiers: DEFAULT_TIERS };

/** Wipe all tables. TRUNCATE bypasses the append-only row triggers. */
export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE "ledger_entry", "ledger_txn", "bet", "account", "tier_history", "character", "fighter", "stage", "user" RESTART IDENTITY CASCADE`);
}

/** One client per test file, with a clean database before every test. */
export function useTestDb(): Db {
  const db = createDb(testDatabaseUrl());
  beforeEach(() => resetDb(db));
  afterAll(() => db.$disconnect());
  return db;
}
