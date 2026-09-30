/**
 * Fighter submissions (DESIGN §11, docs/PHASE3.md step 3). A community
 * submits a fighter for an archetype: sprite sheets, a portrait, an intro and
 * a win pose (PNG images), optional alternate palettes, a name, and a
 * statement of its rights to the art. Staff review it; approved fighters go
 * to the season ballot (step 5). Pure rules; storage and the database live in
 * the orchestrator. Opening submissions to the public waits for the terms
 * (docs/PHASE3.md "Still open"), so they're staff-only by default.
 */
import { ARCHETYPES, type Archetype } from "./character.ts";
import { characterNameProblem, normalizeCharacterName } from "./staff.ts";

export interface SubmissionConfig {
  /** Anyone with a verified email can submit. Off: staff only (to test the pipeline). */
  open: boolean;
  /** Largest image accepted. */
  maxFileBytes: number;
  /** Images per submission, all roles together. */
  maxFiles: number;
  /** Largest width or height of an image, in pixels. */
  maxImageSide: number;
}

export const DEFAULT_SUBMISSIONS: Readonly<SubmissionConfig> = Object.freeze({
  open: false,
  maxFileBytes: 8 * 1024 * 1024,
  maxFiles: 24,
  maxImageSide: 4096,
});

/** ELECTED and NOT_ELECTED come from the season vote (voting.ts), not from these actions. */
export const SUBMISSION_STATUSES = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN", "ELECTED", "NOT_ELECTED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Still being worked on or waiting for review: one per community (and per account) at a time. */
export const OPEN_SUBMISSION_STATUSES: readonly SubmissionStatus[] = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"];
/** The submitter can change the details and images. */
export const EDITABLE_SUBMISSION_STATUSES: readonly SubmissionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

export type SubmissionAction = "SUBMIT" | "WITHDRAW" | "APPROVE" | "REQUEST_CHANGES" | "REJECT";

/**
 * Where a submission goes, or why it can't. The submitter sends it for review
 * (again, after changes were asked for) or withdraws it; staff approve it, ask
 * for changes, or reject it for good (rights or content problems).
 */
export function submissionTransition(status: SubmissionStatus, action: SubmissionAction): { ok: true; to: SubmissionStatus } | { ok: false; error: string } {
  const rules: Record<SubmissionAction, { from: readonly SubmissionStatus[]; to: SubmissionStatus }> = {
    SUBMIT: { from: ["DRAFT", "CHANGES_REQUESTED"], to: "SUBMITTED" },
    WITHDRAW: { from: ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"], to: "WITHDRAWN" },
    APPROVE: { from: ["SUBMITTED"], to: "APPROVED" },
    REQUEST_CHANGES: { from: ["SUBMITTED"], to: "CHANGES_REQUESTED" },
    REJECT: { from: ["SUBMITTED"], to: "REJECTED" },
  };
  const rule = rules[action];
  if (!rule.from.includes(status)) return { ok: false, error: `the submission is ${status.toLowerCase().replace("_", " ")}` };
  return { ok: true, to: rule.to };
}

export const FILE_ROLES = ["SPRITES", "PORTRAIT", "INTRO", "WIN_POSE", "PALETTE"] as const;
export type FileRole = (typeof FILE_ROLES)[number];

/** How many images of each kind a submission needs before it can be sent for review. */
export const FILE_ROLE_RULES: Readonly<Record<FileRole, { min: number; max: number; one: string; many: string; needed: string }>> = Object.freeze({
  SPRITES: { min: 1, max: 16, one: "sprite sheet", many: "sprite sheets", needed: "a sprite sheet following the archetype's template" },
  PORTRAIT: { min: 1, max: 1, one: "portrait", many: "portraits", needed: "a portrait" },
  INTRO: { min: 1, max: 2, one: "intro animation", many: "intro animations", needed: "an intro animation" },
  WIN_POSE: { min: 1, max: 2, one: "win pose animation", many: "win pose animations", needed: "a win pose animation" },
  PALETTE: { min: 0, max: 6, one: "alternate colour sheet", many: "alternate colour sheets", needed: "" },
});

export const RIGHTS_BASES = ["ORIGINAL", "LICENSED", "HOLDER_LICENCE"] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const RIGHTS_LABELS: Readonly<Record<RightsBasis, string>> = Object.freeze({
  ORIGINAL: "We made this art ourselves (or paid someone to, and own it)",
  LICENSED: "We have a licence from the owner that allows this use",
  HOLDER_LICENCE: "Our NFT collection's licence lets holders use this art this way",
});

export interface SubmissionDetails {
  community: string;
  fighterName: string;
  archetype: Archetype;
  description: string;
  rightsBasis: RightsBasis;
  rightsDetails: string;
  /** Where the licence or proof can be read. */
  rightsLink: string | null;
}

/** Trimmed, with runs of spaces collapsed. */
export function normalizeCommunity(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Communities are the same ignoring upper/lower case. */
export function communityKey(name: string): string {
  return normalizeCommunity(name).toLowerCase();
}

/** Tidy the details a player typed. */
export function normalizeDetails(d: SubmissionDetails): SubmissionDetails {
  return {
    ...d,
    community: normalizeCommunity(d.community),
    fighterName: normalizeCharacterName(d.fighterName),
    description: d.description.trim(),
    rightsDetails: d.rightsDetails.trim(),
    rightsLink: d.rightsLink?.trim() || null,
  };
}

/** Why these (normalized) details can't be used, or null. */
export function detailsProblem(d: SubmissionDetails): string | null {
  if (d.community.length < 2 || d.community.length > 40) return "the community name is 2-40 characters long";
  const nameProblem = characterNameProblem(d.fighterName);
  if (nameProblem) return `fighter name: ${nameProblem}`;
  if (!ARCHETYPES.includes(d.archetype)) return "pick one of the archetypes";
  if (d.description.length > 500) return "the description is at most 500 characters";
  if (!RIGHTS_BASES.includes(d.rightsBasis)) return "say where your rights to the art come from";
  if (d.rightsDetails.length < 20 || d.rightsDetails.length > 2000) return "explain your rights to the art in 20-2000 characters";
  if (d.rightsLink !== null) {
    if (d.rightsLink.length > 300 || !/^https:\/\/[^\s]+$/.test(d.rightsLink)) return "the rights link must be an https:// address";
  }
  if (d.rightsBasis !== "ORIGINAL" && d.rightsLink === null) return "link to the licence that gives you these rights";
  return null;
}

/** What's still missing before a submission can be sent for review (empty when it's ready). */
export function missingFiles(counts: Partial<Record<FileRole, number>>): string[] {
  return FILE_ROLES.filter((role) => (counts[role] ?? 0) < FILE_ROLE_RULES[role].min).map((role) => FILE_ROLE_RULES[role].needed);
}

/** Why another image of this role can't be added, or null. */
export function addFileProblem(role: FileRole, counts: Partial<Record<FileRole, number>>, cfg: SubmissionConfig): string | null {
  const total = FILE_ROLES.reduce((n, r) => n + (counts[r] ?? 0), 0);
  if (total >= cfg.maxFiles) return `a submission has at most ${cfg.maxFiles} images`;
  const rule = FILE_ROLE_RULES[role];
  if ((counts[role] ?? 0) >= rule.max) return `at most ${rule.max} ${rule.max === 1 ? rule.one : rule.many}`;
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Checks an upload is a PNG image of an acceptable size, by reading its
 * signature and IHDR header (width, height). Nothing else is trusted: the
 * file name and content type a browser sends are ignored.
 */
export function pngInfo(bytes: Uint8Array, cfg: SubmissionConfig): { ok: true; width: number; height: number } | { ok: false; error: string } {
  if (bytes.length > cfg.maxFileBytes) return { ok: false, error: `an image is at most ${Math.floor(cfg.maxFileBytes / (1024 * 1024))} MB` };
  if (bytes.length < 33 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return { ok: false, error: "only PNG images are accepted" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The first chunk must be IHDR, 13 bytes long.
  const chunkType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (view.getUint32(8) !== 13 || chunkType !== "IHDR") return { ok: false, error: "that PNG image is damaged" };
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return { ok: false, error: "that PNG image is empty" };
  if (width > cfg.maxImageSide || height > cfg.maxImageSide) return { ok: false, error: `images are at most ${cfg.maxImageSide} pixels wide and high` };
  return { ok: true, width, height };
}
