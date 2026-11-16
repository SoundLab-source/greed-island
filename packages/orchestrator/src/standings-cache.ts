/**
 * Standings that only change when a fight settles (season rankings, the "best calls" boards) are worked out from
 * every bet of the season, which grows to hundreds of thousands of rows: too much to add up again on every page view
 * (`/api/me` shows the viewer's season rank on every page). They're kept until the next fight settles instead.
 *
 * The mark is the latest settled fight (its number and when it closed), read through the index on `closed_at`, so a
 * cached answer is never older than the last settlement. Concurrent requests share one computation.
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

type Entry = { key: string; value: Promise<unknown> };
const caches = new WeakMap<Db, Map<string, Entry>>();

/**
 * `compute()`'s answer for `name`, worked out again only once another fight has settled (or `name` changes its key
 * parts, e.g. a new season). One entry per name; a failed computation isn't kept.
 */
export async function untilNextSettle<T>(db: Db, name: string, compute: () => Promise<T>): Promise<T> {
  const key = await settledMark(db);
  let cache = caches.get(db);
  if (!cache) caches.set(db, (cache = new Map()));
  const hit = cache.get(name);
  if (hit && hit.key === key) return hit.value as Promise<T>;
  const value = compute();
  const entry: Entry = { key, value };
  cache.set(name, entry);
  value.catch(() => {
    if (cache.get(name) === entry) cache.delete(name);
  });
  return value;
}
