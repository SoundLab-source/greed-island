/**
 * Read models that many requests ask for at once, kept while what they're made from hasn't changed.
 *
 * - Standings that only change when a fight settles (season rankings, the "best calls" boards) are worked out from
 *   every bet of the season, which grows to hundreds of thousands of rows: too much to add up again on every page view
 *   (`/api/me` shows the viewer's season rank on every page). `untilNextSettle` keeps them until the next settlement:
 *   the mark is the latest settled fight (its number and when it closed), read through the index on `closed_at`.
 * - A fight's view: every open watch page fetches it again at each step of the fight, all at the same moment, and so
 *   does every bot player. Its shared part is kept while the fight's version and its bets are unchanged (`fightMark`).
 *
 * Requests at the same moment share one computation; a failed computation isn't kept. Each cache holds at most
 * `MAX_ENTRIES` names (the oldest go first).
 */
import type { Db } from "@greed-island/db";

/** Changes whenever a fight settles. */
export async function settledMark(db: Db): Promise<string> {
  const [r] = await db.$queryRaw<{ n: number; at: Date }[]>`
    SELECT "number" AS n, "closed_at" AS at FROM "fight"
    WHERE "state" = 'SETTLED' AND "closed_at" IS NOT NULL
    ORDER BY "closed_at" DESC LIMIT 1`;
  return r ? `${r.n}@${r.at.getTime()}` : "none";
}

/** Changes whenever the fight moves on (its version) or a bet on it is placed or changed. `extra` is added as is. */
export async function fightMark(db: Db, fightId: string, extra = ""): Promise<string> {
  const [r] = await db.$queryRaw<{ v: number; n: bigint; at: Date | null }[]>`
    SELECT f."version" AS v, COUNT(b."id") AS n, MAX(b."updated_at") AS at
    FROM "fight" f LEFT JOIN "bet" b ON b."fight_id" = f."id"
    WHERE f."id" = ${fightId}::uuid
    GROUP BY f."version"`;
  return r ? `${r.v}:${r.n}:${r.at?.getTime() ?? 0}:${extra}` : `none:${extra}`;
}

const MAX_ENTRIES = 64;
type Entry = { key: string; at: number; value: Promise<unknown> };
const caches = new WeakMap<Db, Map<string, Entry>>();

/**
 * `compute()`'s answer for `name`, worked out again when `key` changes, or after `maxAgeMs` if given. One entry per
 * name.
 */
export async function keptWhile<T>(db: Db, name: string, key: string, compute: () => Promise<T>, opts: { maxAgeMs?: number; now?: () => number } = {}): Promise<T> {
  const now = opts.now ?? Date.now;
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new Map()));
  const hit = cache.get(name);
  if (hit && hit.key === key && (opts.maxAgeMs === undefined || now() - hit.at < opts.maxAgeMs)) return hit.value as Promise<T>;
  const value = compute();
  const entry: Entry = { key, at: now(), value };
  cache.delete(name); // re-inserted last: the newest
  cache.set(name, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  value.catch(() => {
    if (cache.get(name) === entry) cache.delete(name);
  });
  return value;
}

/** `compute()`'s answer for `name`, worked out again only once another fight has settled. */
export async function untilNextSettle<T>(db: Db, name: string, compute: () => Promise<T>): Promise<T> {
  return keptWhile(db, name, await settledMark(db), compute);
}
