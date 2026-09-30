/**
 * HTTP API and SSE stream (build step 6). Amounts in and out are integer
 * strings (Salt is bigint); a JSON number is accepted for stakes only if it's
 * a safe integer. Auth: a session token as `Authorization: Bearer`, from an
 * anonymous session or an emailed one-time sign-in link.
 */
import fastifyStatic from "@fastify/static";
import {
  AuthError,
  claimBailout,
  claimDailyGrant,
  createUser,
  DEFAULT_AUTH,
  findSessionUser,
  IdempotencyKeyReusedError,
  issueLoginLink,
  redeemLoginLink,
  revokeSession,
  type AuthConfig,
  NotFoundError,
  REPO_ROOT,
  type Db,
} from "@greed-island/db";
import {
  BADGE_IDS,
  cosmeticsCatalog,
  describeCosmetics,
  LedgerRuleError,
  MAX_BADGES,
  MoneyError,
  NAMEPLATE_IDS,
  parseSalt,
  SIDEGRADES,
  ARCHETYPES,
  FILE_ROLES,
  isStaff,
  RIGHTS_BASES,
  TITLE_CODES,
  UPGRADE_STATS,
  type Config,
  type StaffPermission,
} from "@greed-island/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import path from "node:path";
import { z } from "zod";
import { placeFightBet } from "../betting.ts";
import type { BusEvent, FightBus } from "../bus.ts";
import { answerChallenge, expireChallenges, sendChallenge, type ChallengeAnswer } from "../challenges.ts";
import { setCosmetics } from "../cosmetics.ts";
import { ConsoleMailer, signInMail, type Mailer } from "../mail.ts";
import { buyCharacter, currentShop } from "../shop.ts";
import { loadSubmissionStore, type SubmissionStore } from "../submission-store.ts";
import { addSubmissionFile, createSubmission, readSubmissionFile, removeSubmissionFile, sendForReview, updateSubmission, withdrawSubmission } from "../submissions.ts";
import { decideReview, ForbiddenError, requestCharacterName, requireStaff, resetCharacterName, resetDisplayName, setRole, withdrawRequest } from "../staff.ts";
import { setSidegrade, upgradeStat } from "../upgrades.ts";
import {
  betHistory,
  challengeOptions,
  characterProfile,
  characterRanking,
  currentFightId,
  currentTournamentId,
  fightView,
  meView,
  myChallenges,
  myCharacters,
  recentResults,
  recentTournaments,
  tournamentView,
} from "./views.ts";
import { leaderboard, recentSeasons, seasonView } from "./season-views.ts";
import { mySubmissions, submissionDetail, submissionRules } from "./submission-views.ts";
import { reviewQueue, staffLog, staffMembers, staffSearch } from "./staff-views.ts";

export interface ApiDeps {
  db: Db;
  config: Config;
  bus: FightBus;
  /** Folder served at / (the dev page). Defaults to apps/web. */
  webRoot?: string;
  /** SSE keep-alive interval. */
  heartbeatMs?: number;
  /** Sends sign-in links. Defaults to printing them to the console. */
  mailer?: Mailer;
  /** Base URL used in emailed links, e.g. https://greed-island.example (default http://127.0.0.1:3000). */
  publicUrl?: string;
  auth?: AuthConfig;
  logger?: boolean;
  /** Twitch channel shown on the watch page (player and chat); null shows the live betting board instead. */
  twitchChannel?: string | null;
  /** Where submitted fighter images are stored. Defaults to GI_SUBMISSIONS_DIR or `submissions/`. */
  submissionStore?: SubmissionStore;
}

/** GI_TWITCH_CHANNEL: a Twitch login name (4-25 letters, digits or underscores). */
export function loadTwitchChannel(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env["GI_TWITCH_CHANNEL"]?.trim();
  if (!raw) return null;
  if (!/^[a-zA-Z0-9_]{4,25}$/.test(raw)) throw new Error(`GI_TWITCH_CHANNEL "${raw}" isn't a Twitch channel name`);
  return raw.toLowerCase();
}

/** JSON.stringify that writes bigints as strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

const uuid = z.string().uuid();
const BetBody = z.object({
  side: z.union([z.literal(1), z.literal(2)]),
  stake: z.union([z.string(), z.number()]),
  idempotencyKey: z.string().min(8).max(100),
});
const SessionBody = z.object({ displayName: z.string().trim().min(1).max(24).optional() }).optional();
const EmailBody = z.object({ email: z.string().max(254) });
const VerifyBody = z.object({ token: z.string().min(20).max(200) });
const BuyBody = z.object({ fighterId: z.string().min(1).max(64), idempotencyKey: z.string().min(8).max(100) });
const UpgradeBody = z.object({ stat: z.enum(UPGRADE_STATS), idempotencyKey: z.string().min(8).max(100) });
const SidegradeBody = z.object({ sidegrade: z.enum(SIDEGRADES).nullable(), idempotencyKey: z.string().min(8).max(100) });
const ChallengeBody = z.object({ challengerCharacterId: z.string().uuid(), challengedCharacterId: z.string().uuid() });
/** Replaces the whole pick; leave a field out for automatic. */
const CosmeticsBody = z
  .object({
    title: z.enum(TITLE_CODES).nullable().optional(),
    nameplate: z.enum(NAMEPLATE_IDS).optional(),
    badges: z.array(z.enum(BADGE_IDS)).max(MAX_BADGES).optional(),
  })
  .strict();
const NameBody = z.object({ name: z.string().max(100) });
const NoteBody = z.object({ note: z.string().max(5000).nullable().optional() }).optional();
const SubmissionBody = z
  .object({
    community: z.string().max(100),
    fighterName: z.string().max(100),
    archetype: z.enum(ARCHETYPES),
    description: z.string().max(2000).default(""),
    rightsBasis: z.enum(RIGHTS_BASES),
    rightsDetails: z.string().max(5000),
    rightsLink: z.string().max(1000).nullable().default(null),
  })
  .strict();
const FileQuery = z.object({ role: z.enum(FILE_ROLES), label: z.string().min(1).max(200) });
const SubmitBody = z.object({ confirmRights: z.boolean() });
const RoleBody = z.object({ email: z.string().max(254), role: z.enum(["MODERATOR", "PLAYER"]), note: z.string().max(1000).nullable().optional() });

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function buildServer(deps: ApiDeps): Promise<FastifyInstance> {
  const { db, config, bus } = deps;
  const mailer = deps.mailer ?? new ConsoleMailer();
  const publicUrl = (deps.publicUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
  const authCfg = deps.auth ?? DEFAULT_AUTH;
  const store = deps.submissionStore ?? loadSubmissionStore();
  const app = Fastify({ logger: deps.logger ?? false });
  // Submission images arrive as the raw PNG body (checked in pngInfo; the content type isn't trusted).
  app.addContentTypeParser(["image/png", "application/octet-stream"], { parseAs: "buffer", bodyLimit: config.submissions.maxFileBytes + 1024 }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ForbiddenError) return reply.status(403).send({ error: "FORBIDDEN", message: err.message });
    if (err instanceof AuthError) {
      const status = err.code === "RATE_LIMITED" ? 429 : 400;
      return reply.status(status).send({ error: err.code, message: err.message });
    }
    if (err instanceof LedgerRuleError) {
      const status = err.code === "INSUFFICIENT_FUNDS" || err.code === "NOT_ELIGIBLE" ? 409 : 400;
      return reply.status(status).send({ error: err.code, message: err.message });
    }
    if (err instanceof MoneyError) return reply.status(400).send({ error: "INVALID_AMOUNT", message: err.message });
    if (err instanceof IdempotencyKeyReusedError) return reply.status(409).send({ error: "IDEMPOTENCY_KEY_REUSED", message: err.message });
    if (err instanceof NotFoundError) return reply.status(404).send({ error: "NOT_FOUND", message: err.message });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "INVALID_REQUEST", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    const e = err as { validation?: unknown; statusCode?: number; message?: string };
    if (e.statusCode === 413) return reply.status(413).send({ error: "TOO_LARGE", message: `an image is at most ${Math.floor(config.submissions.maxFileBytes / (1024 * 1024))} MB` });
    if (e.statusCode === 415) return reply.status(415).send({ error: "UNSUPPORTED_MEDIA_TYPE", message: e.message ?? "unsupported content type" });
    if (e.validation || e.statusCode === 400) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: e.message ?? "bad request" });
    }
    app.log.error(err);
    return reply.status(500).send({ error: "INTERNAL", message: "something went wrong" });
  });

  const bearer = (req: FastifyRequest): string | undefined => {
    const header = req.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  };
  const viewer = async (req: FastifyRequest): Promise<string | undefined> => {
    const token = bearer(req);
    return token ? (await findSessionUser(db, token))?.id : undefined;
  };
  const requireViewer = async (req: FastifyRequest): Promise<string> => {
    const id = await viewer(req);
    if (!id) throw new HttpError(401, "UNAUTHORIZED", "sign in first (POST /api/session)");
    return id;
  };
  /** A signed-in account with this staff permission (read fresh each request). */
  const requireStaffViewer = async (req: FastifyRequest, permission: StaffPermission) => requireStaff(db, await requireViewer(req), permission);
  const send = (reply: FastifyReply, value: unknown) => reply.type("application/json").send(toJson(value));

  // Sessions: an anonymous account with the starting balance.
  app.post("/api/session", async (req, reply) => {
    const body = SessionBody.parse(req.body ?? undefined);
    const created = await createUser(db, { kind: "ANONYMOUS" }, config.economy);
    if (body?.displayName) await db.user.update({ where: { id: created.user.id }, data: { displayName: body.displayName } });
    return send(reply.status(201), { token: created.sessionToken, me: await meView(db, config, created.user.id) });
  });

  // Email sign-in: send a one-time link; an anonymous player keeps their Salt.
  app.post("/api/auth/email", async (req, reply) => {
    const { email } = EmailBody.parse(req.body);
    const link = await issueLoginLink(db, { email, currentUserId: await viewer(req) }, authCfg);
    await mailer.send(signInMail(link.email, `${publicUrl}/?login=${encodeURIComponent(link.token)}`, Math.round(authCfg.loginLinkTtlMs / 60_000)));
    // Same answer whether or not the email has an account.
    return send(reply.status(202), { sent: true, email: link.email });
  });
  app.post("/api/auth/verify", async (req, reply) => {
    const { token } = VerifyBody.parse(req.body);
    const signed = await redeemLoginLink(db, token, config.economy, authCfg);
    return send(reply, { token: signed.sessionToken, created: signed.created, me: await meView(db, config, signed.user.id) });
  });
  app.post("/api/auth/logout", async (req, reply) => {
    const token = bearer(req);
    if (token) await revokeSession(db, token);
    return reply.status(204).send();
  });

  app.get("/api/me", async (req, reply) => send(reply, await meView(db, config, await requireViewer(req))));
  app.get("/api/me/bets", async (req, reply) => send(reply, await betHistory(db, await requireViewer(req))));
  app.post("/api/me/daily-grant", async (req, reply) => {
    const userId = await requireViewer(req);
    const r = await claimDailyGrant(db, userId, config.economy);
    return send(reply, { status: r.status, amount: r.amount, balance: r.balance });
  });
  app.post("/api/me/bailout", async (req, reply) => {
    const userId = await requireViewer(req);
    const r = await claimBailout(db, userId, config.economy);
    return send(reply, { status: r.status, amount: r.amount, balance: r.balance });
  });

  app.get("/api/fights/current", async (req, reply) => {
    const id = await currentFightId(db);
    return send(reply, id ? await fightView(db, config, id, await viewer(req)) : null);
  });
  app.get<{ Params: { id: string } }>("/api/fights/:id", async (req, reply) => {
    const id = uuid.parse(req.params.id);
    const view = await fightView(db, config, id, await viewer(req));
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such fight");
    return send(reply, view);
  });
  app.post<{ Params: { id: string } }>("/api/fights/:id/bets", async (req, reply) => {
    const userId = await requireViewer(req);
    const fightId = uuid.parse(req.params.id);
    const body = BetBody.parse(req.body);
    const stake = parseSalt(body.stake);
    const r = await placeFightBet(db, config, { userId, fightId, side: body.side, stake, idempotencyKey: body.idempotencyKey });
    return send(reply, { bet: { ...r.bet, stake: r.bet.stake.toString(), returned: r.bet.returned?.toString() ?? null }, balance: r.balance, replayed: r.replayed });
  });

  // Shop and owned characters.
  app.get("/api/shop", async (_req, reply) => send(reply, await currentShop(db, config)));
  app.post("/api/shop/buy", async (req, reply) => {
    const userId = await requireViewer(req);
    const body = BuyBody.parse(req.body);
    const r = await buyCharacter(db, config, { userId, fighterId: body.fighterId, idempotencyKey: body.idempotencyKey });
    return send(reply.status(r.replayed ? 200 : 201), { character: await characterProfile(db, r.characterId), balance: r.balance, replayed: r.replayed });
  });
  app.get("/api/me/characters", async (req, reply) => send(reply, await myCharacters(db, config, await requireViewer(req))));
  app.post<{ Params: { id: string } }>("/api/characters/:id/upgrade", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = UpgradeBody.parse(req.body);
    const r = await upgradeStat(db, config, { userId, characterId, stat: body.stat, idempotencyKey: body.idempotencyKey });
    return send(reply, { character: await characterProfile(db, characterId), balance: r.balance, replayed: r.replayed });
  });
  app.post<{ Params: { id: string } }>("/api/characters/:id/sidegrade", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = SidegradeBody.parse(req.body);
    const r = await setSidegrade(db, config, { userId, characterId, sidegrade: body.sidegrade, idempotencyKey: body.idempotencyKey });
    return send(reply, { character: await characterProfile(db, characterId), balance: r.balance, replayed: r.replayed });
  });

  // Titles and overlay cosmetics.
  app.get("/api/cosmetics", async (_req, reply) => send(reply, cosmeticsCatalog()));
  app.put<{ Params: { id: string } }>("/api/characters/:id/cosmetics", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = CosmeticsBody.parse(req.body ?? {});
    const equipped = await setCosmetics(db, { userId, characterId, choice: body });
    return send(reply, { equipped: describeCosmetics(equipped), character: await characterProfile(db, characterId) });
  });

  // Exhibitions: owner-vs-owner challenges.
  app.get("/api/me/challenges", async (req, reply) => {
    const userId = await requireViewer(req);
    await expireChallenges(db, new Date());
    return send(reply, await myChallenges(db, userId));
  });
  app.get("/api/challenges/options", async (req, reply) => send(reply, await challengeOptions(db, await requireViewer(req))));
  app.post("/api/challenges", async (req, reply) => {
    const userId = await requireViewer(req);
    const body = ChallengeBody.parse(req.body);
    const r = await sendChallenge(db, config, { userId, ...body });
    return send(reply.status(r.replayed ? 200 : 201), { challengeId: r.challenge.id, replayed: r.replayed, challenges: await myChallenges(db, userId) });
  });
  for (const [path, action] of [["accept", "ACCEPT"], ["decline", "DECLINE"], ["cancel", "CANCEL"]] as const satisfies readonly (readonly [string, ChallengeAnswer])[]) {
    app.post<{ Params: { id: string } }>(`/api/challenges/:id/${path}`, async (req, reply) => {
      const userId = await requireViewer(req);
      const challengeId = uuid.parse(req.params.id);
      const c = await answerChallenge(db, { userId, challengeId, action });
      return send(reply, { status: c.status, challenges: await myChallenges(db, userId) });
    });
  }

  // Custom character names: asked for by the owner, approved by staff.
  app.post<{ Params: { id: string } }>("/api/characters/:id/name", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const { name } = NameBody.parse(req.body);
    const r = await requestCharacterName(db, config, { userId, characterId, name });
    return send(reply.status(r.replayed ? 200 : 201), { request: { id: r.request.id, name: r.request.proposedName, status: r.request.status }, replayed: r.replayed });
  });
  app.post<{ Params: { id: string } }>("/api/reviews/:id/withdraw", async (req, reply) => {
    const userId = await requireViewer(req);
    const r = await withdrawRequest(db, { userId, reviewId: uuid.parse(req.params.id) });
    return send(reply, { id: r.id, status: r.status });
  });

  // Staff: the review queue, name resets, moderators and the staff log (staff.html).
  app.get("/api/staff/queue", async (req, reply) => {
    await requireStaffViewer(req, "review");
    return send(reply, await reviewQueue(db));
  });
  for (const [path, decision] of [["approve", "APPROVE"], ["reject", "REJECT"], ["request-changes", "REQUEST_CHANGES"]] as const) {
    app.post<{ Params: { id: string } }>(`/api/staff/reviews/:id/${path}`, async (req, reply) => {
      const { id: reviewerId } = await requireStaffViewer(req, "review");
      const body = NoteBody.parse(req.body ?? undefined);
      const r = await decideReview(db, { reviewerId, reviewId: uuid.parse(req.params.id), decision, note: body?.note ?? null });
      return send(reply, { id: r.id, status: r.status });
    });
  }
  app.get<{ Querystring: { q?: string } }>("/api/staff/search", async (req, reply) => {
    await requireStaffViewer(req, "reset_names");
    return send(reply, await staffSearch(db, z.string().max(100).parse(req.query.q ?? "")));
  });
  app.post<{ Params: { id: string } }>("/api/staff/players/:id/reset-name", async (req, reply) => {
    const { id: actorId } = await requireStaffViewer(req, "reset_names");
    const body = NoteBody.parse(req.body ?? undefined);
    await resetDisplayName(db, { actorId, userId: uuid.parse(req.params.id), note: body?.note ?? "" });
    return reply.status(204).send();
  });
  app.post<{ Params: { id: string } }>("/api/staff/characters/:id/reset-name", async (req, reply) => {
    const { id: actorId } = await requireStaffViewer(req, "reset_names");
    const body = NoteBody.parse(req.body ?? undefined);
    const name = await resetCharacterName(db, { actorId, characterId: uuid.parse(req.params.id), note: body?.note ?? "" });
    return send(reply, { name });
  });
  app.get("/api/staff/log", async (req, reply) => {
    await requireStaffViewer(req, "view_log");
    return send(reply, await staffLog(db));
  });
  app.get("/api/staff/members", async (req, reply) => {
    const viewer = await requireStaffViewer(req, "view_log");
    return send(reply, await staffMembers(db, viewer.role));
  });
  app.put("/api/staff/members", async (req, reply) => {
    const { id: actorId } = await requireStaffViewer(req, "manage_moderators");
    const body = RoleBody.parse(req.body);
    const r = await setRole(db, { actorId, target: { email: body.email }, role: body.role, note: body.note ?? null });
    return send(reply, r);
  });

  // Fighter submissions (docs/PHASE3.md step 3): staff-only until GI_SUBMISSIONS_OPEN.
  app.get("/api/submissions/rules", async (req, reply) => {
    const id = await viewer(req);
    const u = id ? await db.user.findUnique({ where: { id }, select: { role: true } }) : null;
    return send(reply, submissionRules(config, u ? isStaff(u.role) : false));
  });
  app.get("/api/me/submissions", async (req, reply) => send(reply, await mySubmissions(db, await requireViewer(req))));
  app.post("/api/submissions", async (req, reply) => {
    const userId = await requireViewer(req);
    const sub = await createSubmission(db, config, { userId, details: SubmissionBody.parse(req.body) });
    return send(reply.status(201), await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });
  app.patch<{ Params: { id: string } }>("/api/submissions/:id", async (req, reply) => {
    const userId = await requireViewer(req);
    const sub = await updateSubmission(db, config, { userId, submissionId: uuid.parse(req.params.id), details: SubmissionBody.parse(req.body) });
    return send(reply, await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });
  app.get<{ Params: { id: string } }>("/api/submissions/:id", async (req, reply) => {
    const userId = await requireViewer(req);
    const u = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    const view = await submissionDetail(db, uuid.parse(req.params.id), { id: userId, staff: u ? isStaff(u.role) : false });
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such submission");
    return send(reply, view);
  });
  app.put<{ Params: { id: string }; Querystring: { role?: string; label?: string } }>("/api/submissions/:id/files", async (req, reply) => {
    const userId = await requireViewer(req);
    const q = FileQuery.parse(req.query);
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "send the PNG image as the request body (content-type: image/png)");
    const file = await addSubmissionFile(db, config, store, { userId, submissionId: uuid.parse(req.params.id), role: q.role, label: q.label, bytes: req.body });
    return send(reply.status(201), { id: file.id, role: file.role, label: file.label, width: file.width, height: file.height, bytes: file.bytes });
  });
  app.delete<{ Params: { id: string; fileId: string } }>("/api/submissions/:id/files/:fileId", async (req, reply) => {
    const userId = await requireViewer(req);
    await removeSubmissionFile(db, config, { userId, submissionId: uuid.parse(req.params.id), fileId: uuid.parse(req.params.fileId) });
    return reply.status(204).send();
  });
  app.get<{ Params: { id: string; fileId: string } }>("/api/submissions/:id/files/:fileId", async (req, reply) => {
    const viewerId = await requireViewer(req);
    const bytes = await readSubmissionFile(db, store, { viewerId, submissionId: uuid.parse(req.params.id), fileId: uuid.parse(req.params.fileId) });
    return reply
      .header("content-type", "image/png")
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'")
      .header("cache-control", "private, max-age=3600")
      .send(bytes);
  });
  app.post<{ Params: { id: string } }>("/api/submissions/:id/submit", async (req, reply) => {
    const userId = await requireViewer(req);
    const sub = await sendForReview(db, config, { userId, submissionId: uuid.parse(req.params.id), confirmRights: SubmitBody.parse(req.body).confirmRights });
    return send(reply, await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });
  app.post<{ Params: { id: string } }>("/api/submissions/:id/withdraw", async (req, reply) => {
    const userId = await requireViewer(req);
    const sub = await withdrawSubmission(db, { userId, submissionId: uuid.parse(req.params.id) });
    return send(reply, await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });

  // Tournaments: bracket, T-Salt standings and podium.
  app.get("/api/tournaments", async (_req, reply) => send(reply, await recentTournaments(db)));
  app.get("/api/tournaments/current", async (req, reply) => {
    const id = await currentTournamentId(db);
    return send(reply, id ? await tournamentView(db, id, await viewer(req)) : null);
  });
  app.get<{ Params: { id: string } }>("/api/tournaments/:id", async (req, reply) => {
    const view = await tournamentView(db, uuid.parse(req.params.id), await viewer(req));
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such tournament");
    return send(reply, view);
  });

  // What the watch page embeds.
  app.get("/api/site", async (_req, reply) => send(reply, { twitchChannel: deps.twitchChannel ?? null }));

  app.get("/api/results", async (_req, reply) => send(reply, await recentResults(db)));
  app.get("/api/leaderboard", async (_req, reply) => send(reply, await leaderboard(db, config)));

  // Seasons: the running one with live standings, and past ones with their final standings.
  app.get("/api/seasons", async (_req, reply) => send(reply, await recentSeasons(db)));
  app.get("/api/seasons/current", async (req, reply) => send(reply, await seasonView(db, config, null, await viewer(req))));
  app.get<{ Params: { number: string } }>("/api/seasons/:number", async (req, reply) => {
    const view = await seasonView(db, config, z.coerce.number().int().min(1).max(1_000_000).parse(req.params.number), await viewer(req));
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such season");
    return send(reply, view);
  });
  app.get("/api/characters", async (_req, reply) => send(reply, await characterRanking(db)));
  app.get<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    const id = uuid.parse(req.params.id);
    if (!(await db.character.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "NOT_FOUND", "no such character");
    return send(reply, await characterProfile(db, id));
  });

  // Live updates: state changes, odds, engine events and results.
  // Open streams are ended on shutdown; otherwise close() would wait on them forever.
  const streams = new Set<import("node:http").ServerResponse>();
  app.addHook("preClose", async () => {
    for (const res of streams) res.end();
  });
  app.get("/api/stream", (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    streams.add(res);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const write = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${toJson(data)}\n\n`);
    write("hello", { at: new Date().toISOString() });
    const unsubscribe = bus.subscribe((e: BusEvent) => write(e.type, e));
    const heartbeat = setInterval(() => res.write(`: keep-alive\n\n`), deps.heartbeatMs ?? 15_000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      streams.delete(res);
    });
  });

  await app.register(fastifyStatic, { root: deps.webRoot ?? path.join(REPO_ROOT, "apps", "web"), index: ["index.html"] });
  return app;
}
