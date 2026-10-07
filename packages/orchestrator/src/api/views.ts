/**
 * Read models for the API. Everything returned here is JSON-safe: Salt
 * amounts and basis points are strings (bigint), ratings are rounded numbers.
 * Stats shown to bettors (DESIGN §7): rating, tier, record, win rate,
 * head-to-head, last-10 form, tier history.
 */
import { characterCosmetics, getBalance, openStakes, toSalt, tournamentBalance, tournamentBalances, type Db, type Prisma } from "@greed-island/db";
import {
  automaticName,
  describeCosmetics,
  describeUnlocked,
  formatMultiplier,
  liveOdds,
  maxLevel,
  parseCosmeticChoice,
  parseCosmetics,
  PLAYER_TITLES,
  playerName,
  roundName,
  resolveCosmetics,
  TITLES,
  unlockedCosmetics,
  UPGRADE_STATS,
  upgradeCost,
  type Config,
  type Side,
  type TitleCode,
  type UpgradeConfig,
} from "@greed-island/shared";
import { mySeason } from "./season-views.ts";
import { formerNames, latestNameRequest, staffInfo } from "./staff-views.ts";
import { fightStory, storyFacts } from "../story.ts";

const round1 = (n: number) => Math.round(n * 10) / 10;

export { playerName };

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

const ownerOf = (c: { owner: { id: string; displayName: string | null } | null }) =>
  c.owner ? { kind: "player" as const, name: playerName(c.owner) } : { kind: "house" as const, name: "House" };

const winRate = (wins: number, losses: number) => (wins + losses === 0 ? null : round1((100 * wins) / (wins + losses)));

export async function characterCard(db: Db, characterId: string) {
  const c = await db.character.findUniqueOrThrow({ where: { id: characterId }, include: { fighter: true, owner: true } });
  const cosmetics = await characterCosmetics(db, c);
  return {
    id: c.id,
    name: c.name,
    fighter: { id: c.fighterId, displayName: c.fighter.displayName, archetype: c.fighter.archetype, rarity: c.fighter.rarity },
    owner: ownerOf(c),
    serial: c.serial,
    firstEdition: c.firstEdition,
    tier: c.tier,
    rating: Math.round(c.rating),
    deviation: Math.round(c.deviation),
    record: { wins: c.wins, losses: c.losses },
    winRate: winRate(c.wins, c.losses),
    last10: await recentForm(db, c.id),
    stats: { lifePct: c.lifePct, startPower: c.startPower, attackPct: c.attackPct, defensePct: c.defensePct },
    levels: { life: c.lifeLevel, attack: c.attackLevel, defense: c.defenseLevel, power: c.powerLevel },
    sidegrade: c.sidegrade,
    /** What the overlay shows now (a fight shows its frozen copy instead). */
    cosmetics: describeCosmetics(cosmetics.equipped),
    enabled: c.enabled && c.fighter.enabled,
  };
}

async function communityOrigin(db: Db, fighterId: string) {
  const r = await db.release.findUnique({
    where: { fighterId },
    include: { submission: { select: { number: true, community: true } }, standIn: { select: { displayName: true } }, season: { select: { number: true } } },
  });
  return r ? { community: r.submission.community, submissionNumber: r.submission.number, releasedInSeason: r.season.number, standIn: r.standIn.displayName } : null;
}

/** Titles with provenance: who owned the character when it earned each one. */
export async function characterTitles(db: Db, characterId: string) {
  const titles = await db.characterTitle.findMany({
    where: { characterId },
    orderBy: { id: "asc" },
    include: { owner: true, fight: { select: { number: true } }, tournament: { select: { number: true, tier: true } }, season: { select: { number: true } } },
  });
  return titles.map((t) => ({
    code: t.code,
    label: t.tournament
      ? `${TITLES[t.code].label} (Tournament #${t.tournament.number}, ${t.tournament.tier} tier)`
      : t.season
        ? `Season ${t.season.number} Champion`
        : TITLES[t.code].label,
    description: TITLES[t.code].description,
    earnedBy: t.owner ? { kind: "player" as const, name: playerName(t.owner) } : { kind: "house" as const, name: "House" },
    fightId: t.fightId,
    fightNumber: t.fight?.number ?? null,
    tournamentNumber: t.tournament?.number ?? null,
    seasonNumber: t.season?.number ?? null,
    at: t.earnedAt,
  }));
}

/** What the owner can equip, and what they picked (null = automatic). */
async function cosmeticOptions(db: Db, characterId: string) {
  const c = await db.character.findUniqueOrThrow({ where: { id: characterId }, select: { id: true, firstEdition: true, cosmetics: true } });
  const { unlocked, choice } = await characterCosmetics(db, c);
  return { unlocked: describeUnlocked(unlocked), cosmeticChoice: choice };
}

/** What the next level of each stat costs (null at max), for the owner's upgrade buttons. */
export function upgradePrices(levels: Record<(typeof UPGRADE_STATS)[number], number>, cfg: UpgradeConfig) {
  return {
    next: Object.fromEntries(UPGRADE_STATS.map((s) => [s, levels[s] >= maxLevel(s, cfg) ? null : upgradeCost(s, levels[s], cfg).toString()])),
    sidegrade: cfg.sidegradeCost.toString(),
  };
}

export async function characterProfile(db: Db, characterId: string) {
  const card = await characterCard(db, characterId);
  const tierHistory = await db.tierHistory.findMany({ where: { characterId }, orderBy: { id: "desc" }, take: 50 });
  const changes = await db.characterChange.findMany({ where: { characterId }, orderBy: { id: "desc" }, take: 50, include: { byUser: true } });
  const fights = await db.fight.findMany({
    where: { state: { in: ["SETTLED", "VOIDED"] }, OR: [{ side1CharacterId: characterId }, { side2CharacterId: characterId }] },
    orderBy: { number: "desc" },
    take: 20,
    include: { side1Character: true, side2Character: true },
  });
  return {
    ...card,
    license: (await db.fighter.findUniqueOrThrow({ where: { id: card.fighter.id } })).licenseNote,
    formerNames: await formerNames(db, characterId),
    /** Community fighters: where it came from, and the engine character it plays with until its template exists. */
    community: await communityOrigin(db, card.fighter.id),
    titles: await characterTitles(db, characterId),
    ...(await cosmeticOptions(db, characterId)),
    upgrades: changes.map((ch) => ({
      kind: ch.kind,
      stat: ch.stat,
      toLevel: ch.toLevel,
      sidegrade: ch.kind === "SIDEGRADE" ? { from: ch.fromSidegrade, to: ch.toSidegrade } : undefined,
      cost: ch.cost.toFixed(0),
      by: playerName(ch.byUser),
      at: ch.createdAt,
    })),
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
    include: {
      stage: true,
      loadouts: { orderBy: { side: "asc" } },
      odds: true,
      rounds: { orderBy: { round: "asc" } },
      tournamentMatch: { include: { tournament: true } },
    },
  });
  if (!f) return null;
  const tm = f.tournamentMatch;

  const side = async (s: Side) => {
    const characterId = s === 1 ? f.side1CharacterId : f.side2CharacterId;
    const card = await characterCard(db, characterId);
    const l = f.loadouts.find((x) => x.side === s);
    // Once betting opens, show the frozen loadout (what was bet on), not live values.
    const frozen = l
      ? {
          name: l.name,
          tier: l.tier,
          rating: Math.round(l.rating),
          deviation: Math.round(l.deviation),
          record: { wins: l.wins, losses: l.losses },
          winRate: winRate(l.wins, l.losses),
          stats: { lifePct: l.lifePct, startPower: l.startPower, attackPct: l.attackPct, defensePct: l.defensePct },
          ratingAfter: l.ratingAfter === null ? null : Math.round(l.ratingAfter),
          tierAfter: l.tierAfter,
          cosmetics: describeCosmetics(parseCosmetics(l.cosmetics)),
        }
      : {};
    return { ...card, ...frozen, frozen: Boolean(l) };
  };

  const [s1, s2] = [await side(1), await side(2)];
  const h2h = await headToHead(db, f.side1CharacterId, f.side2CharacterId);

  // Everyone's bets, bot players marked: names and stakes as they come in, sides once betting closes (or live: Config.bets).
  const betsRevealed = config.bets.sidesLive || !["BOOKED", "BETTING_OPEN"].includes(f.state);
  const betRows = await db.bet.findMany({
    where: { fightId },
    include: { user: { select: { id: true, displayName: true, kind: true } } },
    orderBy: [{ stake: "desc" }, { updatedAt: "asc" }],
  });
  const bets = betRows.map((b) => ({
    id: b.id,
    name: playerName(b.user),
    bot: b.user.kind === "BOT",
    stake: b.stake.toFixed(0),
    side: betsRevealed || b.userId === viewerId ? b.side : null,
    mine: b.userId === viewerId,
    at: b.updatedAt,
  }));
  const pool = { 1: 0n, 2: 0n };
  for (const b of betRows) pool[b.side as Side] += toSalt(b.stake);

  let odds: unknown = null;
  if (f.odds) {
    const o = f.odds;
    odds = {
      locked: true,
      chancePct: { 1: o.chanceBp1 / 100, 2: o.chanceBp2 / 100 },
      multiplier: { 1: formatMultiplier(BigInt(o.multiplierBp1)), 2: formatMultiplier(BigInt(o.multiplierBp2)) },
      multiplierBp: { 1: String(o.multiplierBp1), 2: String(o.multiplierBp2) },
      // Everyone's stakes, bot players' too (the stored crowd numbers are real players' only).
      pool: { 1: pool[1].toString(), 2: pool[2].toString() },
      bettors: betRows.length,
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

  // Exhibition challenge and owner reward, if any.
  const challenge = await db.challenge.findUnique({ where: { fightId }, include: { challenger: true, challenged: true } });
  const reward = f.state === "SETTLED" ? await db.ledgerTxn.findUnique({ where: { idempotencyKey: `owner-reward:${fightId}` }, include: { entries: true } }) : null;
  const rewardAmount = reward ? reward.entries.reduce((n, e) => (e.amount.isPositive() ? n + toSalt(e.amount) : n), 0n) : null;

  let myBet: unknown = null;
  if (viewerId) {
    const b = await db.bet.findUnique({ where: { userId_fightId: { userId: viewerId, fightId } } });
    if (b) myBet = { side: b.side, stake: b.stake.toFixed(0), status: b.status, returned: b.returned?.toFixed(0) ?? null };
  }

  // The announcer's lines before the fight, and its headline after (docs/ENGAGEMENT.md §1).
  const tournament = tm ? { roundName: roundName(tm.round, tm.tournament.size) } : null;
  const story = fightStory(await storyFacts(db, f, { sides: { 1: s1, 2: s2 }, odds: odds as { chancePct: Record<Side, number>; multiplier: Record<Side, string> } | null, tournament }));

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
    roundsToWin: f.roundsToWin,
    rounds: f.rounds.map((r) => ({ round: r.round, winnerSide: r.winnerSide, reason: r.reason })),
    challenge: challenge ? { challenger: playerName(challenge.challenger), challenged: playerName(challenge.challenged), acceptedAt: challenge.acceptedAt } : null,
    /** Which currency bets on this fight use: tournament fights use that tournament's T-Salt. */
    currency: tm ? ("T-Salt" as const) : ("Salt" as const),
    tournament: tm
      ? { id: tm.tournamentId, number: tm.tournament.number, tier: tm.tournament.tier, debut: tm.tournament.debut, round: tm.round, roundName: roundName(tm.round, tm.tournament.size), slot: tm.slot }
      : null,
    result:
      f.state === "SETTLED"
        ? { kind: "settled", winnerSide: f.winnerSide, ownerReward: rewardAmount?.toString() ?? null }
        : f.state === "VOIDED"
          ? { kind: "voided", reason: f.voidReason, detail: f.voidDetail }
          : null,
    myBet,
    bets,
    betsRevealed,
    story,
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
  // The running tournament's T-Salt: the starting amount until the player's first bet there.
  const running = await db.tournament.findFirst({ where: { status: "RUNNING" }, orderBy: { number: "desc" } });
  const tBalance = running ? await tournamentBalance(db, userId, running.id) : null;
  const titles = await db.playerTitle.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    include: { tournament: { select: { number: true, tier: true } }, season: { select: { number: true } } },
  });
  return {
    id: user.id,
    name: playerName(user),
    kind: user.kind,
    email: user.email,
    ...staffInfo(user.role),
    balance: balance.toString(),
    inOpenBets: stakes.toString(),
    tournament: running
      ? { id: running.id, number: running.number, tier: running.tier, balance: (tBalance ?? config.tournaments.startingBalance).toString(), joined: tBalance !== null }
      : null,
    season: await mySeason(db, config, userId),
    titles: titles.map((t) => ({
      code: t.code,
      label: PLAYER_TITLES[t.code].label,
      tournamentNumber: t.tournament?.number ?? null,
      tier: t.tournament?.tier ?? null,
      seasonNumber: t.season?.number ?? null,
      /** Final T-Salt balance (tournaments) or Salt won (seasons). */
      balance: t.balance.toFixed(0),
      at: t.earnedAt,
    })),
    dailyGrantAvailable: !grant && config.economy.dailyGrant > 0n,
    bailoutAvailable: stakes === 0n && balance < config.economy.bailoutFloor,
  };
}

export async function betHistory(db: Db, userId: string, take = 50) {
  const bets = await db.bet.findMany({
    where: { userId },
    orderBy: { placedAt: "desc" },
    take,
    include: { fight: { select: { number: true, state: true, tournamentMatchId: true } } },
  });
  return bets.map((b) => ({
    fightId: b.fightId,
    fightNumber: b.fight.number,
    fightState: b.fight.state,
    currency: b.fight.tournamentMatchId ? ("T-Salt" as const) : ("Salt" as const),
    side: b.side,
    stake: b.stake.toFixed(0),
    status: b.status,
    returned: b.returned?.toFixed(0) ?? null,
    placedAt: b.placedAt,
  }));
}

/** Players by balance (available Salt, excluding open bets). */
export async function characterRanking(db: Db) {
  const chars = await db.character.findMany({ where: { enabled: true }, orderBy: { rating: "desc" }, include: { fighter: true, owner: true } });
  const earned = new Map<string, TitleCode[]>();
  for (const t of await db.characterTitle.findMany({ where: { characterId: { in: chars.map((c) => c.id) } }, select: { characterId: true, code: true } })) {
    earned.set(t.characterId, [...(earned.get(t.characterId) ?? []), t.code]);
  }
  return chars.map((c, i) => ({
    rank: i + 1,
    id: c.id,
    name: c.name,
    title: describeCosmetics(resolveCosmetics(unlockedCosmetics(earned.get(c.id) ?? [], c), parseCosmeticChoice(c.cosmetics))).title,
    owner: ownerOf(c),
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
export async function myCharacters(db: Db, config: Config, userId: string) {
  const owned = await db.character.findMany({ where: { ownerUserId: userId }, orderBy: [{ rating: "desc" }, { acquiredAt: "asc" }], select: { id: true } });
  return Promise.all(
    owned.map(async (c) => {
      const card = await characterCard(db, c.id);
      return {
        ...card,
        prices: upgradePrices(card.levels, config.upgrades),
        earnings: (await ownerEarnings(db, c.id)).toString(),
        automaticName: card.serial !== null ? automaticName(card.fighter.displayName, card.serial) : null,
        nameRequest: await latestNameRequest(db, c.id),
        titles: await characterTitles(db, c.id),
        ...(await cosmeticOptions(db, c.id)),
      };
    }),
  );
}

/** Owner rewards paid for this character's wins (to whoever owned it then). */
export async function ownerEarnings(db: Db, characterId: string): Promise<bigint> {
  const rows = await db.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT SUM(e."amount") AS total
    FROM "ledger_txn" t
    JOIN "ledger_entry" e ON e."txn_id" = t."id"
    JOIN "account" a ON a."id" = e."account_id" AND a."kind" = 'USER'
    JOIN "fight" f ON f."id" = t."fight_id"
    WHERE t."kind" = 'OWNER_REWARD' AND f."winner_character_id" = ${characterId}::uuid`;
  return rows[0]?.total ? toSalt(rows[0].total) : 0n;
}

type ChallengeWithSides = Prisma.ChallengeGetPayload<{
  include: { challenger: true; challenged: true; challengerCharacter: true; challengedCharacter: true; fight: { select: { number: true; state: true; winnerCharacterId: true } } };
}>;

function challengeView(c: ChallengeWithSides) {
  const who = (character: ChallengeWithSides["challengerCharacter"], owner: ChallengeWithSides["challenger"]) => ({
    characterId: character.id,
    name: character.name,
    tier: character.tier,
    rating: Math.round(character.rating),
    owner: playerName(owner),
  });
  return {
    id: c.id,
    status: c.status,
    challenger: who(c.challengerCharacter, c.challenger),
    challenged: who(c.challengedCharacter, c.challenged),
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    acceptedAt: c.acceptedAt,
    closedAt: c.closedAt,
    fight: c.fight ? { id: c.fightId, number: c.fight.number, state: c.fight.state, winnerCharacterId: c.fight.winnerCharacterId } : null,
  };
}

const CHALLENGE_INCLUDE = {
  challenger: true,
  challenged: true,
  challengerCharacter: true,
  challengedCharacter: true,
  fight: { select: { number: true, state: true, winnerCharacterId: true } },
} as const;

/** A player's challenges: open ones first, then the 10 most recent closed ones each way. */
export async function myChallenges(db: Db, userId: string) {
  const list = async (where: Prisma.ChallengeWhereInput) => {
    const open = await db.challenge.findMany({ where: { ...where, status: { in: ["PENDING", "ACCEPTED"] } }, orderBy: { createdAt: "asc" }, include: CHALLENGE_INCLUDE });
    const closed = await db.challenge.findMany({ where: { ...where, status: { notIn: ["PENDING", "ACCEPTED"] } }, orderBy: { closedAt: "desc" }, take: 10, include: CHALLENGE_INCLUDE });
    return [...open, ...closed].map(challengeView);
  };
  const queue = await db.challenge.findMany({ where: { status: "ACCEPTED" }, orderBy: [{ acceptedAt: "asc" }, { id: "asc" }], select: { id: true } });
  const position = new Map(queue.map((q, i) => [q.id, i + 1]));
  const withQueue = (v: ReturnType<typeof challengeView>) => ({ ...v, queuePosition: position.get(v.id) ?? null });
  return {
    incoming: (await list({ challengedUserId: userId })).map(withQueue),
    outgoing: (await list({ challengerUserId: userId })).map(withQueue),
  };
}

/** What a player can challenge with, and whom: other players' active characters, strongest first. */
export async function challengeOptions(db: Db, userId: string) {
  const active = { enabled: true, fighter: { enabled: true } } as const;
  const brief = (c: { id: string; name: string; tier: string; rating: number; fighterId: string; owner: { id: string; displayName: string | null } | null }) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    rating: Math.round(c.rating),
    fighterId: c.fighterId,
    owner: c.owner ? playerName(c.owner) : "House",
  });
  const mine = await db.character.findMany({ where: { ...active, ownerUserId: userId }, orderBy: { rating: "desc" }, include: { owner: true } });
  const others = await db.character.findMany({ where: { ...active, ownerKind: "USER", NOT: { ownerUserId: userId } }, orderBy: { rating: "desc" }, include: { owner: true } });
  return { mine: mine.map(brief), opponents: others.map(brief) };
}

/** A tournament's bracket, T-Salt standings and podium. */
export async function tournamentView(db: Db, tournamentId: string, viewerId?: string) {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      champion: true,
      entries: { orderBy: { seed: "asc" }, include: { character: { include: { owner: true } } } },
      matches: {
        orderBy: [{ round: "asc" }, { slot: "asc" }],
        include: { side1Character: true, side2Character: true, fights: { orderBy: { number: "asc" }, select: { id: true, number: true, state: true } } },
      },
      playerTitles: { orderBy: { code: "asc" }, include: { user: true } },
    },
  });
  if (!t) return null;
  const seedOf = new Map(t.entries.map((e) => [e.characterId, e.seed]));
  const side = (c: { id: string; name: string } | null) => (c ? { characterId: c.id, name: c.name, seed: seedOf.get(c.id) ?? null } : null);
  const rounds = [...new Set(t.matches.map((m) => m.round))].map((round) => ({
    round,
    name: roundName(round, t.size),
    matches: t.matches
      .filter((m) => m.round === round)
      .map((m) => ({
        id: m.id,
        slot: m.slot,
        sides: { 1: side(m.side1Character), 2: side(m.side2Character) },
        winnerCharacterId: m.winnerCharacterId,
        walkover: m.walkover,
        fights: m.fights,
      })),
  }));
  const balances = await tournamentBalances(db, t.id);
  const users = new Map((await db.user.findMany({ where: { id: { in: balances.map((b) => b.userId) } } })).map((u) => [u.id, u]));
  const standings = balances
    .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : a.joinedAt.getTime() - b.joinedAt.getTime()))
    .slice(0, 10)
    .map((b, i) => ({ rank: i + 1, name: playerName(users.get(b.userId)!), balance: b.balance.toString() }));
  const mine = viewerId ? await tournamentBalance(db, viewerId, t.id) : null;
  return {
    id: t.id,
    number: t.number,
    cycle: t.cycle,
    tier: t.tier,
    /** Newly released community fighters debut here. */
    debut: t.debut,
    size: t.size,
    status: t.status,
    cancelReason: t.cancelReason,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt,
    champion: t.champion ? { id: t.champion.id, name: t.champion.name } : null,
    entries: t.entries.map((e) => ({ seed: e.seed, characterId: e.characterId, name: e.character.name, tier: e.tier, rating: Math.round(e.rating), owner: ownerOf(e.character) })),
    rounds,
    standings,
    podium: t.playerTitles.map((p) => ({ code: p.code, label: PLAYER_TITLES[p.code].label, name: playerName(p.user), balance: p.balance.toFixed(0) })),
    myBalance: mine === null ? null : mine.toString(),
  };
}

/** The running tournament, else the most recent one. */
export async function currentTournamentId(db: Db): Promise<string | null> {
  const t =
    (await db.tournament.findFirst({ where: { status: "RUNNING" }, orderBy: { number: "desc" }, select: { id: true } })) ??
    (await db.tournament.findFirst({ where: { status: { not: "CANCELLED" } }, orderBy: { number: "desc" }, select: { id: true } }));
  return t?.id ?? null;
}

export async function recentTournaments(db: Db, take = 20) {
  const list = await db.tournament.findMany({ orderBy: { number: "desc" }, take, include: { champion: true } });
  return list.map((t) => ({
    id: t.id,
    number: t.number,
    tier: t.tier,
    size: t.size,
    status: t.status,
    champion: t.champion ? { id: t.champion.id, name: t.champion.name } : null,
    finishedAt: t.finishedAt,
  }));
}
