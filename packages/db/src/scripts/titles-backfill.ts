// `pnpm titles:backfill`: award titles for fights settled before titles existed (safe to re-run).
import { createDb } from "../client.ts";
import { loadRepoEnv } from "../env.ts";
import { backfillTitles } from "../titles.ts";

loadRepoEnv();
const db = createDb();
try {
  const added = await backfillTitles(db);
  console.log(`Titles backfill: ${added} title${added === 1 ? "" : "s"} added from past fights`);
} finally {
  await db.$disconnect();
}
