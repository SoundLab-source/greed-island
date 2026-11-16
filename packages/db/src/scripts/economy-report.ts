// `pnpm economy:report [--weeks 12]`: players' Salt week by week, where it came from and went, and whether it's growing
// faster than the number of active players (DESIGN §9). Read-only; the same numbers are on the staff page.
import { FLOW_LABEL, type FlowGroup } from "@greed-island/shared";
import { createDb } from "../client.ts";
import { economyReportFor } from "../economy.ts";
import { loadRepoEnv } from "../env.ts";

loadRepoEnv();
const args = process.argv.slice(2).filter((a) => a !== "--");
const weeks = args.includes("--weeks") ? Number(args[args.indexOf("--weeks") + 1]) : 12;
if (!Number.isInteger(weeks) || weeks < 1 || weeks > 260) {
  console.error("Usage: pnpm economy:report [--weeks 1-260]");
  process.exit(2);
}
const db = createDb();
try {
  const r = await economyReportFor(db, { weeks });
  const n = (v: bigint) => v.toLocaleString("en-US");
  const pct = (v: number | null) => (v === null ? "     -" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`.padStart(6));
  console.log(`Salt supply, last ${weeks} week${weeks === 1 ? "" : "s"} (players only; bots and the house left out)\n`);
  console.log("week of        in         out      players' Salt  active  per active  growth Salt / players");
  for (const w of r.weeks) {
    console.log(
      `${w.week.toISOString().slice(0, 10)}  ${("+" + n(w.in)).padStart(9)}  ${("-" + n(w.out)).padStart(9)}  ${n(w.supply).padStart(14)}  ${String(w.activePlayers).padStart(6)}  ${(w.perActive === null ? "-" : n(w.perActive)).padStart(10)}  ${pct(w.supplyGrowthPct)} / ${pct(w.activeGrowthPct)}${w.inflating ? "  ← faster than players" : ""}`,
    );
    const flows = (Object.entries(w.flows) as [FlowGroup, bigint][]).filter(([, v]) => v !== 0n).map(([k, v]) => `${FLOW_LABEL[k]} ${v > 0n ? "+" : ""}${n(v)}`);
    if (flows.length) console.log(`            ${flows.join(", ")}`);
  }
  console.log(`\n${r.advice}`);
} finally {
  await db.$disconnect();
}
