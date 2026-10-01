/**
 * Only one orchestrator may run at a time: a session-level Postgres advisory
 * lock held on a dedicated connection for the life of the process.
 */
import pg from "pg";

/** Arbitrary fixed bigint key. Single-bigint locks are a separate space from the per-fight two-int locks. */
const ORCHESTRATOR_LOCK_KEY = "435527590500";

export class OrchestratorAlreadyRunningError extends Error {
  override name = "OrchestratorAlreadyRunningError";
  constructor() {
    super("another orchestrator already holds the lock");
  }
}

export interface OrchestratorLock {
  release(): Promise<void>;
}

/**
 * `onLost` is called if the lock's connection fails later (e.g. the database
 * restarts): the lock is gone, so the process should stop and start again.
 */
export async function acquireOrchestratorLock(databaseUrl: string, onLost?: (err: Error) => void): Promise<OrchestratorLock> {
  const client = new pg.Client({ connectionString: databaseUrl });
  let released = false;
  // Without a listener, a connection error is an unhandled 'error' event and kills the process.
  client.on("error", (err) => {
    if (!released) onLost?.(err);
  });
  await client.connect();
  const { rows } = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS ok", [ORCHESTRATOR_LOCK_KEY]);
  if (!rows[0]?.ok) {
    await client.end();
    throw new OrchestratorAlreadyRunningError();
  }
  return {
    async release() {
      if (released) return;
      released = true;
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [ORCHESTRATOR_LOCK_KEY]).catch(() => {});
      await client.end();
    },
  };
}
