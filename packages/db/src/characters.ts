import {
  initialRating,
  nextTier,
  rateFight,
  tierForRating,
  type LoadoutSnapshot,
  type RatingsConfig,
  type Score,
  type Tier,
  type TierConfig,
} from "@greed-island/shared";
import type { Db, Tx } from "./client.ts";
import type { Character } from "./generated/prisma/client.ts";
import { NotFoundError, withRetry } from "./ledger.ts";

export interface RatingSettings {
  ratings: RatingsConfig;
  tiers: TierConfig;
}

export interface NewCharacter {
  fighterId: string;
  name: string;
  palette?: number;
  rosterKey?: string;
}

/** Create a house character at the initial rating, with its first tier-history row. */
export async function createCharacter(tx: Tx, input: NewCharacter, cfg: RatingSettings): Promise<Character> {
  const r = initialRating(cfg.ratings);
  const tier = tierForRating(r.rating, cfg.tiers);
  const character = await tx.character.create({
    data: {
      fighterId: input.fighterId,
      name: input.name,
      palette: input.palette ?? 1,
      rosterKey: input.rosterKey ?? null,
      rating: r.rating,
      deviation: r.deviation,
      volatility: r.volatility,
      tier,
    },
  });
  await tx.tierHistory.create({
    data: { characterId: character.id, fromTier: null, toTier: tier, rating: r.rating, reason: "INITIAL" },
  });
  return character;
}

export function toLoadoutSnapshot(c: Character): LoadoutSnapshot {
  return {
    characterId: c.id,
    fighterId: c.fighterId,
    name: c.name,
    tier: c.tier,
    stats: { lifePct: c.lifePct, startPower: c.startPower, attackPct: c.attackPct, defensePct: c.defensePct },
    rating: c.rating,
    deviation: c.deviation,
    volatility: c.volatility,
    wins: c.wins,
    losses: c.losses,
  };
}

/** Snapshot a character's current loadout. Callers freeze this when betting opens. */
export async function loadoutSnapshot(db: Db | Tx, characterId: string): Promise<LoadoutSnapshot> {
  const c = await db.character.findUnique({ where: { id: characterId } });
  if (!c) throw new NotFoundError(`no character ${characterId}`);
  return toLoadoutSnapshot(c);
}

export interface FightRatingInput {
  /** Character on side 1 and side 2 of the fight. */
  side1: string;
  side2: string;
  /** Result for side 1: 1 win, 0 loss, 0.5 draw. */
  scoreSide1: Score;
  fightId?: string;
}

export interface RatingChange {
  characterId: string;
  before: { rating: number; deviation: number; tier: Tier };
  after: { rating: number; deviation: number; tier: Tier };
}

/**
 * Apply one fight to both characters' Glicko-2 ratings and records, then
 * re-evaluate tiers (X is never changed). Runs inside the caller's
 * transaction so settlement can do everything atomically.
 */
export async function applyFightRating(tx: Tx, input: FightRatingInput, cfg: RatingSettings): Promise<[RatingChange, RatingChange]> {
  if (input.side1 === input.side2) throw new Error("a character can't fight itself");
  // Lock both rows in a fixed order so concurrent updates can't deadlock.
  const ids = [input.side1, input.side2].sort();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "character" WHERE "id" IN (${ids[0]}::uuid, ${ids[1]}::uuid) ORDER BY "id" FOR UPDATE`;
  if (rows.length !== 2) throw new NotFoundError(`fight characters not found: ${ids.join(", ")}`);

  const [c1, c2] = await Promise.all([
    tx.character.findUniqueOrThrow({ where: { id: input.side1 } }),
    tx.character.findUniqueOrThrow({ where: { id: input.side2 } }),
  ]);
  const [r1, r2] = rateFight(c1, c2, input.scoreSide1, cfg.ratings.tau);

  const update = async (c: Character, r: typeof r1, score: number): Promise<RatingChange> => {
    const tier = nextTier(c.tier, r.rating, cfg.tiers);
    await tx.character.update({
      where: { id: c.id },
      data: {
        rating: r.rating,
        deviation: r.deviation,
        volatility: r.volatility,
        tier,
        wins: { increment: score === 1 ? 1 : 0 },
        losses: { increment: score === 0 ? 1 : 0 },
      },
    });
    if (tier !== c.tier) {
      await tx.tierHistory.create({
        data: { characterId: c.id, fromTier: c.tier, toTier: tier, rating: r.rating, reason: "RATING", fightId: input.fightId ?? null },
      });
    }
    return {
      characterId: c.id,
      before: { rating: c.rating, deviation: c.deviation, tier: c.tier },
      after: { rating: r.rating, deviation: r.deviation, tier },
    };
  };

  return [await update(c1, r1, input.scoreSide1), await update(c2, r2, 1 - input.scoreSide1)];
}

/**
 * Manually set a tier (the only way into or out of X). Setting a band tier
 * here is also allowed, e.g. to take a character out of X.
 */
export async function setTierManually(db: Db, characterId: string, tier: Tier): Promise<Character> {
  return withRetry(db, async (tx) => {
    const c = await tx.character.findUnique({ where: { id: characterId } });
    if (!c) throw new NotFoundError(`no character ${characterId}`);
    if (c.tier === tier) return c;
    const updated = await tx.character.update({ where: { id: characterId }, data: { tier } });
    await tx.tierHistory.create({ data: { characterId, fromTier: c.tier, toTier: tier, rating: c.rating, reason: "MANUAL" } });
    return updated;
  });
}
