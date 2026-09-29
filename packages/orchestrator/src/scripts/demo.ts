// `pnpm demo`: the full match cycle with no IKEMEN install. Uses the dev
// database and the fake engine; three demo players bet on every fight.
// Exits non-zero unless >= 10 fights settle, at least one is voided, and the
// ledger audit passes.
import { auditLedger, claimBailout, claimDailyGrant, createDb, createUser, getBalance, loadRepoEnv, openStakes, type Db } from "@greed-island/db";
import { createFakeSource, loadEngineConfig } from "@greed-island/engine";
import { formatMultiplier, loadConfig, TITLES, type Side } from "@greed-island/shared";
import { randomInt, randomUUID } from "node:crypto";
import { placeFightBet } from "../betting.ts";
import { FightBus } from "../bus.ts";
import { loadOrchestratorConfig } from "../config.ts";
import { acquireOrchestratorLock } from "../lock.ts";
import { Orchestrator } from "../orchestrator.ts";
import { reconcile } from "../reconcile.ts";

loadRepoEnv();
const FIGHTS = 12;
const FORCED_CRASH = 4; // the 4th fight's engine "crashes", to show a void and refunds
const config = loadConfig();
const engineCfg = loadEngineConfig();
const orch = { ...loadOrchestratorConfig(), bettingWindowMs: 1_500, interFightDelayMs: 200 };
const db: Db = createDb();
const lock = await acquireOrchestratorLock(process.env["DATABASE_URL"]!);

const out = (s = "") => console.log(s);
const pad = (s: string | number, n: number) => String(s).padEnd(n);

try {
  const cleaned = await reconcile({ db, config, orch, bus: new FightBus(), now: () => new Date() });
  if (cleaned.length) out(`Cleaned up ${cleaned.length} unfinished fight(s) from an earlier run.`);

  // Three demo players (reused across runs).
  const players: { id: string; name: string }[] = [];
  for (const name of ["Alice", "Bob", "Cara"]) {
    const email = `${name.toLowerCase()}@demo.greed-island.local`;
    const existing = await db.user.findUnique({ where: { email } });
    const user = existing ?? (await createUser(db, { kind: "EMAIL", email, displayName: name }, config.economy)).user;
    await claimDailyGrant(db, user.id, config.economy);
    players.push({ id: user.id, name });
  }
  const startedAt = new Date();

  const bus = new FightBus();
  const betsByFight = new Map<string, Map<string, { side: Side; stake: bigint }>>();
  bus.subscribe(async (e) => {
    if (e.type !== "fight_state" || e.state !== "BETTING_OPEN") return;
    const bets = new Map<string, { side: Side; stake: bigint }>();
    betsByFight.set(e.fightId, bets);
    for (const p of players) {
      try {
        if ((await getBalance(db, p.id)) < config.economy.bailoutFloor && (await openStakes(db, p.id)) === 0n) {
          await claimBailout(db, p.id, config.economy);
        }
        const balance = await getBalance(db, p.id);
        if (balance < 1n) continue;
        const side: Side = randomInt(2) === 0 ? 1 : 2;
        const stake = (balance * BigInt(5 + randomInt(21))) / 100n || 1n;
        await placeFightBet(db, config, { userId: p.id, fightId: e.fightId, side, stake, idempotencyKey: randomUUID() });
        bets.set(p.id, { side, stake });
        // Sometimes change their mind: only the latest bet counts.
        if (randomInt(4) === 0) {
          const flipped: Side = side === 1 ? 2 : 1;
          await placeFightBet(db, config, { userId: p.id, fightId: e.fightId, side: flipped, stake, idempotencyKey: randomUUID() });
          bets.set(p.id, { side: flipped, stake });
        }
      } catch (err) {
        out(`  (${p.name} couldn't bet: ${(err as Error).message})`);
      }
    }
  });

  let fightNo = 0;
  const source = createFakeSource({
    seed: randomUUID(),
    eventDelayMs: 40,
    drawRoundRate: 0.1,
    timeoutMs: 1_000,
    script: () => (++fightNo === FORCED_CRASH ? { rounds: [{ winnerSide: 1, reason: "ko" }], ending: "crash" } : undefined),
  });

  out(`Greed Island demo: ${FIGHTS} fights, fake engine (ENGINE_MODE is "${engineCfg.mode}", ignored here), 3 players.\n`);
  const orchestrator = new Orchestrator({ db, config, orch, bus, now: () => new Date(), source });
  const summaries = await orchestrator.run(FIGHTS);

  for (const s of summaries) {
    const f = await db.fight.findUniqueOrThrow({ where: { id: s.fightId }, include: { loadouts: { orderBy: { side: "asc" } }, odds: true } });
    const [l1, l2] = f.loadouts;
    const odds = f.odds ? `${formatMultiplier(BigInt(f.odds.multiplierBp1))} / ${formatMultiplier(BigInt(f.odds.multiplierBp2))}` : "-";
    const result = s.result === "SETTLED" ? `${s.winnerSide === 1 ? l1!.name : l2!.name} wins` : `VOID (${s.voidReason})`;
    out(`#${pad(f.number, 4)} ${pad(`${l1!.name} [${l1!.tier} ${Math.round(l1!.rating)}]`, 28)} vs ${pad(`${l2!.name} [${l2!.tier} ${Math.round(l2!.rating)}]`, 28)} odds ${pad(odds, 14)} ${result}`);
    const bets = await db.bet.findMany({ where: { fightId: f.id } });
    for (const b of bets) {
      const p = players.find((x) => x.id === b.userId);
      if (!p) continue;
      const back = b.returned === null ? "?" : b.returned.toFixed(0);
      out(`       ${pad(p.name, 6)} bet ${pad(b.stake.toFixed(0), 5)} on side ${b.side}  → ${b.status.toLowerCase()} ${b.status === "LOST" ? "" : `(${back} back)`}`);
    }
  }

  out("\nPlayers:");
  for (const p of players) out(`  ${pad(p.name, 6)} ${await getBalance(db, p.id)} Salt`);

  out("\nHouse characters:");
  const chars = await db.character.findMany({ where: { ownerKind: "HOUSE" }, orderBy: { rating: "desc" } });
  for (const c of chars) out(`  ${pad(c.name, 22)} tier ${c.tier}  rating ${pad(Math.round(c.rating), 5)} ±${pad(Math.round(c.deviation), 4)} ${c.wins}-${c.losses}`);
  const tierChanges = await db.tierHistory.findMany({ where: { createdAt: { gte: startedAt }, reason: "RATING" }, include: { character: true }, orderBy: { id: "asc" } });
  out(`\nTier changes this run: ${tierChanges.length}`);
  for (const t of tierChanges) out(`  ${t.character.name}: ${t.fromTier} → ${t.toTier} (rating ${Math.round(t.rating)})`);
  const titles = await db.characterTitle.findMany({ where: { earnedAt: { gte: startedAt } }, include: { character: true, fight: true }, orderBy: { id: "asc" } });
  out(`\nTitles earned this run: ${titles.length}`);
  for (const t of titles) out(`  ${t.character.name}: ${TITLES[t.code].label} (fight #${t.fight?.number ?? "?"})`);

  const audit = await auditLedger(db);
  const settled = summaries.filter((s) => s.result === "SETTLED").length;
  const voided = summaries.length - settled;
  out(`\nFights: ${settled} settled, ${voided} voided.`);
  out(`Ledger audit: ${audit.ok ? "OK" : "FAILED"} (issued ${audit.stats.issued} = players ${audit.stats.userBalances} + escrow ${audit.stats.escrow} + house ${audit.stats.house} + spent ${audit.stats.sink})`);
  for (const p of audit.problems) out(`  FAIL [${p.check}] ${p.detail}`);
  if (!audit.ok || settled < 10 || voided < 1) process.exitCode = 1;
} finally {
  await lock.release();
  await db.$disconnect();
}
