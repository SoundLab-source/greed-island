/**
 * Titles and cosmetics (DESIGN §8, docs/PHASE2.md step 4). Titles are awarded
 * inside the settlement transaction, from the fight's frozen loadout tiers and
 * the rating update, and each row records who owned the character at the
 * time. Cosmetics are derived from titles plus the owner's choice.
 */
import {
  BAND_TIERS,
  higherBand,
  parseCosmeticChoice,
  parsePlateColors,
  resolveCosmetics,
  titlesEarned,
  unlockedCosmetics,
  type CosmeticChoice,
  type Cosmetics,
  type BandTier,
  type Side,
  type Tier,
  type TitleCode,
  type Unlocked,
} from "@greed-island/shared";
import type { RatingChange } from "./characters.ts";
import type { Db, Tx } from "./client.ts";

const band = (t: Tier | null): BandTier | null => (t !== null && (BAND_TIERS as readonly string[]).includes(t) ? (t as BandTier) : null);

export interface AwardedTitle {
  characterId: string;
  code: TitleCode;
  fightId: string;
}

export interface FightTitlesInput {
  fightId: string;
  winnerSide: Side;
  /** Both sides' tiers as frozen in the loadouts. */
  loadoutTiers: Readonly<Record<Side, Tier>>;
  /** From applyFightRating: side 1, then side 2. */
  changes: readonly [RatingChange, RatingChange];
  earnedAt: Date;
}

/**
 * Award the titles both characters earned in a settled fight. Call after
 * applyFightRating in the same transaction (it holds both character rows).
 */
export async function awardFightTitles(tx: Tx, input: FightTitlesInput): Promise<AwardedTitle[]> {
  const awarded: AwardedTitle[] = [];
  for (const side of [1, 2] as const) {
    const change = input.changes[side - 1]!;
    const c = await tx.character.findUniqueOrThrow({ where: { id: change.characterId }, select: { id: true, wins: true, ownerKind: true, ownerUserId: true } });
    const held = await tx.characterTitle.findMany({ where: { characterId: c.id }, select: { code: true } });
    // Highest tier before this fight: every tier-history row except the one this fight just wrote.
    const history = await tx.tierHistory.findMany({
      where: { characterId: c.id, OR: [{ fightId: null }, { fightId: { not: input.fightId } }] },
      select: { toTier: true },
    });
    const codes = titlesEarned({
      won: side === input.winnerSide,
      wins: c.wins,
      ownTier: input.loadoutTiers[side],
      opponentTier: input.loadoutTiers[side === 1 ? 2 : 1],
      tierBefore: change.before.tier,
      tierAfter: change.after.tier,
      peakTier: history.reduce<BandTier | null>((peak, h) => higherBand(peak, band(h.toTier)), null),
      held: new Set(held.map((t) => t.code)),
    });
    for (const code of codes) {
      await tx.characterTitle.create({
        data: { characterId: c.id, code, fightId: input.fightId, ownerKind: c.ownerKind, ownerUserId: c.ownerUserId, earnedAt: input.earnedAt },
      });
      awarded.push({ characterId: c.id, code, fightId: input.fightId });
    }
  }
  return awarded;
}

/**
 * Award titles for fights settled before titles existed, by replaying every
 * settled fight's frozen loadouts in order. Safe to run more than once: titles
 * a character already has are skipped. The highest tier so far comes from each
 * character's starting tier and its earlier fights. Uses the current owner,
 * which is exact while characters can't change hands (no trading in phase 2).
 */
export async function backfillTitles(db: Db): Promise<number> {
  const fights = await db.fight.findMany({
    where: { state: "SETTLED" },
    orderBy: { number: "asc" },
    include: { loadouts: { orderBy: { side: "asc" } } },
  });
  const characters = new Map((await db.character.findMany({ select: { id: true, ownerKind: true, ownerUserId: true } })).map((c) => [c.id, c]));
  // Each character's highest tier so far, starting from where it began.
  const peak = new Map<string, BandTier | null>();
  for (const h of await db.tierHistory.findMany({ where: { reason: "INITIAL" }, select: { characterId: true, toTier: true } })) peak.set(h.characterId, band(h.toTier));
  const held = new Map<string, Set<TitleCode>>();
  for (const t of await db.characterTitle.findMany({ select: { characterId: true, code: true } })) {
    held.set(t.characterId, (held.get(t.characterId) ?? new Set()).add(t.code));
  }
  const rows: { characterId: string; code: TitleCode; fightId: string; ownerKind: "HOUSE" | "USER"; ownerUserId: string | null; earnedAt: Date }[] = [];
  for (const f of fights) {
    if (f.loadouts.length !== 2 || (f.winnerSide !== 1 && f.winnerSide !== 2)) continue;
    const [l1, l2] = [f.loadouts[0]!, f.loadouts[1]!];
    for (const [side, own, opp] of [[1, l1, l2], [2, l2, l1]] as const) {
      const won = f.winnerSide === side;
      const mine = held.get(own.characterId) ?? new Set<TitleCode>();
      held.set(own.characterId, mine);
      const peakBefore = higherBand(peak.get(own.characterId) ?? null, band(own.tier));
      peak.set(own.characterId, higherBand(peakBefore, band(own.tierAfter)));
      const codes = titlesEarned({
        won,
        wins: own.wins + (won ? 1 : 0),
        ownTier: own.tier,
        opponentTier: opp.tier,
        tierBefore: own.tier,
        tierAfter: own.tierAfter ?? own.tier,
        peakTier: peakBefore,
        held: mine,
      });
      const c = characters.get(own.characterId)!;
      for (const code of codes) {
        mine.add(code);
        rows.push({ characterId: own.characterId, code, fightId: f.id, ownerKind: c.ownerKind, ownerUserId: c.ownerUserId, earnedAt: f.closedAt ?? f.endedAt ?? f.bookedAt });
      }
    }
  }
  if (rows.length === 0) return 0;
  // skipDuplicates: a title the orchestrator awarded meanwhile wins.
  const { count } = await db.characterTitle.createMany({ data: rows, skipDuplicates: true });
  return count;
}

export interface CharacterCosmetics {
  unlocked: Unlocked;
  /** The owner's stored pick; null = automatic. */
  choice: CosmeticChoice | null;
  /** What the overlay shows now. */
  equipped: Cosmetics;
}

/** A character's unlocked, chosen and equipped cosmetics. */
export async function characterCosmetics(db: Db | Tx, c: { id: string; firstEdition: boolean; cosmetics: unknown }): Promise<CharacterCosmetics> {
  const titles = await db.characterTitle.findMany({ where: { characterId: c.id }, select: { code: true } });
  const unlocked = unlockedCosmetics(
    titles.map((t) => t.code),
    { firstEdition: c.firstEdition },
  );
  const choice = parseCosmeticChoice(c.cosmetics);
  // An NFT look the character wears (docs/PHASE3.md "NFTs as fighters").
  const look = await db.nftLook.findFirst({ where: { characterId: c.id, removedAt: null }, select: { id: true, name: true, colors: true, defPath: true } });
  const equipped = resolveCosmetics(unlocked, choice);
  return {
    unlocked,
    choice,
    equipped: look ? { ...equipped, look: { id: look.id, name: look.name, colors: parsePlateColors(look.colors), ...(look.defPath ? { defPath: look.defPath } : {}) } } : equipped,
  };
}
