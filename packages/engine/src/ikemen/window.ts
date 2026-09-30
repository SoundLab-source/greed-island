/**
 * macOS: bring a just-launched IKEMEN window to the front. The runner starts
 * the engine in the background, so its window opens behind whatever app is in
 * front, and a whole-screen stream capture shows the wrong thing
 * (docs/obs-notes.md). Activating the process through AppKit, via macOS's
 * built-in JavaScript automation, brings it forward (docs/ikemen-notes.md §1).
 */
import { execFile } from "node:child_process";

/** Resolves true if the app was activated. Never throws; does nothing off macOS. */
export function activateMacApp(pid: number): Promise<boolean> {
  if (process.platform !== "darwin" || !Number.isInteger(pid) || pid <= 0) return Promise.resolve(false);
  const script =
    `ObjC.import("AppKit"); const a = $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid});` +
    ` a.isNil() ? "no" : (a.activateWithOptions($.NSApplicationActivateAllWindows) ? "yes" : "no")`;
  return new Promise((resolve) =>
    execFile("osascript", ["-l", "JavaScript", "-e", script], { timeout: 5_000 }, (err, stdout) => resolve(!err && stdout.trim() === "yes")),
  );
}
