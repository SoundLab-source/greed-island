import { DEFAULT_ECONOMY, type EconomyConfig } from "@greed-island/shared";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../client.ts";
import { testDatabaseUrl } from "./env.ts";

export const economy: EconomyConfig = { ...DEFAULT_ECONOMY, maxPayout: 5_000n };

/** Wipe all ledger tables. TRUNCATE bypasses the append-only row triggers. */
export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE "ledger_entry", "ledger_txn", "bet", "account", "user" RESTART IDENTITY CASCADE`);
}

/** One client per test file, with a clean database before every test. */
export function useTestDb(): Db {
  const db = createDb(testDatabaseUrl());
  beforeEach(() => resetDb(db));
  afterAll(() => db.$disconnect());
  return db;
}
