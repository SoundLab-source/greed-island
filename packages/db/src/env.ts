import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file's location. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Load the repo-root .env into process.env for scripts. Variables already set
 * in the environment win over the file.
 */
export function loadRepoEnv(): void {
  const file = `${REPO_ROOT}.env`;
  if (existsSync(file)) process.loadEnvFile(file);
}
