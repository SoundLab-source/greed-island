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
  goalWorld,
  swapGoal,
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
  FILE_ROLE_RULES,
  FILE_ROLES,
  isStaff,
  RIGHTS_BASES,
  TITLE_CODES,
  UPGRADE_STATS,
  type Config,
  type StaffPermission,
} from "@greed-island/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { GUIDE_FILE, POSE_GUIDE_FILE, TEMPLATES } from "@greed-island/engine";
import { readFile } from "node:fs/promises";
import { installRateLimits, installSecurityHeaders, type RateLimitConfig } from "./security.ts";
import path from "node:path";
import { z } from "zod";
import { announceBet, placeFightBet } from "../betting.ts";
import type { BusEvent, FightBus } from "../bus.ts";
import { answerChallenge, expireChallenges, sendChallenge, type ChallengeAnswer } from "../challenges.ts";
import { setCosmetics } from "../cosmetics.ts";
import { ConsoleMailer, signInMail, type Mailer } from "../mail.ts";
import { buyCharacter, currentShop } from "../shop.ts";
import { loadSubmissionStore, type SubmissionStore } from "../submission-store.ts";
import { addSubmissionFile, createSubmission, readSubmissionFile, removeSubmissionFile, sendForReview, updateSubmission, withdrawSubmission } from "../submissions.ts";
import { requestSubmissionCheck } from "../submission-checks.ts";
import { submissionCharacterId } from "../own-art.ts";
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
  goalSettings,
  goalsJson,
  meView,
  myChallenges,
  myCharacters,
  recentResults,
  recentTournaments,
  tournamentView,
} from "./views.ts";
import { leaderboard, recentSeasons, seasonView } from "./season-views.ts";
import { latestCheck, mySubmissions, submissionDetail, submissionRules } from "./submission-views.ts";
import { ballotView } from "./ballot-views.ts";
import { rosterView } from "./roster-view.ts";
import { castVote, retractVote } from "../voting.ts";
import {
  applyLook,
  createWalletChallenge,
  listCollections,
  listWallets,
  myNfts,
  readLookImage,
  removeLook,
  setCollection,
  submitFromNft,
  unlinkWallet,
  verifyWallet,
} from "../holders.ts";
import { LOOK_IMAGE_TYPES, loadLookStore, type LookStore } from "../look-images.ts";
import { characterCardData, fighterCardData, renderCard, type CardData } from "../cards.ts";
import { collectionView, markSeen } from "../collection.ts";
import { callBoards, myBettorStats } from "../bettor-stats.ts";
import { recapFor, recapLines } from "../recap.ts";
import { shareImage } from "../share-image.ts";
import { fillSharePage, shareMeta } from "./share-page.ts";
import { lookCharacterId } from "../look-sprites.ts";
import { imageFetcher, type ImageFetcher } from "../image-fetch.ts";
import { loadNftSource, NftSourceError, type NftSource } from "../nft-source.ts";
import { reviewQueue, staffLog, staffMembers, staffSearch } from "./staff-views.ts";

export interface ApiDeps {
  db: Db;
  config: Config;
  bus: FightBus;
  /** Folder served at / (the player site). Defaults to apps/web. */
  webRoot?: string;
  /** IKEMEN install, for fighter pictures (`card.png` next to a generated character). */
  ikemenDir?: string;
  /** Rate limits per client address; null or missing turns them off (tests). Production uses loadRateLimits(). */
  rateLimits?: RateLimitConfig | null;
  /** Which proxies to believe about the client's address (Fastify trustProxy). Default "loopback": a tunnel or proxy on this machine. */
  trustProxy?: boolean | string | string[];
  /** The health check reports "stalled" when no fight has changed state for this long (default 20 minutes). */
  stallAfterMs?: number;
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
  /** GI_LOCAL_VIDEO: the watch page plays OBS's Virtual Camera instead of Twitch (local-video.ts). */
  localVideo?: boolean;
  /** Where submitted fighter images are stored. Defaults to GI_SUBMISSIONS_DIR or `submissions/`. */
  submissionStore?: SubmissionStore;
  /** Called when a run of the automatic checks was queued, so the worker looks now instead of at its next tick. */
  onCheckQueued?: () => void;
  /** Where NFT holdings are read (a DAS endpoint). Defaults to GI_SOLANA_RPC_URL; null turns NFT features off. */
  nftSource?: NftSource | null;
  /** Downloads NFT images. Defaults to a guarded https fetch. */
  images?: ImageFetcher;
  /** Where NFT look images are kept. Defaults to GI_LOOKS_DIR or `looks/`. */
  lookStore?: LookStore;
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
const WalletChallengeBody = z.object({ address: z.string().max(64) });
const WalletVerifyBody = z.object({ nonce: z.string().regex(/^[0-9a-f]{32}$/), signature: z.string().max(200) });
const FromNftBody = z.object({ assetId: z.string().min(1).max(64), archetype: z.enum(ARCHETYPES).optional() });
const CollectionBody = z
  .object({
    address: z.string().max(64),
    name: z.string().max(100),
    licenceUrl: z.string().max(500).nullable().default(null),
    licenceNote: z.string().max(1000).default(""),
    submissionsAllowed: z.boolean().default(false),
    looksAllowed: z.boolean().default(false),
    fighterId: z.string().max(64).nullable().default(null),
    enabled: z.boolean().default(true),
  })
  .strict();
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
  const nftSource = deps.nftSource === undefined ? loadNftSource() : deps.nftSource;
  const images = deps.images ?? imageFetcher(config.submissions.maxFileBytes);
  const looks = deps.lookStore ?? loadLookStore();
  const app = Fastify({ logger: deps.logger ?? false, trustProxy: deps.trustProxy ?? "loopback" });
  if (deps.rateLimits) installRateLimits(app, deps.rateLimits);
  installSecurityHeaders(app, { https: publicUrl.startsWith("https://"), camera: deps.localVideo === true });
  const startedAt = Date.now();
  // Submission images arrive as the raw PNG body (checked in pngInfo; the content type isn't trusted).
  app.addContentTypeParser(["image/png", "application/octet-stream"], { parseAs: "buffer", bodyLimit: config.submissions.maxFileBytes + 1024 }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ForbiddenError) return reply.status(403).send({ error: "FORBIDDEN", message: err.message });
    if (err instanceof NftSourceError) return reply.status(502).send({ error: "NFT_SERVICE", message: err.message });
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
  // A bettor's own numbers (bettor-stats.ts), and the best-calls boards (public; the viewer's own line when signed in).
  app.get("/api/me/stats", async (req, reply) => send(reply, await myBettorStats(db, config, await requireViewer(req))));
  app.get("/api/boards/calls", async (req, reply) => send(reply, await callBoards(db, config, await viewer(req))));
  // What happened since a moment (recap.ts): "while you were away", and a long session's own recap.
  app.get<{ Querystring: { since?: string } }>("/api/me/recap", async (req, reply) => {
    const userId = await requireViewer(req);
    const since = z.coerce.date().parse(req.query.since);
    const recap = await recapFor(db, config, userId, since);
    return send(reply, { ...recap, lines: recapLines(recap) });
  });
  // The card collection (collection.ts): every fighter's card, and which ones this player has seen fight or backed.
  app.get("/api/me/collection", async (req, reply) => send(reply, await collectionView(db, await requireViewer(req))));
  // The watch page reports each fight it showed while it was on: both fighters join the player's collection.
  app.post("/api/me/seen", async (req, reply) => {
    const userId = await requireViewer(req);
    const { fightId } = z.object({ fightId: z.string().uuid() }).parse(req.body);
    const r = await markSeen(db, userId, fightId);
    if (!r) throw new HttpError(404, "NOT_FOUND", "no such fight");
    return send(reply, r);
  });
  app.post("/api/me/daily-grant", async (req, reply) => {
    const userId = await requireViewer(req);
    const r = await claimDailyGrant(db, userId, config.economy);
    return send(reply, { status: r.status, amount: r.amount, balance: r.balance });
  });
  // Swap one of today's unfinished daily goals for another (once a day; goals.ts).
  app.post("/api/me/goals/swap", async (req, reply) => {
    const userId = await requireViewer(req);
    const { slot } = z.object({ slot: z.number().int().min(0).max(2) }).parse(req.body);
    const r = await swapGoal(db, userId, slot, goalSettings(config), await goalWorld(db, config.exhibitions.rivalryRate));
    return send(reply, { goals: goalsJson(r.view), paid: r.paid.map((p) => ({ label: p.label, amount: p.amount.toString() })) });
  });
  app.post("/api/me/bailout", async (req, reply) => {
    const userId = await requireViewer(req);
    const r = await claimBailout(db, userId, config.economy);
    return send(reply, { status: r.status, amount: r.amount, balance: r.balance });
  });

  app.get("/api/fights/current", async (req, reply) => {
    const id = await currentFightId(db);
    return send(reply, id ? await fightView(db, config, id, await viewer(req), deps.ikemenDir) : null);
  });
  app.get<{ Params: { id: string } }>("/api/fights/:id", async (req, reply) => {
    const id = uuid.parse(req.params.id);
    const view = await fightView(db, config, id, await viewer(req), deps.ikemenDir);
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such fight");
    return send(reply, view);
  });
  app.post<{ Params: { id: string } }>("/api/fights/:id/bets", async (req, reply) => {
    const userId = await requireViewer(req);
    const fightId = uuid.parse(req.params.id);
    const body = BetBody.parse(req.body);
    const stake = parseSalt(body.stake);
    const r = await placeFightBet(db, config, { userId, fightId, side: body.side, stake, idempotencyKey: body.idempotencyKey });
    if (!r.replayed) await announceBet(db, config, bus, r.bet).catch((e: Error) => req.log.warn(`couldn't announce a bet: ${e.message}`));
    return send(reply, { bet: { ...r.bet, stake: r.bet.stake.toString(), returned: r.bet.returned?.toString() ?? null }, balance: r.balance, replayed: r.replayed });
  });

  // Shop and owned characters.
  app.get("/api/shop", async (_req, reply) => send(reply, await currentShop(db, config)));
  app.post("/api/shop/buy", async (req, reply) => {
    const userId = await requireViewer(req);
    const body = BuyBody.parse(req.body);
    const r = await buyCharacter(db, config, { userId, fighterId: body.fighterId, idempotencyKey: body.idempotencyKey });
    return send(reply.status(r.replayed ? 200 : 201), { character: await characterProfile(db, r.characterId, config.tiers), balance: r.balance, replayed: r.replayed });
  });
  app.get("/api/me/characters", async (req, reply) => send(reply, await myCharacters(db, config, await requireViewer(req))));
  app.post<{ Params: { id: string } }>("/api/characters/:id/upgrade", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = UpgradeBody.parse(req.body);
    const r = await upgradeStat(db, config, { userId, characterId, stat: body.stat, idempotencyKey: body.idempotencyKey });
    return send(reply, { character: await characterProfile(db, characterId, config.tiers), balance: r.balance, replayed: r.replayed });
  });
  app.post<{ Params: { id: string } }>("/api/characters/:id/sidegrade", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = SidegradeBody.parse(req.body);
    const r = await setSidegrade(db, config, { userId, characterId, sidegrade: body.sidegrade, idempotencyKey: body.idempotencyKey });
    return send(reply, { character: await characterProfile(db, characterId, config.tiers), balance: r.balance, replayed: r.replayed });
  });

  // Titles and overlay cosmetics.
  app.get("/api/cosmetics", async (_req, reply) => send(reply, cosmeticsCatalog()));
  app.put<{ Params: { id: string } }>("/api/characters/:id/cosmetics", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const body = CosmeticsBody.parse(req.body ?? {});
    const equipped = await setCosmetics(db, { userId, characterId, choice: body });
    return send(reply, { equipped: describeCosmetics(equipped), character: await characterProfile(db, characterId, config.tiers) });
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
    // Public once the fighter is on a ballot; otherwise the submitter's and staff's.
    const viewerId = await viewer(req);
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
    deps.onCheckQueued?.();
    return send(reply, await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });
  // Staff: the picture of a submission's fighter as built from its own art (by its automatic checks), in its main colours or `?outfit=2` onwards.
  app.get<{ Params: { id: string }; Querystring: { outfit?: string } }>("/api/staff/submissions/:id/card", async (req, reply) => {
    await requireStaffViewer(req, "review");
    const outfit = z.coerce.number().int().min(1).max(1 + FILE_ROLE_RULES.PALETTE.max).default(1).parse(req.query.outfit);
    const sub = await db.submission.findUnique({ where: { id: uuid.parse(req.params.id) }, select: { number: true } });
    const file = outfit === 1 ? "card.png" : `card-${outfit}.png`;
    const bytes = sub && deps.ikemenDir ? await readFile(path.join(deps.ikemenDir, "chars", submissionCharacterId(sub.number), file)).catch(() => null) : null;
    if (!bytes) throw new HttpError(404, "NOT_FOUND", "this submission's fighter hasn't been built");
    return reply.type("image/png").header("cache-control", "private, no-cache").send(bytes);
  });
  // Staff: run the automatic checks (smoke test, template check, balance simulation) on a submission again.
  app.post<{ Params: { id: string } }>("/api/staff/submissions/:id/checks", async (req, reply) => {
    const { id: actorId } = await requireStaffViewer(req, "review");
    const run = await requestSubmissionCheck(db, { actorId, submissionId: uuid.parse(req.params.id) });
    deps.onCheckQueued?.();
    return send(reply.status(202), await latestCheck(db, run.submissionId));
  });
  app.post<{ Params: { id: string } }>("/api/submissions/:id/withdraw", async (req, reply) => {
    const userId = await requireViewer(req);
    const sub = await withdrawSubmission(db, { userId, submissionId: uuid.parse(req.params.id) });
    return send(reply, await submissionDetail(db, sub.id, { id: userId, staff: false }));
  });

  // Holders (docs/PHASE3.md step 7): link a wallet by signing a message, list NFTs, submit from one. Read-only.
  app.get("/api/me/wallets", async (req, reply) => send(reply, await listWallets(db, await requireViewer(req))));
  app.post("/api/me/wallets/challenge", async (req, reply) => {
    const userId = await requireViewer(req);
    return send(reply, await createWalletChallenge(db, config, { userId, address: WalletChallengeBody.parse(req.body).address }));
  });
  app.post("/api/me/wallets/verify", async (req, reply) => {
    const userId = await requireViewer(req);
    const body = WalletVerifyBody.parse(req.body);
    // The signature arrives as base64 (64 bytes).
    const signature = Buffer.from(body.signature, "base64");
    const wallet = await verifyWallet(db, config, { userId, nonce: body.nonce, signature });
    return send(reply, { wallet: { id: wallet.id, chain: wallet.chain, address: wallet.address, verifiedAt: wallet.verifiedAt }, wallets: await listWallets(db, userId) });
  });
  app.delete<{ Params: { id: string } }>("/api/me/wallets/:id", async (req, reply) => {
    await unlinkWallet(db, { userId: await requireViewer(req), walletId: uuid.parse(req.params.id) });
    return reply.status(204).send();
  });
  app.get("/api/me/nfts", async (req, reply) => send(reply, await myNfts(db, nftSource, await requireViewer(req))));
  app.get("/api/nft/collections", async (_req, reply) => send(reply, await listCollections(db, { includeDisabled: false })));
  app.post("/api/submissions/from-nft", async (req, reply) => {
    const userId = await requireViewer(req);
    const body = FromNftBody.parse(req.body);
    const r = await submitFromNft(db, config, { source: nftSource, store, images }, { userId, assetId: body.assetId, ...(body.archetype ? { archetype: body.archetype } : {}) });
    return send(reply.status(201), { portrait: r.portrait, submission: await submissionDetail(db, r.submission.id, { id: userId, staff: false }) });
  });
  // NFT looks: an owner dresses their copy of their community's fighter in an NFT they hold.
  app.post<{ Params: { id: string } }>("/api/characters/:id/look", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    const { assetId } = z.object({ assetId: z.string().min(1).max(64) }).parse(req.body);
    const r = await applyLook(db, { source: nftSource, images, looks, ikemenDir: deps.ikemenDir ?? null }, { userId, characterId, assetId });
    return send(reply.status(r.replayed ? 200 : 201), { replayed: r.replayed, spritesProblem: r.spritesProblem, character: await characterProfile(db, characterId, config.tiers) });
  });
  app.delete<{ Params: { id: string } }>("/api/characters/:id/look", async (req, reply) => {
    const userId = await requireViewer(req);
    const characterId = uuid.parse(req.params.id);
    await removeLook(db, { userId, characterId });
    return send(reply, { character: await characterProfile(db, characterId, config.tiers) });
  });
  // A look's picture of the fighter in the NFT's colours (public, like the look itself).
  app.get<{ Params: { id: string } }>("/api/looks/:id/card", async (req, reply) => {
    const id = uuid.parse(req.params.id);
    const look = await db.nftLook.findUnique({ where: { id }, select: { defPath: true } });
    const bytes = look?.defPath && deps.ikemenDir ? await readFile(path.join(deps.ikemenDir, "chars", lookCharacterId(id), "card.png")).catch(() => null) : null;
    if (!bytes) throw new HttpError(404, "NOT_FOUND", "this look has no picture of its fighter");
    return reply.type("image/png").header("cache-control", "public, max-age=86400").send(bytes);
  });
  app.get<{ Params: { id: string } }>("/api/looks/:id/image", async (req, reply) => {
    const { bytes, type } = await readLookImage(db, looks, uuid.parse(req.params.id));
    return reply
      .header("content-type", LOOK_IMAGE_TYPES[type])
      .header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'")
      .header("cache-control", "public, max-age=86400")
      .send(bytes);
  });
  app.get("/api/staff/collections", async (req, reply) => {
    await requireStaffViewer(req, "view_log");
    return send(reply, await listCollections(db, { includeDisabled: true }));
  });
  app.put("/api/staff/collections", async (req, reply) => {
    const { id: actorId } = await requireStaffViewer(req, "manage_collections");
    return send(reply, await setCollection(db, { actorId, collection: CollectionBody.parse(req.body) }));
  });

  // Voting: the season ballot (docs/PHASE3.md step 5).
  app.get("/api/ballot/current", async (req, reply) => send(reply, await ballotView(db, config, null, await viewer(req))));
  app.get<{ Params: { season: string } }>("/api/ballots/:season", async (req, reply) => {
    const view = await ballotView(db, config, z.coerce.number().int().min(1).max(1_000_000).parse(req.params.season), await viewer(req));
    if (!view) throw new HttpError(404, "NOT_FOUND", "no such season");
    return send(reply, view);
  });
  app.post("/api/ballot/votes", async (req, reply) => {
    const userId = await requireViewer(req);
    const { submissionId } = z.object({ submissionId: z.string().uuid() }).parse(req.body);
    const r = await castVote(db, config, { userId, submissionId });
    return send(reply.status(r.replayed ? 200 : 201), { replayed: r.replayed, ballot: await ballotView(db, config, null, userId) });
  });
  app.delete<{ Params: { submissionId: string } }>("/api/ballot/votes/:submissionId", async (req, reply) => {
    const userId = await requireViewer(req);
    await retractVote(db, { userId, submissionId: uuid.parse(req.params.submissionId) });
    return send(reply, { ballot: await ballotView(db, config, null, userId) });
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
  app.get("/api/site", async (_req, reply) => send(reply, { twitchChannel: deps.twitchChannel ?? null, localVideo: deps.localVideo === true, bigBet: config.bets.bigBet }));

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
  // Every fighter on the stream with its outfits and special moves (the roster gallery).
  app.get("/api/roster", async (_req, reply) => send(reply, await rosterView(db, deps.ikemenDir)));
  // A fighter's picture for the website: card.png in its own character folder
  // (written by pnpm templates:build); fighters without one get a 404 and the page shows a placeholder.
  // `?outfit=n` (2 onwards) is that outfit's picture (card-n.png), or the main one when it has none.
  app.get<{ Params: { id: string }; Querystring: { outfit?: string } }>("/api/fighters/:id/image", async (req, reply) => {
    const fighter = await db.fighter.findUnique({ where: { id: z.string().min(1).max(100).parse(req.params.id) }, select: { defPath: true } });
    const outfit = z.coerce.number().int().min(1).max(64).default(1).parse(req.query.outfit);
    if (!fighter || !deps.ikemenDir) throw new HttpError(404, "NOT_FOUND", "no picture for this fighter");
    const chars = path.resolve(deps.ikemenDir, "chars");
    const file = path.resolve(deps.ikemenDir, path.dirname(fighter.defPath), "card.png");
    if (!file.startsWith(chars + path.sep)) throw new HttpError(404, "NOT_FOUND", "no picture for this fighter");
    const bytes = (outfit > 1 ? await readFile(path.join(path.dirname(file), `card-${outfit}.png`)).catch(() => null) : null) ?? (await readFile(file).catch(() => null));
    if (!bytes) throw new HttpError(404, "NOT_FOUND", "no picture for this fighter");
    return reply.type("image/png").header("cache-control", "public, max-age=3600").send(bytes);
  });
  // Fighter cards (cards.ts): a fighter's, with its base numbers, and an owned (or house) character's, with its own.
  // SVG with its picture inside, so the same image works as an <img> anywhere and, later, as an NFT's picture.
  const sendCard = (reply: FastifyReply, card: CardData | null) => {
    if (!card) throw new HttpError(404, "NOT_FOUND", "no such fighter");
    return reply.type("image/svg+xml").header("cache-control", "public, max-age=60").send(renderCard(card));
  };
  app.get<{ Params: { id: string } }>("/api/cards/fighters/:id", async (req, reply) =>
    sendCard(reply, await fighterCardData(db, deps.ikemenDir, z.string().min(1).max(100).parse(req.params.id))),
  );
  app.get<{ Params: { id: string } }>("/api/cards/characters/:id", async (req, reply) => sendCard(reply, await characterCardData(db, deps.ikemenDir, uuid.parse(req.params.id))));
  // A shared card's preview picture (share-image.ts): a PNG, since link previews don't show SVG.
  app.get<{ Params: { id: string } }>("/api/cards/characters/:id/share.png", async (req, reply) => {
    const card = await characterCardData(db, deps.ikemenDir, uuid.parse(req.params.id));
    if (!card) throw new HttpError(404, "NOT_FOUND", "no such fighter");
    return reply.type("image/png").header("cache-control", "public, max-age=300").send(shareImage(card));
  });
  // The share page for a character's card (apps/web/card.html), with the link-preview tags filled in for it.
  const webRoot = deps.webRoot ?? path.join(REPO_ROOT, "apps", "web");
  app.get<{ Params: { id: string } }>("/card/:id", async (req, reply) => {
    const id = uuid.safeParse(req.params.id);
    const card = id.success ? await characterCardData(db, deps.ikemenDir, id.data) : null;
    if (!id.success || !card) throw new HttpError(404, "NOT_FOUND", "no such card");
    const html = fillSharePage(await readFile(path.join(webRoot, "card.html"), "utf8"), shareMeta(card, id.data, publicUrl));
    return reply.type("text/html; charset=utf-8").header("cache-control", "no-cache").send(html);
  });
  // The guide sheet artists draw a fighter of this archetype on (written by pnpm templates:build next to the template).
  // An archetype's guide sheet, or with ?sheet=pose its pose guide (for intros and win poses).
  app.get<{ Params: { archetype: string }; Querystring: { sheet?: string } }>("/api/guides/:archetype", async (req, reply) => {
    const spec = TEMPLATES.find((t) => t.archetype === req.params.archetype);
    const pose = z.enum(["main", "pose"]).default("main").parse(req.query.sheet) === "pose";
    const bytes = spec && deps.ikemenDir ? await readFile(path.join(deps.ikemenDir, "chars", spec.id, pose ? POSE_GUIDE_FILE : GUIDE_FILE)).catch(() => null) : null;
    if (!spec || !bytes) throw new HttpError(404, "NOT_FOUND", "no guide sheet for that archetype on this server");
    return reply
      .type("image/png")
      .header("content-disposition", `attachment; filename="greed-island-${pose ? "pose-guide" : "guide"}-${spec.name.toLowerCase()}.png"`)
      .header("cache-control", "public, max-age=3600")
      .send(bytes);
  });
  app.get<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    const id = uuid.parse(req.params.id);
    if (!(await db.character.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, "NOT_FOUND", "no such character");
    return send(reply, await characterProfile(db, id, config.tiers));
  });

  // For uptime monitors: the database answers, and fights are still moving.
  app.get("/api/health", async (_req, reply) => {
    try {
      await db.$queryRaw`select 1`;
    } catch {
      return reply.status(503).send({ ok: false, db: false });
    }
    const last = await db.fightTransition.findFirst({ orderBy: { id: "desc" }, select: { createdAt: true } });
    const stalled = last !== null && Date.now() - last.createdAt.getTime() > (deps.stallAfterMs ?? 20 * 60_000);
    return reply.status(stalled ? 503 : 200).send({ ok: !stalled, db: true, stalled, lastFightActivity: last?.createdAt ?? null, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
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

  await app.register(fastifyStatic, { root: webRoot, index: ["index.html"] });
  return app;
}
