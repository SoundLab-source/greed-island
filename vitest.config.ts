import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          include: ["packages/shared/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          include: ["packages/db/src/**/*.test.ts"],
          globalSetup: ["packages/db/src/test/global-setup.ts"],
          // Tests share one Postgres database, so files run one at a time.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
