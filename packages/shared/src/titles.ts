/**
 * Titles and overlay cosmetics (DESIGN §8, docs/PHASE2.md step 4). Pure rules.
 *
 * A character earns titles through play and keeps them for life, whoever owns
 * it later. Each title unlocks a badge, and some also unlock a name plate, for
 * the stream overlay. Cosmetics never change how a character fights.
 */
import { parseLookCosmetic, type LookCosmetic } from "./looks.ts";
import { BAND_TIERS, type BandTier, type Tier } from "./tiers.ts";

export const TITLE_CODES = ["FIRST_BLOOD", "WINS_10", "WINS_100", "GIANT_SLAYER", "TIER_B", "TIER_A", "TIER_S", "TOURNAMENT_CHAMPION", "SEASON_CHAMPION"] as const;
export type TitleCode = (typeof TITLE_CODES)[number];

export const NAMEPLATE_IDS = ["standard", "bronze", "silver", "gold", "veteran", "crimson", "champion", "legend"] as const;
export type NameplateId = (typeof NAMEPLATE_IDS)[number];

export const BADGE_IDS = ["first-edition", "first-blood", "wins-10", "wins-100", "giant-slayer", "tier-b", "tier-a", "tier-s", "tournament-champion", "season-champion"] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

/** Badges shown next to a name at once. */
export const MAX_BADGES = 3;

/** Titles that can be earned more than once (one per tournament or season). The others are once per character. */
export const REPEATABLE_TITLES: readonly TitleCode[] = ["TOURNAMENT_CHAMPION", "SEASON_CHAMPION"];

export interface TitleDef {
  label: string;
  description: string;
  /** Higher ranks are shown first when the owner hasn't picked. */
  rank: number;
  badge: BadgeId;
  nameplate?: NameplateId;
}

export const TITLES: Readonly<Record<TitleCode, TitleDef>> = Object.freeze({
  FIRST_BLOOD: { label: "First Blood", description: "Won a fight for the first time.", rank: 10, badge: "first-blood" },
  WINS_10: { label: "10 Wins", description: "Won 10 fights.", rank: 20, badge: "wins-10" },
  TIER_B: { label: "B-Tier", description: "Climbed into B tier for the first time.", rank: 30, badge: "tier-b", nameplate: "bronze" },
  TIER_A: { label: "A-Tier", description: "Climbed into A tier for the first time.", rank: 40, badge: "tier-a", nameplate: "silver" },
  WINS_100: { label: "100 Wins", description: "Won 100 fights.", rank: 50, badge: "wins-100", nameplate: "veteran" },
  GIANT_SLAYER: { label: "Giant Slayer", description: "Beat a character three or more tiers higher.", rank: 60, badge: "giant-slayer", nameplate: "crimson" },
  TIER_S: { label: "S-Tier", description: "Climbed into S tier for the first time.", rank: 70, badge: "tier-s", nameplate: "gold" },
  TOURNAMENT_CHAMPION: { label: "Tournament Champion", description: "Won a tournament.", rank: 80, badge: "tournament-champion", nameplate: "champion" },
  SEASON_CHAMPION: { label: "Season Champion", description: "The highest-rated character at the end of a season.", rank: 90, badge: "season-champion", nameplate: "legend" },
});

export interface NameplateDef {
  label: string;
  rank: number;
  /** CSS colours for the overlay. */
  background: string;
  border: string;
  text: string;
}

export const NAMEPLATES: Readonly<Record<NameplateId, NameplateDef>> = Object.freeze({
  standard: { label: "Standard", rank: 0, background: "#1f2937", border: "#4b5563", text: "#f9fafb" },
  bronze: { label: "Bronze", rank: 30, background: "#3b2314", border: "#b87333", text: "#fbe7d3" },
  silver: { label: "Silver", rank: 40, background: "#2b3036", border: "#c0c7cf", text: "#f4f6f8" },
  veteran: { label: "Veteran", rank: 50, background: "#1d2b22", border: "#4f8a5b", text: "#e6f4ea" },
  crimson: { label: "Crimson", rank: 60, background: "#3a0d12", border: "#dc2626", text: "#fde8e8" },
  gold: { label: "Gold", rank: 70, background: "#3a2e05", border: "#eab308", text: "#fef9c3" },
  champion: { label: "Champion", rank: 80, background: "#2e1065", border: "#a78bfa", text: "#f5f3ff" },
  legend: { label: "Legend", rank: 90, background: "#082f49", border: "#38bdf8", text: "#f0f9ff" },
});

export interface BadgeDef {
  label: string;
  rank: number;
  /** A few characters the overlay draws inside the badge. */
  glyph: string;
  color: string;
}

export const BADGES: Readonly<Record<BadgeId, BadgeDef>> = Object.freeze({
  "first-blood": { label: "First Blood", rank: 10, glyph: "1st", color: "#b91c1c" },
  "wins-10": { label: "10 Wins", rank: 20, glyph: "10", color: "#2563eb" },
  "tier-b": { label: "B-Tier", rank: 30, glyph: "B", color: "#b87333" },
  "first-edition": { label: "First Edition", rank: 35, glyph: "1E", color: "#0d9488" },
  "tier-a": { label: "A-Tier", rank: 40, glyph: "A", color: "#9ca3af" },
  "wins-100": { label: "100 Wins", rank: 50, glyph: "100", color: "#16a34a" },
  "giant-slayer": { label: "Giant Slayer", rank: 60, glyph: "GS", color: "#dc2626" },
  "tier-s": { label: "S-Tier", rank: 70, glyph: "S", color: "#eab308" },
  "tournament-champion": { label: "Tournament Champion", rank: 80, glyph: "TC", color: "#7c3aed" },
  "season-champion": { label: "Season Champion", rank: 90, glyph: "SC", color: "#0284c7" },
});

/** The higher of two band tiers (null counts as lowest). */
export function higherBand(a: BandTier | null, b: BandTier | null): BandTier | null {
  if (a === null) return b;
  if (b === null) return a;
  return tierRank(a) >= tierRank(b) ? a : b;
}

/**
 * Player titles: the tournament T-Salt podium (docs/PHASE2.md step 6), each season's top bettor (docs/PHASE3.md
 * step 2) and the bettor titles earned by playing (bettors.ts, docs/ENGAGEMENT.md §2), once each.
 */
export const PLAYER_TITLE_CODES = ["BETTOR_1ST", "BETTOR_2ND", "BETTOR_3RD", "SEASON_TOP_BETTOR", "CALLED_IT", "IRON_READ", "LOYAL", "CONTRARIAN"] as const;
export type PlayerTitleCode = (typeof PLAYER_TITLE_CODES)[number];
/** A tournament's T-Salt podium, first to third. */
export const PODIUM_TITLE_CODES = ["BETTOR_1ST", "BETTOR_2ND", "BETTOR_3RD"] as const satisfies readonly PlayerTitleCode[];

export const PLAYER_TITLES: Readonly<Record<PlayerTitleCode, { label: string; description: string }>> = Object.freeze({
  BETTOR_1ST: { label: "Top Bettor", description: "Finished a tournament with the highest T-Salt balance." },
  BETTOR_2ND: { label: "Runner-up Bettor", description: "Finished a tournament with the second-highest T-Salt balance." },
  BETTOR_3RD: { label: "Third-place Bettor", description: "Finished a tournament with the third-highest T-Salt balance." },
  SEASON_TOP_BETTOR: { label: "Season Top Bettor", description: "Won the most Salt betting in a season." },
  // The bars are bettors.ts DEFAULT_BETTORS (settings; the descriptions say the defaults).
  CALLED_IT: { label: "Called It", description: "Won a bet on an underdog given a 20% chance or less." },
  IRON_READ: { label: "Iron Read", description: "Called 10 fights right in a row." },
  LOYAL: { label: "Loyal", description: "Bet on the same fighter 50 times." },
  CONTRARIAN: { label: "Contrarian", description: "Won 20 bets against the crowd: on the side with less of the players' Salt." },
});

/** Tier order for "tiers higher": P < B < A < S < X. */
export function tierRank(tier: Tier): number {
  return tier === "X" ? BAND_TIERS.length : BAND_TIERS.indexOf(tier);
}

/** How far above the winner the loser has to be for Giant Slayer (P beating S counts). */
export const GIANT_SLAYER_GAP = 3;

export interface TitleCheck {
  won: boolean;
  /** Total wins after this fight. */
  wins: number;
  /** Both sides' tiers as frozen when betting opened. */
  ownTier: Tier;
  opponentTier: Tier;
  /** The character's tier just before and just after the fight's rating update. */
  tierBefore: Tier;
  tierAfter: Tier;
  /** Highest band tier it had been in before this fight (tier history, including its starting tier); null if unknown. */
  peakTier: BandTier | null;
  /** Titles the character already has. */
  held: ReadonlySet<TitleCode>;
}

/** Titles a character earns from one settled fight, lowest rank first. Never repeats a held one. */
export function titlesEarned(c: TitleCheck): TitleCode[] {
  const earned: TitleCode[] = [];
  if (c.won && c.wins >= 1) earned.push("FIRST_BLOOD");
  if (c.won && c.wins >= 10) earned.push("WINS_10");
  if (c.won && c.wins >= 100) earned.push("WINS_100");
  if (c.won && tierRank(c.opponentTier) - tierRank(c.ownTier) >= GIANT_SLAYER_GAP) earned.push("GIANT_SLAYER");
  // Tier firsts: every band reached for the first time on a rating promotion (a
  // jump from P to A earns B-Tier and A-Tier). A character that starts in B, or
  // drops out of A and climbs back, doesn't earn them again. X is set by hand,
  // so it never counts.
  if (c.tierBefore !== "X" && c.tierAfter !== "X") {
    const floor = Math.max(tierRank(c.tierBefore), c.peakTier === null ? -1 : tierRank(c.peakTier));
    for (const t of ["B", "A", "S"] as const) {
      if (floor < tierRank(t) && tierRank(t) <= tierRank(c.tierAfter)) earned.push(`TIER_${t}`);
    }
  }
  return earned.filter((code) => !c.held.has(code)).sort((a, b) => TITLES[a].rank - TITLES[b].rank);
}

/** What the owner has picked. A missing field means "automatic" (best unlocked). */
export interface CosmeticChoice {
  /** null shows no title. */
  title?: TitleCode | null;
  nameplate?: NameplateId;
  /** [] shows no badges. */
  badges?: BadgeId[];
}

/** What the overlay shows for a character. Frozen into each fight's loadouts. */
export interface Cosmetics {
  title: TitleCode | null;
  nameplate: NameplateId;
  badges: BadgeId[];
  /** An NFT look (docs/PHASE3.md "NFTs as fighters"); absent when the character has none. */
  look?: LookCosmetic;
}

export const NO_COSMETICS: Readonly<Cosmetics> = Object.freeze({ title: null, nameplate: "standard", badges: [] as BadgeId[] });

export interface Unlocked {
  titles: TitleCode[];
  nameplates: NameplateId[];
  badges: BadgeId[];
}

const byRank = <K extends string>(defs: Readonly<Record<K, { rank: number }>>) => (a: K, b: K) => defs[b].rank - defs[a].rank;

/** Everything a character may show, best first. */
export function unlockedCosmetics(earned: Iterable<TitleCode>, extras: { firstEdition: boolean }): Unlocked {
  const titles = [...new Set(earned)].sort(byRank(TITLES));
  const nameplates = new Set<NameplateId>(["standard"]);
  const badges = new Set<BadgeId>();
  if (extras.firstEdition) badges.add("first-edition");
  for (const t of titles) {
    badges.add(TITLES[t].badge);
    const plate = TITLES[t].nameplate;
    if (plate) nameplates.add(plate);
  }
  return { titles, nameplates: [...nameplates].sort(byRank(NAMEPLATES)), badges: [...badges].sort(byRank(BADGES)) };
}

/** Why a choice isn't allowed, or null if it is. */
export function checkChoice(choice: CosmeticChoice, unlocked: Unlocked): string | null {
  if (choice.title != null && !unlocked.titles.includes(choice.title)) return `the character hasn't earned ${TITLES[choice.title].label}`;
  if (choice.nameplate !== undefined && !unlocked.nameplates.includes(choice.nameplate)) return `the ${NAMEPLATES[choice.nameplate].label} name plate isn't unlocked`;
  if (choice.badges !== undefined) {
    if (choice.badges.length > MAX_BADGES) return `at most ${MAX_BADGES} badges`;
    if (new Set(choice.badges).size !== choice.badges.length) return "a badge is listed twice";
    const locked = choice.badges.find((b) => !unlocked.badges.includes(b));
    if (locked) return `the ${BADGES[locked].label} badge isn't unlocked`;
  }
  return null;
}

/** What to show: the owner's pick where it's still valid, otherwise the best unlocked. */
export function resolveCosmetics(unlocked: Unlocked, choice: CosmeticChoice | null | undefined): Cosmetics {
  const c = choice ?? {};
  const title = c.title === undefined ? (unlocked.titles[0] ?? null) : c.title !== null && unlocked.titles.includes(c.title) ? c.title : null;
  const nameplate = c.nameplate !== undefined && unlocked.nameplates.includes(c.nameplate) ? c.nameplate : (unlocked.nameplates[0] ?? "standard");
  const badges = c.badges === undefined ? unlocked.badges.slice(0, MAX_BADGES) : [...new Set(c.badges.filter((b) => unlocked.badges.includes(b)))].slice(0, MAX_BADGES);
  return { title, nameplate, badges };
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/**
 * Read a stored choice (JSON column). Unknown ids (e.g. a cosmetic removed
 * from the catalogue) are dropped rather than failing the whole read.
 */
export function parseCosmeticChoice(value: unknown): CosmeticChoice | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const choice: CosmeticChoice = {};
  if (v["title"] === null || isOneOf(TITLE_CODES, v["title"])) choice.title = v["title"];
  if (isOneOf(NAMEPLATE_IDS, v["nameplate"])) choice.nameplate = v["nameplate"];
  if (Array.isArray(v["badges"])) choice.badges = v["badges"].filter((b): b is BadgeId => isOneOf(BADGE_IDS, b));
  return choice;
}

/** Read frozen loadout cosmetics (JSON column), falling back to nothing shown. */
export function parseCosmetics(value: unknown): Cosmetics {
  const c = parseCosmeticChoice(value);
  const look = value !== null && typeof value === "object" ? parseLookCosmetic((value as Record<string, unknown>)["look"]) : undefined;
  return { title: c?.title ?? null, nameplate: c?.nameplate ?? "standard", badges: c?.badges ?? [], ...(look ? { look } : {}) };
}

/** The whole catalogue, for the overlay and the dev page. */
export function cosmeticsCatalog() {
  return {
    maxBadges: MAX_BADGES,
    titles: TITLE_CODES.map((code) => ({ code, ...TITLES[code], repeatable: REPEATABLE_TITLES.includes(code) })),
    nameplates: NAMEPLATE_IDS.map((id) => ({ id, ...NAMEPLATES[id] })),
    badges: BADGE_IDS.map((id) => ({ id, ...BADGES[id] })),
  };
}

/** Cosmetics with their catalogue labels and colours, for the API and overlay. */
export function describeCosmetics(c: Cosmetics) {
  // An NFT look's colours replace the name plate's (a look is worn over whatever plate is picked).
  const lookColors = c.look?.colors;
  return {
    title: c.title ? { code: c.title, label: TITLES[c.title].label } : null,
    nameplate: lookColors ? { id: c.nameplate, ...NAMEPLATES[c.nameplate], ...lookColors, label: "NFT look" } : { id: c.nameplate, ...NAMEPLATES[c.nameplate] },
    badges: c.badges.map((id) => ({ id, ...BADGES[id] })),
    look: c.look ? { id: c.look.id, name: c.look.name, image: `/api/looks/${c.look.id}/image`, card: c.look.defPath ? `/api/looks/${c.look.id}/card` : null } : null,
  };
}

/** What an owner can pick from, with labels. */
export function describeUnlocked(u: Unlocked) {
  return {
    titles: u.titles.map((code) => ({ code, label: TITLES[code].label })),
    nameplates: u.nameplates.map((id) => ({ id, label: NAMEPLATES[id].label })),
    badges: u.badges.map((id) => ({ id, label: BADGES[id].label })),
  };
}
