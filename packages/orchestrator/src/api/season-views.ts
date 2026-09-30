/**
 * Read models for seasons (docs/PHASE3.md step 2): the running season's live
 * standings, an ended season's final standings, and the player leaderboard
 * (Salt won this season).
 */
import type { Db, Prisma } from "@greed-island/db";
import { playerName, seasonChampion, topBettor, type Config } from "@greed-island/shared";
import { seasonRankings } from "../seasons.ts";

type SeasonWithWinners = Prisma.SeasonGetPayload<{ include: { champion: true; topBettor: true } }>;

function summary(s: SeasonWithWinners) {
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    endedAt: s.endedAt,
    champion: s.champion ? { characterId: s.champion.id, name: s.champion.name } : null,
    topBettor: s.topBettor ? { name: playerName(s.topBettor) } : null,
  };
}

async function names(db: Db, userIds: string[], characterIds: string[]) {
  const [users, characters] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } } }),
    db.character.findMany({ where: { id: { in: characterIds } }, include: { owner: true } }),
  ]);
  return {
    user: new Map(users.map((u) => [u.id, playerName(u)])),
    character: new Map(characters.map((c) => [c.id, { name: c.name, tier: c.tier, owner: c.owner ? playerName(c.owner) : "House" }])),
  };
}

/** Live standings of a running season: top players by Salt won, top characters by rating (with the season's record). */
async function liveStandings(db: Db, config: Config, season: { startsAt: Date; endsAt: Date }, viewerId?: string) {
  const { players, characters } = await seasonRankings(db, season);
  const n = config.seasons.standingsSize;
  const shownPlayers = players.slice(0, n);
  const shownCharacters = characters.slice(0, n);
  const lookup = await names(db, shownPlayers.map((p) => p.userId), shownCharacters.map((c) => c.characterId));
  const mine = viewerId ? players.find((p) => p.userId === viewerId) : undefined;
  const champ = seasonChampion(characters, config.seasons);
  const top = topBettor(players, config.seasons);
  return {
    players: shownPlayers.map((p) => ({ rank: p.rank, name: lookup.user.get(p.userId) ?? "?", saltWon: p.saltWon.toString(), bets: p.bets, eligible: p.bets >= config.seasons.minBets })),
    characters: shownCharacters.map((c) => ({
      rank: c.rank,
      characterId: c.characterId,
      ...lookup.character.get(c.characterId)!,
      rating: Math.round(c.rating),
      record: { wins: c.wins, losses: c.losses },
      eligible: c.wins + c.losses >= config.seasons.minFights,
    })),
    /** Who would win the titles if the season ended now. */
    leaders: {
      champion: champ ? { characterId: champ.characterId, name: (await db.character.findUniqueOrThrow({ where: { id: champ.characterId } })).name } : null,
      topBettor: top ? { name: lookup.user.get(top.userId) ?? playerName(await db.user.findUniqueOrThrow({ where: { id: top.userId } })) } : null,
    },
    me: mine ? { rank: mine.rank, saltWon: mine.saltWon.toString(), bets: mine.bets } : null,
  };
}

/** An ended season's final standings, as kept. */
async function finalStandings(db: Db, seasonId: string, viewerId?: string) {
  const rows = await db.seasonStanding.findMany({ where: { seasonId }, orderBy: [{ kind: "asc" }, { rank: "asc" }], include: { user: true, character: { include: { owner: true } } } });
  const players = rows.filter((r) => r.kind === "PLAYER");
  const mine = viewerId ? players.find((r) => r.userId === viewerId) : undefined;
  return {
    players: players.map((r) => ({ rank: r.rank, name: r.user ? playerName(r.user) : "?", saltWon: r.saltWon!.toFixed(0), bets: r.bets! })),
    characters: rows
      .filter((r) => r.kind === "CHARACTER")
      .map((r) => ({
        rank: r.rank,
        characterId: r.characterId!,
        name: r.character!.name,
        tier: r.character!.tier,
        owner: r.character!.owner ? playerName(r.character!.owner) : "House",
        rating: Math.round(r.rating!),
        record: { wins: r.wins!, losses: r.losses! },
      })),
    me: mine ? { rank: mine.rank, saltWon: mine.saltWon!.toFixed(0), bets: mine.bets! } : null,
  };
}

const include = { champion: true, topBettor: true } as const;

/** One season by number (null: the running one). */
export async function seasonView(db: Db, config: Config, number: number | null, viewerId?: string) {
  const s = number === null ? await db.season.findFirst({ where: { status: "RUNNING" }, include }) : await db.season.findUnique({ where: { number }, include });
  if (!s) return null;
  const rules = { minFights: config.seasons.minFights, minBets: config.seasons.minBets };
  return s.status === "RUNNING"
    ? { ...summary(s), rules, ...(await liveStandings(db, config, s, viewerId)) }
    : { ...summary(s), rules, leaders: null, ...(await finalStandings(db, s.id, viewerId)) };
}

export async function recentSeasons(db: Db, take = 20) {
  return (await db.season.findMany({ orderBy: { number: "desc" }, take, include })).map(summary);
}

/** The player leaderboard: Salt won in the running season (it starts over each season). */
export async function leaderboard(db: Db, config: Config) {
  const s = await db.season.findFirst({ where: { status: "RUNNING" } });
  if (!s) return [];
  return (await liveStandings(db, config, s)).players;
}

/** The viewer's running-season numbers, for /api/me. */
export async function mySeason(db: Db, config: Config, userId: string) {
  const s = await db.season.findFirst({ where: { status: "RUNNING" } });
  if (!s) return null;
  const { players } = await seasonRankings(db, s);
  const mine = players.find((p) => p.userId === userId);
  return { number: s.number, endsAt: s.endsAt, rank: mine?.rank ?? null, saltWon: (mine?.saltWon ?? 0n).toString(), bets: mine?.bets ?? 0, minBets: config.seasons.minBets };
}
