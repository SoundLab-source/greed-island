import { DEFAULT_ECONOMY, DEFAULT_RATINGS, DEFAULT_TIERS, type EconomyConfig } from "@greed-island/shared";
import type { RatingSettings } from "../characters.ts";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../client.ts";
import { testDatabaseUrl } from "./env.ts";

export { testDatabaseUrl };

export const economy: EconomyConfig = { ...DEFAULT_ECONOMY, maxPayout: 5_000n };
export const ratingSettings: RatingSettings = { ratings: DEFAULT_RATINGS, tiers: DEFAULT_TIERS };

/** Wipe all tables. TRUNCATE bypasses the append-only row triggers. */
export async function resetDb(db: Db): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE "release", "nft_look", "wallet", "wallet_challenge", "nft_collection", "vote", "ballot_entry", "ballot", "submission_file", "submission", "season_standing", "season", "staff_action", "review_item", "session", "login_token", "challenge", "player_title", "character_title", "tournament_entry", "tournament_match", "tournament", "character_change", "ledger_entry", "ledger_txn", "bet", "account", "tier_history", "fight_transition", "fight_round", "fight_odds", "fight_loadout", "fight", "character", "fighter", "stage", "user" RESTART IDENTITY CASCADE`);
}

/** One client per test file, with a clean database before every test. */
export function useTestDb(): Db {
  const db = createDb(testDatabaseUrl());
  beforeEach(() => resetDb(db));
  afterAll(() => db.$disconnect());
  return db;
}

/**
 * A minimal fight row for ledger tests (bets and escrow accounts reference
 * fights). Creates two test fighters, characters and a stage on first use.
 */
export async function createTestFight(db: Db, state: "BOOKED" | "BETTING_OPEN" = "BETTING_OPEN"): Promise<string> {
  const ids = await db.$transaction(async (tx) => {
    for (const id of ["test-a", "test-b"]) {
      await tx.fighter.upsert({
        where: { id },
        create: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" },
        update: {},
      });
    }
    await tx.stage.upsert({
      where: { id: "test-stage" },
      create: { id: "test-stage", displayName: "Test Stage", defPath: "stages/test.def", licenseNote: "test" },
      update: {},
    });
    const character = async (key: string) =>
      (await tx.character.findUnique({ where: { rosterKey: key } })) ??
      (await tx.character.create({ data: { rosterKey: key, fighterId: key, name: key, rating: 1500, deviation: 350, volatility: 0.06, tier: "B" } }));
    return [(await character("test-a")).id, (await character("test-b")).id] as const;
  });
  const fight = await db.fight.create({
    data: {
      state,
      engineMode: "fake",
      cycle: 1,
      segment: "MATCHMAKING",
      segmentIndex: 0,
      pairKind: "CLOSE",
      stageId: "test-stage",
      side1CharacterId: ids[0],
      side2CharacterId: ids[1],
    },
    select: { id: true },
  });
  return fight.id;
}
