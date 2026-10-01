import { describe, expect, it } from "vitest";
import { BACKUP_LABEL, backupPlist, STREAM_LABEL, streamPlist } from "./service.ts";

const paths = { repoRoot: "/Users/me/greed & island", logDir: "/Users/me/Library/Logs/GreedIsland" };

describe("launchd jobs", () => {
  it("the stream starts at login and is kept alive, with its log", () => {
    const p = streamPlist(paths);
    expect(p).toContain(`<key>Label</key><string>${STREAM_LABEL}</string>`);
    expect(p).toContain("<string>/Users/me/greed &amp; island/scripts/run-service.sh</string>");
    expect(p).toContain("<key>RunAtLoad</key><true/>");
    expect(p).toContain("<key>KeepAlive</key><true/>");
    expect(p).toContain("<key>ThrottleInterval</key><integer>30</integer>");
    expect(p).toContain("/Users/me/Library/Logs/GreedIsland/stream.log");
    expect(p.startsWith('<?xml version="1.0"')).toBe(true);
  });

  it("the backup runs every night", () => {
    const p = backupPlist(paths);
    expect(p).toContain(`<string>${BACKUP_LABEL}</string>`);
    expect(p).toContain("scripts/backup-db.sh");
    expect(p).toContain("<key>Hour</key><integer>4</integer>");
    expect(p).not.toContain("KeepAlive");
  });
});
