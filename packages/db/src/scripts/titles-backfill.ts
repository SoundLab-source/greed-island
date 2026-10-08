// `pnpm titles:backfill`: award fighter titles and bettor titles for fights settled before they existed (safe to re-run).
import { loadConfig } from "@greed-island/shared";
import { backfillBettorTitles } from "../bettor-titles.ts";
import { createDb } from "../client.ts";
import { loadRepoEnv } from "../env.ts";
import { backfillTitles } from "../titles.ts";

loadRepoEnv();
const db = createDb();
try {
  const added = await backfillTitles(db);
  console.log(`Titles backfill: ${added} fighter title${added === 1 ? "" : "s"} added from past fights`);
  const bettors = await backfillBettorTitles(db, loadConfig().bettors);
  console.log(`Titles backfill: ${bettors} bettor title${bettors === 1 ? "" : "s"} added from past bets`);
} finally {
  await db.$disconnect();
}
