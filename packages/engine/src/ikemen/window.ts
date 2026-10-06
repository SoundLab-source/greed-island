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

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  /** The window's CoreGraphics number (what OBS's window capture takes), when known. */
  id?: number;
}

/**
 * macOS: where the game's window is on screen, in points from the main
 * screen's top-left corner (CoreGraphics' window list: the biggest on-screen
 * window owned by "I.K.E.M.E.N-Go", title bar included, and its window
 * number), and the main
 * screen's size in points. Null when there's no game window on screen, off
 * macOS, or when the lookup fails. Never throws.
 */
export function gameWindow(): Promise<{ window: WindowBounds; screen: { width: number; height: number } } | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  const script =
    `ObjC.import("CoreGraphics"); ObjC.import("AppKit");` +
    ` const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0))) || [];` +
    ` const w = list.filter((x) => /^I\\.?K\\.?E\\.?M\\.?E\\.?N/i.test(x.kCGWindowOwnerName || "") && x.kCGWindowLayer === 0 && x.kCGWindowBounds)` +
    `.map((x) => ({ ...x.kCGWindowBounds, id: x.kCGWindowNumber })).sort((a, b) => b.Width * b.Height - a.Width * a.Height)[0];` +
    ` const s = $.NSScreen.mainScreen.frame.size;` +
    ` JSON.stringify(w ? { window: { x: w.X, y: w.Y, width: w.Width, height: w.Height, id: w.id }, screen: { width: s.width, height: s.height } } : null)`;
  return new Promise((resolve) =>
    execFile("osascript", ["-l", "JavaScript", "-e", script], { timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(stdout.trim()) as Awaited<ReturnType<typeof gameWindow>>);
      } catch {
        resolve(null);
      }
    }),
  );
}

/**
 * The crop that leaves only the game's picture in a capture of the whole main
 * screen: `source` is the capture's size in pixels (a Retina screen captures
 * at twice its size in points). The window's title bar is cut off too: the
 * game draws a 16:9 picture, so whatever is above that is the title bar.
 */
/** The crop that cuts the title bar off a capture of the game's window alone (`source` in pixels). */
export function titleBarCrop(win: WindowBounds, source: { width: number; height: number }): { cropLeft: number; cropTop: number; cropRight: number; cropBottom: number } {
  const picture = Math.min(win.height, Math.round((win.width * 9) / 16));
  return { cropLeft: 0, cropTop: Math.round((win.height - picture) * (source.height / win.height)), cropRight: 0, cropBottom: 0 };
}

export function gameCrop(win: WindowBounds, screen: { width: number; height: number }, source: { width: number; height: number }): { cropLeft: number; cropTop: number; cropRight: number; cropBottom: number } {
  const sx = source.width / screen.width, sy = source.height / screen.height;
  const picture = Math.min(win.height, Math.round((win.width * 9) / 16));
  const top = win.y + (win.height - picture);
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  return {
    cropLeft: clamp(win.x * sx, source.width),
    cropTop: clamp(top * sy, source.height),
    cropRight: clamp(source.width - (win.x + win.width) * sx, source.width),
    cropBottom: clamp(source.height - (win.y + win.height) * sy, source.height),
  };
}
