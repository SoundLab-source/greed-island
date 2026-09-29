/**
 * Read models for the API. Everything returned here is JSON-safe: Salt
 * amounts and basis points are strings (bigint), ratings are rounded numbers.
 * Stats shown to bettors (DESIGN §7): rating, tier, record, win rate,
 * head-to-head, last-10 form, tier history.
 */
import { getBalance, openStakes, toSalt, type Db } from "@greed-island/db";
import { formatMultiplier, liveOdds, type Config, type Side } from "@greed-island/shared";

const round1 = (n: number) => Math.round(n * 10) / 10;

export function playerName(u: { id: string; displayName: string | null }): string {
  return u.displayName ?? `Anon-${u.id.slice(0, 6)}`;
}

/** Results of a character's last `n` settled fights, newest first. */
export async function recentForm(db: Db, characterId: string, n = 10): Promise<("W" | "L")[]> {
  const fights = await db.fight.findMany({
    where: { state: "SETTLED", OR: [{ side1CharacterId: characterId }, { side2CharacterId: characterId }] },
    orderBy: { number: "desc" },
    take: n,
    select: { winnerCharacterId: true },
  });
  return fights.map((f) => (f.winnerCharacterId === characterId ? "W" : "L"));
}

export async function headToHead(db: Db, a: string, b: string): Promise<{ fights: number; wins: Record<string, number> }> {
  const fights = await db.fight.findMany({
    where: {
      state: "SETTLED",
      OR: [
        { side1CharacterId: a, side2CharacterId: b },
        { side1CharacterId: b, side2CharacterId: a },
      ],
    },
    select: { winnerCharacterId: true },
  });
  const wins: Record<string, number> = { [a]: 0, [b]: 0 };
  for (const f of fights) if (f.winnerCharacterId) wins[f.winnerCharacterId] = (wins[f.winnerCharacterId] ?? 0) + 1;
  return { fights: fights.length, wins };
}

const winRate = (wins: number, losses: number) => (wins + losses === 0 ? null : round1((100 * wins) / (wins + losses)));

export async function characterCard(db: Db, characterId: string) {
  const c = await db.character.findUniqueOrThrow({ where: { id: characterId }, include: { fighter: true, owner: true } });
  return {
    id: c.id,
    name: c.name,
    fighter: { id: c.fighterId, displayName: c.fighter.displayName, archetype: c.fighter.archetype, rarity: c.fighter.rarity },
    owner: c.owner ? { kind: "player" as const, name: playerName(c.owner) } : { kind: "house" as const, name: "House" },
    serial: c.serial,
    firstEdition: c.firstEdition,
    tier: c.tier,
    rating: Math.round(c.rating),
    deviation: Math.round(c.deviation),
    record: { wins: c.wins, losses: c.losses },
    winRate: winRate(c.wins, c.losses),
    last10: await recentForm(db, c.id),
    stats: { lifePct: c.lifePct, startPower: c.startPower, attackPct: c.attackPct, defensePct: c.defensePct },
    enabled: c.enabled && c.fighter.enabled,
  };
}

export async function characterProfile(db: Db, characterId: string) {
  const card = await characterCard(db, characterId);
  const tierHistory = await db.tierHistory.findMany({ where: { characterId }, orderBy: { id: "desc" }, take: 50 });
  const fights = await db.fight.findMany({
    where: { state: { in: ["SETTLED", "VOIDED"] }, OR: [{ side1CharacterId: characterId }, { side2CharacterId: characterId }] },
    orderBy: { number: "desc" },
    take: 20,
    include: { side1Character: true, side2Character: true },
  });
  return {
    ...card,
    license: (await db.fighter.findUniqueOrThrow({ where: { id: card.fighter.id } })).licenseNote,
    tierHistory: tierHistory.map((t) => ({ from: t.fromTier, to: t.toTier, rating: Math.round(t.rating), reason: t.reason, fightId: t.fightId, at: t.createdAt })),
    recentFights: fights.map((f) => {
      const opponent = f.side1CharacterId === characterId ? f.side2Character : f.side1Character;
      return {
        fightId: f.id,
        number: f.number,
        opponent: { id: opponent.id, name: opponent.name },
        result: f.state === "VOIDED" ? "VOID" : f.winnerCharacterId === characterId ? "W" : "L",
        at: f.closedAt,
      };
    }),
  };
}

/** Full view of one fight, optionally with the viewer's own bet. */
export async function fightView(db: Db, config: Config, fightId: string, viewerId?: string) {
  const f = await db.fight.findUnique({
    where: { id: fightId },
    include: { stage: true, loadouts: { orderBy: { side: "asc" } }, odds: true, rounds: { orderBy: { round: "asc" } } },
  });
  if (!f) return null;

  const side = async (s: Side) => {
    const characterId = s === 1 ? f.side1CharacterId : f.side2CharacterId;
    const card = await characterCard(db, characterId);
    const l = f.loadouts.find((x) => x.side === s);
    // Once betting opens, show the frozen loadout (what was bet on), not live values.
    const frozen = l
      ? {
          tier: l.tier,
          rating: Math.round(l.rating),
          deviation: Math.round(l.deviation),
          record: { wins: l.wins, losses: l.losses },
          winRate: winRate(l.wins, l.losses),
          stats: { lifePct: l.lifePct, startPower: l.startPower, attackPct: l.attackPct, defensePct: l.defensePct },
          ratingAfter: l.ratingAfter === null ? null : Math.round(l.ratingAfter),
          tierAfter: l.tierAfter,
        }
      : {};
    return { ...card, ...frozen, frozen: Boolean(l) };
  };

  const [s1, s2] = [await side(1), await side(2)];
  const h2h = await headToHead(db, f.side1CharacterId, f.side2CharacterId);

  let odds: unknown = null;
  if (f.odds) {
    const o = f.odds;
    odds = {
      locked: true,
      chancePct: { 1: o.chanceBp1 / 100, 2: o.chanceBp2 / 100 },
      multiplier: { 1: formatMultiplier(BigInt(o.multiplierBp1)), 2: formatMultiplier(BigInt(o.multiplierBp2)) },
      multiplierBp: { 1: String(o.multiplierBp1), 2: String(o.multiplierBp2) },
      pool: { 1: o.pool1.toFixed(0), 2: o.pool2.toFixed(0) },
      bettors: o.bettors,
      modelChancePct: { 1: o.modelChanceBp1 / 100, 2: o.modelChanceBp2 / 100 },
      crowdChancePct: o.crowdChanceBp1 === null ? null : { 1: o.crowdChanceBp1 / 100, 2: o.crowdChanceBp2! / 100 },
    };
  } else if (f.loadouts.length === 2) {
    // Live estimate while betting is open: model only, no crowd split (DESIGN §6).
    const [l1, l2] = [f.loadouts[0]!, f.loadouts[1]!];
    const live = liveOdds(l1, l2, config.odds);
    odds = {
      locked: false,
      chancePct: { 1: Number(live.chanceBp[0]) / 100, 2: Number(live.chanceBp[1]) / 100 },
      multiplier: { 1: formatMultiplier(live.multiplierBp[1]), 2: formatMultiplier(live.multiplierBp[2]) },
      multiplierBp: { 1: live.multiplierBp[1].toString(), 2: live.multiplierBp[2].toString() },
    };
  }

  let myBet: unknown = null;
  if (viewerId) {
    const b = await db.bet.findUnique({ where: { userId_fightId: { userId: viewerId, fightId } } });
    if (b) myBet = { side: b.side, stake: b.stake.toFixed(0), status: b.status, returned: b.returned?.toFixed(0) ?? null };
  }

  return {
    id: f.id,
    number: f.number,
    state: f.state,
    version: f.version,
    stage: { id: f.stage.id, displayName: f.stage.displayName },
    pairKind: f.pairKind,
    cycle: { cycle: f.cycle, segment: f.segment, index: f.segmentIndex },
    times: {
      booked: f.bookedAt,
      bettingOpens: f.bettingOpensAt,
      bettingCloses: f.bettingClosesAt,
      locked: f.lockedAt,
      started: f.startedAt,
      ended: f.endedAt,
      closed: f.closedAt,
    },
    sides: { 1: s1, 2: s2 },
    headToHead: { fights: h2h.fights, wins: { 1: h2h.wins[f.side1CharacterId] ?? 0, 2: h2h.wins[f.side2CharacterId] ?? 0 } },
    odds,
    rounds: f.rounds.map((r) => ({ round: r.round, winnerSide: r.winnerSide, reason: r.reason })),
    result:
      f.state === "SETTLED"
        ? { kind: "settled", winnerSide: f.winnerSide }
        : f.state === "VOIDED"
          ? { kind: "voided", reason: f.voidReason, detail: f.voidDetail }
          : null,
    myBet,
  };
}

/** The fight to show now: the newest unfinished one, else the newest finished one. */
export async function currentFightId(db: Db): Promise<string | null> {
  const open = await db.fight.findFirst({ where: { state: { notIn: ["SETTLED", "VOIDED"] } }, orderBy: { number: "desc" }, select: { id: true } });
  if (open) return open.id;
  const last = await db.fight.findFirst({ orderBy: { number: "desc" }, select: { id: true } });
  return last?.id ?? null;
}

export async function meView(db: Db, config: Config, userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const balance = await getBalance(db, userId);
  const stakes = await openStakes(db, userId);
  const today = now.toISOString().slice(0, 10);
  const grant = await db.ledgerTxn.findUnique({ where: { idempotencyKey: `grant:daily:${userId}:${today}` }, select: { id: true } });
  return {
    id: user.id,
    name: playerName(user),
    kind: user.kind,
    email: user.email,
    balance: balance.toString(),
    inOpenBets: stakes.toString(),
    dailyGrantAvailable: !grant && config.economy.dailyGrant > 0n,
    bailoutAvailable: stakes === 0n && balance < config.economy.bailoutFloor,
  };
}

export async function betHistory(db: Db, userId: string, take = 50) {
  const bets = await db.bet.findMany({ where: { userId }, orderBy: { placedAt: "desc" }, take, include: { fight: { select: { number: true, state: true } } } });
  return bets.map((b) => ({
    fightId: b.fightId,
    fightNumber: b.fight.number,
    fightState: b.fight.state,
    side: b.side,
    stake: b.stake.toFixed(0),
    status: b.status,
    returned: b.returned?.toFixed(0) ?? null,
    placedAt: b.placedAt,
  }));
}

/** Players by balance (available Salt, excluding open bets). */
export async function leaderboard(db: Db, take = 20) {
  const accounts = await db.account.findMany({
    where: { kind: "USER" },
    orderBy: [{ balance: "desc" }, { createdAt: "asc" }],
    take,
    include: { user: true },
  });
  return accounts.map((a, i) => ({ rank: i + 1, name: a.user ? playerName(a.user) : "?", balance: toSalt(a.balance).toString() }));
}

export async function characterRanking(db: Db) {
  const chars = await db.character.findMany({ where: { enabled: true }, orderBy: { rating: "desc" }, include: { fighter: true } });
  return chars.map((c, i) => ({
    rank: i + 1,
    id: c.id,
    name: c.name,
    tier: c.tier,
    rating: Math.round(c.rating),
    deviation: Math.round(c.deviation),
    record: { wins: c.wins, losses: c.losses },
    winRate: winRate(c.wins, c.losses),
  }));
}

export async function recentResults(db: Db, take = 10) {
  const fights = await db.fight.findMany({
    where: { state: { in: ["SETTLED", "VOIDED"] } },
    orderBy: { number: "desc" },
    take,
    include: { side1Character: true, side2Character: true },
  });
  return fights.map((f) => ({
    fightId: f.id,
    number: f.number,
    sides: { 1: f.side1Character.name, 2: f.side2Character.name },
    result: f.state === "SETTLED" ? { kind: "settled", winnerSide: f.winnerSide } : { kind: "voided", reason: f.voidReason },
  }));
}

/** A player's own characters, strongest first. */
export async function myCharacters(db: Db, userId: string) {
  const owned = await db.character.findMany({ where: { ownerUserId: userId }, orderBy: [{ rating: "desc" }, { acquiredAt: "asc" }], select: { id: true } });
  return Promise.all(owned.map((c) => characterCard(db, c.id)));
}
