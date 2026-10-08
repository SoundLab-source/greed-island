import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import { CHALLENGE_STATUSES, challengeProblem, challengeTransition, DEFAULT_EXHIBITIONS, type ChallengeAction, type ChallengeActor } from "./exhibitions.ts";

describe("challengeTransition", () => {
  it("lets the challenged owner answer, the challenger cancel, and the game expire or book", () => {
    expect(challengeTransition("PENDING", "ACCEPT", "challenged")).toEqual({ ok: true, to: "ACCEPTED" });
    expect(challengeTransition("PENDING", "DECLINE", "challenged")).toEqual({ ok: true, to: "DECLINED" });
    expect(challengeTransition("PENDING", "CANCEL", "challenger")).toEqual({ ok: true, to: "CANCELLED" });
    expect(challengeTransition("ACCEPTED", "CANCEL", "challenger")).toEqual({ ok: true, to: "CANCELLED" });
    expect(challengeTransition("PENDING", "EXPIRE", "system")).toEqual({ ok: true, to: "EXPIRED" });
    expect(challengeTransition("ACCEPTED", "BOOK", "system")).toEqual({ ok: true, to: "BOOKED" });
  });

  it("refuses the wrong person or a finished challenge", () => {
    expect(challengeTransition("PENDING", "ACCEPT", "challenger")).toMatchObject({ ok: false, error: /challenged owner/ });
    expect(challengeTransition("PENDING", "CANCEL", "challenged")).toMatchObject({ ok: false, error: /sent it/ });
    expect(challengeTransition("ACCEPTED", "DECLINE", "challenged")).toMatchObject({ ok: false, error: /accepted/ });
    expect(challengeTransition("BOOKED", "CANCEL", "challenger")).toMatchObject({ ok: false, error: /booked/ });
  });

  it("never leaves a closed status (exhaustive)", () => {
    const actions: ChallengeAction[] = ["ACCEPT", "DECLINE", "CANCEL", "EXPIRE", "BOOK"];
    const actors: ChallengeActor[] = ["challenger", "challenged", "system"];
    for (const status of CHALLENGE_STATUSES) {
      for (const action of actions) {
        for (const actor of actors) {
          const r = challengeTransition(status, action, actor);
          if (["DECLINED", "CANCELLED", "EXPIRED", "BOOKED"].includes(status)) expect(r.ok).toBe(false);
          if (r.ok) expect(r.to).not.toBe(status);
        }
      }
    }
  });
});

describe("challengeProblem", () => {
  const mine = { fighterId: "kfm", ownerUserId: "me", enabled: true };
  const theirs = { fighterId: "crane", ownerUserId: "you", enabled: true };
  const check = (over: Partial<Parameters<typeof challengeProblem>[0]> = {}) =>
    challengeProblem({ userId: "me", challenger: mine, challenged: theirs, openSent: 0, ...over }, DEFAULT_EXHIBITIONS);

  it("allows an owner to challenge another player's active character", () => {
    expect(check()).toBeNull();
  });

  it("explains every refusal", () => {
    expect(check({ userId: "someone" })).toMatch(/you own/);
    expect(check({ challenged: { ...theirs, ownerUserId: null } })).toMatch(/house/);
    expect(check({ challenged: { ...theirs, ownerUserId: "me" } })).toMatch(/your own/);
    expect(check({ challenged: { ...theirs, enabled: false } })).toMatch(/active/);
    expect(check({ challenged: { ...theirs, fighterId: "kfm" } })).toMatch(/same fighter/);
    expect(check({ openSent: 5 })).toMatch(/5 open challenges/);
  });
});

describe("config", () => {
  it("reads the owner reward and exhibition settings", () => {
    const c = loadConfig({ GI_OWNER_REWARD: "0", GI_CHALLENGE_TTL_HOURS: "2", GI_MAX_OPEN_CHALLENGES: "1", GI_SHOWCASE_POOL: "4", GI_RIVALRY_RATE: "0.5" });
    expect(c.economy.ownerReward).toBe(0n);
    expect(c.exhibitions).toEqual({ challengeTtlMs: 7_200_000, maxOpenPerUser: 1, showcasePool: 4, rivalryRate: 0.5 });
    expect(loadConfig({}).economy.ownerReward).toBe(25n);
    expect(loadConfig({}).exhibitions.rivalryRate).toBe(0.25);
    expect(() => loadConfig({ GI_OWNER_REWARD: "-1" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_CHALLENGE_TTL_HOURS: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_RIVALRY_RATE: "2" })).toThrow(ConfigError);
  });
});
