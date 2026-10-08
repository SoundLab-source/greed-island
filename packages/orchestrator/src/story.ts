/**
 * The announcer (docs/ENGAGEMENT.md §1): a fight's facts said out loud. Before the fight, the most interesting
 * lines (a debut, a win streak, a one-sided head-to-head, a rivalry, a long-shot underdog, a dead-even fight, which
 * styles tend to win this matchup); after it, one headline when there's a story (an upset, a streak broken or
 * extended, a promotion, a debut win). Pure: `storyFacts` gathers the facts from the database.
 */
import type { Archetype } from "@greed-island/shared";
import type { Db } from "@greed-island/db";

type Side = 1 | 2;
const other = (s: Side): Side => (s === 1 ? 2 : 1);

export interface StoryFacts {
  sides: Record<Side, {
    name: string;
    archetype: Archetype;
    debut: boolean;
    /** A community fighter's first fight on stream: the community that voted it in (docs/ENGAGEMENT.md §4). */
    communityDebut?: string | null;
    streak: { kind: "W" | "L"; n: number } | null;
    tier: string;
    tierAfter: string | null;
  }>;
  /** Their meetings before this fight. */
  headToHead: { fights: number; wins: Record<Side, number>; lastWinner: Side | null };
  /** Win chances (locked, or the live estimate) and payouts, when known. */
  chancePct: Record<Side, number> | null;
  multiplier: Record<Side, string> | null;
  /** "final", "semi-final"... for a tournament match (shared roundName). */
  tournamentRound: string | null;
  /** Which style tends to win this matchup on this roster, when the data says so. */
  styleEdge: { winner: Archetype; loser: Archetype; pct: number; fights: number } | null;
  result: { winnerSide: Side } | null;
}

export interface Story {
  /** Before the fight: the best few lines, most interesting first. */
  lines: string[];
  /** After it: the one headline worth shouting, if any. */
  headline: { kind: "upset" | "streak-broken" | "streak" | "promoted" | "debut-win"; text: string } | null;
  /** Each side's win streak as it stands (going in; after the result, the winner's grown by one and the loser's gone), when
   * it's 3 or more: a flame by the name. 0 otherwise. */
  flames: Record<Side, number>;
}

/** A win streak this long gets a flame by the name. */
export const FLAME_AT = 3;

/** Two characters are rivals once they've met this often with records at most one win apart (also what exhibitions
 * book as rivalry rematches: matchmaking `pickRivalry`). */
export const RIVALRY_MIN_FIGHTS = 4;
export const isRivalry = (wins: readonly [number, number]) => wins[0] + wins[1] >= RIVALRY_MIN_FIGHTS && Math.abs(wins[0] - wins[1]) <= 1;

/** Each style's name on the roster (the templates'), plural. */
export const STYLE_NAMES: Record<Archetype, string> = { ALL_ROUNDER: "Brawlers", RUSHDOWN: "Strikers", HEAVY: "Bruisers", GRAPPLER: "Wrestlers", ZONER: "Sages" };

const TIERS = ["P", "B", "A", "S", "X"];
const pct = (n: number) => `${Math.round(n)}%`;
/** "an 18%", "a 20%": numbers said with a vowel first (eight, eleven, eighteen, eighty...). */
const article = (n: number) => (/^(8|11|18)$/.test(String(Math.round(n))) || (Math.round(n) >= 80 && Math.round(n) < 90) ? "an" : "a");

export function fightStory(f: StoryFacts, max = 3): Story {
  const lines: { score: number; text: string }[] = [];
  const add = (score: number, text: string) => lines.push({ score, text });
  const name = (s: Side) => f.sides[s].name;
  const h = f.headToHead;

  if (f.tournamentRound === "final") add(100, "Tournament final: the winner takes the title");
  else if (f.tournamentRound === "semi-final") add(80, "Tournament semi-final: a place in the final on the line");
  for (const s of [1, 2] as const) {
    const x = f.sides[s];
    if (x.communityDebut) add(95, `Community debut: ${x.name}, voted in by ${x.communityDebut}`);
    else if (x.debut) add(90, `First fight ever for ${x.name}`);
    if (x.streak?.kind === "W" && x.streak.n >= 3) add(60 + 2 * x.streak.n, `${x.name} is on a ${x.streak.n}-fight win streak`);
    if (x.streak?.kind === "L" && x.streak.n >= 4) add(44 + x.streak.n, `${x.name} has lost ${x.streak.n} in a row`);
  }
  if (h.fights >= 3 && (h.wins[1] === 0 || h.wins[2] === 0)) {
    const loser: Side = h.wins[1] === 0 ? 1 : 2;
    add(75 + h.fights, `${name(loser)} has never beaten ${name(other(loser))} (0-${h.fights})`);
  } else if (isRivalry([h.wins[1], h.wins[2]])) {
    const lead: Side | null = h.wins[1] === h.wins[2] ? null : h.wins[1] > h.wins[2] ? 1 : 2;
    add(70, lead ? `Rivalry: ${name(lead)} leads ${name(other(lead))} ${h.wins[lead]}-${h.wins[other(lead)]}` : `Rivalry: all square at ${h.wins[1]}-${h.wins[2]}`);
  } else if (h.fights >= 1 && h.lastWinner) {
    add(50, `Rematch: ${name(h.lastWinner)} won their last meeting`);
  }
  if (f.chancePct) {
    const dog: Side = f.chancePct[1] <= f.chancePct[2] ? 1 : 2;
    const c = f.chancePct[dog];
    if (c <= 25) add(55 + (25 - c), `Upset alert: ${name(dog)} is ${article(c)} ${pct(c)} underdog${f.multiplier ? `, paying ${f.multiplier[dog].replace("x", "×")}` : ""}`);
    else if (Math.abs(f.chancePct[1] - f.chancePct[2]) <= 6) add(35, `Dead even: ${pct(f.chancePct[1])} to ${pct(f.chancePct[2])}`);
  }
  if (f.styleEdge) {
    const e = f.styleEdge;
    add(28 + (e.pct - 55), `${STYLE_NAMES[e.winner]} beat ${STYLE_NAMES[e.loser]} ${pct(e.pct)} of the time on this roster`);
  }

  return { lines: lines.sort((a, b) => b.score - a.score).slice(0, max).map((l) => l.text), headline: f.result ? headline(f, f.result.winnerSide) : null, flames: flames(f) };
}

function flames(f: StoryFacts): Record<Side, number> {
  const run = (s: Side) => {
    const st = f.sides[s].streak;
    const n = st?.kind === "W" ? st.n : 0;
    if (!f.result) return n;
    return f.result.winnerSide === s ? n + 1 : 0;
  };
  const lit = (n: number) => (n >= FLAME_AT ? n : 0);
  return { 1: lit(run(1)), 2: lit(run(2)) };
}

function headline(f: StoryFacts, w: Side): Story["headline"] {
  const l = other(w);
  const winner = f.sides[w], loser = f.sides[l];
  const chance = f.chancePct?.[w];
  if (chance !== undefined && chance <= 30) {
    return { kind: "upset", text: `UPSET! ${winner.name} wins at ${pct(chance)}${f.multiplier ? `, paying ${f.multiplier[w].replace("x", "×")}` : ""}` };
  }
  if (loser.streak?.kind === "W" && loser.streak.n >= 3) return { kind: "streak-broken", text: `STREAK BROKEN: ${loser.name}'s ${loser.streak.n}-fight run is over` };
  if (winner.tierAfter && TIERS.indexOf(winner.tierAfter) > TIERS.indexOf(winner.tier)) return { kind: "promoted", text: `${winner.name} moves up to ${winner.tierAfter} tier!` };
  if (winner.streak?.kind === "W" && winner.streak.n >= 2) return { kind: "streak", text: `${winner.name} makes it ${winner.streak.n + 1} in a row` };
  if (winner.debut) return { kind: "debut-win", text: `${winner.name} wins on debut!` };
  return null;
}

// ----- The post-fight breakdown -----

/** One round as stored (fight_round): its winner, how, and the event mod's detail when it has it. */
export interface RoundRecord {
  round: number;
  winnerSide: 0 | 1 | 2;
  reason: string;
  /** Per mille of full life, per side. */
  life: Record<Side, number> | null;
  low: Record<Side, number> | null;
  firstHit: 0 | 1 | 2 | null;
  ticks: number | null;
}

/**
 * Why the fight was won, in up to three lines, most telling first (DESIGN §14: a win should make sense, and the next
 * bet feel informed): a perfect round, a comeback from low life, a close finish, winning after losing the first round,
 * who hit first, a quick knockout, rounds on the clock. Only facts the rounds hold: older fights (before the event mod
 * reported life) get only the ones that need no life numbers.
 */
export function fightBreakdown(rounds: readonly RoundRecord[], names: Record<Side, string>, winner: Side, max = 3): string[] {
  const lines: { score: number; text: string }[] = [];
  const add = (score: number, text: string) => lines.push({ score, text });
  const w = winner, l = other(winner);
  const W = names[w], L = names[l];
  const won = rounds.filter((r) => r.winnerSide === w);
  const lost = rounds.filter((r) => r.winnerSide === l);
  const p = (perMille: number) => `${Math.round(perMille / 10)}%`;
  const sec = (ticks: number) => Math.max(1, Math.round(ticks / 60));

  const perfect = won.filter((r) => r.life && r.life[w] >= 1000 && r.reason === "ko");
  if (perfect.length) add(90 + perfect.length, perfect.length === 1 ? `${W} won round ${perfect[0]!.round} without taking a hit` : `${W} won ${perfect.length} rounds without taking a hit`);
  const comeback = won.filter((r) => r.low && r.low[w] <= 250).sort((a, b) => a.low![w] - b.low![w])[0];
  if (comeback) add(85 + Math.round((250 - comeback.low![w]) / 25), `Came back from ${p(comeback.low![w])} life to win round ${comeback.round}`);
  const last = rounds[rounds.length - 1];
  if (last && last.winnerSide === w && last.life && last.life[w] <= 150) add(82, `${lost.length ? "Won the deciding round" : "Finished it"} with just ${p(last.life[w])} life left`);
  else if (last && last.winnerSide === w && last.life) add(30, `Finished with ${p(last.life[w])} life left`);
  if (rounds[0]?.winnerSide === l && lost.length === 1 && won.length >= 2) add(70, `Lost the first round, then won ${won.length === 2 ? "the next two" : `${won.length} in a row`}`);
  const hits = rounds.filter((r) => r.firstHit === 1 || r.firstHit === 2);
  if (hits.length >= 2 && hits.every((r) => r.firstHit === w)) add(50, `Landed the first hit in every round`);
  else if (hits.length >= 2 && hits.every((r) => r.firstHit === l)) add(62, `Won without landing the first hit in any round`);
  const quick = won.filter((r) => r.reason === "ko" && r.ticks !== null && r.ticks > 0 && sec(r.ticks) <= 20).sort((a, b) => a.ticks! - b.ticks!)[0];
  if (quick) add(55 + (20 - sec(quick.ticks!)), `Knocked out ${L} in ${sec(quick.ticks!)} seconds in round ${quick.round}`);
  const clock = won.filter((r) => r.reason === "time");
  if (clock.length) add(45, clock.length === 1 ? `Won round ${clock[0]!.round} on the clock` : `Won ${clock.length} rounds on the clock`);
  return lines.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.text);
}

/** A run of the same result, newest first: "WWWL..." gives 3 wins. */
export function streakOf(results: readonly ("W" | "L")[]): { kind: "W" | "L"; n: number } | null {
  if (!results.length) return null;
  let n = 0;
  while (n < results.length && results[n] === results[0]) n++;
  return { kind: results[0]!, n };
}

/** Wins between styles on settled fights, `wins[a][b]` = how often a beat b (mirror matches left out). */
export type StyleWins = Partial<Record<Archetype, Partial<Record<Archetype, number>>>>;

/** Which of two styles tends to win, when there are enough fights and the edge is clear. */
export function styleEdge(wins: StyleWins, a: Archetype, b: Archetype, minFights = 40, minPct = 57): StoryFacts["styleEdge"] {
  if (a === b) return null;
  const ab = wins[a]?.[b] ?? 0, ba = wins[b]?.[a] ?? 0, total = ab + ba;
  if (total < minFights) return null;
  const top = ab >= ba ? { winner: a, loser: b, n: ab } : { winner: b, loser: a, n: ba };
  const share = (100 * top.n) / total;
  return share >= minPct ? { winner: top.winner, loser: top.loser, pct: Math.round(share), fights: total } : null;
}

// ----- Gathering the facts -----

let styleCache: { at: number; db: Db; wins: StyleWins } | null = null;

/** Every settled fight's styles and winner, tallied (kept for five minutes: it changes slowly). */
export async function styleWins(db: Db, now = Date.now()): Promise<StyleWins> {
  if (styleCache && styleCache.db === db && now - styleCache.at < 5 * 60_000) return styleCache.wins;
  const rows = await db.$queryRaw<{ a1: Archetype; a2: Archetype; w: number; n: number }[]>`
    SELECT f1.archetype::text AS a1, f2.archetype::text AS a2, fi.winner_side::int AS w, COUNT(*)::int AS n
    FROM fight fi
    JOIN character c1 ON c1.id = fi.side1_character_id JOIN fighter f1 ON f1.id = c1.fighter_id
    JOIN character c2 ON c2.id = fi.side2_character_id JOIN fighter f2 ON f2.id = c2.fighter_id
    WHERE fi.state = 'SETTLED' AND fi.winner_side IS NOT NULL
    GROUP BY 1, 2, 3`;
  const wins: StyleWins = {};
  for (const r of rows) {
    if (r.a1 === r.a2) continue;
    const [won, lost] = r.w === 1 ? [r.a1, r.a2] : [r.a2, r.a1];
    const row = (wins[won] ??= {});
    row[lost] = (row[lost] ?? 0) + Number(r.n);
  }
  styleCache = { at: now, db, wins };
  return wins;
}

/** A character's results before fight number `before`, newest first. */
async function formBefore(db: Db, characterId: string, before: number, n = 30): Promise<("W" | "L")[]> {
  const fights = await db.fight.findMany({
    where: { state: "SETTLED", number: { lt: before }, OR: [{ side1CharacterId: characterId }, { side2CharacterId: characterId }] },
    orderBy: { number: "desc" },
    take: n,
    select: { winnerCharacterId: true },
  });
  return fights.map((x) => (x.winnerCharacterId === characterId ? "W" : "L"));
}

/** The facts for a fight, as of when it was booked (streaks and meetings before it). */
export async function storyFacts(
  db: Db,
  fight: { number: number; side1CharacterId: string; side2CharacterId: string; winnerSide: number | null; state: string },
  view: {
    sides: Record<Side, { name: string; tier: string; tierAfter?: string | null; community?: { name: string; debut: boolean } | null }>;
    odds: { chancePct: Record<Side, number>; multiplier: Record<Side, string> } | null;
    tournament: { roundName: string } | null;
  },
): Promise<StoryFacts> {
  const ids: Record<Side, string> = { 1: fight.side1CharacterId, 2: fight.side2CharacterId };
  const chars = await db.character.findMany({ where: { id: { in: [ids[1], ids[2]] } }, select: { id: true, fighter: { select: { archetype: true } } } });
  const archetype = (s: Side) => chars.find((c) => c.id === ids[s])!.fighter.archetype as Archetype;
  const forms = { 1: await formBefore(db, ids[1], fight.number), 2: await formBefore(db, ids[2], fight.number) };
  const meetings = await db.fight.findMany({
    where: {
      state: "SETTLED",
      number: { lt: fight.number },
      OR: [
        { side1CharacterId: ids[1], side2CharacterId: ids[2] },
        { side1CharacterId: ids[2], side2CharacterId: ids[1] },
      ],
    },
    orderBy: { number: "desc" },
    select: { winnerCharacterId: true },
  });
  const wins = { 1: meetings.filter((m) => m.winnerCharacterId === ids[1]).length, 2: meetings.filter((m) => m.winnerCharacterId === ids[2]).length };
  const last = meetings[0]?.winnerCharacterId;
  const side = (s: Side) => {
    const v = view.sides[s];
    const communityDebut = v.community?.debut ? v.community.name : null;
    return { name: v.name, archetype: archetype(s), debut: forms[s].length === 0, communityDebut, streak: streakOf(forms[s]), tier: v.tier, tierAfter: v.tierAfter ?? null };
  };
  return {
    sides: { 1: side(1), 2: side(2) },
    headToHead: { fights: meetings.length, wins, lastWinner: last === ids[1] ? 1 : last === ids[2] ? 2 : null },
    chancePct: view.odds ? view.odds.chancePct : null,
    multiplier: view.odds ? view.odds.multiplier : null,
    tournamentRound: view.tournament?.roundName ?? null,
    styleEdge: styleEdge(await styleWins(db), archetype(1), archetype(2)),
    result: fight.state === "SETTLED" && (fight.winnerSide === 1 || fight.winnerSide === 2) ? { winnerSide: fight.winnerSide } : null,
  };
}

// ----- The scouting card (docs/ENGAGEMENT.md §2) -----

export interface Scouting {
  /** Each side's style, by its roster name ("Wrestler"). */
  styles: Record<Side, string>;
  /** How the two styles have done against each other on this roster (settled fights; none for a mirror match). */
  styleRecord: { fights: number; wins: Record<Side, number> } | null;
  /** Each character's own record against the other's style, before this fight. */
  vsStyle: Record<Side, { fights: number; wins: number }>;
}

/** Each style's name on the roster, singular. */
export const STYLE_NAME: Record<Archetype, string> = { ALL_ROUNDER: "Brawler", RUSHDOWN: "Striker", HEAVY: "Bruiser", GRAPPLER: "Wrestler", ZONER: "Sage" };

/** The scouting card's numbers for a fight. */
export async function scouting(db: Db, fight: { number: number; side1CharacterId: string; side2CharacterId: string }): Promise<Scouting> {
  const ids: Record<Side, string> = { 1: fight.side1CharacterId, 2: fight.side2CharacterId };
  const chars = await db.character.findMany({ where: { id: { in: [ids[1], ids[2]] } }, select: { id: true, fighter: { select: { archetype: true } } } });
  const style = (s: Side) => chars.find((c) => c.id === ids[s])!.fighter.archetype as Archetype;
  const wins = await styleWins(db);
  const a1 = style(1), a2 = style(2);
  const styleRecord = a1 === a2 ? null : { fights: (wins[a1]?.[a2] ?? 0) + (wins[a2]?.[a1] ?? 0), wins: { 1: wins[a1]?.[a2] ?? 0, 2: wins[a2]?.[a1] ?? 0 } };
  const vs = async (s: Side) => {
    const c = ids[s], against = style(s === 1 ? 2 : 1);
    const [row] = await db.$queryRaw<{ fights: number; wins: number }[]>`
      SELECT COUNT(*)::int AS fights, COUNT(*) FILTER (WHERE fi.winner_character_id = ${c}::uuid)::int AS wins
      FROM fight fi
      JOIN character o ON o.id = CASE WHEN fi.side1_character_id = ${c}::uuid THEN fi.side2_character_id ELSE fi.side1_character_id END
      JOIN fighter f ON f.id = o.fighter_id
      WHERE fi.state = 'SETTLED' AND fi.number < ${fight.number}
        AND (fi.side1_character_id = ${c}::uuid OR fi.side2_character_id = ${c}::uuid)
        AND f.archetype::text = ${against}`;
    return { fights: Number(row?.fights ?? 0), wins: Number(row?.wins ?? 0) };
  };
  return { styles: { 1: STYLE_NAME[a1], 2: STYLE_NAME[a2] }, styleRecord, vsStyle: { 1: await vs(1), 2: await vs(2) } };
}
