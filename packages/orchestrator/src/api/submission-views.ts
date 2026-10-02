/**
 * Read models for fighter submissions (docs/PHASE3.md step 3): the rules the
 * form needs, a player's own submissions, and one submission in full (for its
 * submitter and staff). Images are served separately, never publicly.
 */
import type { Db, Prisma } from "@greed-island/db";
import {
  ARCHETYPES,
  describeChecks,
  EDITABLE_SUBMISSION_STATUSES,
  FILE_ROLE_RULES,
  FILE_ROLES,
  missingFiles,
  playerName,
  RIGHTS_BASES,
  RIGHTS_LABELS,
  type CheckResults,
  type Config,
  type FileRole,
} from "@greed-island/shared";

type SubmissionFull = Prisma.SubmissionGetPayload<{ include: { files: true; submittedBy: true; reviewItems: { include: { decidedBy: true } } } }>;

const fullInclude = {
  files: { orderBy: [{ role: "asc" as const }, { createdAt: "asc" as const }] },
  submittedBy: true,
  reviewItems: { orderBy: { createdAt: "desc" as const }, include: { decidedBy: true } },
} satisfies Prisma.SubmissionInclude;

export function submissionView(s: SubmissionFull) {
  const counts: Partial<Record<FileRole, number>> = {};
  for (const f of s.files) counts[f.role] = (counts[f.role] ?? 0) + 1;
  const lastDecided = s.reviewItems.find((r) => r.status !== "PENDING" && r.status !== "WITHDRAWN");
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    editable: EDITABLE_SUBMISSION_STATUSES.includes(s.status),
    submittedBy: { id: s.submittedByUserId, name: playerName(s.submittedBy) },
    community: s.community,
    fighterName: s.fighterName,
    archetype: s.archetype,
    description: s.description,
    rights: { basis: s.rightsBasis, label: RIGHTS_LABELS[s.rightsBasis], details: s.rightsDetails, link: s.rightsLink, confirmedAt: s.rightsConfirmedAt },
    files: s.files.map((f) => ({ id: f.id, role: f.role, label: f.label, width: f.width, height: f.height, bytes: f.bytes })),
    missing: missingFiles(counts),
    createdAt: s.createdAt,
    submittedAt: s.submittedAt,
    closedAt: s.closedAt,
    /** The latest staff decision, with the note the submitter sees. */
    lastReview: lastDecided ? { status: lastDecided.status, note: lastDecided.note, at: lastDecided.decidedAt, by: lastDecided.decidedBy ? playerName(lastDecided.decidedBy) : null } : null,
    reviews: s.reviewItems.length,
  };
}

export async function mySubmissions(db: Db, userId: string) {
  const subs = await db.submission.findMany({ where: { submittedByUserId: userId }, orderBy: { number: "desc" }, include: fullInclude });
  return subs.map(submissionView);
}

type CheckWithRequester = Prisma.SubmissionCheckGetPayload<{ include: { requestedBy: true } }>;

/** One run of the automatic checks (docs/PHASE3.md step 4), with a line per check for the staff page. */
export function checkView(c: CheckWithRequester) {
  const results = c.results as unknown as CheckResults | null;
  return {
    id: c.id,
    status: c.status,
    /** Who asked for it; null when sending the submission for review did. */
    requestedBy: c.requestedBy ? playerName(c.requestedBy) : null,
    createdAt: c.createdAt,
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    error: c.error,
    results,
    lines: results ? describeChecks(results) : [],
  };
}

/** The latest run of the automatic checks on a submission, or null if there has been none. */
export async function latestCheck(db: Db, submissionId: string) {
  const c = await db.submissionCheck.findFirst({ where: { submissionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { requestedBy: true } });
  return c ? checkView(c) : null;
}

/** One submission for its submitter or staff (null if missing or not theirs). Staff also get the automatic checks. */
export async function submissionDetail(db: Db, submissionId: string, viewer: { id: string; staff: boolean }) {
  const s = await db.submission.findUnique({ where: { id: submissionId }, include: fullInclude });
  if (!s || (!viewer.staff && s.submittedByUserId !== viewer.id)) return null;
  return viewer.staff ? { ...submissionView(s), checks: await latestCheck(db, s.id) } : submissionView(s);
}

/** What the submission form needs to know. */
export function submissionRules(config: Config, viewerIsStaff: boolean) {
  const c = config.submissions;
  return {
    open: c.open,
    /** This viewer can submit now (staff can while submissions are closed, to test). */
    canSubmit: c.open || viewerIsStaff,
    maxFileBytes: c.maxFileBytes,
    maxFiles: c.maxFiles,
    maxImageSide: c.maxImageSide,
    archetypes: ARCHETYPES,
    roles: FILE_ROLES.map((role) => ({ role, min: FILE_ROLE_RULES[role].min, max: FILE_ROLE_RULES[role].max, label: FILE_ROLE_RULES[role].many })),
    rightsBases: RIGHTS_BASES.map((basis) => ({ basis, label: RIGHTS_LABELS[basis] })),
  };
}
