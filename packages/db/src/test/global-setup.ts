import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { testDatabaseUrl } from "./env.ts";

/** Check Postgres is reachable, then apply migrations to the test database. */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Can't reach the test database (${(err as Error).message}).\n` +
        `Start Postgres with: docker compose up -d`,
    );
  } finally {
    await client.end().catch(() => {});
  }
  const dbDir = fileURLToPath(new URL("../..", import.meta.url));
  execFileSync(fileURLToPath(new URL("../../node_modules/.bin/prisma", import.meta.url)), ["migrate", "deploy"], {
    cwd: dbDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
