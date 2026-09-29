import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_TEST_URL = "postgresql://greed:greed@localhost:54329/greed_island_test";

/** The test database URL: TEST_DATABASE_URL from env or the repo .env, else the docker-compose default. */
export function testDatabaseUrl(): string {
  const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
  if (!process.env["TEST_DATABASE_URL"] && existsSync(envFile)) {
    const saved = process.env["DATABASE_URL"];
    process.loadEnvFile(envFile);
    // Only TEST_DATABASE_URL is wanted from .env; never point tests at the dev DB.
    if (saved === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = saved;
  }
  return process.env["TEST_DATABASE_URL"] ?? DEFAULT_TEST_URL;
}
