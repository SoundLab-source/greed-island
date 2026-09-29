import { defineConfig } from "vitest/config";

// Tests that touch Postgres all live in the "db" project: every file in
// packages/db, plus any `*.db.test.ts` elsewhere. They share one database, so
// that project runs one file at a time. Everything else runs in parallel.
const dbTests = ["packages/db/src/**/*.test.ts", "packages/*/src/**/*.db.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts"],
          exclude: [...dbTests, "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "db",
          include: dbTests,
          globalSetup: ["packages/db/src/test/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
