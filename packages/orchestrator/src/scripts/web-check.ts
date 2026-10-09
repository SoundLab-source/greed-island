// `pnpm web:check [--url http://127.0.0.1:3000] [--widths 375,826,1100,1280,1600,2000] [--pages shop,rankings]`: open every
// page of the running site (pnpm dev) in a hidden Chrome at each width and report what looks broken (web-check.ts).
// Screenshots go to runs/web-check/; exits 1 when anything's found. Chrome: CHROME_BIN, or the usual macOS path.
import { REPO_ROOT } from "@greed-island/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { AUDIT_SCRIPT, HiddenChrome, summarize, type PageCheck } from "../web-check.ts";

const { values } = parseArgs({ options: { url: { type: "string" }, widths: { type: "string" }, pages: { type: "string" } } });
const base = (values.url ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const widths = (values.widths ?? "375,826,1100,1280,1600,2000").split(",").map(Number);
const PAGES = ["index", "shop", "roster", "fighters", "fighter", "collection", "rankings", "vote", "account", "how-to-play", "terms", "privacy", "submit"];
const pages = values.pages ? values.pages.split(",") : PAGES;

// A fighter's page needs a character: the top of the rankings (the one with the most titles and fights to show).
async function pageUrl(page: string): Promise<string | null> {
  if (page !== "fighter") return `${base}/${page}.html`;
  const list = (await (await fetch(`${base}/api/characters`)).json()) as { id: string }[];
  return list[0] ? `${base}/fighter.html?id=${encodeURIComponent(list[0].id)}` : null;
}

try {
  await fetch(base);
} catch {
  console.error(`Nothing at ${base}: start the site first (pnpm dev).`);
  process.exit(1);
}
const out = path.join(REPO_ROOT, "runs", "web-check");
await mkdir(out, { recursive: true });
const chrome = await HiddenChrome.launch(process.env["CHROME_BIN"] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", path.join(out, "chrome-profile"));
const results: PageCheck[] = [];
try {
  await chrome.send("Page.enable");
  for (const page of pages) {
    const url = await pageUrl(page);
    if (!url) {
      console.warn(`skipped ${page}: nothing to show`);
      continue;
    }
    for (const width of widths) {
      await chrome.open(url, width, width < 700 ? 900 : Math.round(width * 0.6), 2500);
      results.push({ page, width, problems: await chrome.evaluate<string[]>(AUDIT_SCRIPT) });
      await writeFile(path.join(out, `${page}-${width}.png`), await chrome.screenshot());
    }
  }
} finally {
  chrome.close();
}
for (const line of summarize(results)) console.log(line);
console.log(`Screenshots: ${path.relative(REPO_ROOT, out)}/`);
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
