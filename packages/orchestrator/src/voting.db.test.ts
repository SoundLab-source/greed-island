import { createCharacter, createUser } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { loadConfig, type Config } from "@greed-island/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ballotView } from "./api/ballot-views.ts";
import { placeFightBet } from "./betting.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import type { Rng } from "./matchmaking.ts";
import { decideReview, setRole } from "./staff.ts";
import { SubmissionStore } from "./submission-store.ts";
import { addSubmissionFile, createSubmission, readSubmissionFile, sendForReview } from "./submissions.ts";
import { png } from "./testing/png.ts";
import { castVote, retractVote } from "./voting.ts";

const db = useTestDb();
const DAY = 86_400_000;
const T0 = new Date("2026-10-01T00:00:00Z");
const base = loadConfig({});
const config: Config = {
  ...base,
  economy: testEconomy,
  submissions: { ...base.submissions, open: true },
  voting: { ...base.voting, votesPerVoter: 2, minBets: 1 },
};
const orch: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10, cycle: { matchmakingFights: 100, tournamentSize: 0, exhibitionFights: 0 } };
const dir = await mkdtemp(path.join(tmpdir(), "gi-voting-"));
const store = new SubmissionStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));
const rng = (): Rng => {
  const r = seededRandom("voting");
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};

let clock: Date;
let events: BusEvent[];
let d: FightDeps;
let mod: string;
const voters: Record<string, string> = {};

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

/** A fighter submission sent and approved by the moderator. */
async function approved(email: string, community: string, fighterName: string) {
  const userId = await verified(email);
  const sub = await createSubmission(db, config, {
    userId,
    details: { community, fighterName, archetype: "RUSHDOWN", description: "", rightsBasis: "ORIGINAL", rightsDetails: "Made by our community artist, all rights ours.", rightsLink: null },
  });
  for (const [role, shade] of [["SPRITES", 1], ["PORTRAIT", 2], ["INTRO", 3], ["WIN_POSE", 4]] as const) {
    await addSubmissionFile(db, config, store, { userId, submissionId: sub.id, role, label: role.toLowerCase(), bytes: png(32, 32, shade + fighterName.length) });
  }
  await sendForReview(db, config, { userId, submissionId: sub.id, confirmRights: true });
  const item = await db.reviewItem.findFirstOrThrow({ where: { submissionId: sub.id, status: "PENDING" } });
  await decideReview(db, { reviewerId: mod, reviewId: item.id, decision: "APPROVE" });
  return { userId, id: sub.id };
}

/** Book and settle a fight; everyone listed bets 1 Salt on it first. */
async function fight(bettors: string[] = []) {
  const f = (await bookFight(d, rng(), "fake"))!;
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  for (const userId of bettors) await placeFightBet(db, config, { userId, fightId: f.id, side: 1, stake: 1n, idempotencyKey: randomUUID() });
  await applyTransition(d, f.id, { type: "LOCK" });
  await applyTransition(d, f.id, { type: "ENGINE_STARTED" });
  await applyTransition(d, f.id, { type: "MATCH_END", winnerSide: 1 });
  await applyTransition(d, f.id, { type: "SETTLED_OK" });
}

beforeEach(async () => {
  clock = T0;
  events = [];
  const bus = new FightBus();
  bus.subscribe((e) => events.push(e));
  d = { db, config, orch, bus, now: () => clock };
  for (const id of ["h1", "h2", "h3"]) {
    await db.fighter.create({ data: { id, displayName: `House ${id}`, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `House ${id}` }, ratingSettings));
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  const admin = await verified("admin@example.com");
  mod = await verified("mod@example.com");
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
  await setRole(db, { actorId: admin, target: { userId: mod }, role: "MODERATOR" });
  for (const name of ["v1", "v2", "v3", "nobets", "young"]) voters[name] = await verified(`${name}@example.com`);
  await db.user.update({ where: { id: voters.young! }, data: { createdAt: new Date(T0.getTime() + 40 * DAY) } });
});

describe("a season's vote", () => {
  it("opens with the approved fighters, takes votes, publishes counts at the end and elects the top 2", async () => {
    await fight([voters.v1!, voters.v2!, voters.v3!, voters.young!]);
    const heron = await approved("sam@example.com", "Pixel Monks", "Iron Heron");
    const golem = await approved("pat@example.com", "Moss Guild", "Moss Golem");
    const crane = await approved("kim@example.com", "Crane Club", "Red Crane");
    expect((await ballotView(db, config, null, voters.v1, clock))!).toMatchObject({ status: "UPCOMING", waiting: 3, opensAt: new Date(T0.getTime() + 42 * DAY) });

    // Voting opens 2 weeks before the season ends, at the next booking.
    clock = new Date(T0.getTime() + 43 * DAY);
    events = [];
    await fight();
    expect(events.find((e) => e.type === "ballot")).toEqual({
      type: "ballot",
      status: "OPENED",
      seasonNumber: 1,
      closesAt: new Date(T0.getTime() + 56 * DAY).toISOString(),
      fighters: [{ name: "Iron Heron", community: "Pixel Monks" }, { name: "Moss Golem", community: "Moss Guild" }, { name: "Red Crane", community: "Crane Club" }],
    });
    const late = await approved("lee@example.com", "Late Crew", "Jade Monk");

    const view = (await ballotView(db, config, null, voters.v1, clock))!;
    expect(view).toMatchObject({ status: "OPEN", votingOpen: true, votesPerVoter: 2, me: { eligible: true, votesLeft: 2, votedFor: [] } });
    expect(view.entries.map((e) => [e.fighterName, e.result])).toEqual([["Iron Heron", null], ["Moss Golem", null], ["Red Crane", null]]);
    expect((await ballotView(db, config, null, voters.nobets, clock))!.me).toMatchObject({ eligible: false, reason: "place 1 bets to vote (you have 0)" });
    expect((await ballotView(db, config, null, voters.young, clock))!.me).toMatchObject({ eligible: false, reason: expect.stringMatching(/14 days old/) });

    // Votes: at most 2 each, one per fighter, and they can be taken back.
    const vote = (who: string, submissionId: string) => castVote(db, config, { userId: voters[who]!, submissionId }, clock);
    expect(await vote("v1", heron.id)).toEqual({ replayed: false });
    expect(await vote("v1", heron.id)).toEqual({ replayed: true });
    await vote("v1", golem.id);
    await expect(vote("v1", crane.id)).rejects.toThrow(/used all 2 votes/);
    await retractVote(db, { userId: voters.v1!, submissionId: golem.id }, clock);
    await vote("v1", crane.id);
    await vote("v2", heron.id);
    await vote("v3", golem.id);
    await vote("v3", crane.id);
    await expect(vote("nobets", heron.id)).rejects.toThrow(/place 1 bets/);
    await expect(vote("young", heron.id)).rejects.toThrow(/14 days old/);
    await expect(vote("v2", late.id)).rejects.toThrow(/isn't on this ballot/);
    await expect(retractVote(db, { userId: voters.v2!, submissionId: crane.id }, clock)).rejects.toThrow(/haven't voted/);
    expect((await ballotView(db, config, null, voters.v1, clock))!.me).toMatchObject({ votesLeft: 0, votedFor: expect.arrayContaining([heron.id, crane.id]) });
    // Fighters on a ballot are public, images included; others aren't.
    const portrait = await db.submissionFile.findFirstOrThrow({ where: { submissionId: heron.id, role: "PORTRAIT" } });
    await expect(readSubmissionFile(db, store, { viewerId: undefined, submissionId: heron.id, fileId: portrait.id })).resolves.toBeInstanceOf(Buffer);
    const latePortrait = await db.submissionFile.findFirstOrThrow({ where: { submissionId: late.id, role: "PORTRAIT" } });
    await expect(readSubmissionFile(db, store, { viewerId: undefined, submissionId: late.id, fileId: latePortrait.id })).rejects.toThrow(/no such image/);

    // After the end but before the next booking, voting is closed.
    clock = new Date(T0.getTime() + 56 * DAY + 3_600_000);
    await expect(vote("v2", crane.id)).rejects.toThrow(/voting has closed/);
    events = [];
    await fight();
    // Heron 2 and Crane 2 tie: Heron was sent for review first. Golem 1.
    expect(events.find((e) => e.type === "ballot")).toEqual({
      type: "ballot",
      status: "CLOSED",
      seasonNumber: 1,
      results: [
        { name: "Iron Heron", community: "Pixel Monks", votes: 2, elected: true },
        { name: "Red Crane", community: "Crane Club", votes: 2, elected: true },
        { name: "Moss Golem", community: "Moss Guild", votes: 1, elected: false },
      ],
    });
    const statuses = await db.submission.findMany({ orderBy: { number: "asc" }, select: { fighterName: true, status: true } });
    expect(statuses.map((s) => [s.fighterName, s.status])).toEqual([["Iron Heron", "ELECTED"], ["Moss Golem", "NOT_ELECTED"], ["Red Crane", "ELECTED"], ["Jade Monk", "APPROVED"]]);
    const results = (await ballotView(db, config, 1))!;
    expect(results).toMatchObject({ status: "CLOSED", votingOpen: false, me: null });
    expect(results.entries.map((e) => [e.fighterName, e.result])).toEqual([
      ["Iron Heron", { votes: 2, rank: 1, elected: true }],
      ["Red Crane", { votes: 2, rank: 2, elected: true }],
      ["Moss Golem", { votes: 1, rank: 3, elected: false }],
    ]);

    // The not-elected community can submit again (the name is free); elected names stay reserved.
    const again = { archetype: "RUSHDOWN" as const, description: "", rightsBasis: "ORIGINAL" as const, rightsDetails: "Made by our community artist, all rights ours.", rightsLink: null };
    await expect(createSubmission(db, config, { userId: golem.userId, details: { ...again, community: "Moss Guild", fighterName: "Moss Golem" } })).resolves.toMatchObject({ status: "DRAFT" });
    await expect(createSubmission(db, config, { userId: voters.v1!, details: { ...again, community: "Copycats", fighterName: "Iron Heron" } })).rejects.toThrow(/taken/);

    // The late one goes on Season 2's ballot.
    clock = new Date(T0.getTime() + 56 * DAY + 43 * DAY);
    events = [];
    await fight();
    expect(events.find((e) => e.type === "ballot")).toMatchObject({ status: "OPENED", seasonNumber: 2, fighters: [{ name: "Jade Monk" }] });
  });

  it("has no ballot when nothing is approved, and none opens outside the window", async () => {
    await fight();
    clock = new Date(T0.getTime() + 50 * DAY);
    await fight();
    expect(await db.ballot.count()).toBe(0);
    expect((await ballotView(db, config, null, undefined, clock))!).toMatchObject({ status: "UPCOMING", waiting: 0, entries: [] });
    await expect(castVote(db, config, { userId: voters.v1!, submissionId: randomUUID() }, clock)).rejects.toThrow(/voting isn't open/);
  });
});

describe("voting guards", () => {
  it("keeps results and votes fixed once counted, and elects only through the ballot", async () => {
    await fight([voters.v1!]);
    const heron = await approved("sam@example.com", "Pixel Monks", "Iron Heron");
    clock = new Date(T0.getTime() + 43 * DAY);
    await fight();
    const ballot = await db.ballot.findFirstOrThrow();
    await castVote(db, config, { userId: voters.v1!, submissionId: heron.id }, clock);
    const vote = await db.vote.findFirstOrThrow();
    await expect(db.vote.update({ where: { id: vote.id }, data: { createdAt: T0 } })).rejects.toThrow(/can't be edited/);
    await expect(db.ballotEntry.delete({ where: { ballotId_submissionId: { ballotId: ballot.id, submissionId: heron.id } } })).rejects.toThrow(/kept/);
    await expect(db.ballot.update({ where: { id: ballot.id }, data: { status: "CLOSED", closedAt: clock } })).rejects.toThrow(/every result counted/);
    await expect(db.submission.update({ where: { id: heron.id }, data: { status: "ELECTED" } })).rejects.toThrow(/only by its ballot's result/);

    clock = new Date(T0.getTime() + 57 * DAY);
    await fight();
    await expect(db.vote.create({ data: { ballotId: ballot.id, userId: voters.v2!, submissionId: heron.id } })).rejects.toThrow(/voting has closed/);
    await expect(db.vote.delete({ where: { id: vote.id } })).rejects.toThrow(/voting has closed/);
    await expect(db.ballotEntry.update({ where: { ballotId_submissionId: { ballotId: ballot.id, submissionId: heron.id } }, data: { votes: 99 } })).rejects.toThrow(/closed/);
    await expect(db.ballot.update({ where: { id: ballot.id }, data: { closedAt: T0 } })).rejects.toThrow(/closed ballot can't change/);
    await expect(db.submission.update({ where: { id: heron.id }, data: { status: "NOT_ELECTED" } })).rejects.toThrow(/elected submission can't change/);
  });
});
