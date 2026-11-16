import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { loadConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FightBus } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR } from "./config.ts";
import { applyTransition, type FightDeps } from "./fights.ts";
import { chatAnnouncements, gameAnswers } from "./twitch-chat.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const URL = "https://play.example.gg";
let deps: FightDeps;

beforeEach(async () => {
  deps = { db, config, orch: { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 60_000 }, bus: new FightBus(), now: () => new Date() };
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
});

async function character(id: string, name: string, rating: number) {
  await db.fighter.create({ data: { id, displayName: `Fighter ${id}`, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
  return (await db.character.create({ data: { fighterId: id, name, rating, deviation: 50, volatility: 0.06, tier: "A", rosterKey: id, wins: 3, losses: 1 } })).id;
}

describe("chat answers from the game", () => {
  it("answers !fight with the open fight and its payouts, then with its result", async () => {
    const answer = gameAnswers(db, config, URL);
    expect(await answer({ kind: "fight" })).toMatch(/^No fight yet/);
    const a = await character("a", "Free Loot", 1650);
    const b = await character("b", "Hot Takes", 1600);
    const fight = await db.fight.create({ data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: 0, pairKind: "CLOSE", stageId: "s1", side1CharacterId: a, side2CharacterId: b } });
    await applyTransition(deps, fight.id, { type: "OPEN_BETTING" });
    expect(await answer({ kind: "fight" })).toMatch(new RegExp(`^#${fight.number} Matchmaking: 🔴 Free Loot \\(A, 1650, 3–1\\) \\d\\.\\d\\d× vs 🔵 Hot Takes \\(A, 1600, 3–1\\) \\d\\.\\d\\d× · betting closes in \\d+s · bet free Salt at ${URL}$`));
    for (const e of [{ type: "LOCK" }, { type: "ENGINE_STARTED" }, { type: "MATCH_END", winnerSide: 2 }, { type: "SETTLED_OK" }] as const) await applyTransition(deps, fight.id, e);
    expect(await answer({ kind: "fight" })).toMatch(new RegExp(`^Hot Takes won #${fight.number}, Blue paid \\d\\.\\d\\d×`));
  });

  it("finds a fighter by name in any case, exact names before ones that start with it", async () => {
    const answer = gameAnswers(db, config, URL);
    const a = await character("a", "Big Cheese", 1700);
    await character("b", "Big Cheese Jr", 1800);
    expect(await answer({ kind: "fighter", name: "big cheese" })).toBe(`Big Cheese (Fighter a): A tier, rating 1700, 3–1, 75% wins, 0 titles, a house fighter · ${URL}/fighter.html?id=${a}`);
    expect(await answer({ kind: "fighter", name: "big ch" })).toMatch(/^Big Cheese Jr \(Fighter b\): A tier, rating 1800.*\(and 1 more match\)/);
    expect(await answer({ kind: "fighter", name: "nobody" })).toMatch(/^No fighter called "nobody"/);
  });

  it("calls the fight in chat as it goes: open, locked, the winner", async () => {
    const said: string[] = [];
    const stop = chatAnnouncements(deps.bus, db, config, URL, (t) => said.push(t));
    const a = await character("a", "Free Loot", 1650);
    const b = await character("b", "Hot Takes", 1600);
    const fight = await db.fight.create({ data: { engineMode: "fake", cycle: 1, segment: "MATCHMAKING", segmentIndex: 0, pairKind: "CLOSE", stageId: "s1", side1CharacterId: a, side2CharacterId: b } });
    const settle = async () => new Promise((r) => setTimeout(r, 150));
    await applyTransition(deps, fight.id, { type: "OPEN_BETTING" });
    await settle();
    await applyTransition(deps, fight.id, { type: "LOCK" });
    await settle();
    for (const e of [{ type: "ENGINE_STARTED" }, { type: "MATCH_END", winnerSide: 2 }, { type: "SETTLED_OK" }] as const) await applyTransition(deps, fight.id, e);
    await settle();
    stop();
    expect(said).toHaveLength(3);
    expect(said[0]).toMatch(/^Bets are OPEN! 🔴 Free Loot \d\.\d\d× vs 🔵 Hot Takes \d\.\d\d× · #\d+ Matchmaking · \d+s · bet free Salt at /);
    expect(said[1]).toMatch(/^Bets are LOCKED\. Payouts: 🔴 \d\.\d\d× · 🔵 \d\.\d\d×$/);
    expect(said[2]).toMatch(new RegExp(`^🔵 Hot Takes wins #${fight.number}!.* Payouts to Team Blue: \\d\\.\\d\\d×\\.$`));
  });
});
