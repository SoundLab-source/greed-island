/**
 * Fighter submissions (docs/PHASE3.md step 3), the submitter's side: create a
 * draft, edit its details, add and remove images, send it for review (again,
 * after changes were asked for), or withdraw it. Staff decide in the review
 * queue (staff.ts). Until the terms are ready (GI_SUBMISSIONS_OPEN), only
 * staff can submit, to test the pipeline.
 */
import { NotFoundError, withRetry, type Db, type Tx } from "@greed-island/db";
import {
  addFileProblem,
  communityKey,
  detailsProblem,
  EDITABLE_SUBMISSION_STATUSES,
  FILE_ROLES,
  isStaff,
  LedgerRuleError,
  missingFiles,
  normalizeDetails,
  OPEN_SUBMISSION_STATUSES,
  pngInfo,
  submissionTransition,
  type Config,
  type FileRole,
  type SubmissionDetails,
} from "@greed-island/shared";
import { ForbiddenError, lockName, nameTaken } from "./staff.ts";
import type { SubmissionStore } from "./submission-store.ts";

type SubmissionRow = Awaited<ReturnType<Tx["submission"]["findUniqueOrThrow"]>>;
type FileRow = Awaited<ReturnType<Tx["submissionFile"]["findUniqueOrThrow"]>>;

function refuse(problem: string | null): void {
  if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
}

/** Who may submit: a verified email, and (while submissions are closed) staff. */
async function requireSubmitter(tx: Tx, userId: string, config: Config): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, role: true } });
  if (!u) throw new ForbiddenError("sign in first");
  if (!config.submissions.open && !isStaff(u.role)) throw new ForbiddenError("fighter submissions aren't open yet");
  if (!u.emailVerifiedAt) refuse("add your email first (the sign-in link): staff need a way to reach you about your submission");
}

/** The submitter's own submission, locked; other people's look the same as missing ones. */
async function lockOwn(tx: Tx, userId: string, submissionId: string): Promise<SubmissionRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "submission" WHERE "id" = ${submissionId}::uuid FOR UPDATE`;
  const sub = rows.length ? await tx.submission.findUniqueOrThrow({ where: { id: submissionId } }) : null;
  if (!sub || sub.submittedByUserId !== userId) throw new NotFoundError("no such submission");
  return sub;
}

function requireEditable(sub: SubmissionRow): void {
  if (!EDITABLE_SUBMISSION_STATUSES.includes(sub.status)) refuse(`the submission is ${sub.status.toLowerCase()} and can't be edited`);
}

/** Checks the details and that the fighter's name and community are free; returns them tidied. */
async function checkDetails(tx: Tx, raw: SubmissionDetails, exceptSubmissionId?: string): Promise<SubmissionDetails> {
  const d = normalizeDetails(raw);
  refuse(detailsProblem(d));
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7107, hashtext(${communityKey(d.community)}))`;
  await lockName(tx, d.fighterName);
  if (await nameTaken(tx, d.fighterName, { exceptSubmissionId, includePending: true })) refuse("that fighter name is taken");
  const other = await tx.submission.findFirst({
    where: { communityKey: communityKey(d.community), status: { in: [...OPEN_SUBMISSION_STATUSES] }, ...(exceptSubmissionId ? { id: { not: exceptSubmissionId } } : {}) },
    select: { number: true },
  });
  if (other) refuse(`${d.community} already has an open submission (#${other.number}); one at a time per community`);
  return d;
}

/** Start a draft. One open submission per account and per community. */
export async function createSubmission(db: Db, config: Config, input: { userId: string; details: SubmissionDetails }, now = new Date()): Promise<SubmissionRow> {
  return withRetry(db, async (tx) => {
    await requireSubmitter(tx, input.userId, config);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7108, hashtext(${input.userId}))`;
    const mine = await tx.submission.findFirst({ where: { submittedByUserId: input.userId, status: { in: [...OPEN_SUBMISSION_STATUSES] } }, select: { number: true } });
    if (mine) refuse(`you already have an open submission (#${mine.number}); finish or withdraw it first`);
    const d = await checkDetails(tx, input.details);
    return tx.submission.create({ data: { ...d, communityKey: communityKey(d.community), submittedByUserId: input.userId, createdAt: now, updatedAt: now } });
  });
}

/** Change a draft's (or a sent-back submission's) details. */
export async function updateSubmission(db: Db, config: Config, input: { userId: string; submissionId: string; details: SubmissionDetails }): Promise<SubmissionRow> {
  return withRetry(db, async (tx) => {
    await requireSubmitter(tx, input.userId, config);
    const sub = await lockOwn(tx, input.userId, input.submissionId);
    requireEditable(sub);
    const d = await checkDetails(tx, input.details, sub.id);
    return tx.submission.update({ where: { id: sub.id }, data: { ...d, communityKey: communityKey(d.community) } });
  });
}

async function roleCounts(tx: Tx, submissionId: string): Promise<Partial<Record<FileRole, number>>> {
  const groups = await tx.submissionFile.groupBy({ by: ["role"], where: { submissionId }, _count: { _all: true } });
  return Object.fromEntries(groups.map((g) => [g.role, g._count._all]));
}

/** Add a PNG image. The bytes are checked (a real PNG, size limits) before anything is stored. */
export async function addSubmissionFile(
  db: Db,
  config: Config,
  store: SubmissionStore,
  input: { userId: string; submissionId: string; role: FileRole; label: string; bytes: Uint8Array },
  now = new Date(),
): Promise<FileRow> {
  const info = pngInfo(input.bytes, config.submissions);
  if (!info.ok) refuse(info.error);
  const { width, height } = info as { width: number; height: number };
  const label = input.label.trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 60) refuse("give the image a short label (1-60 characters)");
  if (!FILE_ROLES.includes(input.role)) refuse("unknown image kind");
  return withRetry(db, async (tx) => {
    await requireSubmitter(tx, input.userId, config);
    const sub = await lockOwn(tx, input.userId, input.submissionId);
    requireEditable(sub);
    refuse(addFileProblem(input.role, await roleCounts(tx, sub.id), config.submissions));
    const sha256 = await store.save(sub.id, input.bytes);
    if (await tx.submissionFile.findUnique({ where: { submissionId_sha256: { submissionId: sub.id, sha256 } } })) refuse("that image is already in this submission");
    const file = await tx.submissionFile.create({ data: { submissionId: sub.id, role: input.role, label, sha256, bytes: input.bytes.length, width, height, createdAt: now } });
    await tx.submission.update({ where: { id: sub.id }, data: { updatedAt: now } });
    return file;
  });
}

export async function removeSubmissionFile(db: Db, config: Config, input: { userId: string; submissionId: string; fileId: string }): Promise<void> {
  await withRetry(db, async (tx) => {
    await requireSubmitter(tx, input.userId, config);
    const sub = await lockOwn(tx, input.userId, input.submissionId);
    requireEditable(sub);
    const { count } = await tx.submissionFile.deleteMany({ where: { id: input.fileId, submissionId: sub.id } });
    if (count === 0) throw new NotFoundError("no such image");
  });
}

/**
 * Send it for review: everything required is there, the details still check
 * out, and the submitter confirms the rights statement. Creates a request in
 * the staff queue.
 */
export async function sendForReview(db: Db, config: Config, input: { userId: string; submissionId: string; confirmRights: boolean }, now = new Date()): Promise<SubmissionRow> {
  return withRetry(db, async (tx) => {
    await requireSubmitter(tx, input.userId, config);
    const sub = await lockOwn(tx, input.userId, input.submissionId);
    const t = submissionTransition(sub.status, "SUBMIT");
    if (!t.ok) refuse(t.error);
    const missing = missingFiles(await roleCounts(tx, sub.id));
    if (missing.length) refuse(`still needed: ${missing.join(", ")}`);
    await checkDetails(tx, { ...sub }, sub.id);
    if (!input.confirmRights) refuse("confirm the rights statement: you have the right to let Greed Island use this art");
    const updated = await tx.submission.update({ where: { id: sub.id }, data: { status: "SUBMITTED", submittedAt: now, rightsConfirmedAt: now, updatedAt: now } });
    await tx.reviewItem.create({ data: { kind: "FIGHTER_SUBMISSION", submittedByUserId: input.userId, submissionId: sub.id, createdAt: now } });
    return updated;
  });
}

/** Take it back (a draft, or one waiting for review or for changes). */
export async function withdrawSubmission(db: Db, input: { userId: string; submissionId: string }, now = new Date()): Promise<SubmissionRow> {
  return withRetry(db, async (tx) => {
    const sub = await lockOwn(tx, input.userId, input.submissionId);
    const t = submissionTransition(sub.status, "WITHDRAW");
    if (!t.ok) refuse(t.error);
    await tx.reviewItem.updateMany({ where: { submissionId: sub.id, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: now } });
    return tx.submission.update({ where: { id: sub.id }, data: { status: "WITHDRAWN", closedAt: now, updatedAt: now } });
  });
}

/** An image, for its submitter or staff who review. */
export async function readSubmissionFile(db: Db, store: SubmissionStore, input: { viewerId: string; submissionId: string; fileId: string }): Promise<Buffer> {
  const file = await db.submissionFile.findFirst({ where: { id: input.fileId, submissionId: input.submissionId }, include: { submission: { select: { submittedByUserId: true } } } });
  const viewer = await db.user.findUnique({ where: { id: input.viewerId }, select: { role: true } });
  const allowed = file && viewer && (file.submission.submittedByUserId === input.viewerId || isStaff(viewer.role));
  if (!allowed) throw new NotFoundError("no such image");
  return store.read(input.submissionId, file.sha256);
}
