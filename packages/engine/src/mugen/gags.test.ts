import { describe, expect, it } from "vitest";
import { airReach, parseStates } from "./ai.ts";
import { scanCheats } from "./cheats.ts";
import { EXPLOSION_HIT_ANIM, EXPLOSION_STATE, gagAir, gagStates, gagTriggers } from "./gags.ts";

describe("gags", () => {
  it("the explosion: a wind-up, the pack's animation on the opponent, and an unblockable hit for 45% of their life", () => {
    const [state] = parseStates({ name: "gi-gags.cns", text: gagStates(["explosion"]) });
    expect(state!.number).toBe(EXPLOSION_STATE);
    expect(state!.params.get("movetype")).toBe("A");
    const ctrl = (type: string) => state!.controllers.find((c) => c.type === type)!;
    expect(ctrl("explod").lines).toEqual(expect.arrayContaining([["anim", "GIFX1"], ["postype", "p2"]]));
    const blast = ctrl("projectile").lines;
    expect(blast).toEqual(expect.arrayContaining([["postype", "p2"], ["projanim", String(EXPLOSION_HIT_ANIM)], ["damage", "floor((EnemyNear, LifeMax) * 0.45), 0"], ["fall", "1"]]));
    expect(blast.some(([key]) => key === "guardflag")).toBe(false); // no guardflag: it can't be blocked
    // Our own move, not something the cheat scanner should flag.
    expect(scanCheats([{ name: "gi-gags.cns", text: gagStates(["explosion"]) }])).toEqual([]);
  });

  it("its hit is one big box with no picture, in the character's line endings", () => {
    const air = gagAir(["explosion"], "\r\n");
    expect(air).toContain(`[Begin Action ${EXPLOSION_HIT_ANIM}]\r\n`);
    expect(air).toContain("-1, 0, 0, 0, 30");
    expect(airReach(air).get(EXPLOSION_HIT_ANIM)).toEqual({ reach: 75, startup: 0 });
  });

  it("the AI sets it off at random, at most once a round", () => {
    const text = gagTriggers(["explosion"]).join("\n");
    expect(text).toContain(`value = ${EXPLOSION_STATE}`);
    expect(text).toContain("!Map(gi_boom)");
    expect(text).toContain("Random < 1 && Random < 300");
    expect(text).toMatch(/trigger1 = RoundState < 2\nmap = "gi_boom"\nvalue = 0/);
    expect(gagStates([])).toBe("");
    expect(gagTriggers([])).toEqual([]);
  });
});
