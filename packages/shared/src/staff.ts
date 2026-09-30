/**
 * Staff roles and the review queue (docs/PHASE3.md step 1). Admins and
 * moderators review what players submit (custom character names first,
 * fighter submissions later) and every staff action is logged. Pure rules;
 * the database side lives in the orchestrator. Defaults are settings.
 */

export const USER_ROLES = ["PLAYER", "MODERATOR", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type StaffPermission =
  /** Approve or reject what's in the review queue. */
  | "review"
  /** Reset a player's display name or a character's custom name. */
  | "reset_names"
  /** Read the staff log and the staff list. */
  | "view_log"
  /** Appoint and remove moderators. */
  | "manage_moderators";

const PERMISSIONS: Record<UserRole, readonly StaffPermission[]> = {
  PLAYER: [],
  MODERATOR: ["review", "reset_names", "view_log"],
  ADMIN: ["review", "reset_names", "view_log", "manage_moderators"],
};

export function hasPermission(role: UserRole, permission: StaffPermission): boolean {
  return PERMISSIONS[role].includes(permission);
}

export function isStaff(role: UserRole): boolean {
  return role !== "PLAYER";
}

export function permissionsOf(role: UserRole): readonly StaffPermission[] {
  return PERMISSIONS[role];
}

export interface StaffConfig {
  /** After a custom name is approved, the next change can be asked for this much later. */
  renameCooldownMs: number;
}

export const DEFAULT_STAFF: Readonly<StaffConfig> = Object.freeze({
  renameCooldownMs: 7 * 86_400_000,
});

export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN", "CHANGES_REQUESTED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
/** REQUEST_CHANGES is for fighter submissions: the submitter fixes them and sends them again. */
export type ReviewDecision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

/** Longest note a reviewer can leave (the player sees it). Fighter submissions allow longer notes. */
export const MAX_NOTE_LENGTH = 200;
export const MAX_SUBMISSION_NOTE_LENGTH = 2000;

/** Why this reviewer can't decide this request, or null if they can. Nobody reviews their own, except an admin. */
export function reviewProblem(input: { status: ReviewStatus; reviewerId: string; reviewerRole: UserRole; submitterId: string }): string | null {
  if (!hasPermission(input.reviewerRole, "review")) return "only staff can review requests";
  if (input.status !== "PENDING") return `this request was already ${input.status.toLowerCase().replace("_", " ")}`;
  if (input.reviewerId === input.submitterId && input.reviewerRole !== "ADMIN") return "you can't review your own request";
  return null;
}

export type RoleActor = { kind: "cli" } | { kind: "user"; id: string; role: UserRole };

/**
 * Why this role change isn't allowed, or null. The server's command line can
 * set any role; on the staff page an admin appoints and removes moderators
 * (admins themselves only change from the command line). Staff need a
 * verified email.
 */
export function roleChangeProblem(input: { actor: RoleActor; target: { id: string; role: UserRole; emailVerified: boolean }; to: UserRole }): string | null {
  const { actor, target, to } = input;
  if (to !== "PLAYER" && !target.emailVerified) return "staff need an account with a verified email (signed in with an emailed link)";
  if (actor.kind === "cli") return null;
  if (!hasPermission(actor.role, "manage_moderators")) return "only an admin can appoint or remove moderators";
  if (target.id === actor.id) return "you can't change your own role";
  if (to === "ADMIN" || target.role === "ADMIN") return "admins are appointed and removed from the server's command line (pnpm staff:role)";
  return null;
}

// ---------------------------------------------------------------------------
// Custom character names

export const NAME_MIN = 3;
export const NAME_MAX = 20;

/** Trimmed, with runs of spaces collapsed. */
export function normalizeCharacterName(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Names are unique ignoring upper/lower case. */
export function nameKey(name: string): string {
  return normalizeCharacterName(name).toLowerCase();
}

/**
 * Why a (normalized) name can't be used, or null. Plain letters, digits,
 * spaces and ' - . & only: "#" is left out because automatic names look
 * like "Grey Monk #1", and lookalike letters from other alphabets can't
 * be used to copy another character's name.
 */
export function characterNameProblem(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `a name is ${NAME_MIN}-${NAME_MAX} characters long`;
  if (!/^[A-Za-z0-9 '\-.&]+$/.test(name)) return "use only letters A-Z, digits, spaces and ' - . &";
  if (!/[A-Za-z]/.test(name)) return "a name needs at least one letter";
  return null;
}

/** How an owned character is named until its owner picks a name. */
export function automaticName(fighterDisplayName: string, serial: number): string {
  return `${fighterDisplayName} #${serial}`;
}

/** Why this player can't ask for a new name for this character now, or null. */
export function renameProblem(
  input: {
    userId: string;
    ownerUserId: string | null;
    pending: boolean;
    /** When the character's last custom name was approved, if ever. */
    lastApprovedAt: Date | null;
    currentName: string;
    name: string;
    now: Date;
  },
  cfg: StaffConfig,
): string | null {
  if (input.ownerUserId === null) return "house characters keep their names";
  if (input.ownerUserId !== input.userId) return "you can only rename a character you own";
  if (input.pending) return "this character already has a name waiting for review";
  if (input.name === input.currentName) return "that's already its name";
  const nameProblem = characterNameProblem(input.name);
  if (nameProblem) return nameProblem;
  if (input.lastApprovedAt) {
    const next = new Date(input.lastApprovedAt.getTime() + cfg.renameCooldownMs);
    if (next > input.now) return `this character's name changed recently; you can ask again after ${next.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  return null;
}

/** The reason for a reset: required, and kept in the staff log. */
export function reasonProblem(note: string | null): string | null {
  if (!note) return "say why: the reason is kept in the staff log";
  if (note.length > MAX_NOTE_LENGTH) return `a note is at most ${MAX_NOTE_LENGTH} characters`;
  return null;
}

/** A reviewer's note: required to reject or ask for changes (the player sees it), optional to approve. */
export function reviewNoteProblem(decision: ReviewDecision, note: string | null, maxLength = MAX_NOTE_LENGTH): string | null {
  if (note !== null && note.length > maxLength) return `a note is at most ${maxLength} characters`;
  if (decision === "REJECT" && !note) return "say why it's rejected: the player sees the note";
  if (decision === "REQUEST_CHANGES" && !note) return "say what to change: the submitter sees the note";
  return null;
}
