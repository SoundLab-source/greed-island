import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config.ts";
import { DEFAULT_SHOP, pickRotation, priceFor, rotationWindow } from "./shop.ts";

const fighters = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}` }));

describe("shop rotation", () => {
  it("uses 5-hour windows", () => {
    const w = rotationWindow(new Date("2026-10-01T12:34:00Z"), DEFAULT_SHOP);
    expect(w.endsAt.getTime() - w.startsAt.getTime()).toBe(5 * 3_600_000);
    expect(w.startsAt.getTime()).toBeLessThanOrEqual(new Date("2026-10-01T12:34:00Z").getTime());
    expect(rotationWindow(w.endsAt, DEFAULT_SHOP).index).toBe(w.index + 1);
  });

  it("offers the same 6 fighters to everyone within a window, and changes between windows", () => {
    const a = pickRotation(fighters, 100, DEFAULT_SHOP);
    expect(a).toHaveLength(6);
    expect(new Set(a.map((f) => f.id)).size).toBe(6);
    expect(pickRotation([...fighters].reverse(), 100, DEFAULT_SHOP)).toEqual(a);
    const windows = Array.from({ length: 10 }, (_, i) => pickRotation(fighters, 200 + i, DEFAULT_SHOP).map((f) => f.id).join());
    expect(new Set(windows).size).toBeGreaterThan(5);
  });

  it("offers everything when there are fewer fighters than slots", () => {
    expect(pickRotation(fighters.slice(0, 3), 1, DEFAULT_SHOP)).toHaveLength(3);
  });

  it("gives every fighter a fair share of appearances over time", () => {
    const counts = new Map<string, number>();
    for (let w = 0; w < 2000; w++) for (const f of pickRotation(fighters, w, DEFAULT_SHOP)) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    for (const n of counts.values()) expect(n / 2000).toBeGreaterThan(0.4); // expected 0.5 (6 of 12)
  });
});

describe("prices", () => {
  it("scale with rarity", () => {
    expect([priceFor("COMMON", DEFAULT_SHOP), priceFor("RARE", DEFAULT_SHOP), priceFor("LEGENDARY", DEFAULT_SHOP)]).toEqual([1000n, 2000n, 4000n]);
  });
});

describe("shop config", () => {
  it("reads overrides and rejects bad values", () => {
    const cfg = loadConfig({ GI_SHOP_ROTATION_HOURS: "2", GI_SHOP_SLOTS: "4", GI_SHOP_BASE_PRICE: "500" });
    expect(cfg.shop).toMatchObject({ rotationMs: 7_200_000, slots: 4, basePrice: 500n });
    expect(() => loadConfig({ GI_SHOP_SLOTS: "2.5" })).toThrow(ConfigError);
    expect(() => loadConfig({ GI_SHOP_BASE_PRICE: "0" })).toThrow(ConfigError);
  });
});
