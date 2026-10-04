import { describe, expect, it } from "vitest";
import { parseScreenLocked, waitForUnlockedScreen } from "./screen.ts";

describe("parseScreenLocked", () => {
  it("reads the console session's lock flag from ioreg output", () => {
    expect(parseScreenLocked('  | "IOConsoleUsers" = ({"kCGSSessionOnConsoleKey"=Yes,"CGSSessionScreenIsLocked"=Yes,"kCGSSessionUserNameKey"="x"})')).toBe(true);
    expect(parseScreenLocked('  | "IOConsoleUsers" = ({"kCGSSessionOnConsoleKey"=Yes,"kCGSSessionUserNameKey"="x"})')).toBe(false);
    expect(parseScreenLocked("")).toBe(false);
  });
});

describe("waitForUnlockedScreen", () => {
  it("waits while locked and says so once", async () => {
    const answers = [true, true, false];
    let told = 0;
    await waitForUnlockedScreen({ isLocked: async () => answers.shift()!, onWait: () => told++, pollMs: 1 });
    expect(answers).toEqual([]);
    expect(told).toBe(1);
  });
  it("returns at once when unlocked, and stops waiting when aborted", async () => {
    let told = 0;
    await waitForUnlockedScreen({ isLocked: async () => false, onWait: () => told++ });
    expect(told).toBe(0);
    const abort = new AbortController();
    abort.abort();
    await waitForUnlockedScreen({ isLocked: async () => true, signal: abort.signal, pollMs: 1 });
  });
});
