import { DEFAULT_STATS } from "@greed-island/shared";
import type { FightSpec } from "../types.ts";
import type { Roster } from "./schema.ts";

/** Build a fight between two roster characters (neutral stats), for tools that run without the database. */
export function specFromRoster(roster: Roster, fightId: string, key1: string, key2: string, stageId: string): FightSpec {
  const side = (key: string) => {
    const c = roster.characters.find((x) => x.key === key);
    if (!c) throw new Error(`no character "${key}" in roster.json`);
    const f = roster.fighters.find((x) => x.id === c.fighter)!;
    return { characterId: c.key, fighterId: f.id, defPath: f.def, palette: c.palette, stats: { ...DEFAULT_STATS } };
  };
  const stage = roster.stages.find((s) => s.id === stageId);
  if (!stage) throw new Error(`no stage "${stageId}" in roster.json`);
  return { fightId, sides: { 1: side(key1), 2: side(key2) }, stage: { id: stage.id, defPath: stage.def }, roundsToWin: 2 };
}
