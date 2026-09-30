/**
 * Seasons (docs/PHASE3.md step 2). Before each booking the orchestrator
 * checks the season clock: the first booking starts Season 1, and the first
 * booking after a season's end closes it (final standings, Season Champion,
 * Season Top Bettor) and starts the next. A fight counts in the season its
 * result came in. Nothing here touches the ledger: balances never reset.
 */
import { fromSalt, toSalt, type Db, type Prisma, type Tx } from "@greed-island/db";
import {
  nextSeasonWindow,
  playerName,
  rankCharacters,
  rankPlayers,
  seasonChampion,
  TITLES,
  topBettor,
  type CharacterSeasonStat,
  type Config,
  type PlayerSeasonStat,
} from "@greed-island/shared";
import type { BusEvent } from "./bus.ts";
import { releaseElected } from "./releases.ts";
import { closeBallot, openBallotIfDue } from "./voting.ts";

type SeasonRow = Prisma.SeasonGetPayload<object>;

/** Salt won on settled Salt bets (not T-Salt) whose fight's result came in [from, to). */
export async function playerSeasonStats(db: Db | Tx, from: Date, to: Date): Promise<PlayerSeasonStat[]> {
  const rows = await db.$queryRaw<{ user_id: string; salt_won: Prisma.Decimal; bets: bigint }[]>`
    SELECT b."user_id",
           SUM(CASE WHEN b."status" = 'WON' THEN b."returned" - b."stake" ELSE -b."stake" END) AS salt_won,
           COUNT(*) AS bets
    FROM "bet" b
    JOIN "fight" f ON f."id" = b."fight_id"
    WHERE f."state" = 'SETTLED' AND f."tournament_match_id" IS NULL
      AND b."status" IN ('WON', 'LOST')
      AND f."closed_at" >= ${from} AND f."closed_at" < ${to}
    GROUP BY b."user_id"`;
  return rows.map((r) => ({ userId: r.user_id, saltWon: toSalt(r.salt_won), bets: Number(r.bets) }));
}

/** Active characters' rating now and their record in fights settled in [from, to). */
export async function characterSeasonStats(db: Db | Tx, from: Date, to: Date): Promise<CharacterSeasonStat[]> {
  const rows = await db.$queryRaw<{ id: string; rating: number; wins: bigint; losses: bigint }[]>`
    SELECT c."id", c."rating",
           COUNT(*) FILTER (WHERE f."winner_character_id" = c."id") AS wins,
           COUNT(*) FILTER (WHERE f."winner_character_id" <> c."id") AS losses
    FROM "fight" f
    JOIN "character" c ON c."id" IN (f."side1_character_id", f."side2_character_id")
    JOIN "fighter" fr ON fr."id" = c."fighter_id"
    WHERE f."state" = 'SETTLED' AND f."closed_at" >= ${from} AND f."closed_at" < ${to}
      AND c."enabled" AND fr."enabled"
    GROUP BY c."id", c."rating"`;
  return rows.map((r) => ({ characterId: r.id, rating: r.rating, wins: Number(r.wins), losses: Number(r.losses) }));
}

/** Both rankings for a season window, best first. */
export async function seasonRankings(db: Db | Tx, season: { startsAt: Date; endsAt: Date }) {
  const [players, characters] = await Promise.all([playerSeasonStats(db, season.startsAt, season.endsAt), characterSeasonStats(db, season.startsAt, season.endsAt)]);
  return { players: rankPlayers(players), characters: rankCharacters(characters) };
}

/**
 * Close the running season if it's over and start the next one (or start
 * Season 1). Runs inside the booking transaction; returns bus notices to
 * publish after commit.
 */
export async function advanceSeason(tx: Tx, config: Config, now: Date): Promise<BusEvent[]> {
  // Season changes take turns (only one orchestrator runs, but be sure).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7106)`;
  const running = await tx.season.findFirst({ where: { status: "RUNNING" } });
  // Mid-season: open the ballot when voting starts.
  if (running && now < running.endsAt) return openBallotIfDue(tx, config, running, now);
  const notices: BusEvent[] = [];
  let previousEndsAt: Date | null;
  if (running) {
    notices.push(...(await closeBallot(tx, config, running, now)));
    notices.push(...(await endSeason(tx, running, config, now)));
    previousEndsAt = running.endsAt;
  } else {
    previousEndsAt = (await tx.season.findFirst({ orderBy: { number: "desc" }, select: { endsAt: true } }))?.endsAt ?? null;
  }
  const next = await tx.season.create({ data: { ...nextSeasonWindow(previousEndsAt, now, config.seasons), createdAt: now } });
  notices.push({ type: "season", seasonId: next.id, number: next.number, status: "STARTED", startsAt: next.startsAt.toISOString(), endsAt: next.endsAt.toISOString() });
  // Last season's elected fighters join the roster now.
  notices.push(...(await releaseElected(tx, config, next, now)));
  // A season shorter than the voting window votes from its first day.
  notices.push(...(await openBallotIfDue(tx, config, next, now)));
  return notices;
}

async function endSeason(tx: Tx, season: SeasonRow, config: Config, now: Date): Promise<BusEvent[]> {
  const cfg = config.seasons;
  const { players, characters } = await seasonRankings(tx, season);
  const champ = seasonChampion(characters, cfg);
  const top = topBettor(players, cfg);

  await tx.seasonStanding.createMany({
    data: [
      ...players.slice(0, cfg.standingsSize).map((p) => ({ seasonId: season.id, kind: "PLAYER" as const, rank: p.rank, userId: p.userId, saltWon: fromSalt(p.saltWon), bets: p.bets })),
      ...characters
        .slice(0, cfg.standingsSize)
        .map((c) => ({ seasonId: season.id, kind: "CHARACTER" as const, rank: c.rank, characterId: c.characterId, rating: c.rating, wins: c.wins, losses: c.losses })),
    ],
  });

  const notices: BusEvent[] = [];
  let champion: { characterId: string; name: string } | null = null;
  if (champ) {
    const c = await tx.character.findUniqueOrThrow({ where: { id: champ.characterId } });
    await tx.characterTitle.create({ data: { characterId: c.id, code: "SEASON_CHAMPION", seasonId: season.id, ownerKind: c.ownerKind, ownerUserId: c.ownerUserId, earnedAt: now } });
    champion = { characterId: c.id, name: c.name };
    notices.push({ type: "title_earned", fightId: null, number: null, characterId: c.id, name: c.name, code: "SEASON_CHAMPION", label: TITLES.SEASON_CHAMPION.label });
  }
  let bettor: { name: string; saltWon: bigint } | null = null;
  if (top) {
    await tx.playerTitle.create({ data: { userId: top.userId, code: "SEASON_TOP_BETTOR", seasonId: season.id, balance: fromSalt(top.saltWon), earnedAt: now } });
    bettor = { name: playerName(await tx.user.findUniqueOrThrow({ where: { id: top.userId } })), saltWon: top.saltWon };
  }
  await tx.season.update({
    where: { id: season.id },
    data: { status: "ENDED", endedAt: now, championCharacterId: champ?.characterId ?? null, topBettorUserId: top?.userId ?? null },
  });
  return [{ type: "season", seasonId: season.id, number: season.number, status: "ENDED", champion, topBettor: bettor }, ...notices];
}
