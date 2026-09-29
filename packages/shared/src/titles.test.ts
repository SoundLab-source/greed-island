import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BAND_TIERS, type Tier } from "./tiers.ts";
import {
  BADGE_IDS,
  checkChoice,
  cosmeticsCatalog,
  MAX_BADGES,
  NAMEPLATE_IDS,
  parseCosmeticChoice,
  parseCosmetics,
  resolveCosmetics,
  TITLE_CODES,
  tierRank,
  TITLES,
  titlesEarned,
  unlockedCosmetics,
  type CosmeticChoice,
  type TitleCheck,
  type TitleCode,
} from "./titles.ts";

const check = (over: Partial<TitleCheck>): TitleCheck => ({
  won: true,
  wins: 5,
  ownTier: "P",
  opponentTier: "P",
  tierBefore: "P",
  tierAfter: "P",
  peakTier: null,
  held: new Set(["FIRST_BLOOD"]),
  ...over,
});

describe("titlesEarned", () => {
  it("awards First Blood, 10 Wins and 100 Wins on reaching the count", () => {
    expect(titlesEarned(check({ wins: 1, held: new Set() }))).toEqual(["FIRST_BLOOD"]);
    expect(titlesEarned(check({ wins: 9 }))).toEqual([]);
    expect(titlesEarned(check({ wins: 10 }))).toEqual(["WINS_10"]);
    expect(titlesEarned(check({ wins: 100, held: new Set(["FIRST_BLOOD", "WINS_10"]) }))).toEqual(["WINS_100"]);
    // A loss never earns a win title, even if one was missed earlier.
    expect(titlesEarned(check({ won: false, wins: 10, held: new Set() }))).toEqual([]);
  });

  it("awards Giant Slayer for beating a character three or more tiers up", () => {
    expect(titlesEarned(check({ ownTier: "P", opponentTier: "S" }))).toEqual(["GIANT_SLAYER"]);
    expect(titlesEarned(check({ ownTier: "B", opponentTier: "X" }))).toEqual(["GIANT_SLAYER"]);
    expect(titlesEarned(check({ ownTier: "P", opponentTier: "A" }))).toEqual([]);
    expect(titlesEarned(check({ ownTier: "P", opponentTier: "S", won: false }))).toEqual([]);
    expect(titlesEarned(check({ ownTier: "P", opponentTier: "S", held: new Set(["FIRST_BLOOD", "GIANT_SLAYER"]) }))).toEqual([]);
  });

  it("awards tier firsts for every band passed on a promotion, never for X or a drop", () => {
    expect(titlesEarned(check({ tierBefore: "P", tierAfter: "B" }))).toEqual(["TIER_B"]);
    expect(titlesEarned(check({ tierBefore: "P", tierAfter: "A" }))).toEqual(["TIER_B", "TIER_A"]);
    expect(titlesEarned(check({ tierBefore: "A", tierAfter: "S", won: false }))).toEqual(["TIER_S"]);
    expect(titlesEarned(check({ tierBefore: "S", tierAfter: "A", won: false }))).toEqual([]);
    expect(titlesEarned(check({ tierBefore: "X", tierAfter: "X" }))).toEqual([]);
    expect(titlesEarned(check({ tierBefore: "P", tierAfter: "B", held: new Set(["FIRST_BLOOD", "TIER_B"]) }))).toEqual([]);
  });

  it("only counts tiers reached for the first time: not a starting tier, not a climb back", () => {
    // Started in B (peak B), dropped to P, climbs back to B: nothing.
    expect(titlesEarned(check({ tierBefore: "P", tierAfter: "B", peakTier: "B" }))).toEqual([]);
    // Had been in A, climbs from P straight to S: only S is new.
    expect(titlesEarned(check({ tierBefore: "P", tierAfter: "S", peakTier: "A" }))).toEqual(["TIER_S"]);
    expect(titlesEarned(check({ tierBefore: "B", tierAfter: "A", peakTier: "B" }))).toEqual(["TIER_A"]);
  });

  it("returns several titles from one fight, lowest rank first", () => {
    expect(titlesEarned(check({ wins: 1, held: new Set(), ownTier: "P", opponentTier: "S", tierBefore: "P", tierAfter: "B" }))).toEqual([
      "FIRST_BLOOD",
      "TIER_B",
      "GIANT_SLAYER",
    ]);
  });

  it("never repeats a held title and never awards a win title on a loss (property)", () => {
    const tier = fc.constantFrom<Tier>(...BAND_TIERS, "X");
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.integer({ min: 0, max: 300 }),
        tier,
        tier,
        tier,
        tier,
        fc.subarray([...TITLE_CODES]),
        fc.constantFrom(null, ...BAND_TIERS),
        (won, wins, ownTier, opponentTier, tierBefore, tierAfter, held, peakTier) => {
          const earned = titlesEarned({ won, wins, ownTier, opponentTier, tierBefore, tierAfter, peakTier, held: new Set(held) });
          expect(earned.filter((t) => held.includes(t))).toEqual([]);
          expect(new Set(earned).size).toBe(earned.length);
          expect(earned).not.toContain("TOURNAMENT_CHAMPION");
          if (!won) expect(earned.filter((t) => ["FIRST_BLOOD", "WINS_10", "WINS_100", "GIANT_SLAYER"].includes(t))).toEqual([]);
          // A tier title is always above both the starting point and the peak, and at most the new tier.
          for (const t of earned.filter((x) => x.startsWith("TIER_"))) {
            const r = tierRank(t.slice(5) as Tier);
            expect(r).toBeGreaterThan(tierRank(tierBefore));
            if (peakTier) expect(r).toBeGreaterThan(tierRank(peakTier));
            expect(r).toBeLessThanOrEqual(tierRank(tierAfter));
          }
        },
      ),
    );
  });
});

describe("cosmetics", () => {
  it("unlocks a badge per title, name plates for some, and the First Edition badge", () => {
    const u = unlockedCosmetics(["FIRST_BLOOD", "TIER_S", "TIER_B"], { firstEdition: true });
    expect(u.titles).toEqual(["TIER_S", "TIER_B", "FIRST_BLOOD"]);
    expect(u.nameplates).toEqual(["gold", "bronze", "standard"]);
    expect(u.badges).toEqual(["tier-s", "first-edition", "tier-b", "first-blood"]);
    expect(unlockedCosmetics([], { firstEdition: false })).toEqual({ titles: [], nameplates: ["standard"], badges: [] });
  });

  it("shows the best unlocked when the owner hasn't picked", () => {
    const u = unlockedCosmetics(["FIRST_BLOOD", "WINS_10", "TIER_B", "TIER_A"], { firstEdition: false });
    expect(resolveCosmetics(u, null)).toEqual({ title: "TIER_A", nameplate: "silver", badges: ["tier-a", "tier-b", "wins-10"] });
    expect(resolveCosmetics(unlockedCosmetics([], { firstEdition: false }), undefined)).toEqual({ title: null, nameplate: "standard", badges: [] });
  });

  it("follows the owner's pick, including choosing to show nothing", () => {
    const u = unlockedCosmetics(["FIRST_BLOOD", "TIER_B"], { firstEdition: true });
    expect(resolveCosmetics(u, { title: "FIRST_BLOOD", nameplate: "standard", badges: ["first-edition"] })).toEqual({
      title: "FIRST_BLOOD",
      nameplate: "standard",
      badges: ["first-edition"],
    });
    expect(resolveCosmetics(u, { title: null, badges: [] })).toEqual({ title: null, nameplate: "bronze", badges: [] });
    // Anything no longer unlocked falls back instead of showing.
    expect(resolveCosmetics(u, { title: "TIER_S", nameplate: "gold", badges: ["tier-s", "tier-b"] })).toEqual({ title: null, nameplate: "bronze", badges: ["tier-b"] });
  });

  it("checks a choice against what's unlocked", () => {
    const u = unlockedCosmetics(["FIRST_BLOOD", "TIER_B"], { firstEdition: false });
    expect(checkChoice({ title: "FIRST_BLOOD", nameplate: "bronze", badges: ["tier-b"] }, u)).toBeNull();
    expect(checkChoice({ title: null, badges: [] }, u)).toBeNull();
    expect(checkChoice({ title: "TIER_S" }, u)).toMatch(/hasn't earned S-Tier/);
    expect(checkChoice({ nameplate: "gold" }, u)).toMatch(/Gold name plate/);
    expect(checkChoice({ badges: ["first-edition"] }, u)).toMatch(/First Edition badge/);
    expect(checkChoice({ badges: ["tier-b", "tier-b"] }, u)).toMatch(/twice/);
    const many = unlockedCosmetics(["FIRST_BLOOD", "WINS_10", "TIER_B", "TIER_A"], { firstEdition: false });
    expect(checkChoice({ badges: many.badges }, many)).toMatch(/at most 3/);
  });

  it("always resolves to unlocked items within the badge limit (property)", () => {
    const choice = fc.record(
      {
        title: fc.constantFrom<TitleCode | null>(null, ...TITLE_CODES),
        nameplate: fc.constantFrom(...NAMEPLATE_IDS),
        badges: fc.array(fc.constantFrom(...BADGE_IDS), { maxLength: 6 }),
      },
      { requiredKeys: [] },
    );
    fc.assert(
      fc.property(fc.subarray([...TITLE_CODES]), fc.boolean(), fc.option(choice, { nil: null }), (earned, firstEdition, pick) => {
        const u = unlockedCosmetics(earned, { firstEdition });
        const r = resolveCosmetics(u, pick as CosmeticChoice | null);
        if (r.title !== null) expect(u.titles).toContain(r.title);
        expect(u.nameplates).toContain(r.nameplate);
        expect(r.badges.length).toBeLessThanOrEqual(MAX_BADGES);
        for (const b of r.badges) expect(u.badges).toContain(b);
        // A valid choice is shown exactly as picked.
        if (pick && checkChoice(pick as CosmeticChoice, u) === null) {
          if (pick.title !== undefined) expect(r.title).toBe(pick.title);
          if (pick.nameplate !== undefined) expect(r.nameplate).toBe(pick.nameplate);
          if (pick.badges !== undefined) expect(r.badges).toEqual(pick.badges);
        }
      }),
    );
  });

  it("reads stored JSON leniently", () => {
    expect(parseCosmeticChoice(null)).toBeNull();
    expect(parseCosmeticChoice([])).toBeNull();
    expect(parseCosmeticChoice({})).toEqual({});
    expect(parseCosmeticChoice({ title: null, nameplate: "gold", badges: ["tier-s", "gone"] })).toEqual({ title: null, nameplate: "gold", badges: ["tier-s"] });
    expect(parseCosmeticChoice({ title: "NOPE", nameplate: 3 })).toEqual({});
    expect(parseCosmetics(null)).toEqual({ title: null, nameplate: "standard", badges: [] });
    expect(parseCosmetics({ title: "TIER_B", nameplate: "bronze", badges: ["tier-b"] })).toEqual({ title: "TIER_B", nameplate: "bronze", badges: ["tier-b"] });
  });

  it("has a consistent catalogue", () => {
    const cat = cosmeticsCatalog();
    expect(cat.titles.map((t) => t.code)).toEqual([...TITLE_CODES]);
    for (const t of TITLE_CODES) {
      expect(BADGE_IDS).toContain(TITLES[t].badge);
      if (TITLES[t].nameplate) expect(NAMEPLATE_IDS).toContain(TITLES[t].nameplate);
    }
    expect(new Set(TITLE_CODES.map((t) => TITLES[t].rank)).size).toBe(TITLE_CODES.length);
    expect(cat.titles.find((t) => t.code === "TOURNAMENT_CHAMPION")?.repeatable).toBe(true);
  });
});
