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
import { LedgerRuleError, MoneyError, parseSalt, SIDEGRADES, UPGRADE_STATS, type Config } from "@greed-island/shared";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import path from "node:path";
import { z } from "zod";
import { placeFightBet } from "../betting.ts";
import type { BusEvent, FightBus } from "../bus.ts";
import { ConsoleMailer, signInMail, type Mailer } from "../mail.ts";
import { buyCharacter, currentShop } from "../shop.ts";
import { setSidegrade, upgradeStat } from "../upgrades.ts";
import { betHistory, characterProfile, characterRanking, currentFightId, fightView, leaderboard, meView, myCharacters, recentResults } from "./views.ts";

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
  const app = Fastify({ logger: deps.logger ?? false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
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

  app.get("/api/results", async (_req, reply) => send(reply, await recentResults(db)));
  app.get("/api/leaderboard", async (_req, reply) => send(reply, await leaderboard(db)));
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
