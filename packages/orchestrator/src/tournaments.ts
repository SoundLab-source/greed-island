/**
 * Tournaments (DESIGN §5, docs/PHASE2.md step 6): one single-elimination
 * bracket per cycle, in a tier that rotates S, A, B, P. Bets use the
 * tournament's own T-Salt book. These functions run inside the booking or
 * settlement transaction.
 */
import { tournamentBalances, type Tx } from "@greed-island/db";
import { pendingDebuts } from "./releases.ts";
import {
  bettorPodium,
  firstRound,
  MAIN_BOOK,
  nextSlot,
  pickSeats,
  PODIUM_TITLE_CODES,
  PLAYER_TITLES,
  playerName,
  roundsFor,
  tournamentBook,
  tournamentTier,
  type Book,
  type Config,
  type Tier,
} from "@greed-island/shared";

type TournamentRow = Awaited<ReturnType<Tx["tournament"]["findUniqueOrThrow"]>>;
type MatchRow = Awaited<ReturnType<Tx["tournamentMatch"]["findUniqueOrThrow"]>>;

export interface TournamentFinished {
  tournamentId: string;
  number: number;
  tier: Tier;
  championCharacterId: string;
  championName: string;
  podium: { name: string; code: (typeof PODIUM_TITLE_CODES)[number]; label: string; balance: bigint }[];
}

/**
 * The cycle's tournament, seeded on first use: the tier's players'
 * characters first, then its house characters, then the nearest house
 * characters from other tiers. Cancelled if fewer than 2 can play.
 */
export async function ensureTournament(tx: Tx, cycle: number, maxSize: number, config: Config): Promise<{ tournament: TournamentRow; created: boolean }> {
  const existing = await tx.tournament.findUnique({ where: { cycle } });
  if (existing) return { tournament: existing, created: false };
  const tier = tournamentTier(cycle);
  const characters = await tx.character.findMany({ where: { enabled: true, fighter: { enabled: true } } });
  // Newly released community fighters debut here, seated first.
  const debuts = await pendingDebuts(tx);
  const seats = pickSeats(
    characters.map((c) => ({ characterId: c.id, tier: c.tier, rating: c.rating, owned: c.ownerKind === "USER" })),
    tier,
    maxSize,
    config.tiers,
    new Set(debuts.map((d) => d.characterId)),
  );
  if (seats.length < 2) {
    const tournament = await tx.tournament.create({ data: { cycle, tier, size: 0, status: "CANCELLED", cancelReason: "fewer than 2 characters could play" } });
    return { tournament, created: true };
  }
  const size = seats.length;
  const seated = new Set(seats.map((s) => s.characterId));
  const debuting = debuts.filter((d) => seated.has(d.characterId));
  const tournament = await tx.tournament.create({ data: { cycle, tier, size, debut: debuting.length > 0 } });
  for (const d of debuting) await tx.release.update({ where: { id: d.releaseId }, data: { debutTournamentId: tournament.id } });
  const byId = new Map(characters.map((c) => [c.id, c]));
  await tx.tournamentEntry.createMany({
    data: seats.map((s, i) => ({ tournamentId: tournament.id, seed: i + 1, characterId: s.characterId, rating: s.rating, tier: byId.get(s.characterId)!.tier })),
  });
  // Every match up front: round 1 seeded, later rounds filled in as winners advance.
  const matches: { tournamentId: string; round: number; slot: number; side1CharacterId: string | null; side2CharacterId: string | null }[] = firstRound(size).map(
    ([a, b], slot) => ({ tournamentId: tournament.id, round: 1, slot, side1CharacterId: seats[a - 1]!.characterId, side2CharacterId: seats[b - 1]!.characterId }),
  );
  for (let round = 2; round <= roundsFor(size); round++) {
    for (let slot = 0; slot < size / 2 ** round; slot++) matches.push({ tournamentId: tournament.id, round, slot, side1CharacterId: null, side2CharacterId: null });
  }
  await tx.tournamentMatch.createMany({ data: matches });
  return { tournament, created: true };
}

/**
 * The next match to play (earliest round, then slot). A match with a
 * disabled character is decided as a walkover on the way. Returns no match
 * once the tournament is decided, with the result if this call finished it.
 */
export async function nextTournamentMatch(tx: Tx, tournament: TournamentRow, config: Config, now: Date): Promise<{ match: MatchRow | null; finished: TournamentFinished | null }> {
  for (;;) {
    const match = await tx.tournamentMatch.findFirst({
      where: { tournamentId: tournament.id, winnerCharacterId: null, side1CharacterId: { not: null }, side2CharacterId: { not: null } },
      orderBy: [{ round: "asc" }, { slot: "asc" }],
    });
    if (!match) return { match: null, finished: null };
    const active = async (id: string) => {
      const c = await tx.character.findUniqueOrThrow({ where: { id }, include: { fighter: { select: { enabled: true } } } });
      return c.enabled && c.fighter.enabled;
    };
    const [a1, a2] = [await active(match.side1CharacterId!), await active(match.side2CharacterId!)];
    if (a1 && a2) return { match, finished: null };
    // Walkover: the active side goes through (the higher seed, side 1, if neither can play).
    const winner = a1 || !a2 ? match.side1CharacterId! : match.side2CharacterId!;
    const finished = await decideMatch(tx, match, winner, { walkover: true, fightId: null, now }, config);
    if (finished) return { match: null, finished };
  }
}

/** Record a match result and move the winner on. After the final, finish the tournament. */
export async function decideMatch(
  tx: Tx,
  match: MatchRow,
  winnerCharacterId: string,
  opts: { walkover: boolean; fightId: string | null; now: Date },
  config: Config,
): Promise<TournamentFinished | null> {
  await tx.tournamentMatch.update({ where: { id: match.id }, data: { winnerCharacterId, walkover: opts.walkover, decidedAt: opts.now } });
  const tournament = await tx.tournament.findUniqueOrThrow({ where: { id: match.tournamentId } });
  const next = nextSlot(match.round, match.slot, tournament.size);
  if (next) {
    await tx.tournamentMatch.update({
      where: { tournamentId_round_slot: { tournamentId: tournament.id, round: next.round, slot: next.slot } },
      data: next.side === 1 ? { side1CharacterId: winnerCharacterId } : { side2CharacterId: winnerCharacterId },
    });
    return null;
  }
  return finishTournament(tx, tournament, winnerCharacterId, opts.fightId, opts.now, config);
}

async function finishTournament(tx: Tx, t: TournamentRow, championId: string, fightId: string | null, now: Date, config: Config): Promise<TournamentFinished> {
  await tx.tournament.update({ where: { id: t.id }, data: { status: "FINISHED", finishedAt: now, championCharacterId: championId } });
  const champion = await tx.character.findUniqueOrThrow({ where: { id: championId } });
  await tx.characterTitle.create({
    data: { characterId: championId, code: "TOURNAMENT_CHAMPION", tournamentId: t.id, fightId, ownerKind: champion.ownerKind, ownerUserId: champion.ownerUserId, earnedAt: now },
  });
  // The T-Salt podium: players who finished above the starting balance.
  const podium = bettorPodium(await tournamentBalances(tx, t.id), config.tournaments);
  const result: TournamentFinished["podium"] = [];
  for (const [i, p] of podium.entries()) {
    const code = PODIUM_TITLE_CODES[i]!;
    await tx.playerTitle.create({ data: { userId: p.userId, code, tournamentId: t.id, balance: p.balance.toString(), earnedAt: now } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: p.userId } });
    result.push({ name: playerName(user), code, label: PLAYER_TITLES[code].label, balance: p.balance });
  }
  return { tournamentId: t.id, number: t.number, tier: t.tier, championCharacterId: championId, championName: champion.name, podium: result };
}

/** The ledger book a fight's bets use: its tournament's T-Salt, or main Salt. */
export async function bookOf(tx: Tx, fight: { tournamentMatchId: string | null }): Promise<Book> {
  if (!fight.tournamentMatchId) return MAIN_BOOK;
  const match = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: fight.tournamentMatchId }, select: { tournamentId: true } });
  return tournamentBook(match.tournamentId);
}
