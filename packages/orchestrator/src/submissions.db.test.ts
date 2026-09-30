import { createCharacter, createUser } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { loadConfig, type Config, type SubmissionDetails } from "@greed-island/shared";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reviewQueue, staffLog } from "./api/staff-views.ts";
import { mySubmissions, submissionDetail } from "./api/submission-views.ts";
import { decideReview, ForbiddenError, requestCharacterName, setRole } from "./staff.ts";
import { SubmissionStore } from "./submission-store.ts";
import { addSubmissionFile, createSubmission, readSubmissionFile, removeSubmissionFile, sendForReview, updateSubmission, withdrawSubmission } from "./submissions.ts";
import { png } from "./testing/png.ts";

const db = useTestDb();
const base = loadConfig({});
const closed: Config = { ...base, economy: testEconomy };
const open: Config = { ...closed, submissions: { ...closed.submissions, open: true } };
const dir = await mkdtemp(path.join(tmpdir(), "gi-submissions-"));
const store = new SubmissionStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));

let admin: string;
let mod: string;
let sam: string;
let pat: string;
let anon: string;

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

beforeEach(async () => {
  await db.fighter.create({ data: { id: "monk", displayName: "Grey Monk", archetype: "ALL_ROUNDER", defPath: "chars/monk/monk.def", licenseNote: "test" } });
  await db.$transaction((tx) => createCharacter(tx, { rosterKey: "monk", fighterId: "monk", name: "Old Master" }, ratingSettings));
  [admin, mod, sam, pat] = [await verified("admin@example.com"), await verified("mod@example.com"), await verified("sam@example.com"), await verified("pat@example.com")];
  anon = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
  await setRole(db, { actorId: admin, target: { userId: mod }, role: "MODERATOR" });
});

const details = (over: Partial<SubmissionDetails> = {}): SubmissionDetails => ({
  community: "Pixel Monks",
  fighterName: "Iron Heron",
  archetype: "GRAPPLER",
  description: "A patient grappler.",
  rightsBasis: "ORIGINAL",
  rightsDetails: "Drawn by our member Sam in 2026; the community owns it.",
  rightsLink: null,
  ...over,
});

const add = (userId: string, submissionId: string, role: "SPRITES" | "PORTRAIT" | "INTRO" | "WIN_POSE" | "PALETTE", shade: number, cfg = open) =>
  addSubmissionFile(db, cfg, store, { userId, submissionId, role, label: `${role.toLowerCase()} ${shade}`, bytes: png(64, 48, shade) });

/** A draft with everything needed to send it for review. */
async function complete(userId: string, cfg = open, over: Partial<SubmissionDetails> = {}) {
  const sub = await createSubmission(db, cfg, { userId, details: details(over) });
  for (const [role, shade] of [["SPRITES", 1], ["SPRITES", 2], ["PORTRAIT", 3], ["INTRO", 4], ["WIN_POSE", 5]] as const) await add(userId, sub.id, role, shade, cfg);
  return sub;
}

describe("who can submit", () => {
  it("is staff only until submissions open, and always needs a verified email", async () => {
    await expect(createSubmission(db, closed, { userId: sam, details: details() })).rejects.toThrow(ForbiddenError);
    await expect(createSubmission(db, closed, { userId: mod, details: details() })).resolves.toMatchObject({ status: "DRAFT" });
    await expect(createSubmission(db, open, { userId: anon, details: details({ community: "Other" }) })).rejects.toThrow(/add your email/);
    await expect(createSubmission(db, open, { userId: sam, details: details({ community: "Third", fighterName: "Red Heron" }) })).resolves.toMatchObject({ status: "DRAFT" });
  });
});

describe("drafts", () => {
  it("keeps one open submission per account and per community, and fighter names unique", async () => {
    const sub = await createSubmission(db, open, { userId: sam, details: details({ community: "  Pixel   Monks " }) });
    expect(sub).toMatchObject({ community: "Pixel Monks", communityKey: "pixel monks", fighterName: "Iron Heron", number: 1 });
    await expect(createSubmission(db, open, { userId: sam, details: details({ community: "Else", fighterName: "Blue Heron" }) })).rejects.toThrow(/already have an open submission \(#1\)/);
    await expect(createSubmission(db, open, { userId: pat, details: details({ community: "PIXEL MONKS", fighterName: "Blue Heron" }) })).rejects.toThrow(/one at a time per community/);
    await expect(createSubmission(db, open, { userId: pat, details: details({ community: "Else", fighterName: "iron heron" }) })).rejects.toThrow(/fighter name is taken/);
    await expect(createSubmission(db, open, { userId: pat, details: details({ community: "Else", fighterName: "Grey Monk" }) })).rejects.toThrow(/taken/);
    await expect(createSubmission(db, open, { userId: pat, details: details({ community: "Else", fighterName: "old master" }) })).rejects.toThrow(/taken/);
    await expect(createSubmission(db, open, { userId: pat, details: details({ community: "Else", fighterName: "Blue Heron", rightsBasis: "LICENSED" }) })).rejects.toThrow(/link to the licence/);
    // Its own name can be kept when editing.
    await expect(updateSubmission(db, open, { userId: sam, submissionId: sub.id, details: details({ description: "Updated." }) })).resolves.toMatchObject({ description: "Updated." });
    await expect(updateSubmission(db, open, { userId: pat, submissionId: sub.id, details: details() })).rejects.toThrow(/no such submission/);
  });

  it("stores checked PNG images outside the database", async () => {
    const sub = await createSubmission(db, open, { userId: sam, details: details() });
    const file = await add(sam, sub.id, "SPRITES", 7);
    expect(file).toMatchObject({ role: "SPRITES", label: "sprites 7", width: 64, height: 48 });
    expect(await readFile(path.join(dir, sub.id, `${file.sha256}.png`))).toEqual(png(64, 48, 7));
    await expect(add(sam, sub.id, "PORTRAIT", 7)).rejects.toThrow(/already in this submission/);
    await expect(addSubmissionFile(db, open, store, { userId: sam, submissionId: sub.id, role: "SPRITES", label: "x", bytes: Buffer.from("GIF89a not a png at all.........") })).rejects.toThrow(/only PNG/);
    await expect(addSubmissionFile(db, { ...open, submissions: { ...open.submissions, maxFileBytes: 64 } }, store, { userId: sam, submissionId: sub.id, role: "SPRITES", label: "x", bytes: png(64, 48, 9) })).rejects.toThrow(/at most 0 MB/);
    await add(sam, sub.id, "PORTRAIT", 8);
    await expect(add(sam, sub.id, "PORTRAIT", 9)).rejects.toThrow(/at most 1 portrait/);
    await expect(add(pat, sub.id, "INTRO", 10)).rejects.toThrow(/no such submission/);
    await removeSubmissionFile(db, open, { userId: sam, submissionId: sub.id, fileId: file.id });
    expect((await submissionDetail(db, sub.id, { id: sam, staff: false }))!.files.map((f) => f.role)).toEqual(["PORTRAIT"]);
    // Only the submitter and staff can see the images.
    const portrait = (await db.submissionFile.findFirstOrThrow({ where: { submissionId: sub.id } })).id;
    expect(await readSubmissionFile(db, store, { viewerId: sam, submissionId: sub.id, fileId: portrait })).toEqual(png(64, 48, 8));
    expect(await readSubmissionFile(db, store, { viewerId: mod, submissionId: sub.id, fileId: portrait })).toEqual(png(64, 48, 8));
    await expect(readSubmissionFile(db, store, { viewerId: pat, submissionId: sub.id, fileId: portrait })).rejects.toThrow(/no such image/);
    expect(await submissionDetail(db, sub.id, { id: pat, staff: false })).toBeNull();
  });
});

describe("review", () => {
  it("goes through the staff queue: changes asked for, fixed, sent again, approved", async () => {
    const draft = await createSubmission(db, open, { userId: sam, details: details() });
    await expect(sendForReview(db, open, { userId: sam, submissionId: draft.id, confirmRights: true })).rejects.toThrow(
      /still needed: a sprite sheet following the archetype's template, a portrait, an intro animation, a win pose animation/,
    );
    await withdrawSubmission(db, { userId: sam, submissionId: draft.id });
    const sub = await complete(sam);
    await expect(sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: false })).rejects.toThrow(/confirm the rights/);
    await expect(sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: true })).resolves.toMatchObject({ status: "SUBMITTED" });

    // Locked while it's reviewed.
    await expect(updateSubmission(db, open, { userId: sam, submissionId: sub.id, details: details({ description: "x" }) })).rejects.toThrow(/can't be edited/);
    await expect(add(sam, sub.id, "PALETTE", 20)).rejects.toThrow(/can't be edited/);
    const queue = await reviewQueue(db);
    expect(queue.pending).toMatchObject([{ kind: "FIGHTER_SUBMISSION", submittedBy: { id: sam }, submission: { number: 2, fighterName: "Iron Heron", community: "Pixel Monks", archetype: "GRAPPLER" } }]);
    const first = queue.pending[0]!.id;

    // Changes asked for (a note is required), then fixed and sent again.
    await expect(decideReview(db, { reviewerId: mod, reviewId: first, decision: "REQUEST_CHANGES" })).rejects.toThrow(/say what to change/);
    await decideReview(db, { reviewerId: mod, reviewId: first, decision: "REQUEST_CHANGES", note: "Add a second intro frame." });
    const back = (await mySubmissions(db, sam))[0]!;
    expect(back).toMatchObject({ status: "CHANGES_REQUESTED", editable: true, lastReview: { status: "CHANGES_REQUESTED", note: "Add a second intro frame." } });
    await add(sam, sub.id, "INTRO", 30);
    await sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: true });
    const second = (await reviewQueue(db)).pending[0]!.id;
    expect(second).not.toBe(first);

    const approved = await decideReview(db, { reviewerId: mod, reviewId: second, decision: "APPROVE", note: "Looks great." });
    expect(approved.status).toBe("APPROVED");
    expect((await mySubmissions(db, sam))[0]).toMatchObject({ status: "APPROVED", editable: false, reviews: 2, lastReview: { status: "APPROVED", note: "Looks great." } });
    const log = await staffLog(db);
    expect(log.slice(0, 2).map((l) => [l.kind, l.detail])).toEqual([
      ["REVIEW_APPROVED", { kind: "FIGHTER_SUBMISSION", submission: 2, fighterName: "Iron Heron", community: "Pixel Monks", note: "Looks great." }],
      ["REVIEW_CHANGES_REQUESTED", { kind: "FIGHTER_SUBMISSION", submission: 2, fighterName: "Iron Heron", community: "Pixel Monks", note: "Add a second intro frame." }],
    ]);
    await expect(withdrawSubmission(db, { userId: sam, submissionId: sub.id })).rejects.toThrow(/approved/);

    // The approved fighter's name is reserved: a character can't take it.
    const owned = await db.character.create({
      data: { fighterId: "monk", name: "Grey Monk #1", rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: pat, serial: 1, acquiredAt: new Date() },
    });
    await expect(requestCharacterName(db, open, { userId: pat, characterId: owned.id, name: "Iron Heron" })).rejects.toThrow(/taken/);
    // And the community can submit again.
    await expect(createSubmission(db, open, { userId: sam, details: details({ fighterName: "Jade Heron" }) })).resolves.toMatchObject({ status: "DRAFT" });
  });

  it("rejects for good, and lets the submitter withdraw while waiting", async () => {
    const sub = await complete(sam);
    await sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: true });
    const item = (await reviewQueue(db)).pending[0]!.id;
    await decideReview(db, { reviewerId: mod, reviewId: item, decision: "REJECT", note: "This art belongs to a commercial game." });
    await expect(sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: true })).rejects.toThrow(/rejected/);

    const again = await complete(pat, open, { community: "Other Guild", fighterName: "Moss Golem" });
    await sendForReview(db, open, { userId: pat, submissionId: again.id, confirmRights: true });
    const waiting = (await reviewQueue(db)).pending[0]!;
    await expect(withdrawSubmission(db, { userId: sam, submissionId: again.id })).rejects.toThrow(/no such submission/);
    await expect(withdrawSubmission(db, { userId: pat, submissionId: again.id })).resolves.toMatchObject({ status: "WITHDRAWN" });
    expect((await db.reviewItem.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe("WITHDRAWN");
    await expect(decideReview(db, { reviewerId: mod, reviewId: waiting.id, decision: "APPROVE" })).rejects.toThrow(/already withdrawn/);
  });

  it("stops moderators reviewing their own submission, but not admins", async () => {
    const sub = await complete(mod, closed);
    await sendForReview(db, closed, { userId: mod, submissionId: sub.id, confirmRights: true });
    const item = (await reviewQueue(db)).pending[0]!.id;
    await expect(decideReview(db, { reviewerId: mod, reviewId: item, decision: "APPROVE" })).rejects.toThrow(/your own/);
    await expect(decideReview(db, { reviewerId: sam, reviewId: item, decision: "APPROVE" })).rejects.toThrow(ForbiddenError);
    await expect(decideReview(db, { reviewerId: admin, reviewId: item, decision: "APPROVE" })).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("only sends fighter submissions back for changes, not names", async () => {
    const owned = await db.character.create({
      data: { fighterId: "monk", name: "Grey Monk #1", rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: pat, serial: 1, acquiredAt: new Date() },
    });
    const { request } = await requestCharacterName(db, open, { userId: pat, characterId: owned.id, name: "Stone Fist" });
    await expect(decideReview(db, { reviewerId: mod, reviewId: request.id, decision: "REQUEST_CHANGES", note: "try another" })).rejects.toThrow(/only fighter submissions/);
  });
});

describe("database guards", () => {
  it("locks a submission's details and images while it's reviewed, and keeps it", async () => {
    const sub = await complete(sam);
    await sendForReview(db, open, { userId: sam, submissionId: sub.id, confirmRights: true });
    await expect(db.submission.update({ where: { id: sub.id }, data: { fighterName: "Sneaky" } })).rejects.toThrow(/details can't change while it's being reviewed/);
    await expect(db.submission.update({ where: { id: sub.id }, data: { status: "DRAFT" } })).rejects.toThrow(/can't go from SUBMITTED to DRAFT/);
    await expect(db.submission.delete({ where: { id: sub.id } })).rejects.toThrow(/kept/);
    await expect(db.submissionFile.create({ data: { submissionId: sub.id, role: "PALETTE", label: "x", sha256: "a".repeat(64), bytes: 1, width: 1, height: 1 } })).rejects.toThrow(/while the submission can be edited/);
    const file = await db.submissionFile.findFirstOrThrow({ where: { submissionId: sub.id } });
    await expect(db.submissionFile.delete({ where: { id: file.id } })).rejects.toThrow(/while the submission can be edited/);
    await expect(db.submissionFile.update({ where: { id: file.id }, data: { label: "renamed" } })).rejects.toThrow(/can't be changed/);
    await expect(db.submission.create({ data: { ...details(), communityKey: "pixel monks", fighterName: "Other Name", submittedByUserId: pat } })).rejects.toThrow(/submission_one_open_per_community|Unique constraint/);
    await expect(db.submission.create({ data: { ...details(), community: "New", communityKey: "wrong", fighterName: "Other Name", submittedByUserId: pat } })).rejects.toThrow(/submission_community_key/);
    await expect(db.reviewItem.create({ data: { kind: "FIGHTER_SUBMISSION", submittedByUserId: sam, submissionId: sub.id } })).rejects.toThrow(/review_item_one_pending_submission|Unique constraint/);
  });
});
