import { createCharacter, createUser } from "@greed-island/db";
import { economy as testEconomy, ratingSettings, useTestDb } from "@greed-island/db/test";
import { loadConfig, type Config } from "@greed-island/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { formerNames, latestNameRequest, reviewQueue, staffLog, staffSearch } from "./api/staff-views.ts";
import { decideReview, ForbiddenError, requestCharacterName, requireStaff, resetCharacterName, resetDisplayName, setRole, withdrawRequest } from "./staff.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };

let admin: string;
let mod: string;
let alice: string;
let bob: string;
/** alice owns Grey Monk #1 and #2; bob owns Crane #1; the mod owns Crane #2. */
const ch: Record<string, string> = {};
let houseId: string;

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

async function owned(key: string, fighterId: string, userId: string, serial: number, name: string) {
  ch[key] = (await db.character.create({
    data: { fighterId, name: `${name} #${serial}`, rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: userId, serial, acquiredAt: new Date() },
  })).id;
}

beforeEach(async () => {
  for (const [id, displayName] of [["monk", "Grey Monk"], ["crane", "Crane"], ["house", "Old Master"]] as const) {
    await db.fighter.create({ data: { id, displayName, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
  }
  admin = await verified("admin@example.com");
  mod = await verified("mod@example.com");
  alice = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
  bob = (await createUser(db, { kind: "ANONYMOUS" }, testEconomy)).user.id;
  await setRole(db, { actorId: null, target: { email: "admin@example.com" }, role: "ADMIN" });
  await setRole(db, { actorId: admin, target: { email: "mod@example.com" }, role: "MODERATOR" });
  await owned("a1", "monk", alice, 1, "Grey Monk");
  await owned("a2", "monk", alice, 2, "Grey Monk");
  await owned("b1", "crane", bob, 1, "Crane");
  await owned("m1", "crane", mod, 2, "Crane");
  houseId = (await db.$transaction((tx) => createCharacter(tx, { rosterKey: "house", fighterId: "house", name: "Old Master" }, ratingSettings))).id;
});

const ask = (userId: string, key: string, name: string, now?: Date) => requestCharacterName(db, config, { userId, characterId: ch[key]!, name }, now);
const decide = (reviewerId: string, reviewId: string, decision: "APPROVE" | "REJECT", note?: string, now?: Date) => decideReview(db, { reviewerId, reviewId, decision, note: note ?? null }, now);

describe("roles", () => {
  it("appoints staff from the command line and the staff page, and logs it", async () => {
    expect((await db.user.findUniqueOrThrow({ where: { id: admin } })).role).toBe("ADMIN");
    expect((await db.user.findUniqueOrThrow({ where: { id: mod } })).role).toBe("MODERATOR");
    const log = await staffLog(db);
    expect(log.map((l) => [l.kind, l.by.id, l.by.name, l.player?.id, l.detail])).toEqual([
      ["ROLE_SET", admin, expect.stringMatching(/^Anon-/), mod, { from: "PLAYER", to: "MODERATOR", note: null }],
      ["ROLE_SET", null, "server command line", admin, { from: "PLAYER", to: "ADMIN", note: null }],
    ]);
    expect(log[0]!.by.role).toBe("ADMIN");
    // Setting the same role again changes and logs nothing.
    expect(await setRole(db, { actorId: admin, target: { userId: mod }, role: "MODERATOR" })).toMatchObject({ changed: false });
    expect(await db.staffAction.count()).toBe(2);
  });

  it("keeps staff to verified emails, admins to the command line, and moderator lists to admins", async () => {
    await expect(setRole(db, { actorId: null, target: { userId: alice }, role: "MODERATOR" })).rejects.toThrow(/verified email/);
    await expect(db.user.update({ where: { id: alice }, data: { role: "MODERATOR" } })).rejects.toThrow(/user_staff_verified/);
    const pat = await verified("pat@example.com");
    await expect(setRole(db, { actorId: admin, target: { userId: pat }, role: "ADMIN" })).rejects.toThrow(/command line/);
    await expect(setRole(db, { actorId: mod, target: { userId: pat }, role: "MODERATOR" })).rejects.toThrow(ForbiddenError);
    await expect(setRole(db, { actorId: alice, target: { userId: pat }, role: "MODERATOR" })).rejects.toThrow(ForbiddenError);
    await expect(setRole(db, { actorId: admin, target: { email: "nobody@example.com" }, role: "MODERATOR" })).rejects.toThrow(/no account/);
  });

  it("takes access away as soon as a moderator is removed", async () => {
    await expect(requireStaff(db, mod, "review")).resolves.toMatchObject({ role: "MODERATOR" });
    await expect(requireStaff(db, mod, "manage_moderators")).rejects.toThrow(ForbiddenError);
    const { request } = await ask(alice, "a1", "Iron Lotus");
    await setRole(db, { actorId: admin, target: { userId: mod }, role: "PLAYER" });
    await expect(decide(mod, request.id, "APPROVE")).rejects.toThrow(ForbiddenError);
    await expect(decide(alice, request.id, "APPROVE")).rejects.toThrow(ForbiddenError);
  });
});

describe("custom names", () => {
  it("renames a character once a moderator approves, and logs who approved it", async () => {
    const r = await ask(alice, "a1", "  Iron   Lotus ");
    expect(r).toMatchObject({ replayed: false, request: { status: "PENDING", proposedName: "Iron Lotus" } });
    expect(await ask(alice, "a1", "Iron Lotus")).toMatchObject({ replayed: true, request: { id: r.request.id } });
    await expect(ask(alice, "a1", "Other Name")).rejects.toThrow(/waiting for review/);
    // Nothing changes until it's approved.
    expect((await db.character.findUniqueOrThrow({ where: { id: ch.a1 } })).name).toBe("Grey Monk #1");
    expect((await reviewQueue(db)).pending).toMatchObject([{ proposedName: "Iron Lotus", character: { name: "Grey Monk #1", automaticName: "Grey Monk #1", ownerChanged: false } }]);

    const approved = await decide(mod, r.request.id, "APPROVE", "nice");
    expect(approved).toMatchObject({ status: "APPROVED", previousName: "Grey Monk #1", decidedByUserId: mod, note: "nice" });
    expect((await db.character.findUniqueOrThrow({ where: { id: ch.a1 } })).name).toBe("Iron Lotus");
    expect(await formerNames(db, ch.a1!)).toEqual(["Grey Monk #1"]);
    expect(await latestNameRequest(db, ch.a1!)).toMatchObject({ name: "Iron Lotus", status: "APPROVED", note: "nice" });
    const [entry] = await staffLog(db);
    expect(entry).toMatchObject({ kind: "REVIEW_APPROVED", by: { id: mod, role: "MODERATOR" }, player: { id: alice }, character: { name: "Iron Lotus" }, reviewId: r.request.id });
    expect(entry!.detail).toEqual({ kind: "CHARACTER_NAME", name: "Iron Lotus", previousName: "Grey Monk #1", note: "nice" });
    // A decision is final.
    await expect(decide(admin, r.request.id, "REJECT", "changed my mind")).rejects.toThrow(/already approved/);
  });

  it("waits a week after an approved name before the next one", async () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const { request } = await ask(alice, "a1", "Iron Lotus", now);
    await decide(mod, request.id, "APPROVE", undefined, now);
    await expect(ask(alice, "a1", "Jade Lotus", new Date("2026-10-07T23:00:00Z"))).rejects.toThrow(/ask again after 2026-10-08 00:00 UTC/);
    await expect(ask(alice, "a1", "Jade Lotus", new Date("2026-10-08T00:00:00Z"))).resolves.toMatchObject({ replayed: false });
  });

  it("refuses other players' and house characters, and names that are taken", async () => {
    await expect(ask(bob, "a1", "Iron Lotus")).rejects.toThrow(/you own/);
    await expect(requestCharacterName(db, config, { userId: alice, characterId: houseId, name: "Iron Lotus" })).rejects.toThrow(/house characters/);
    await expect(ask(alice, "a1", "crane #1")).rejects.toThrow(/only letters/);
    await expect(ask(alice, "a1", "OLD MASTER")).rejects.toThrow(/taken/); // a character's name, any case
    await expect(ask(alice, "a1", "grey monk")).rejects.toThrow(/taken/); // a fighter's name
    await ask(bob, "b1", "Iron Lotus");
    await expect(ask(alice, "a1", "iron lotus")).rejects.toThrow(/taken/); // waiting for another character
    // A case change of its own name is fine.
    const { request } = await ask(bob, "b1", "Iron Lotus");
    await decide(mod, request.id, "APPROVE");
    await new Promise((r) => setTimeout(r, 5));
    await expect(requestCharacterName(db, { ...config, staff: { renameCooldownMs: 0 } }, { userId: bob, characterId: ch.b1!, name: "IRON LOTUS" })).resolves.toMatchObject({ replayed: false });
  });

  it("refuses an approval if the name was taken meanwhile, or the owner changed", async () => {
    const { request } = await ask(alice, "a1", "Iron Lotus");
    await db.character.update({ where: { id: houseId }, data: { name: "iron lotus" } });
    await expect(decide(mod, request.id, "APPROVE")).rejects.toThrow(/another character has this name now/);
    await db.character.update({ where: { id: houseId }, data: { name: "Old Master" } });
    await db.character.update({ where: { id: ch.a1 }, data: { ownerUserId: bob } });
    await expect(decide(mod, request.id, "APPROVE")).rejects.toThrow(/different owner/);
    expect((await reviewQueue(db)).pending[0]!.character!.ownerChanged).toBe(true);
    // The moderator rejects it instead; the player sees why.
    await expect(decide(mod, request.id, "REJECT")).rejects.toThrow(/say why/);
    await decide(mod, request.id, "REJECT", "the character changed hands");
    expect(await latestNameRequest(db, ch.a1!)).toMatchObject({ status: "REJECTED", note: "the character changed hands" });
    expect((await staffLog(db))[0]).toMatchObject({ kind: "REVIEW_REJECTED", detail: { name: "Iron Lotus", note: "the character changed hands" } });
  });

  it("stops moderators reviewing their own requests, but not admins", async () => {
    const own = await ask(mod, "m1", "Blue Heron");
    await expect(decide(mod, own.request.id, "APPROVE")).rejects.toThrow(/your own/);
    await decide(admin, own.request.id, "APPROVE");
    const adminOwned = await db.character.update({ where: { id: ch.a2 }, data: { ownerUserId: admin } });
    const r = await requestCharacterName(db, config, { userId: admin, characterId: adminOwned.id, name: "Red Crane" });
    await expect(decide(admin, r.request.id, "APPROVE")).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("lets the player withdraw a request while it waits", async () => {
    const { request } = await ask(alice, "a1", "Iron Lotus");
    await expect(withdrawRequest(db, { userId: bob, reviewId: request.id })).rejects.toThrow(/no such request/);
    await expect(withdrawRequest(db, { userId: alice, reviewId: request.id })).resolves.toMatchObject({ status: "WITHDRAWN" });
    await expect(decide(mod, request.id, "APPROVE")).rejects.toThrow(/already withdrawn/);
    await expect(withdrawRequest(db, { userId: alice, reviewId: request.id })).rejects.toThrow(/already withdrawn/);
    // And ask again.
    await expect(ask(alice, "a1", "Iron Lotus")).resolves.toMatchObject({ replayed: false });
  });
});

describe("resets", () => {
  it("resets a display name or a custom character name, with a logged reason", async () => {
    await db.user.update({ where: { id: bob }, data: { displayName: "Rude Name" } });
    await expect(resetDisplayName(db, { actorId: mod, userId: bob, note: "" })).rejects.toThrow(/say why/);
    await expect(resetDisplayName(db, { actorId: alice, userId: bob, note: "x" })).rejects.toThrow(ForbiddenError);
    await resetDisplayName(db, { actorId: mod, userId: bob, note: "offensive" });
    expect((await db.user.findUniqueOrThrow({ where: { id: bob } })).displayName).toBeNull();
    await expect(resetDisplayName(db, { actorId: mod, userId: bob, note: "again" })).rejects.toThrow(/no display name/);
    expect((await staffLog(db))[0]).toMatchObject({ kind: "DISPLAY_NAME_RESET", player: { id: bob }, detail: { previousName: "Rude Name", note: "offensive" } });

    const { request } = await ask(alice, "a1", "Iron Lotus");
    await decide(mod, request.id, "APPROVE");
    expect(await resetCharacterName(db, { actorId: mod, characterId: ch.a1!, note: "impersonation" })).toBe("Grey Monk #1");
    expect((await db.character.findUniqueOrThrow({ where: { id: ch.a1 } })).name).toBe("Grey Monk #1");
    await expect(resetCharacterName(db, { actorId: mod, characterId: ch.a1!, note: "again" })).rejects.toThrow(/already has its automatic name/);
    await expect(resetCharacterName(db, { actorId: mod, characterId: houseId, note: "x" })).rejects.toThrow(/roster.json/);
    expect((await staffLog(db))[0]).toMatchObject({ kind: "CHARACTER_NAME_RESET", player: { id: alice }, detail: { name: "Grey Monk #1", previousName: "Iron Lotus", note: "impersonation" } });
  });

  it("finds players and characters to moderate", async () => {
    await db.user.update({ where: { id: bob }, data: { displayName: "Bobby" } });
    const found = await staffSearch(db, "bob");
    expect(found.players.map((p) => p.id)).toEqual([bob]);
    expect((await staffSearch(db, "admin@example.com")).players.map((p) => p.id)).toEqual([admin]);
    expect((await staffSearch(db, "monk")).characters.map((c) => [c.name, c.customName])).toEqual([["Grey Monk #1", false], ["Grey Monk #2", false]]);
    expect(await staffSearch(db, "b")).toEqual({ players: [], characters: [] });
  });
});

describe("database guards", () => {
  it("keeps requests, fixes what they ask for, and makes decisions final", async () => {
    const { request } = await ask(alice, "a1", "Iron Lotus");
    await expect(db.reviewItem.update({ where: { id: request.id }, data: { proposedName: "Sneaky" } })).rejects.toThrow(/fixed/);
    await expect(db.reviewItem.delete({ where: { id: request.id } })).rejects.toThrow(/kept/);
    await expect(db.reviewItem.create({ data: { kind: "CHARACTER_NAME", submittedByUserId: alice, characterId: ch.a1!, proposedName: "Second" } })).rejects.toThrow(/review_item_one_pending_name|Unique constraint/);
    await expect(db.reviewItem.update({ where: { id: request.id }, data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: mod } })).rejects.toThrow(/review_item_reject_note/);
    await decide(mod, request.id, "APPROVE");
    await expect(db.reviewItem.update({ where: { id: request.id }, data: { note: "edited" } })).rejects.toThrow(/approved review request can't change/);
  });

  it("keeps the staff log append-only and every entry attributed", async () => {
    const [entry] = await db.staffAction.findMany({ take: 1 });
    await expect(db.staffAction.update({ where: { id: entry!.id }, data: { detail: {} } })).rejects.toThrow(/append-only/);
    await expect(db.staffAction.delete({ where: { id: entry!.id } })).rejects.toThrow(/append-only/);
    await expect(db.staffAction.create({ data: { actorUserId: alice, actorRole: "PLAYER", kind: "DISPLAY_NAME_RESET", targetUserId: bob, detail: {} } })).rejects.toThrow(/staff_action_actor/);
    await expect(db.staffAction.create({ data: { kind: "DISPLAY_NAME_RESET", targetUserId: bob, detail: {} } })).rejects.toThrow(/staff_action_shape/);
  });
});
