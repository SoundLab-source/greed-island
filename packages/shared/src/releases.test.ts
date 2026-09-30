import { describe, expect, it } from "vitest";
import { communityFighterId, pickStandIn } from "./releases.ts";

describe("pickStandIn", () => {
  const roster = [
    { id: "kfm", archetype: "ALL_ROUNDER" as const },
    { id: "gi-stone-buddha", archetype: "HEAVY" as const },
    { id: "gi-grey-monk", archetype: "ALL_ROUNDER" as const },
    { id: "gi-tpl-all-rounder", archetype: "ALL_ROUNDER" as const },
  ];

  it("prefers the archetype's template", () => {
    expect(pickStandIn(roster, "ALL_ROUNDER")?.id).toBe("gi-tpl-all-rounder");
  });

  it("falls back to a fighter of the same archetype, then Kung Fu Man, then anyone", () => {
    expect(pickStandIn(roster, "HEAVY")?.id).toBe("gi-stone-buddha");
    expect(pickStandIn(roster, "ZONER")?.id).toBe("kfm");
    expect(pickStandIn([{ id: "gi-z", archetype: "HEAVY" as const }], "ZONER")?.id).toBe("gi-z");
    expect(pickStandIn([], "ZONER")).toBeNull();
  });
});

describe("communityFighterId", () => {
  it("makes a unique slug", () => {
    expect(communityFighterId("Big Bad Wolf!", new Set())).toBe("community-big-bad-wolf");
    expect(communityFighterId("Big Bad Wolf", new Set(["community-big-bad-wolf"]))).toBe("community-big-bad-wolf-2");
  });
});
