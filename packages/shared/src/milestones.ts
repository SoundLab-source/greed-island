/**
 * Owners' goals (DESIGN §7-8, docs/ENGAGEMENT.md §3): a character's next milestones, so an owner always sees what
 * they're climbing toward ("3 more wins to 10 Wins", "rating 1600 for A tier: 45 to go"). The next win title and the
 * next tier up (by rating; the tier's title and name plate the first time). Pure.
 */
import { NAMEPLATES, TITLES, type TitleCode } from "./titles.ts";
import { BAND_TIERS, DEFAULT_TIERS, type BandTier, type Tier, type TierConfig } from "./tiers.ts";

export interface Milestone {
  kind: "wins" | "tier";
  /** What to do, plainly: "3 more wins to 10 Wins". */
  text: string;
  /** What it earns, when it earns something new: "the 10 Wins title". */
  reward: string | null;
  /** How far along, 0 to 1 (from the last milestone of its kind). */
  progress: number;
}

/** Win titles, in order, by the wins that earn them. */
const WIN_TITLES: readonly { wins: number; code: TitleCode }[] = [
  { wins: 1, code: "FIRST_BLOOD" },
  { wins: 10, code: "WINS_10" },
  { wins: 100, code: "WINS_100" },
];

const TIER_TITLE: Record<Exclude<BandTier, "P">, TitleCode> = { B: "TIER_B", A: "TIER_A", S: "TIER_S" };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** "the 100 Wins title and the Veteran name plate" */
function rewardOf(code: TitleCode): string {
  const t = TITLES[code];
  return `the ${t.label} title${t.nameplate ? ` and the ${NAMEPLATES[t.nameplate].label} name plate` : ""}`;
}

/** The character's next milestones, wins first. None past 100 wins and S tier (X is set by hand). */
export function nextMilestones(c: { wins: number; rating: number; tier: Tier; titles: readonly TitleCode[] }, tiers: TierConfig = DEFAULT_TIERS): Milestone[] {
  const out: Milestone[] = [];
  const held = new Set(c.titles);
  const rating = Math.round(c.rating);

  const i = WIN_TITLES.findIndex((w) => c.wins < w.wins);
  if (i >= 0) {
    const w = WIN_TITLES[i]!;
    const from = i > 0 ? WIN_TITLES[i - 1]!.wins : 0;
    const left = w.wins - c.wins;
    out.push({
      kind: "wins",
      text: c.wins === 0 ? `Win a fight for ${TITLES[w.code].label}` : `${left} more win${left === 1 ? "" : "s"} to ${TITLES[w.code].label}`,
      reward: held.has(w.code) ? null : rewardOf(w.code),
      progress: clamp01((c.wins - from) / (w.wins - from)),
    });
  }

  if (c.tier !== "X" && c.tier !== "S") {
    const next = BAND_TIERS[BAND_TIERS.indexOf(c.tier) + 1] as Exclude<BandTier, "P">;
    const need = tiers.thresholds[next];
    const { B, A } = tiers.thresholds;
    // The rating where this tier starts (P has no floor: one band's width below B).
    const floor = c.tier === "P" ? B - (A - B) : tiers.thresholds[c.tier];
    out.push({
      kind: "tier",
      // Promotion happens as a fight settles, so a rating already there (a changed setting, a tier set by hand) waits for one.
      text: `Rating ${need} for ${next} tier: ${rating >= need ? "there, it moves up after its next fight" : `${need - rating} to go`}`,
      reward: held.has(TIER_TITLE[next]) ? null : rewardOf(TIER_TITLE[next]),
      progress: clamp01((rating - floor) / (need - floor)),
    });
  }
  return out;
}
