/**
 * Equipping overlay cosmetics (DESIGN §8, docs/PHASE2.md step 4). Free, owner
 * only, and limited to what the character has unlocked. Like upgrades, a
 * change applies from the next fight whose betting opens.
 */
import { characterCosmetics, NotFoundError, Prisma, withRetry, type Db } from "@greed-island/db";
import { checkChoice, LedgerRuleError, resolveCosmetics, type CosmeticChoice, type Cosmetics } from "@greed-island/shared";

export interface SetCosmeticsInput {
  userId: string;
  characterId: string;
  /** Replaces the whole pick; a missing field goes back to automatic. */
  choice: CosmeticChoice;
}

export async function setCosmetics(db: Db, input: SetCosmeticsInput): Promise<Cosmetics> {
  const { userId, characterId, choice } = input;
  return withRetry(db, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "character" WHERE "id" = ${characterId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundError("no such character");
    const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
    if (c.ownerUserId !== userId) throw new LedgerRuleError("NOT_ELIGIBLE", "you can only change characters you own");
    const { unlocked } = await characterCosmetics(tx, c);
    const problem = checkChoice(choice, unlocked);
    if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
    const stored: CosmeticChoice = {};
    if (choice.title !== undefined) stored.title = choice.title;
    if (choice.nameplate !== undefined) stored.nameplate = choice.nameplate;
    if (choice.badges !== undefined) stored.badges = choice.badges;
    await tx.character.update({
      where: { id: characterId },
      data: { cosmetics: Object.keys(stored).length === 0 ? Prisma.DbNull : { ...stored } },
    });
    return resolveCosmetics(unlocked, stored);
  });
}
