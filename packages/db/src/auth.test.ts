import { describe, expect, it } from "vitest";
import { AuthError, createSession, DEFAULT_AUTH, findSessionUser, issueLoginLink, loadAuthConfig, normalizeEmail, redeemLoginLink, revokeSession } from "./auth.ts";
import { placeBet } from "./bets.ts";
import { getBalance } from "./ledger.ts";
import { createTestFight, economy, useTestDb } from "./test/db.ts";
import { createUser } from "./users.ts";

const db = useTestDb();
const t0 = new Date("2026-10-01T12:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

describe("normalizeEmail", () => {
  it("lower-cases and trims, and rejects junk", () => {
    expect(normalizeEmail("  Ann@Example.COM ")).toBe("ann@example.com");
    for (const bad of ["", "ann", "ann@", "@x.com", "a b@c.com", "a@b"]) expect(() => normalizeEmail(bad)).toThrow(AuthError);
  });
});

describe("loadAuthConfig", () => {
  it("uses defaults and reads overrides", () => {
    expect(loadAuthConfig({})).toEqual(DEFAULT_AUTH);
    expect(loadAuthConfig({ GI_SESSION_DAYS: "7", GI_LOGIN_LINK_MINUTES: "10", GI_LOGIN_LINKS_PER_HOUR: "3" })).toEqual({
      sessionTtlMs: 7 * 86_400_000,
      loginLinkTtlMs: 600_000,
      maxLinksPerHour: 3,
    });
    expect(() => loadAuthConfig({ GI_SESSION_DAYS: "0" })).toThrow();
  });
});

describe("sessions", () => {
  it("expire and can be signed out", async () => {
    const { user } = await createUser(db, { kind: "EMAIL", email: "s@example.com" }, economy);
    const token = await createSession(db, user.id, DEFAULT_AUTH, t0);
    expect((await findSessionUser(db, token, later(1000)))?.id).toBe(user.id);
    expect(await findSessionUser(db, token, later(DEFAULT_AUTH.sessionTtlMs + 1))).toBeNull();
    await revokeSession(db, token, later(2000));
    expect(await findSessionUser(db, token, later(3000))).toBeNull();
    expect(await findSessionUser(db, "not-a-token")).toBeNull();
  });

  it("allow several devices at once", async () => {
    const { user } = await createUser(db, { kind: "EMAIL", email: "multi@example.com" }, economy);
    const [a, b] = [await createSession(db, user.id), await createSession(db, user.id)];
    await revokeSession(db, a);
    expect(await findSessionUser(db, a)).toBeNull();
    expect((await findSessionUser(db, b))?.id).toBe(user.id);
  });
});

describe("email sign-in links", () => {
  it("create a verified account with the starting balance on first use", async () => {
    const link = await issueLoginLink(db, { email: "New@Example.com" }, DEFAULT_AUTH, t0);
    expect(link).toMatchObject({ email: "new@example.com", purpose: "SIGN_IN" });
    expect(await db.loginToken.count({ where: { tokenHash: link.token } })).toBe(0); // only the hash is stored
    const signed = await redeemLoginLink(db, link.token, economy, DEFAULT_AUTH, later(60_000));
    expect(signed.created).toBe(true);
    expect(signed.user).toMatchObject({ kind: "EMAIL", email: "new@example.com" });
    expect(signed.user.emailVerifiedAt).not.toBeNull();
    expect(await getBalance(db, signed.user.id)).toBe(400n);
    expect((await findSessionUser(db, signed.sessionToken))?.id).toBe(signed.user.id);
  });

  it("sign in to the existing account the next time, without a second grant", async () => {
    const first = await redeemLoginLink(db, (await issueLoginLink(db, { email: "ann@example.com" })).token, economy);
    const second = await redeemLoginLink(db, (await issueLoginLink(db, { email: "ann@example.com" })).token, economy);
    expect(second.created).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    expect(await getBalance(db, first.user.id)).toBe(400n);
  });

  it("work once, and expire", async () => {
    const link = await issueLoginLink(db, { email: "once@example.com" }, DEFAULT_AUTH, t0);
    await redeemLoginLink(db, link.token, economy, DEFAULT_AUTH, later(1000));
    await expect(redeemLoginLink(db, link.token, economy, DEFAULT_AUTH, later(2000))).rejects.toMatchObject({ code: "INVALID_LINK" });
    const old = await issueLoginLink(db, { email: "late@example.com" }, DEFAULT_AUTH, t0);
    await expect(redeemLoginLink(db, old.token, economy, DEFAULT_AUTH, later(DEFAULT_AUTH.loginLinkTtlMs + 1))).rejects.toMatchObject({ code: "INVALID_LINK" });
    await expect(redeemLoginLink(db, "made-up", economy)).rejects.toMatchObject({ code: "INVALID_LINK" });
  });

  it("attach an email to an anonymous player, keeping their Salt and bets", async () => {
    const anon = await createUser(db, { kind: "ANONYMOUS" }, economy);
    await placeBet(db, { userId: anon.user.id, fightId: await createTestFight(db), side: 1, stake: 50n, idempotencyKey: "k-attach" }, economy);
    const link = await issueLoginLink(db, { email: "keep@example.com", currentUserId: anon.user.id });
    expect(link.purpose).toBe("ATTACH");
    const signed = await redeemLoginLink(db, link.token, economy);
    expect(signed.user.id).toBe(anon.user.id);
    expect(signed.user).toMatchObject({ kind: "EMAIL", email: "keep@example.com" });
    expect(signed.created).toBe(false);
    expect(await getBalance(db, anon.user.id)).toBe(350n);
    expect(await db.bet.count({ where: { userId: anon.user.id } })).toBe(1);
    // The old anonymous session still works too.
    expect((await findSessionUser(db, anon.sessionToken!))?.id).toBe(anon.user.id);
  });

  it("sign an anonymous player in to the existing account when the email is taken", async () => {
    const owner = await createUser(db, { kind: "EMAIL", email: "taken@example.com" }, economy);
    const anon = await createUser(db, { kind: "ANONYMOUS" }, economy);
    const link = await issueLoginLink(db, { email: "taken@example.com", currentUserId: anon.user.id });
    expect(link.purpose).toBe("SIGN_IN");
    expect((await redeemLoginLink(db, link.token, economy)).user.id).toBe(owner.user.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: anon.user.id } })).kind).toBe("ANONYMOUS");
  });

  it("are rate-limited per email address", async () => {
    for (let i = 0; i < DEFAULT_AUTH.maxLinksPerHour; i++) await issueLoginLink(db, { email: "spam@example.com" }, DEFAULT_AUTH, t0);
    await expect(issueLoginLink(db, { email: "spam@example.com" }, DEFAULT_AUTH, later(1000))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await issueLoginLink(db, { email: "spam@example.com" }, DEFAULT_AUTH, later(60 * 60 * 1000 + 1));
    await issueLoginLink(db, { email: "other@example.com" }, DEFAULT_AUTH, later(1000));
  });

  it("can't be redeemed twice even concurrently", async () => {
    const link = await issueLoginLink(db, { email: "race@example.com" });
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => redeemLoginLink(db, link.token, economy)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { email: "race@example.com" } })).toBe(1);
  });
});
