import { createCharacter, createUser } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { seededRandom } from "@greed-island/engine";
import { encodeBase58, loadConfig, type Config } from "@greed-island/shared";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { characterProfile } from "./api/views.ts";
import { placeFightBet } from "./betting.ts";
import { FightBus, type BusEvent } from "./bus.ts";
import { DEFAULT_ORCHESTRATOR, type OrchestratorConfig } from "./config.ts";
import { applyTransition, bookFight, type FightDeps } from "./fights.ts";
import { setCollection } from "./holders.ts";
import type { Rng } from "./matchmaking.ts";
import { syncCommunityBuilds, type OwnArtBuilder, type OwnArtInput } from "./own-art.ts";
import { currentShop } from "./shop.ts";
import { decideReview, setRole } from "./staff.ts";
import { SubmissionStore } from "./submission-store.ts";
import { addSubmissionFile, createSubmission, sendForReview } from "./submissions.ts";
import { png } from "./testing/png.ts";
import { ensureTournament } from "./tournaments.ts";
import { castVote } from "./voting.ts";

const db = useTestDb();
const DAY = 86_400_000;
const T0 = new Date("2026-10-01T00:00:00Z");
const base = loadConfig({});
const config: Config = {
  ...base,
  economy: testEconomy,
  submissions: { ...base.submissions, open: true },
  voting: { ...base.voting, minBets: 0, minAccountAgeMs: 0 },
  shop: { ...base.shop, slots: 2 },
};
const orch: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR, bettingWindowMs: 0, interFightDelayMs: 0, idleRetryMs: 10, cycle: { matchmakingFights: 100, tournamentSize: 0, exhibitionFights: 0 } };
const dir = await mkdtemp(path.join(tmpdir(), "gi-releases-"));
const store = new SubmissionStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));
const rng = (): Rng => {
  const r = seededRandom("release");
  return { int: (n) => Math.floor(r() * n), chance: () => r() };
};
const COLLECTION = encodeBase58(new Uint8Array(32).fill(9));

let clock: Date;
let events: BusEvent[];
let d: FightDeps;
let admin: string;
let mod: string;

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

async function approved(email: string, community: string, fighterName: string, archetype: "GRAPPLER" | "ZONER", nft?: { assetId: string; collectionId: string }) {
  const userId = await verified(email);
  const sub = await createSubmission(db, config, {
    userId,
    details: { community, fighterName, archetype, description: "", rightsBasis: "ORIGINAL", rightsDetails: "Made by our community artist, all rights ours.", rightsLink: null },
    ...(nft ? { nft } : {}),
  });
  for (const [role, shade] of [["SPRITES", 1], ["PORTRAIT", 2], ["INTRO", 3], ["WIN_POSE", 4]] as const) {
    await addSubmissionFile(db, config, store, { userId, submissionId: sub.id, role, label: role, bytes: png(16, 16, shade + fighterName.length) });
  }
  await sendForReview(db, config, { userId, submissionId: sub.id, confirmRights: true });
  await decideReview(db, { reviewerId: mod, reviewId: (await db.reviewItem.findFirstOrThrow({ where: { submissionId: sub.id, status: "PENDING" } })).id, decision: "APPROVE" });
  return sub.id;
}

async function fight() {
  const f = (await bookFight(d, rng(), "fake"))!;
  await applyTransition(d, f.id, { type: "OPEN_BETTING" });
  await placeFightBet(db, config, { userId: admin, fightId: f.id, side: 1, stake: 1n, idempotencyKey: randomUUID() });
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
  for (const [id, archetype] of [["kfm", "ALL_ROUNDER"], ["gi-oak", "GRAPPLER"], ["gi-crane", "RUSHDOWN"]] as const) {
    await db.fighter.create({ data: { id, displayName: `Fighter ${id}`, archetype, defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
    await db.$transaction((tx) => createCharacter(tx, { rosterKey: id, fighterId: id, name: `House ${id}`, palette: 3 }, ratingSettings));
  }
  await db.stage.create({ data: { id: "s1", displayName: "Stage", defPath: "stages/s1.def", licenseNote: "test" } });
  admin = await verified("admin@example.com");
  mod = await verified("mod@example.com");
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
  await setRole(db, { actorId: admin, target: { userId: mod }, role: "MODERATOR" });
});

/** Finish the submission's queued automatic check with these results. */
async function finishCheck(submissionId: string, status: "PASSED" | "FAILED", checkedAs: { fighterId: string; name: string; ownArt: boolean; defPath: string }) {
  const run = await db.submissionCheck.findFirstOrThrow({ where: { submissionId, status: "QUEUED" } });
  await db.submissionCheck.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: clock } });
  const results = { checkedAs, smoke: { ok: true, detail: "fine" }, template: { ok: true, findings: [] }, balance: null };
  await db.submissionCheck.update({ where: { id: run.id }, data: { status, results, finishedAt: clock } });
}

describe("seasonal release", () => {
  it("brings the vote's winners into the roster at the next season, with a debut tournament and First Editions", async () => {
    await fight();
    const collection = await setCollection(db, {
      actorId: admin,
      collection: { address: COLLECTION, name: "Pixel Monks", licenceUrl: "https://pm.example/licence", licenceNote: "", submissionsAllowed: true, looksAllowed: true, fighterId: null, enabled: true },
    });
    const heron = await approved("sam@example.com", "Pixel Monks", "Iron Heron", "GRAPPLER", { assetId: "Asset1", collectionId: collection.id });
    const lark = await approved("pat@example.com", "Lark Club", "Sky Lark", "ZONER");
    // The automatic checks built the Sky Lark from its own art (failing on balance, but it ran); the Iron Heron was checked as its template.
    await finishCheck(lark, "FAILED", { fighterId: "gi-sub-2", name: "Sky Lark", ownArt: true, defPath: "chars/gi-sub-2/gi-sub-2.def" });
    await finishCheck(heron, "PASSED", { fighterId: "gi-oak", name: "Fighter gi-oak", ownArt: false, defPath: "chars/gi-oak/gi-oak.def" });
    clock = new Date(T0.getTime() + 43 * DAY);
    await fight();
    await castVote(db, config, { userId: admin, submissionId: heron }, clock);
    await castVote(db, config, { userId: admin, submissionId: lark }, clock);

    clock = new Date(T0.getTime() + 56 * DAY + 60_000);
    events = [];
    await fight();
    const types = events.filter((e) => ["ballot", "season", "release"].includes(e.type)).map((e) => (e.type === "season" ? `season ${e.status}` : e.type));
    expect(types).toEqual(["ballot", "season ENDED", "season STARTED", "release"]);
    expect(events.find((e) => e.type === "release")).toEqual({
      type: "release",
      seasonNumber: 2,
      fighters: [
        { name: "Iron Heron", community: "Pixel Monks", fighterId: "community-iron-heron" },
        { name: "Sky Lark", community: "Lark Club", fighterId: "community-sky-lark" },
      ],
    });

    // The fighters: community ones, playing with a stand-in of the same archetype (or Kung Fu Man).
    const heronFighter = await db.fighter.findUniqueOrThrow({ where: { id: "community-iron-heron" } });
    expect(heronFighter).toMatchObject({ source: "COMMUNITY", displayName: "Iron Heron", archetype: "GRAPPLER", rarity: "RARE", defPath: "chars/gi-oak/gi-oak.def", enabled: true });
    expect(heronFighter.licenseNote).toMatch(/Pixel Monks \(submission #1.*stand-in/);
    // Built from its own art: it plays with that character.
    const larkFighter = await db.fighter.findUniqueOrThrow({ where: { id: "community-sky-lark" } });
    expect(larkFighter.defPath).toBe("chars/gi-sub-2/gi-sub-2.def");
    expect(larkFighter.licenseNote).toMatch(/Lark Club \(submission #2.*with its own art\./);
    const releases = await db.release.findMany({ orderBy: { createdAt: "asc" }, include: { character: true } });
    expect(releases.map((r) => [r.character.name, r.character.ownerKind, r.character.palette, r.standInFighterId])).toEqual([
      ["Iron Heron", "HOUSE", 3, "gi-oak"],
      ["Sky Lark", "HOUSE", 1, "kfm"], // its own art's main colours, not the stand-in's
    ]);
    expect((await db.submission.findMany({ orderBy: { number: "asc" } })).map((s) => s.status)).toEqual(["RELEASED", "RELEASED"]);
    // It became its NFT collection's community fighter.
    expect((await db.nftCollection.findUniqueOrThrow({ where: { id: collection.id } })).fighterId).toBe("community-iron-heron");
    expect((await characterProfile(db, releases[0]!.characterId)).community).toEqual({ community: "Pixel Monks", submissionNumber: 1, releasedInSeason: 2, standIn: "Fighter gi-oak" });

    // Always in the shop this season (2 slots here), with First Editions.
    const shop = await currentShop(db, config, clock);
    expect(shop.offers.map((o) => [o.fighterId, o.price, o.firstEditionLeft])).toEqual([
      ["community-iron-heron", 2000n, 25],
      ["community-sky-lark", 2000n, 25],
    ]);

    // The next tournament seats them first, whatever their tier; the one after is a normal one.
    const first = await db.$transaction((tx) => ensureTournament(tx, 100, 4, config));
    expect(first.tournament).toMatchObject({ debut: true, size: 4 });
    const seated = (await db.tournamentEntry.findMany({ where: { tournamentId: first.tournament.id } })).map((e) => e.characterId);
    expect(seated).toEqual(expect.arrayContaining(releases.map((r) => r.characterId)));
    expect((await db.release.findMany()).every((r) => r.debutTournamentId === first.tournament.id)).toBe(true);
    const second = await db.$transaction((tx) => ensureTournament(tx, 101, 4, config));
    expect(second.tournament.debut).toBe(false);

    // Guards: kept, debut set once, released only with a release.
    await expect(db.release.update({ where: { id: releases[0]!.id }, data: { debutTournamentId: second.tournament.id } })).rejects.toThrow(/debut tournament, once/);
    await expect(db.release.delete({ where: { id: releases[0]!.id } })).rejects.toThrow(/kept/);

    // On an engine folder without its character (a new machine), the Sky Lark is built again from its images; the Iron Heron plays a stand-in.
    const ikemen = await mkdtemp(path.join(tmpdir(), "gi-ikemen-"));
    try {
      const built: OwnArtInput[] = [];
      const stub: OwnArtBuilder = async (input) => (built.push(input), { kind: "none", problem: "no sheet on the guide" });
      expect(await syncCommunityBuilds(db, ikemen, stub)).toEqual(["community-sky-lark (submission #2) couldn't be built again: no sheet on the guide"]);
      expect(built).toEqual([expect.objectContaining({ number: 2, fighterName: "Sky Lark", archetype: "ZONER", sprites: [expect.objectContaining({ width: 16, height: 16 })], portrait: expect.objectContaining({ sha256: expect.any(String) }), alternates: [], intros: [expect.objectContaining({ width: 16 })], wins: [expect.objectContaining({ width: 16 })] })]);
      // Already there: left alone.
      await mkdir(path.join(ikemen, "chars", "gi-sub-2"), { recursive: true });
      await writeFile(path.join(ikemen, "chars", "gi-sub-2", "gi-sub-2.def"), "");
      expect(await syncCommunityBuilds(db, ikemen, stub)).toEqual([]);
      expect(built).toHaveLength(1);
    } finally {
      await rm(ikemen, { recursive: true, force: true });
    }
  });

  it("releases nothing when nobody was elected", async () => {
    await fight();
    clock = new Date(T0.getTime() + 57 * DAY);
    events = [];
    await fight();
    expect(events.some((e) => e.type === "release")).toBe(false);
    expect(await db.fighter.count({ where: { source: "COMMUNITY" } })).toBe(0);
  });
});
