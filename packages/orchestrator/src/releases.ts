/**
 * Seasonal release (docs/PHASE3.md step 6). When a season starts, every
 * fighter elected in the previous season's vote joins the roster: a
 * community fighter (its name, archetype and community), a house character
 * that debuts in the next tournament, and First Edition copies in the shop
 * (always offered during its debut season). Until its archetype's template
 * exists it plays with a stand-in engine character of the same archetype. If
 * it came from an NFT collection with no community fighter yet, it becomes
 * that collection's fighter, so holders can give their copies NFT looks.
 */
import { createCharacter, type Prisma, type Tx } from "@greed-island/db";
import { COMMUNITY_RARITY, communityFighterId, pickStandIn, type Config } from "@greed-island/shared";
import type { BusEvent } from "./bus.ts";

type SeasonRow = Prisma.SeasonGetPayload<object>;

export async function releaseElected(tx: Tx, config: Config, season: SeasonRow, now: Date): Promise<BusEvent[]> {
  const elected = await tx.submission.findMany({ where: { status: "ELECTED", release: null }, orderBy: { number: "asc" } });
  if (!elected.length) return [];
  const rosterFighters = await tx.fighter.findMany({ where: { enabled: true, source: "ROSTER" } });
  const taken = new Set((await tx.fighter.findMany({ select: { id: true } })).map((f) => f.id));
  const released: { name: string; community: string; fighterId: string }[] = [];
  for (const sub of elected) {
    const standIn = pickStandIn(rosterFighters, sub.archetype);
    if (!standIn) break; // nothing to play with yet; they'll be released at a later season start
    const fighterId = communityFighterId(sub.fighterName, taken);
    taken.add(fighterId);
    await tx.fighter.create({
      data: {
        id: fighterId,
        source: "COMMUNITY",
        displayName: sub.fighterName,
        archetype: sub.archetype,
        rarity: COMMUNITY_RARITY,
        defPath: standIn.defPath,
        licenseNote: `Community fighter from ${sub.community} (submission #${sub.number}, ${sub.rightsBasis.toLowerCase().replace("_", " ")}). Plays with ${standIn.displayName} as a stand-in until its template is built.`,
        createdAt: now,
        updatedAt: now,
      },
    });
    const house = await tx.character.findFirst({ where: { fighterId: standIn.id, ownerKind: "HOUSE" }, orderBy: { createdAt: "asc" }, select: { palette: true } });
    const character = await createCharacter(tx, { fighterId, name: sub.fighterName, palette: house?.palette ?? 1 }, config);
    await tx.release.create({ data: { seasonId: season.id, submissionId: sub.id, fighterId, characterId: character.id, standInFighterId: standIn.id, createdAt: now } });
    await tx.submission.update({ where: { id: sub.id }, data: { status: "RELEASED" } });
    if (sub.nftCollectionId) {
      await tx.nftCollection.updateMany({ where: { id: sub.nftCollectionId, fighterId: null }, data: { fighterId } });
    }
    released.push({ name: sub.fighterName, community: sub.community, fighterId });
  }
  return released.length ? [{ type: "release", seasonNumber: season.number, fighters: released }] : [];
}

/** House characters of released fighters that haven't had their debut tournament yet. */
export async function pendingDebuts(tx: Tx): Promise<{ releaseId: string; characterId: string }[]> {
  const rows = await tx.release.findMany({
    where: { debutTournamentId: null, character: { enabled: true }, fighter: { enabled: true } },
    orderBy: { createdAt: "asc" },
    select: { id: true, characterId: true },
  });
  return rows.map((r) => ({ releaseId: r.id, characterId: r.characterId }));
}
