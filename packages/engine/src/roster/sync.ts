/**
 * Load roster.json into the database. roster.json is the source of truth for
 * names, files, licenses and enabled flags; ratings and records are never
 * touched. Entries removed from the file are disabled, not deleted, because
 * fights and tier history refer to them.
 */
import { createCharacter, withRetry, type Db, type RatingSettings } from "@greed-island/db";
import type { Roster } from "./schema.ts";

export interface SyncReport {
  fighters: { created: number; updated: number; disabled: number };
  stages: { created: number; updated: number; disabled: number };
  characters: { created: number; updated: number; disabled: number };
}

const REMOVED = "removed from roster.json";

export class RosterSyncError extends Error {
  override name = "RosterSyncError";
}

function disabledReason(enabled: boolean, notes: string | undefined): string | null {
  return enabled ? null : (notes ?? "disabled in roster.json");
}

export async function syncRoster(db: Db, roster: Roster, cfg: RatingSettings): Promise<SyncReport> {
  return withRetry(db, async (tx) => {
    const report: SyncReport = {
      fighters: { created: 0, updated: 0, disabled: 0 },
      stages: { created: 0, updated: 0, disabled: 0 },
      characters: { created: 0, updated: 0, disabled: 0 },
    };

    const existingFighters = new Set((await tx.fighter.findMany({ select: { id: true } })).map((f) => f.id));
    for (const f of roster.fighters) {
      const data = {
        displayName: f.displayName,
        archetype: f.archetype,
        rarity: f.rarity,
        defPath: f.def,
        licenseNote: f.license,
        enabled: f.enabled,
        disabledReason: disabledReason(f.enabled, f.notes),
      };
      await tx.fighter.upsert({ where: { id: f.id }, create: { id: f.id, ...data }, update: data });
      report.fighters[existingFighters.has(f.id) ? "updated" : "created"]++;
    }
    const removedFighters = await tx.fighter.updateMany({
      where: { id: { notIn: roster.fighters.map((f) => f.id) }, enabled: true },
      data: { enabled: false, disabledReason: REMOVED },
    });
    report.fighters.disabled = removedFighters.count;

    const existingStages = new Set((await tx.stage.findMany({ select: { id: true } })).map((s) => s.id));
    for (const s of roster.stages) {
      const data = {
        displayName: s.displayName,
        defPath: s.def,
        licenseNote: s.license,
        enabled: s.enabled,
        disabledReason: disabledReason(s.enabled, s.notes),
      };
      await tx.stage.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
      report.stages[existingStages.has(s.id) ? "updated" : "created"]++;
    }
    const removedStages = await tx.stage.updateMany({
      where: { id: { notIn: roster.stages.map((s) => s.id) }, enabled: true },
      data: { enabled: false, disabledReason: REMOVED },
    });
    report.stages.disabled = removedStages.count;

    for (const c of roster.characters) {
      const existing = await tx.character.findUnique({ where: { rosterKey: c.key } });
      if (!existing) {
        const created = await createCharacter(tx, { fighterId: c.fighter, name: c.name, palette: c.palette, rosterKey: c.key }, cfg);
        if (!c.enabled) await tx.character.update({ where: { id: created.id }, data: { enabled: false, disabledReason: "disabled in roster.json" } });
        report.characters.created++;
        continue;
      }
      if (existing.fighterId !== c.fighter) {
        throw new RosterSyncError(
          `character "${c.key}" is ${existing.fighterId} in the database but ${c.fighter} in roster.json. ` +
            `Changing a character's fighter would make its record meaningless: give it a new key instead.`,
        );
      }
      await tx.character.update({
        where: { id: existing.id },
        data: { name: c.name, palette: c.palette, enabled: c.enabled, disabledReason: c.enabled ? null : "disabled in roster.json" },
      });
      report.characters.updated++;
    }
    const removedCharacters = await tx.character.updateMany({
      where: { ownerKind: "HOUSE", rosterKey: { notIn: roster.characters.map((c) => c.key) }, enabled: true },
      data: { enabled: false, disabledReason: REMOVED },
    });
    report.characters.disabled = removedCharacters.count;

    return report;
  });
}
