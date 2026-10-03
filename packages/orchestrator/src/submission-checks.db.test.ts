import { createUser } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import type { EventSource, FightSpec } from "@greed-island/engine";
import { loadConfig, type Config, type EngineOutcome, type WinTally } from "@greed-island/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { reviewQueue } from "./api/staff-views.ts";
import { submissionDetail } from "./api/submission-views.ts";
import { ForbiddenError, setRole } from "./staff.ts";
import { guideLayout, TEMPLATES as TEMPLATE_SPECS, writePng } from "@greed-island/engine";
import { createOwnArtBuilder, type OwnArtBuilder } from "./own-art.ts";
import { createCheckRunner, requestSubmissionCheck, requeueInterruptedChecks, runNextSubmissionCheck, type CheckRunnerDeps } from "./submission-checks.ts";
import { SubmissionStore } from "./submission-store.ts";
import { addSubmissionFile, createSubmission, sendForReview } from "./submissions.ts";
import { png } from "./testing/png.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy, submissions: { ...loadConfig({}).submissions, open: true }, checks: { enabled: true, fights: 16, tolerance: 0.1 } };
const dir = await mkdtemp(path.join(tmpdir(), "gi-checks-"));
const store = new SubmissionStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));

let admin: string;
let sam: string;

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

const TEMPLATES = [["gi-tpl-all-rounder", "Brawler", "ALL_ROUNDER"], ["gi-tpl-grappler", "Wrestler", "GRAPPLER"], ["gi-tpl-heavy", "Bruiser", "HEAVY"], ["gi-tpl-zoner", "Sage", "ZONER"]] as const;

beforeEach(async () => {
  for (const [id, displayName, archetype] of TEMPLATES) await db.fighter.create({ data: { id, displayName, archetype, defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
  await db.fighter.create({ data: { id: "kfm", displayName: "Kung Fu Man", archetype: "ALL_ROUNDER", defPath: "chars/kfm/kfm.def", licenseNote: "test" } });
  await db.stage.create({ data: { id: "gi-dusk-peaks", displayName: "Dusk Peaks", defPath: "stages/gi-dusk-peaks.def", licenseNote: "test" } });
  await db.stage.create({ data: { id: "training-room", displayName: "Training Room", defPath: "stages/training.def", licenseNote: "test" } });
  [admin, sam] = [await verified("admin@example.com"), await verified("sam@example.com")];
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
});

/** A submission sent for review (which queues the checks when they're enabled). */
async function sent(cfg = config, archetype: "GRAPPLER" | "RUSHDOWN" = "GRAPPLER", alternates = 0) {
  const sub = await createSubmission(db, cfg, {
    userId: sam,
    details: { community: "Pixel Monks", fighterName: "Iron Heron", archetype, description: "", rightsBasis: "ORIGINAL", rightsDetails: "Drawn by our member Sam in 2026; the community owns it.", rightsLink: null },
  });
  const alternateSheets = Array.from({ length: alternates }, (_, i) => ["PALETTE", 6 + i] as const);
  for (const [role, shade] of [["SPRITES", 1], ["PORTRAIT", 3], ["INTRO", 4], ["WIN_POSE", 5], ...alternateSheets] as const) {
    await addSubmissionFile(db, cfg, store, { userId: sam, submissionId: sub.id, role, label: `${role} ${shade}`, bytes: png(64, 48, shade) });
  }
  return sendForReview(db, cfg, { userId: sam, submissionId: sub.id, confirmRights: true });
}

const finished = (winnerSide: 1 | 2): EngineOutcome => ({ kind: "finished", winnerSide, rounds: [1, 2].map((round) => ({ type: "round_end", round, winnerSide, reason: "ko" })) });

/** A stub engine where player 1 always wins (so every fighter wins half its side-swapped fights), unless `crash` names a fighter. */
function stubSource(crash?: string): EventSource & { fights: FightSpec[] } {
  const fights: FightSpec[] = [];
  return {
    mode: "sim",
    fights,
    async run(spec) {
      fights.push(spec);
      return [spec.sides[1].fighterId, spec.sides[2].fighterId].includes(crash ?? "") ? { kind: "engine_crash", detail: "preflight: missing chars/x.def" } : finished(1);
    },
  };
}

const deps = (source: EventSource | null, over: Partial<CheckRunnerDeps> = {}): CheckRunnerDeps => ({ source, settings: config.checks, parallel: 2, referenceRecords: new Map<string, WinTally>(), ...over });

describe("queueing", () => {
  it("sending a submission for review queues the checks, once", async () => {
    const sub = await sent();
    const checks = await db.submissionCheck.findMany({ where: { submissionId: sub.id } });
    expect(checks).toMatchObject([{ status: "QUEUED", requestedByUserId: null, results: null }]);
    // Asking again while one is waiting gives back the same run.
    const again = await requestSubmissionCheck(db, { actorId: admin, submissionId: sub.id });
    expect(again.id).toBe(checks[0]!.id);
    expect(await db.submissionCheck.count()).toBe(1);
  });

  it("queues nothing when the checks are switched off, and only staff can ask for a run", async () => {
    const sub = await sent({ ...config, checks: { ...config.checks, enabled: false } });
    expect(await db.submissionCheck.count()).toBe(0);
    await expect(requestSubmissionCheck(db, { actorId: sam, submissionId: sub.id })).rejects.toThrow(ForbiddenError);
    await expect(requestSubmissionCheck(db, { actorId: admin, submissionId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/no such submission/);
    await expect(requestSubmissionCheck(db, { actorId: admin, submissionId: sub.id })).resolves.toMatchObject({ status: "QUEUED", requestedByUserId: admin });
  });
});

describe("running", () => {
  it("checks the fighter as its archetype's template against the other templates on our stage, and passes", async () => {
    const sub = await sent();
    const source = stubSource();
    const run = await runNextSubmissionCheck(db, deps(source));
    expect(run).toMatchObject({ status: "PASSED", error: null });
    expect(run!.startedAt).not.toBeNull();
    expect(run!.finishedAt).not.toBeNull();
    expect(run!.results).toMatchObject({
      checkedAs: { fighterId: "gi-tpl-grappler", name: "Wrestler", ownArt: false },
      smoke: { ok: true },
      template: { ok: true, findings: [] },
      balance: { ok: true, fighter: null, opponents: ["Brawler", "Bruiser", "Sage"], reference: { fighterId: "gi-tpl-grappler", name: "Wrestler", winRate: 0.5 } },
    });
    // Only templates as opponents (not Kung Fu Man), only our own stage.
    expect(new Set(source.fights.flatMap((f) => [f.sides[1].fighterId, f.sides[2].fighterId]))).toEqual(new Set(["gi-tpl-grappler", "gi-tpl-all-rounder", "gi-tpl-heavy", "gi-tpl-zoner"]));
    expect(new Set(source.fights.map((f) => f.stage.id))).toEqual(new Set(["gi-dusk-peaks"]));
    expect(source.fights).toHaveLength(1 + 18); // the smoke fight, then 16 rounded up to 6 per opponent
    expect(await runNextSubmissionCheck(db, deps(source))).toBeNull(); // the queue is empty

    // Staff see it on the submission and in the queue; the submitter doesn't.
    const forStaff = await submissionDetail(db, sub.id, { id: admin, staff: true });
    expect(forStaff).toMatchObject({ checks: { status: "PASSED", requestedBy: null } });
    expect((forStaff as { checks: { lines: string[] } }).checks.lines[0]).toMatch(/^Checked as Wrestler \(its archetype's template/);
    expect(await submissionDetail(db, sub.id, { id: sam, staff: false })).not.toHaveProperty("checks");
    expect((await reviewQueue(db)).pending[0]!.submission).toMatchObject({ number: sub.number, checks: "PASSED" });
  });

  it("fails when the fighter's character doesn't run, or when its archetype has no template", async () => {
    await sent();
    const crashed = await runNextSubmissionCheck(db, deps(stubSource("gi-tpl-grappler")));
    expect(crashed).toMatchObject({ status: "FAILED", results: { smoke: { ok: false }, template: null, balance: null } });

    // No rushdown template on this roster: it would play as someone else's character.
    await db.submission.updateMany({ data: { status: "WITHDRAWN", closedAt: new Date() } });
    const rush = await sent(config, "RUSHDOWN");
    const run = await runNextSubmissionCheck(db, deps(stubSource()));
    expect(run).toMatchObject({ status: "FAILED", submissionId: rush.id, results: { checkedAs: { fighterId: "kfm" }, smoke: { ok: true }, template: { ok: false } } });
    expect((run!.results as { template: { findings: string[] } }).template.findings).toEqual(["there is no rushdown template on the roster, so it would play as Kung Fu Man"]);
  });

  it("ends as \"couldn't run\" without an engine or opponents, and staff can run it again", async () => {
    const sub = await sent();
    expect(await runNextSubmissionCheck(db, deps(null))).toMatchObject({ status: "ERROR", error: expect.stringMatching(/no game engine/), results: null });
    const again = await requestSubmissionCheck(db, { actorId: admin, submissionId: sub.id });
    expect(again).toMatchObject({ status: "QUEUED", requestedByUserId: admin });
    await db.fighter.updateMany({ where: { id: { not: "gi-tpl-grappler" } }, data: { enabled: false } });
    expect(await runNextSubmissionCheck(db, deps(stubSource()))).toMatchObject({ status: "ERROR", error: "there are no other fighters to check it against" });
    expect(await db.submissionCheck.count()).toBe(2);
    expect(await submissionDetail(db, sub.id, { id: admin, staff: true })).toMatchObject({ checks: { status: "ERROR", requestedBy: expect.any(String), lines: [] } });
  });

  it("puts a run interrupted by a restart back in the queue", async () => {
    await sent();
    await db.submissionCheck.updateMany({ data: { status: "RUNNING", startedAt: new Date() } });
    expect(await runNextSubmissionCheck(db, deps(stubSource()))).toBeNull();
    expect(await requeueInterruptedChecks(db)).toBe(1);
    expect(await runNextSubmissionCheck(db, deps(stubSource()))).toMatchObject({ status: "PASSED" });
  });

  it("the worker runs what's queued and remembers each reference fighter's record", async () => {
    await sent();
    const source = stubSource();
    const done: string[] = [];
    const runner = createCheckRunner(db, { source, settings: config.checks, parallel: 2 }, { everyMs: 60_000, onDone: (c) => done.push(c.status) });
    await runner.start();
    await expect.poll(() => done, { timeout: 5000 }).toEqual(["PASSED"]);
    const first = source.fights.length;
    const sub = await db.submission.findFirstOrThrow();
    await requestSubmissionCheck(db, { actorId: admin, submissionId: sub.id });
    runner.poke();
    await expect.poll(() => done, { timeout: 5000 }).toEqual(["PASSED", "PASSED"]);
    expect(source.fights.length - first).toBe(1); // only the smoke fight the second time
    await runner.stop();
  });
});

describe("fighters built from their own art", () => {
  const template = { life: 1000, attack: 100, defence: 100, walkFwd: 2, runFwd: 4, moves: [] };

  it("checks the character built from its sprite sheet, against its template's numbers", async () => {
    const sub = await sent(config, "GRAPPLER", 2);
    const files = await db.submissionFile.findMany({ where: { submissionId: sub.id }, orderBy: { createdAt: "asc" } });
    const sha = (role: string) => files.filter((f) => f.role === role).map((f) => f.sha256);
    const seen: string[] = [];
    const ownArt: OwnArtBuilder = async (input) => {
      seen.push(`${input.number} ${input.archetype} ${input.sprites.map((f) => f.sha256)} ${input.portrait?.sha256} ${input.alternates?.map((f) => f.sha256)}`);
      return { kind: "built", fighter: { id: `gi-sub-${input.number}`, name: input.fighterName, defPath: `chars/gi-sub-${input.number}/gi-sub-${input.number}.def` }, numbers: { fighter: { ...template, life: 1300 }, template }, outfits: 3 };
    };
    const source = stubSource();
    const run = await runNextSubmissionCheck(db, deps(source, { ownArt }));
    expect(seen).toEqual([`${sub.number} GRAPPLER ${sha("SPRITES")} ${sha("PORTRAIT")} ${sha("PALETTE")}`]);
    expect(sha("PALETTE")).toHaveLength(2);
    expect(run).toMatchObject({
      status: "FAILED",
      results: {
        checkedAs: { fighterId: `gi-sub-${sub.number}`, name: "Iron Heron", ownArt: true, defPath: `chars/gi-sub-${sub.number}/gi-sub-${sub.number}.def`, outfits: 3 },
        smoke: { ok: true },
        template: { ok: false, findings: ["life is 1300, the template's is 1000"] },
        balance: { ok: true, fighter: { winRate: 0.5 }, reference: { fighterId: "gi-tpl-grappler", winRate: 0.5 } },
      },
    });
    // Its own fights and the template's, against the same opponents.
    const fought = new Set(source.fights.flatMap((f) => [f.sides[1].fighterId, f.sides[2].fighterId]));
    expect(fought).toEqual(new Set([`gi-sub-${sub.number}`, "gi-tpl-grappler", "gi-tpl-all-rounder", "gi-tpl-heavy", "gi-tpl-zoner"]));
  });

  it("checks it as its template when its sheet isn't on the guide or has problems, and says why", async () => {
    await sent();
    const none = await runNextSubmissionCheck(db, deps(stubSource(), { ownArt: async () => ({ kind: "none", problem: "none of its sprite sheets is drawn on the Wrestler guide" }) }));
    expect(none).toMatchObject({ status: "FAILED", results: { checkedAs: { fighterId: "gi-tpl-grappler", ownArt: false }, template: { ok: false, findings: ["none of its sprite sheets is drawn on the Wrestler guide"] } } });
    const sub = await db.submission.findFirstOrThrow();
    await requestSubmissionCheck(db, { actorId: admin, submissionId: sub.id });
    const problems = await runNextSubmissionCheck(db, deps(stubSource(), { ownArt: async () => ({ kind: "problems", problems: ["its sprite sheet: box 4 is empty"] }) }));
    expect(problems).toMatchObject({ status: "FAILED", results: { template: { findings: ["its sprite sheet: box 4 is empty"] } } });
  });

  it("finds the sheet drawn on the guide by its size and reports what to fix in it", async () => {
    const sub = await sent();
    const ikemenDir = await mkdtemp(path.join(tmpdir(), "gi-ikemen-"));
    const build = createOwnArtBuilder(ikemenDir, store);
    const input = { id: sub.id, number: sub.number, fighterName: sub.fighterName, community: sub.community, archetype: "GRAPPLER" as const };
    expect(await build({ ...input, sprites: [{ sha256: "x", width: 64, height: 48 }] })).toEqual({ kind: "none", problem: expect.stringMatching(/drawn on the Wrestler guide \(\d+x\d+ pixels/) });
    // A blank page of the guide's size: every box is empty.
    const layout = guideLayout(TEMPLATE_SPECS.find((t) => t.archetype === "GRAPPLER")!);
    const blank = writePng({ width: layout.width, height: layout.height, colorType: 6, pixels: new Uint8Array(layout.width * layout.height * 4) });
    const sha256 = await store.save(sub.id, blank);
    const r = await build({ ...input, sprites: [{ sha256, width: layout.width, height: layout.height }] });
    expect(r).toEqual({ kind: "problems", problems: [expect.stringMatching(/^its sprite sheet: boxes 1, 2, 3, .* and \d+ more are empty/)] });
    // An image the PNG reader can't read is a problem with that image, listed with the rest.
    const unreadable = await store.save(sub.id, Buffer.from("not a png at all"));
    const both = await build({ ...input, sprites: [{ sha256, width: layout.width, height: layout.height }], portrait: { sha256: unreadable, width: 1, height: 1 } });
    expect(both).toEqual({ kind: "problems", problems: ["its portrait: it can't be read (not a PNG file): save it again as an ordinary PNG", expect.stringMatching(/^its sprite sheet: boxes 1, 2, 3/)] });
    await rm(ikemenDir, { recursive: true, force: true });
  });
});

describe("guards", () => {
  it("keeps runs, never changes a finished one, and allows one open run per submission", async () => {
    const sub = await sent();
    const [queued] = await db.submissionCheck.findMany();
    await expect(db.submissionCheck.create({ data: { submissionId: sub.id } })).rejects.toThrow();
    await expect(db.submissionCheck.delete({ where: { id: queued!.id } })).rejects.toThrow(/kept/);
    await expect(db.submissionCheck.update({ where: { id: queued!.id }, data: { status: "PASSED", finishedAt: new Date(), results: {} } })).rejects.toThrow(/can't go from QUEUED to PASSED/);
    await expect(db.submissionCheck.update({ where: { id: queued!.id }, data: { status: "RUNNING" } })).rejects.toThrow(/submission_check_shape/);
    const run = await runNextSubmissionCheck(db, deps(stubSource()));
    await expect(db.submissionCheck.update({ where: { id: run!.id }, data: { error: "edited" } })).rejects.toThrow(/finished submission check can't change/);
  });
});
