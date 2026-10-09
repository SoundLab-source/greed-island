import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";
import { asGoalCode, DEFAULT_GOALS, GOAL_CODES, GOALS, goalDay, goalProgress, goalReward, pickGoals, swapGoal, validateGoals, type GoalCall, type GoalWorld } from "./goals.ts";

const all: GoalWorld = { communityFighters: true, rivalries: true };
const call = (o: Partial<GoalCall> = {}): GoalCall => ({ won: false, chanceBp: 5000, againstCrowd: false, segment: "MATCHMAKING", rivalry: false, community: false, archetype: "ALL_ROUNDER", ...o });

describe("goal progress", () => {
  it("counts calls and wins", () => {
    const calls = [call({ won: true }), call(), call({ won: true }), call(), call()];
    expect(goalProgress("BET_5", calls)).toEqual({ have: 5, need: 5, done: true });
    expect(goalProgress("BET_8", calls)).toEqual({ have: 5, need: 8, done: false });
    expect(goalProgress("WIN_2", calls)).toMatchObject({ have: 2, done: true });
    expect(goalProgress("WIN_4", calls)).toMatchObject({ have: 2, done: false });
  });

  it("never shows more than the goal needs", () => {
    expect(goalProgress("BET_5", Array.from({ length: 9 }, () => call()))).toEqual({ have: 5, need: 5, done: true });
  });

  it("wants 3 wins in a row: a loss starts the count again, but the best run of the day stays", () => {
    const run = (r: boolean[]) => goalProgress("WIN_STREAK_3", r.map((won) => call({ won })));
    expect(run([true, true, false, true, true])).toMatchObject({ have: 2, done: false });
    expect(run([true, true, true, false])).toMatchObject({ have: 3, done: true });
    expect(run([false, true, false, true, true, true])).toMatchObject({ have: 3, done: true });
  });

  it("counts a tournament bet for taking part, but never its win: T-Salt winnings don't become Salt", () => {
    const t = (won: boolean) => call({ won, segment: "TOURNAMENT", chanceBp: 2000, againstCrowd: true });
    const calls = [call({ won: true }), t(true), call({ won: true }), t(true), t(true)];
    expect(goalProgress("BET_5", calls).done).toBe(true);
    expect(goalProgress("TOURNAMENT", calls).done).toBe(true);
    expect(goalProgress("WIN_4", calls).have).toBe(2);
    // The tournament wins in between neither extend the run nor break it.
    expect(goalProgress("WIN_STREAK_3", calls).have).toBe(2);
    expect(goalProgress("WIN_STREAK_3", [...calls, t(false), call({ won: true })]).done).toBe(true);
    for (const code of ["UNDERDOG", "AGAINST_CROWD"] as const) expect(goalProgress(code, [t(true)]).done).toBe(false);
  });

  it("knows an underdog win and a win against the crowd", () => {
    expect(goalProgress("UNDERDOG", [call({ won: true, chanceBp: 5000 }), call({ won: false, chanceBp: 2000 })]).done).toBe(false);
    expect(goalProgress("UNDERDOG", [call({ won: true, chanceBp: 4999 })]).done).toBe(true);
    expect(goalProgress("AGAINST_CROWD", [call({ won: false, againstCrowd: true })]).done).toBe(false);
    expect(goalProgress("AGAINST_CROWD", [call({ won: true, againstCrowd: true })]).done).toBe(true);
  });

  it("counts the explore goals by what the fight was, won or lost", () => {
    expect(goalProgress("TOURNAMENT", [call({ segment: "TOURNAMENT" })]).done).toBe(true);
    expect(goalProgress("EXHIBITION", [call({ segment: "EXHIBITION" })]).done).toBe(true);
    expect(goalProgress("RIVALRY", [call({ segment: "EXHIBITION", rivalry: true })]).done).toBe(true);
    expect(goalProgress("COMMUNITY", [call({ community: true })]).done).toBe(true);
    const styles = ["HEAVY", "HEAVY", "ZONER", "RUSHDOWN"].map((archetype) => call({ archetype: archetype as GoalCall["archetype"] }));
    expect(goalProgress("STYLES", styles.slice(0, 3))).toMatchObject({ have: 2, done: false });
    expect(goalProgress("STYLES", styles)).toMatchObject({ have: 3, done: true });
  });
});

describe("picking goals", () => {
  it("gives one goal from each pool, the same every time it's asked on a day", () => {
    const goals = pickGoals("user-1", "2026-10-09", all);
    expect(goals.map((c) => GOALS[c].pool)).toEqual(["easy", "skill", "explore"]);
    expect(pickGoals("user-1", "2026-10-09", all)).toEqual(goals);
  });

  it("changes from day to day and player to player", () => {
    const days = new Set(Array.from({ length: 20 }, (_, i) => pickGoals("user-1", `2026-10-${String(i + 1).padStart(2, "0")}`, all).join()));
    const players = new Set(Array.from({ length: 20 }, (_, i) => pickGoals(`user-${i}`, "2026-10-09", all).join()));
    expect(days.size).toBeGreaterThan(5);
    expect(players.size).toBeGreaterThan(5);
  });

  it("never gives a goal nobody can do today", () => {
    const none: GoalWorld = { communityFighters: false, rivalries: false };
    for (let i = 0; i < 200; i++) expect(pickGoals(`user-${i}`, "2026-10-09", none)).not.toContain("COMMUNITY");
    for (let i = 0; i < 200; i++) expect(pickGoals(`user-${i}`, "2026-10-09", none)).not.toContain("RIVALRY");
  });

  it("swaps a goal for the next one in its pool that the player doesn't have", () => {
    const next = swapGoal("BET_5", ["BET_5", "WIN_STREAK_3", "STYLES"], all);
    expect(next).not.toBe("BET_5");
    expect(GOALS[next!].pool).toBe("easy");
    expect(swapGoal("TOURNAMENT", ["BET_5", "WIN_STREAK_3", "TOURNAMENT"], { communityFighters: false, rivalries: false })).toBe("EXHIBITION");
  });
});

describe("rewards and days", () => {
  it("pays the setting for easy and explore goals, half as much again for skill goals", () => {
    expect(goalReward("BET_5", DEFAULT_GOALS)).toBe(100n);
    expect(goalReward("STYLES", DEFAULT_GOALS)).toBe(100n);
    expect(goalReward("WIN_STREAK_3", DEFAULT_GOALS)).toBe(150n);
    expect(goalReward("WIN_STREAK_3", { reward: 75n })).toBe(112n);
  });

  it("reads GI_GOAL_REWARD and refuses a goal that pays nothing", () => {
    expect(loadConfig({}).goals).toEqual(DEFAULT_GOALS);
    expect(loadConfig({ GI_GOAL_REWARD: "250" }).goals.reward).toBe(250n);
    expect(() => validateGoals({ reward: 0n })).toThrow();
  });

  it("runs on the UTC day, like the daily grant", () => {
    const d = goalDay(new Date("2026-10-09T23:59:59.999Z"));
    expect(d.day).toBe("2026-10-09");
    expect(d.start.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(d.resetsAt.toISOString()).toBe("2026-10-10T00:00:00.000Z");
  });

  it("reads back only goals that still exist", () => {
    for (const code of GOAL_CODES) expect(asGoalCode(code)).toBe(code);
    expect(asGoalCode("RETIRED")).toBeNull();
    expect(asGoalCode("toString")).toBeNull();
  });
});
