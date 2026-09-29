// `pnpm ledger:audit`: verify the ledger invariants against the database in DATABASE_URL.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditLedger } from "../audit.ts";
import { createDb } from "../client.ts";

const envFile = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);

const db = createDb();
try {
  const report = await auditLedger(db);
  const s = report.stats;
  console.log(`Ledger audit: ${s.transactions} transactions, ${s.accounts} accounts`);
  console.log(`  issued ${s.issued} = users ${s.userBalances} + escrow ${s.escrow} + house ${s.house}`);
  if (report.ok) {
    console.log("OK: all checks passed");
  } else {
    for (const p of report.problems) console.error(`FAIL [${p.check}] ${p.detail}`);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
