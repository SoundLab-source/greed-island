/**
 * The shop (DESIGN §8): a rotating selection of fighters to buy as owned
 * characters. Every player sees the same selection in a rotation window.
 * Defaults are docs/PHASE2.md answers to DESIGN §15 open questions.
 */
import { createHash } from "node:crypto";
import type { Salt } from "./money.ts";

export const RARITIES = ["COMMON", "RARE", "LEGENDARY"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface ShopConfig {
  /** How often the selection changes. */
  rotationMs: number;
  /** Fighters on offer per rotation. */
  slots: number;
  /** Price of a common fighter. */
  basePrice: Salt;
  rarityMultiplier: Readonly<Record<Rarity, bigint>>;
  /** The first N copies of each fighter are First Edition. */
  firstEditionSupply: number;
  /** Rating a newly bought character starts at (below tier B, so it climbs). */
  startRating: number;
  /** Most characters one player can own. */
  maxOwnedPerUser: number;
}

export const DEFAULT_SHOP: Readonly<ShopConfig> = Object.freeze({
  rotationMs: 5 * 60 * 60 * 1000,
  slots: 6,
  basePrice: 1_000n,
  rarityMultiplier: Object.freeze({ COMMON: 1n, RARE: 2n, LEGENDARY: 4n }),
  firstEditionSupply: 25,
  startRating: 1350,
  maxOwnedPerUser: 10,
});

export interface RotationWindow {
  index: number;
  startsAt: Date;
  endsAt: Date;
}

export function rotationWindow(now: Date, cfg: Pick<ShopConfig, "rotationMs">): RotationWindow {
  const index = Math.floor(now.getTime() / cfg.rotationMs);
  return { index, startsAt: new Date(index * cfg.rotationMs), endsAt: new Date((index + 1) * cfg.rotationMs) };
}

/**
 * The fighters on offer in a window: a stable pseudo-random pick, the same
 * for everyone and every server, that changes each window.
 */
/** `featured` fighters (new community fighters in their debut season) are always offered, first. */
export function pickRotation<T extends { id: string }>(fighters: readonly T[], windowIndex: number, cfg: Pick<ShopConfig, "slots">, featured: ReadonlySet<string> = new Set()): T[] {
  const key = (f: T) => createHash("sha256").update(`shop:${windowIndex}:${f.id}`).digest("hex");
  const first = fighters.filter((f) => featured.has(f.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rest = fighters
    .filter((f) => !featured.has(f.id))
    .map((f) => ({ f, k: key(f) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.f);
  return [...first, ...rest].slice(0, cfg.slots);
}

export function priceFor(rarity: Rarity, cfg: Pick<ShopConfig, "basePrice" | "rarityMultiplier">): Salt {
  return cfg.basePrice * cfg.rarityMultiplier[rarity];
}
