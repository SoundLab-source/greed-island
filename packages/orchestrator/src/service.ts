/**
 * Running unattended on macOS (docs/DEPLOY.md): two launchd jobs for the
 * logged-in user. The stream (scripts/run-service.sh) starts at login and
 * again whenever it stops; the backup (scripts/backup-db.sh) runs nightly.
 * They are LaunchAgents, not daemons, because the game needs the user's
 * screen. Pure: builds the property lists; scripts/service.ts installs them.
 */
export const STREAM_LABEL = "com.greedisland.stream";
export const BACKUP_LABEL = "com.greedisland.backup";

export interface ServicePaths {
  repoRoot: string;
  logDir: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plist(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

/** The stream: started at login, restarted 30 s after it stops for any reason. */
export function streamPlist(p: ServicePaths): string {
  return plist(`  <key>Label</key><string>${STREAM_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>${esc(p.repoRoot)}/scripts/run-service.sh</string></array>
  <key>WorkingDirectory</key><string>${esc(p.repoRoot)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${esc(p.logDir)}/stream.log</string>
  <key>StandardErrorPath</key><string>${esc(p.logDir)}/stream.log</string>`);
}

/** The nightly database backup, at 04:30. */
export function backupPlist(p: ServicePaths): string {
  return plist(`  <key>Label</key><string>${BACKUP_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>${esc(p.repoRoot)}/scripts/backup-db.sh</string></array>
  <key>WorkingDirectory</key><string>${esc(p.repoRoot)}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>${esc(p.logDir)}/backup.log</string>
  <key>StandardErrorPath</key><string>${esc(p.logDir)}/backup.log</string>`);
}
