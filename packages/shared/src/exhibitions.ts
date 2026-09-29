/**
 * Exhibitions (DESIGN §5, docs/PHASE2.md step 5): owners challenge each
 * other's characters, accepted challenges play in the exhibition segment
 * (oldest first), and house showcases fill the gaps. Pure rules; booking
 * lives in the orchestrator. Defaults answer DESIGN §15 open questions.
 */

export interface ExhibitionConfig {
  /** How long a challenge waits for an answer before it expires. */
  challengeTtlMs: number;
  /** Challenges a player can have open at once (sent and not yet answered, or accepted and waiting to play). */
  maxOpenPerUser: number;
  /** Showcases pair house characters from this many of the strongest. */
  showcasePool: number;
}

export const DEFAULT_EXHIBITIONS: Readonly<ExhibitionConfig> = Object.freeze({
  challengeTtlMs: 24 * 3_600_000,
  maxOpenPerUser: 5,
  showcasePool: 6,
});

export const CHALLENGE_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED", "BOOKED"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/** Still waiting for an answer or for its fight. */
export const OPEN_CHALLENGE_STATUSES: readonly ChallengeStatus[] = ["PENDING", "ACCEPTED"];

export type ChallengeAction = "ACCEPT" | "DECLINE" | "CANCEL" | "EXPIRE" | "BOOK";
export type ChallengeActor = "challenger" | "challenged" | "system";

/**
 * The status a challenge moves to, or why it can't. Only the challenged owner
 * answers, only the challenger cancels (until the fight is booked), and only
 * the system expires or books.
 */
export function challengeTransition(
  status: ChallengeStatus,
  action: ChallengeAction,
  actor: ChallengeActor,
): { ok: true; to: ChallengeStatus } | { ok: false; error: string } {
  const allowed: Record<ChallengeAction, { actor: ChallengeActor; from: readonly ChallengeStatus[]; to: ChallengeStatus }> = {
    ACCEPT: { actor: "challenged", from: ["PENDING"], to: "ACCEPTED" },
    DECLINE: { actor: "challenged", from: ["PENDING"], to: "DECLINED" },
    CANCEL: { actor: "challenger", from: ["PENDING", "ACCEPTED"], to: "CANCELLED" },
    EXPIRE: { actor: "system", from: ["PENDING"], to: "EXPIRED" },
    BOOK: { actor: "system", from: ["ACCEPTED"], to: "BOOKED" },
  };
  const rule = allowed[action];
  if (rule.actor !== actor) {
    const who = { challenger: "the player who sent it", challenged: "the challenged owner", system: "the game" }[rule.actor];
    return { ok: false, error: `only ${who} can do that` };
  }
  if (!rule.from.includes(status)) return { ok: false, error: `the challenge is ${status.toLowerCase()}` };
  return { ok: true, to: rule.to };
}

export interface ChallengeSide {
  fighterId: string;
  ownerUserId: string | null;
  /** The character and its fighter are both enabled. */
  enabled: boolean;
}

/** Why a player can't send this challenge, or null if they can. */
export function challengeProblem(
  input: { userId: string; challenger: ChallengeSide; challenged: ChallengeSide; openSent: number },
  cfg: ExhibitionConfig,
): string | null {
  const { userId, challenger, challenged } = input;
  if (challenger.ownerUserId !== userId) return "you can only challenge with a character you own";
  if (challenged.ownerUserId === null) return "only players' characters can be challenged, not house characters";
  if (challenged.ownerUserId === userId) return "you can't challenge your own character";
  if (!challenger.enabled || !challenged.enabled) return "both characters must be active on the stream";
  // Same rule as matchmaking: no mirror matches.
  if (challenger.fighterId === challenged.fighterId) return "two copies of the same fighter can't face each other";
  if (input.openSent >= cfg.maxOpenPerUser) return `you already have ${cfg.maxOpenPerUser} open challenges`;
  return null;
}
