/**
 * Follow a fighter (docs/ENGAGEMENT.md §4; DESIGN §4, proposed): a player follows a fighter (the design, so every
 * outfit and every owned copy of it counts) and gets a gentle heads-up when one is about to fight. Nothing here
 * touches Salt. The heads-up is only on the site: a line on the page and the tab's title, plus a browser notification
 * when the player turned those on themselves (never at night). No email yet.
 */

export interface FollowConfig {
  /** The most fighters one player can follow (GI_FOLLOW_MAX). Open question: a default, not a DESIGN number. */
  max: number;
}

export const DEFAULT_FOLLOWS: Readonly<FollowConfig> = Object.freeze({ max: 30 });

export function validateFollows(c: FollowConfig): FollowConfig {
  if (!Number.isInteger(c.max) || c.max < 1 || c.max > 500) throw new Error(`GI_FOLLOW_MAX must be a whole number from 1 to 500 (got ${c.max})`);
  return c;
}

/** One side of a fight, as the heads-up needs it. */
export interface FollowSide {
  side: 1 | 2;
  fighterId: string;
  /** The name bettors see (the outfit's or the owner's name for the character). */
  name: string;
}

export interface FollowHeadsUp {
  /** The sides whose fighter the player follows. */
  sides: (1 | 2)[];
  /** One line for the page, the tab and a notification: "Free Loot is up: betting is open". */
  line: string;
}

/**
 * The heads-up for a fight, or null when the player follows neither fighter. When both are followed (two different
 * fighters, or the same fighter in two outfits), one line names both.
 */
export function followHeadsUp(sides: readonly FollowSide[], followed: ReadonlySet<string>): FollowHeadsUp | null {
  const mine = sides.filter((s) => followed.has(s.fighterId));
  if (mine.length === 0) return null;
  const who = mine.length === 1 ? `${mine[0]!.name} is up` : `${mine[0]!.name} vs ${mine[1]!.name}, both yours, is up`;
  return { sides: mine.map((s) => s.side), line: `${who}: betting is open` };
}

/** Why a follow was refused, in words for the site; null when it's fine. */
export function followProblem(state: { alreadyFollowing: boolean; count: number; fighterEnabled: boolean }, config: FollowConfig): string | null {
  if (state.alreadyFollowing) return null; // following twice is a no-op, never an error
  if (!state.fighterEnabled) return "that fighter isn't on the roster any more";
  if (state.count >= config.max) return `you can follow up to ${config.max} fighters; unfollow one first`;
  return null;
}
