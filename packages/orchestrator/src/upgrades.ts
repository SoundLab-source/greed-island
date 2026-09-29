/**
 * Upgrades and sidegrades for owned characters (DESIGN §8, docs/PHASE2.md).
 * Salt spent goes to the sink. Every change widens the character's rating
 * deviation, because its record is now less predictive (DESIGN §7).
 * Loadouts already frozen for a fight are not affected: the change applies
 * from the next fight whose betting opens.
 */
import { getBalance, lockUserAccount, NotFoundError, postTransaction, requestHash, withIdempotency, type Db, type Tx } from "@greed-island/db";
import {
  effectiveStats,
  LedgerRuleError,
  maxLevel,
  planSpend,
  upgradeCost,
  widenedDeviation,
  type Config,
  type Levels,
  type Salt,
  type Sidegrade,
  type UpgradeStat,
} from "@greed-island/shared";

export interface UpgradeResult {
  characterId: string;
  balance: Salt;
  replayed: boolean;
}

type CharacterRow = Awaited<ReturnType<Tx["character"]["findUniqueOrThrow"]>>;

const levelsOf = (c: CharacterRow): Levels => ({ life: c.lifeLevel, attack: c.attackLevel, defense: c.defenseLevel, power: c.powerLevel });

/** Lock an owned character's row and check the caller owns it. */
async function lockOwned(tx: Tx, userId: string, characterId: string): Promise<CharacterRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "character" WHERE "id" = ${characterId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("no such character");
  const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
  if (c.ownerUserId !== userId) throw new LedgerRuleError("NOT_ELIGIBLE", "you can only upgrade characters you own");
  return c;
}

/** Write the new levels/sidegrade, derived stats and widened deviation. */
async function applyBuild(tx: Tx, c: CharacterRow, levels: Levels, sidegrade: Sidegrade | null, config: Config): Promise<void> {
  const stats = effectiveStats(levels, sidegrade, config.upgrades);
  await tx.character.update({
    where: { id: c.id },
    data: {
      lifeLevel: levels.life,
      attackLevel: levels.attack,
      defenseLevel: levels.defense,
      powerLevel: levels.power,
      sidegrade,
      ...stats,
      deviation: widenedDeviation(c.deviation, config.upgrades),
    },
  });
}

async function spend(tx: Tx, key: string, hash: string, userId: string, cost: Salt): Promise<string | null> {
  if (cost === 0n) return null;
  const balance = await getBalance(tx, userId);
  if (balance < cost) throw new LedgerRuleError("INSUFFICIENT_FUNDS", `this costs ${cost} Salt; you have ${balance}`);
  return postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind: "UPGRADE", userId, postings: planSpend(userId, cost) });
}

export interface UpgradeInput {
  userId: string;
  characterId: string;
  stat: UpgradeStat;
  /** Client-supplied; scoped per user. */
  idempotencyKey: string;
}

/** Raise one stat by one level. */
export async function upgradeStat(db: Db, config: Config, input: UpgradeInput): Promise<UpgradeResult> {
  const { userId, characterId, stat } = input;
  const key = `upgrade:${userId}:${input.idempotencyKey}`;
  const hash = requestHash({ op: "upgrade", userId, characterId, stat });
  return withIdempotency<UpgradeResult>(db, key, hash, {
    lock: (tx) => lockUserAccount(tx, userId).then(() => undefined),
    run: async (tx) => {
      const c = await lockOwned(tx, userId, characterId);
      const levels = levelsOf(c);
      if (levels[stat] >= maxLevel(stat, config.upgrades)) throw new LedgerRuleError("NOT_ELIGIBLE", `${stat} is already at the maximum level`);
      const cost = upgradeCost(stat, levels[stat], config.upgrades);
      const txnId = await spend(tx, key, hash, userId, cost);
      await applyBuild(tx, c, { ...levels, [stat]: levels[stat] + 1 }, c.sidegrade, config);
      await tx.characterChange.create({
        data: { characterId, kind: "UPGRADE", stat, fromLevel: levels[stat], toLevel: levels[stat] + 1, cost: cost.toString(), txnId, byUserId: userId },
      });
      return { characterId, balance: await getBalance(tx, userId), replayed: false };
    },
    replay: async (tx) => ({ characterId, balance: await getBalance(tx, userId), replayed: true }),
  });
}

export interface SidegradeInput {
  userId: string;
  characterId: string;
  /** null removes the current sidegrade (free). */
  sidegrade: Sidegrade | null;
  idempotencyKey: string;
}

/** Pick, switch or remove the character's sidegrade. */
export async function setSidegrade(db: Db, config: Config, input: SidegradeInput): Promise<UpgradeResult> {
  const { userId, characterId, sidegrade } = input;
  const key = `sidegrade:${userId}:${input.idempotencyKey}`;
  const hash = requestHash({ op: "sidegrade", userId, characterId, sidegrade });
  return withIdempotency<UpgradeResult>(db, key, hash, {
    lock: (tx) => lockUserAccount(tx, userId).then(() => undefined),
    run: async (tx) => {
      const c = await lockOwned(tx, userId, characterId);
      if (c.sidegrade === sidegrade) throw new LedgerRuleError("NOT_ELIGIBLE", "that's already the character's sidegrade");
      const cost = sidegrade === null ? 0n : config.upgrades.sidegradeCost;
      // Free changes still get an idempotency record via a zero-entry txn.
      const txnId = (await spend(tx, key, hash, userId, cost)) ?? (await postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind: "UPGRADE", userId, postings: [] }));
      await applyBuild(tx, c, levelsOf(c), sidegrade, config);
      await tx.characterChange.create({
        data: { characterId, kind: "SIDEGRADE", fromSidegrade: c.sidegrade, toSidegrade: sidegrade, cost: cost.toString(), txnId, byUserId: userId },
      });
      return { characterId, balance: await getBalance(tx, userId), replayed: false };
    },
    replay: async (tx) => ({ characterId, balance: await getBalance(tx, userId), replayed: true }),
  });
}
