// `pnpm service:install | service:uninstall | service:status` (macOS): run Greed Island unattended.
// install: the stream starts at login and restarts whenever it stops, and the database is backed up
// every night at 04:30 (docs/DEPLOY.md). Logs: ~/Library/Logs/GreedIsland/.
import { REPO_ROOT } from "@greed-island/db";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { BACKUP_LABEL, backupPlist, STREAM_LABEL, streamPlist } from "../service.ts";

if (process.platform !== "darwin") {
  console.error("These commands set up launchd on macOS. On Linux, use the systemd units in docs/DEPLOY.md.");
  process.exit(1);
}
const command = process.argv[2];
const repoRoot = REPO_ROOT.replace(/\/$/, "");
const logDir = path.join(homedir(), "Library", "Logs", "GreedIsland");
const agents = path.join(homedir(), "Library", "LaunchAgents");
const domain = `gui/${userInfo().uid}`;
const jobs = [
  { label: STREAM_LABEL, file: path.join(agents, `${STREAM_LABEL}.plist`), body: streamPlist({ repoRoot, logDir }) },
  { label: BACKUP_LABEL, file: path.join(agents, `${BACKUP_LABEL}.plist`), body: backupPlist({ repoRoot, logDir }) },
];
const launchctl = (...args: string[]) => {
  try {
    return { ok: true, out: execFileSync("launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { ok: false, out: String((e as { stderr?: string }).stderr ?? e) };
  }
};

if (command === "install") {
  await mkdir(logDir, { recursive: true });
  await mkdir(agents, { recursive: true });
  for (const j of jobs) {
    launchctl("bootout", `${domain}/${j.label}`); // replace an older install
    await writeFile(j.file, j.body);
    const r = launchctl("bootstrap", domain, j.file);
    if (!r.ok) {
      console.error(`couldn't load ${j.label}: ${r.out.trim()}`);
      process.exit(1);
    }
  }
  console.log(`Installed. The stream starts now and at every login, and restarts if it stops.
The database is backed up every night at 04:30 into ${path.join(repoRoot, "backups")}.
Logs: ${logDir}/stream.log and backup.log
For it to run after a restart, the Mac must log this user in automatically and Docker Desktop must start at login (docs/DEPLOY.md).
Stop it with: pnpm service:uninstall`);
} else if (command === "uninstall") {
  for (const j of jobs) {
    launchctl("bootout", `${domain}/${j.label}`);
    if (existsSync(j.file)) await rm(j.file);
  }
  console.log("Uninstalled: the stream stops (the fight in progress is refunded) and no longer starts at login. Backups stop too.");
} else if (command === "status") {
  for (const j of jobs) {
    const r = launchctl("print", `${domain}/${j.label}`);
    const state = r.ok ? (/state = (\w+)/.exec(r.out)?.[1] ?? "loaded") : "not installed";
    const runs = r.ok ? /runs = (\d+)/.exec(r.out)?.[1] : undefined;
    const exit = r.ok ? /last exit code = ([^\n]+)/.exec(r.out)?.[1] : undefined;
    console.log(`${j.label}: ${state}${runs ? `, started ${runs} time${runs === "1" ? "" : "s"}` : ""}${exit ? `, last exit ${exit}` : ""}`);
  }
  const port = process.env["GI_PORT"] ?? "3000";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    console.log(`health: ${res.status} ${await res.text()}`);
  } catch {
    console.log("health: the server isn't answering");
  }
  console.log(`logs: ${logDir}`);
} else {
  console.error("usage: pnpm service:install | service:uninstall | service:status");
  process.exit(1);
}
