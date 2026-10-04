/**
 * macOS: is the screen locked? While it is, a newly started engine never
 * opens its window and every fight times out (docs/ikemen-notes.md §1
 * "Locked screen"). The runner names the lock in a timeout's detail, and the
 * balance tool waits for the screen to be unlocked before starting fights.
 */
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/** Whether `ioreg -n Root -d1` output says the console session's screen is locked. */
export function parseScreenLocked(ioreg: string): boolean {
  return /"CGSSessionScreenIsLocked"\s*=\s*Yes/.test(ioreg);
}

/** True when the screen is locked; false when it isn't, off macOS, or when it can't be told. Never throws. */
export function screenLocked(): Promise<boolean> {
  if (process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) =>
    execFile("ioreg", ["-n", "Root", "-d1"], { timeout: 5_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(!err && parseScreenLocked(stdout))),
  );
}

/** Wait until the screen is unlocked (or `signal` aborts), calling `onWait` once if it has to wait. */
export async function waitForUnlockedScreen(opts: { signal?: AbortSignal; onWait?: () => void; pollMs?: number; isLocked?: () => Promise<boolean> } = {}): Promise<void> {
  const isLocked = opts.isLocked ?? screenLocked;
  let told = false;
  while (!opts.signal?.aborted && (await isLocked())) {
    if (!told) opts.onWait?.();
    told = true;
    await sleep(opts.pollMs ?? 5_000);
  }
}
