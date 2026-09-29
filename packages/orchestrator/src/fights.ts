/**
 * Fight persistence: booking, and applying state transitions. Each transition
 * runs in one DB transaction that (1) takes the fight's ledger lock and row
 * lock, (2) checks the expected version, (3) runs the effects the pure state
 * machine asked for, (4) bumps the version and (5) writes an audit row.
 * Bus events are published only after commit.
 */
import {
  applyFightRating,
  lockFight,
  NotFoundError,
  settleFightLedgerTx,
  toSalt,
  voidFightLedgerTx,
  withRetry,
  type Db,
  type Prisma,
  type Tx,
} from "@greed-island/db";
import { liveOdds, lockOdds, type Config, type RoundEndEvent, type Side, type Stake } from "@greed-island/shared";
import type { BusEvent, FightBus } from "./bus.ts";
import { bookingModeFor, nextPosition, type CyclePosition } from "./cycle.ts";
import type { OrchestratorConfig } from "./config.ts";
import { pickMatch, pickStage, type Candidate, type Rng } from "./matchmaking.ts";
import { transition, type Effect, type FightEvent, type FightState } from "./state-machine.ts";

export interface FightDeps {
  db: Db;
  config: Config;
  orch: OrchestratorConfig;
  bus: FightBus;
  now: () => Date;
}

export class IllegalTransitionError extends Error {
  override name = "IllegalTransitionError";
}

export class StaleFightError extends Error {
  override name = "StaleFightError";
}

type FightRow = Prisma.FightGetPayload<object>;

/** Book the next fight (state BOOKED). Returns null when no valid pairing or stage exists. */
export async function bookFight(deps: FightDeps, rng: Rng, engineMode: "live" | "fake"): Promise<FightRow | null> {
  const { db, orch } = deps;
  const booked = await withRetry(db, async (tx) => {
    const characters = await tx.character.findMany({
      where: { enabled: true, fighter: { enabled: true } },
      orderBy: { id: "asc" },
    });
    const stages = await tx.stage.findMany({ where: { enabled: true }, orderBy: { id: "asc" } });
    const recent = await tx.fight.findMany({
      orderBy: { number: "desc" },
      take: Math.max(orch.matchmaking.rematchCooldown, 1),
      select: { side1CharacterId: true, side2CharacterId: true },
    });
    const last = await tx.fight.findFirst({ orderBy: { number: "desc" }, select: { cycle: true, segment: true, segmentIndex: true } });

    const candidates: Candidate[] = characters.map((c) => ({
      characterId: c.id,
      fighterId: c.fighterId,
      tier: c.tier,
      rating: { rating: c.rating, deviation: c.deviation, volatility: c.volatility },
    }));
    const pairing = pickMatch(candidates, recent.map((f) => [f.side1CharacterId, f.side2CharacterId] as [string, string]), rng, orch.matchmaking);
    const stage = pickStage(stages, rng);
    if (!pairing || !stage) return null;

    const pos: CyclePosition = nextPosition(last ? { cycle: last.cycle, segment: last.segment, index: last.segmentIndex } : null, orch.cycle);
    const fight = await tx.fight.create({
      data: {
        engineMode,
        cycle: pos.cycle,
        segment: pos.segment,
        segmentIndex: pos.index,
        pairKind: pairing.kind,
        stageId: stage.id,
        side1CharacterId: pairing.sides[1].characterId,
        side2CharacterId: pairing.sides[2].characterId,
        roundsToWin: orch.roundsToWin,
        bookedAt: deps.now(),
      },
    });
    await tx.fightTransition.create({
      data: {
        fightId: fight.id,
        fromState: null,
        toState: "BOOKED",
        event: "BOOK",
        payload: { mode: bookingModeFor(pos.segment), pairKind: pairing.kind, chanceSide1Bp: Number(pairing.chanceSide1Bp) },
        version: fight.version,
      },
    });
    return fight;
  });
  if (booked) deps.bus.publish({ type: "fight_state", fightId: booked.id, number: booked.number, state: "BOOKED", version: booked.version });
  return booked;
}

async function loadouts(tx: Tx, fightId: string) {
  const rows = await tx.fightLoadout.findMany({ where: { fightId }, orderBy: { side: "asc" } });
  if (rows.length !== 2) throw new Error(`fight ${fightId} has ${rows.length} loadouts, expected 2`);
  return { 1: rows[0]!, 2: rows[1]! } as const;
}

const ratingOf = (l: { rating: number; deviation: number; volatility: number }) => ({ rating: l.rating, deviation: l.deviation, volatility: l.volatility });

/** Run one effect inside the transition's transaction. */
async function runEffect(
  deps: FightDeps,
  tx: Tx,
  fight: FightRow,
  effect: Effect,
  data: Prisma.FightUpdateInput,
  notices: BusEvent[],
): Promise<void> {
  const now = deps.now();
  switch (effect.type) {
    case "FREEZE_LOADOUTS": {
      for (const [side, characterId] of [[1, fight.side1CharacterId], [2, fight.side2CharacterId]] as const) {
        const c = await tx.character.findUniqueOrThrow({ where: { id: characterId } });
        await tx.fightLoadout.create({
          data: {
            fightId: fight.id,
            side,
            characterId: c.id,
            fighterId: c.fighterId,
            name: c.name,
            tier: c.tier,
            lifePct: c.lifePct,
            startPower: c.startPower,
            attackPct: c.attackPct,
            defensePct: c.defensePct,
            rating: c.rating,
            deviation: c.deviation,
            volatility: c.volatility,
            wins: c.wins,
            losses: c.losses,
          },
        });
      }
      const l = await loadouts(tx, fight.id);
      data.bettingOpensAt = now;
      data.bettingClosesAt = new Date(now.getTime() + deps.orch.bettingWindowMs);
      notices.push({ type: "odds_live", fightId: fight.id, odds: liveOdds(ratingOf(l[1]), ratingOf(l[2]), deps.config.odds) });
      return;
    }
    case "LOCK_ODDS": {
      const l = await loadouts(tx, fight.id);
      const bets = await tx.bet.findMany({ where: { fightId: fight.id, status: "OPEN" }, select: { side: true, stake: true } });
      const stakes: Stake[] = bets.map((b) => ({ side: b.side as Side, amount: toSalt(b.stake) }));
      const locked = lockOdds(ratingOf(l[1]), ratingOf(l[2]), stakes, deps.config.odds);
      await tx.fightOdds.create({
        data: {
          fightId: fight.id,
          modelChanceBp1: Number(locked.modelChanceBp[0]),
          modelChanceBp2: Number(locked.modelChanceBp[1]),
          crowdChanceBp1: locked.crowdChanceBp ? Number(locked.crowdChanceBp[0]) : null,
          crowdChanceBp2: locked.crowdChanceBp ? Number(locked.crowdChanceBp[1]) : null,
          blendWeightBp: Number(locked.blendWeightBp),
          chanceBp1: Number(locked.chanceBp[0]),
          chanceBp2: Number(locked.chanceBp[1]),
          multiplierBp1: Number(locked.multiplierBp[1]),
          multiplierBp2: Number(locked.multiplierBp[2]),
          pool1: locked.pool[1].toString(),
          pool2: locked.pool[2].toString(),
          cappedPool1: locked.cappedPool[1].toString(),
          cappedPool2: locked.cappedPool[2].toString(),
          bettors: bets.length,
          lockedAt: now,
        },
      });
      data.lockedAt = now;
      notices.push({ type: "odds_locked", fightId: fight.id, odds: locked });
      return;
    }
    case "RECORD_WINNER": {
      const l = await loadouts(tx, fight.id);
      data.winnerSide = effect.winnerSide;
      data.winnerCharacter = { connect: { id: l[effect.winnerSide].characterId } };
      data.endedAt = now;
      return;
    }
    case "SETTLE": {
      const winnerSide = fight.winnerSide as Side | null;
      if (winnerSide !== 1 && winnerSide !== 2) throw new Error(`fight ${fight.id} has no winner to settle`);
      const odds = await tx.fightOdds.findUnique({ where: { fightId: fight.id } });
      if (!odds) throw new Error(`fight ${fight.id} has no locked odds`);
      await settleFightLedgerTx(tx, {
        fightId: fight.id,
        winnerSide,
        multiplierBp: { 1: BigInt(odds.multiplierBp1), 2: BigInt(odds.multiplierBp2) },
        maxPayout: deps.config.economy.maxPayout,
      });
      const l = await loadouts(tx, fight.id);
      const changes = await applyFightRating(
        tx,
        { side1: l[1].characterId, side2: l[2].characterId, scoreSide1: winnerSide === 1 ? 1 : 0, fightId: fight.id },
        deps.config,
      );
      for (const [i, change] of changes.entries()) {
        await tx.fightLoadout.update({
          where: { fightId_side: { fightId: fight.id, side: i + 1 } },
          data: { ratingAfter: change.after.rating, deviationAfter: change.after.deviation, tierAfter: change.after.tier },
        });
      }
      data.closedAt = now;
      notices.push({ type: "fight_result", fightId: fight.id, number: fight.number, result: "SETTLED", winnerSide, winnerCharacterId: l[winnerSide].characterId });
      return;
    }
    case "RECORD_VOID":
      data.voidReason = effect.reason;
      data.voidDetail = effect.detail ?? null;
      data.endedAt = fight.endedAt ?? now;
      return;
    case "REFUND_ALL":
      await voidFightLedgerTx(tx, fight.id);
      data.closedAt = now;
      notices.push({ type: "fight_result", fightId: fight.id, number: fight.number, result: "VOIDED", voidReason: fight.voidReason! });
      return;
  }
}

export interface AppliedTransition {
  fight: FightRow;
  from: FightState;
  to: FightState;
}

/**
 * Apply one event to a fight. Pass `expectedVersion` (the version you last
 * saw) to fail with StaleFightError if anything else moved the fight.
 */
export async function applyTransition(deps: FightDeps, fightId: string, event: FightEvent, expectedVersion?: number): Promise<AppliedTransition> {
  const { fight, from, to, notices } = await withRetry(deps.db, async (tx) => {
    // Ledger lock first, then the row: the same order bets use, so no deadlock.
    await lockFight(tx, fightId, "exclusive");
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "fight" WHERE "id" = ${fightId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError(`no fight ${fightId}`);
    const current = await tx.fight.findUniqueOrThrow({ where: { id: fightId } });
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new StaleFightError(`fight ${fightId} is at version ${current.version}, expected ${expectedVersion}`);
    }
    const result = transition(current.state, event);
    if (!result.ok) throw new IllegalTransitionError(`fight #${current.number}: ${result.error}`);

    const data: Prisma.FightUpdateInput = { state: result.to, version: { increment: 1 } };
    if (result.to === "IN_PROGRESS") data.startedAt = deps.now();
    const notices: BusEvent[] = [];
    // SETTLE and REFUND_ALL read the winner / void reason stored by the previous transition.
    for (const effect of result.effects) await runEffect(deps, tx, current, effect, data, notices);
    const updated = await tx.fight.update({ where: { id: fightId }, data });
    await tx.fightTransition.create({
      data: { fightId, fromState: current.state, toState: result.to, event: event.type, payload: { ...event }, version: updated.version },
    });
    return { fight: updated, from: current.state, to: result.to, notices };
  });

  deps.bus.publish({
    type: "fight_state",
    fightId,
    number: fight.number,
    state: to,
    version: fight.version,
    ...(to === "BETTING_OPEN" && fight.bettingClosesAt ? { bettingClosesAt: fight.bettingClosesAt.toISOString() } : {}),
  });
  for (const n of notices) deps.bus.publish(n);
  return { fight, from, to };
}

/** Store a round result as it happens (for stats and the stream overlay). */
export async function recordRound(db: Db, fightId: string, round: RoundEndEvent): Promise<void> {
  await db.fightRound.upsert({
    where: { fightId_round: { fightId, round: round.round } },
    create: { fightId, round: round.round, winnerSide: round.winnerSide, reason: round.reason },
    update: {},
  });
}
