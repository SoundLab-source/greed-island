/**
 * Accounts: sessions and one-time email sign-in links (magic links).
 * Tokens are random 32-byte strings; only their SHA-256 is stored, so a
 * database leak doesn't let anyone sign in.
 */
import type { EconomyConfig } from "@greed-island/shared";
import { createHash, randomBytes } from "node:crypto";
import type { Db, Tx } from "./client.ts";
import type { User } from "./generated/prisma/client.ts";
import { withRetry } from "./ledger.ts";
import { createUserTx } from "./users.ts";

export interface AuthConfig {
  /** How long a signed-in session lasts. */
  sessionTtlMs: number;
  /** How long a sign-in link stays valid. */
  loginLinkTtlMs: number;
  /** Sign-in links per email address per hour. */
  maxLinksPerHour: number;
}

export const DEFAULT_AUTH: Readonly<AuthConfig> = Object.freeze({
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  loginLinkTtlMs: 15 * 60 * 1000,
  maxLinksPerHour: 5,
});

/** Auth settings from env: GI_SESSION_DAYS, GI_LOGIN_LINK_MINUTES, GI_LOGIN_LINKS_PER_HOUR. */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const num = (name: string, fallback: number) => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
    return n;
  };
  return {
    sessionTtlMs: num("GI_SESSION_DAYS", DEFAULT_AUTH.sessionTtlMs / 86_400_000) * 86_400_000,
    loginLinkTtlMs: num("GI_LOGIN_LINK_MINUTES", DEFAULT_AUTH.loginLinkTtlMs / 60_000) * 60_000,
    maxLinksPerHour: Math.floor(num("GI_LOGIN_LINKS_PER_HOUR", DEFAULT_AUTH.maxLinksPerHour)),
  };
}

export class AuthError extends Error {
  override name = "AuthError";
  constructor(
    readonly code: "INVALID_EMAIL" | "RATE_LIMITED" | "INVALID_LINK",
    message: string,
  ) {
    super(message);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Lower-cased and trimmed; throws AuthError for anything that isn't a plausible address. */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AuthError("INVALID_EMAIL", "that doesn't look like an email address");
  return e;
}

/** Start a session for a user. Returns the token to hand to the client (shown once). */
export async function createSession(tx: Db | Tx, userId: string, cfg: AuthConfig = DEFAULT_AUTH, now = new Date()): Promise<string> {
  const token = newToken();
  await tx.session.create({ data: { userId, tokenHash: hashToken(token), createdAt: now, expiresAt: new Date(now.getTime() + cfg.sessionTtlMs) } });
  return token;
}

/** The signed-in user for a session token, or null if unknown, expired or signed out. */
export async function findSessionUser(db: Db, token: string, now = new Date()): Promise<User | null> {
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  return session.user;
}

/** Sign out one device. */
export async function revokeSession(db: Db, token: string, now = new Date()): Promise<void> {
  await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: now } });
}

export interface LoginRequest {
  email: string;
  /** The anonymous player asking, if any: the email gets attached to their account. */
  currentUserId?: string | undefined;
}

export interface IssuedLink {
  /** Goes into the emailed link; never stored or logged by the server. */
  token: string;
  email: string;
  purpose: "SIGN_IN" | "ATTACH";
  expiresAt: Date;
}

/**
 * Issue a one-time sign-in link. If an anonymous player asks for an email no
 * other account uses, the link attaches that email to their account (keeping
 * their Salt and bets); otherwise it signs in to (or creates) the email's account.
 */
export async function issueLoginLink(db: Db, req: LoginRequest, cfg: AuthConfig = DEFAULT_AUTH, now = new Date()): Promise<IssuedLink> {
  const email = normalizeEmail(req.email);
  return withRetry(db, async (tx) => {
    // Serialize link requests per email so the rate limit can't be raced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7102, hashtext(${email}))`;
    const recent = await tx.loginToken.count({ where: { email, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } } });
    if (recent >= cfg.maxLinksPerHour) throw new AuthError("RATE_LIMITED", "too many sign-in links for this email; try again later");

    let purpose: "SIGN_IN" | "ATTACH" = "SIGN_IN";
    let userId: string | null = null;
    if (req.currentUserId) {
      const [current, owner] = await Promise.all([
        tx.user.findUnique({ where: { id: req.currentUserId }, select: { kind: true } }),
        tx.user.findUnique({ where: { email }, select: { id: true } }),
      ]);
      if (current?.kind === "ANONYMOUS" && !owner) {
        purpose = "ATTACH";
        userId = req.currentUserId;
      }
    }
    const token = newToken();
    const expiresAt = new Date(now.getTime() + cfg.loginLinkTtlMs);
    await tx.loginToken.create({ data: { email, tokenHash: hashToken(token), purpose, userId, createdAt: now, expiresAt } });
    return { token, email, purpose, expiresAt };
  });
}

export interface SignedIn {
  user: User;
  sessionToken: string;
  /** True when this sign-in created a brand-new account. */
  created: boolean;
}

/** Use a sign-in link: single use, expires. Returns a new session for the account. */
export async function redeemLoginLink(db: Db, token: string, economy: EconomyConfig, cfg: AuthConfig = DEFAULT_AUTH, now = new Date()): Promise<SignedIn> {
  return withRetry(db, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "login_token" WHERE "token_hash" = ${hashToken(token)} FOR UPDATE`;
    const link = rows[0] ? await tx.loginToken.findUniqueOrThrow({ where: { id: rows[0].id } }) : null;
    if (!link || link.usedAt || link.expiresAt <= now) throw new AuthError("INVALID_LINK", "this sign-in link is invalid, used or expired; ask for a new one");
    await tx.loginToken.update({ where: { id: link.id }, data: { usedAt: now } });

    let user = await tx.user.findUnique({ where: { email: link.email } });
    let created = false;
    if (!user && link.purpose === "ATTACH" && link.userId) {
      const anon = await tx.user.findUnique({ where: { id: link.userId } });
      if (anon?.kind === "ANONYMOUS") {
        user = await tx.user.update({ where: { id: anon.id }, data: { kind: "EMAIL", email: link.email, emailVerifiedAt: now } });
      }
    }
    if (!user) {
      user = (await createUserTx(tx, { kind: "EMAIL", email: link.email }, economy)).user;
      user = await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
      created = true;
    } else if (!user.emailVerifiedAt) {
      user = await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
    }
    return { user, sessionToken: await createSession(tx, user.id, cfg, now), created };
  });
}
