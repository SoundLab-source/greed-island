/**
 * The shop (DESIGN §8, docs/PHASE2.md): a rotating selection of fighters,
 * bought with Salt as player-owned characters. Spent Salt goes to the sink.
 */
import {
  createCharacter,
  getBalance,
  lockUserAccount,
  postTransaction,
  requestHash,
  withIdempotency,
  type Db,
  type Tx,
} from "@greed-island/db";
import { automaticName, LedgerRuleError, pickRotation, planSpend, priceFor, rotationWindow, type Config, type Rarity, type Salt } from "@greed-island/shared";

export interface ShopOffer {
  fighterId: string;
  displayName: string;
  archetype: string;
  rarity: Rarity;
  price: Salt;
  /** Copies sold so far. */
  sold: number;
  /** First Edition copies still available. */
  firstEditionLeft: number;
}

export interface ShopView {
  window: { index: number; endsAt: Date };
  offers: ShopOffer[];
}

async function offersFor(db: Db | Tx, config: Config, now: Date): Promise<ShopView> {
  const window = rotationWindow(now, config.shop);
  const fighters = await db.fighter.findMany({ where: { enabled: true }, orderBy: { id: "asc" } });
  // Community fighters released this season are always offered (docs/PHASE3.md step 6).
  const featured = new Set((await db.release.findMany({ where: { season: { status: "RUNNING" }, fighter: { enabled: true } }, select: { fighterId: true } })).map((r) => r.fighterId));
  const picked = pickRotation(fighters, window.index, config.shop, featured);
  const sold = await db.character.groupBy({
    by: ["fighterId"],
    where: { ownerKind: "USER", fighterId: { in: picked.map((f) => f.id) } },
    _count: { _all: true },
  });
  const soldBy = new Map(sold.map((s) => [s.fighterId, s._count._all]));
  return {
    window: { index: window.index, endsAt: window.endsAt },
    offers: picked.map((f) => {
      const n = soldBy.get(f.id) ?? 0;
      return {
        fighterId: f.id,
        displayName: f.displayName,
        archetype: f.archetype,
        rarity: f.rarity,
        price: priceFor(f.rarity, config.shop),
        sold: n,
        firstEditionLeft: Math.max(0, config.shop.firstEditionSupply - n),
      };
    }),
  };
}

export function currentShop(db: Db, config: Config, now = new Date()): Promise<ShopView> {
  return offersFor(db, config, now);
}

export interface BuyInput {
  userId: string;
  fighterId: string;
  /** Client-supplied; scoped per user. */
  idempotencyKey: string;
}

export interface BuyResult {
  characterId: string;
  balance: Salt;
  replayed: boolean;
}

/** Buy a character from the current rotation. Throws LedgerRuleError on any rule. */
export async function buyCharacter(db: Db, config: Config, input: BuyInput, now = new Date()): Promise<BuyResult> {
  const { userId, fighterId } = input;
  const key = `buy:${userId}:${input.idempotencyKey}`;
  const hash = requestHash({ op: "buy", userId, fighterId });

  return withIdempotency<BuyResult>(db, key, hash, {
    lock: async (tx) => {
      await lockUserAccount(tx, userId);
      // Copy numbers are allocated one purchase at a time per fighter.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7103, hashtext(${fighterId}))`;
    },
    run: async (tx) => {
      const shop = await offersFor(tx, config, now);
      const offer = shop.offers.find((o) => o.fighterId === fighterId);
      if (!offer) throw new LedgerRuleError("NOT_ELIGIBLE", "that fighter isn't in the shop right now");
      const owned = await tx.character.count({ where: { ownerUserId: userId } });
      if (owned >= config.shop.maxOwnedPerUser) {
        throw new LedgerRuleError("NOT_ELIGIBLE", `you already own the maximum of ${config.shop.maxOwnedPerUser} characters`);
      }
      const balance = await getBalance(tx, userId);
      if (balance < offer.price) throw new LedgerRuleError("INSUFFICIENT_FUNDS", `this costs ${offer.price} Salt; you have ${balance}`);

      const last = await tx.character.aggregate({ where: { fighterId }, _max: { serial: true } });
      const serial = (last._max.serial ?? 0) + 1;
      const txnId = await postTransaction(tx, { idempotencyKey: key, requestHash: hash, kind: "PURCHASE", userId, postings: planSpend(userId, offer.price) });
      // An owned copy looks like the house character of the same fighter (same palette).
      const house = await tx.character.findFirst({ where: { fighterId, ownerKind: "HOUSE" }, orderBy: { createdAt: "asc" }, select: { palette: true } });
      const character = await createCharacter(
        tx,
        {
          fighterId,
          name: automaticName(offer.displayName, serial),
          palette: house?.palette ?? 1,
          startRating: config.shop.startRating,
          owner: { userId, serial, firstEdition: serial <= config.shop.firstEditionSupply, acquiredAt: now, acquiredTxnId: txnId },
        },
        config,
      );
      return { characterId: character.id, balance: await getBalance(tx, userId), replayed: false };
    },
    replay: async (tx, txnId) => {
      const character = await tx.character.findUniqueOrThrow({ where: { acquiredTxnId: txnId }, select: { id: true } });
      return { characterId: character.id, balance: await getBalance(tx, userId), replayed: true };
    },
  });
}
