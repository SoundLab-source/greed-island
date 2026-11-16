/**
 * The Salt supply, week by week (DESIGN §9: "Watch the Salt supply weekly: if total Salt grows faster than active
 * players, raise sinks"; §14 lists inflation as a risk). Where players' Salt came from (grants, bailouts, rewards, net
 * betting) and where it went (the shop, upgrades), how much they hold at the end of each week, and how that compares
 * with the number of active players. Players only: bot players and the house are left out.
 *
 * Pure: `economyReport` takes per-week sums from the ledger (db `economyWeeks`). Amounts are integer Salt (bigint).
 */
import type { Salt } from "./money.ts";

/** How Salt enters or leaves players' hands, grouped from ledger transaction kinds. */
export type FlowGroup = "starting" | "daily" | "bailout" | "ownerRewards" | "goals" | "betting" | "shop" | "upgrades" | "other";

/** Ledger transaction kinds (TxnKind) to flow groups. Tournament T-Salt is its own book and never counted here. */
export const FLOW_OF_KIND: Readonly<Record<string, FlowGroup>> = Object.freeze({
  GRANT_START: "starting",
  GRANT_DAILY: "daily",
  BAILOUT: "bailout",
  OWNER_REWARD: "ownerRewards",
  GOAL_REWARD: "goals",
  BET: "betting",
  SETTLE: "betting",
  VOID: "betting",
  PURCHASE: "shop",
  UPGRADE: "upgrades",
});

export const FLOW_LABEL: Readonly<Record<FlowGroup, string>> = Object.freeze({
  starting: "starting balances",
  daily: "daily Salt",
  bailout: "bailouts",
  ownerRewards: "owner rewards",
  goals: "daily goals",
  betting: "betting (net)",
  shop: "shop",
  upgrades: "upgrades",
  other: "other",
});

/** One week's raw numbers. */
export interface EconomyWeekInput {
  /** Monday 00:00 UTC of the week. */
  week: Date;
  /** Net change to players' Salt per ledger transaction kind (positive: players got Salt). */
  byKind: Record<string, Salt>;
  /** Players who bet at least once that week. */
  activePlayers: number;
}

export interface EconomyWeek {
  week: Date;
  flows: Record<FlowGroup, Salt>;
  /** Everything players gained (positive groups) and spent (negative groups), and the net. */
  in: Salt;
  out: Salt;
  net: Salt;
  /** Players' Salt at the end of the week. */
  supply: Salt;
  activePlayers: number;
  /** Supply divided by active players (whole Salt, rounded down); null with no active players. */
  perActive: Salt | null;
  /** Week-on-week growth in percent (supply and active players); null for the first week or from zero. */
  supplyGrowthPct: number | null;
  activeGrowthPct: number | null;
  /** DESIGN §9's warning: supply grew faster than active players (by more than the tolerance). */
  inflating: boolean;
}

export interface EconomyReport {
  weeks: EconomyWeek[];
  /** Weeks in a row, ending with the latest, flagged as inflating. */
  inflatingStreak: number;
  /** What to do, in a line. */
  advice: string;
}

const ZERO_FLOWS = (): Record<FlowGroup, Salt> => ({ starting: 0n, daily: 0n, bailout: 0n, ownerRewards: 0n, goals: 0n, betting: 0n, shop: 0n, upgrades: 0n, other: 0n });

const growth = (now: number, before: number): number | null => (before > 0 ? ((now - before) / before) * 100 : null);

/**
 * `startingSupply` is players' Salt before the first week given (0 when the report starts at the beginning).
 * `tolerancePct`: supply may outgrow active players by this many percentage points before a week counts as inflating.
 */
export function economyReport(input: readonly EconomyWeekInput[], opts: { startingSupply?: Salt; tolerancePct?: number } = {}): EconomyReport {
  const tolerance = opts.tolerancePct ?? 5;
  const sorted = [...input].sort((a, b) => a.week.getTime() - b.week.getTime());
  let supply = opts.startingSupply ?? 0n;
  const weeks: EconomyWeek[] = [];
  for (const w of sorted) {
    const flows = ZERO_FLOWS();
    for (const [kind, amount] of Object.entries(w.byKind)) {
      // A kind added to the ledger later still counts, as "other", so the supply always adds up.
      flows[FLOW_OF_KIND[kind] ?? "other"] += amount;
    }
    let gained = 0n, spent = 0n;
    for (const v of Object.values(flows)) {
      if (v > 0n) gained += v;
      else spent -= v;
    }
    const before = supply;
    supply += gained - spent;
    const prev = weeks[weeks.length - 1];
    const supplyGrowthPct = prev ? growth(Number(supply), Number(before)) : null;
    const activeGrowthPct = prev ? growth(w.activePlayers, prev.activePlayers) : null;
    // Inflating: supply grew, and faster than active players did (or players fell away while Salt kept piling up).
    const inflating = supplyGrowthPct !== null && supplyGrowthPct > 0 && (activeGrowthPct === null ? w.activePlayers === 0 : supplyGrowthPct > activeGrowthPct + tolerance);
    weeks.push({
      week: w.week,
      flows,
      in: gained,
      out: spent,
      net: gained - spent,
      supply,
      activePlayers: w.activePlayers,
      perActive: w.activePlayers > 0 ? supply / BigInt(w.activePlayers) : null,
      supplyGrowthPct,
      activeGrowthPct,
      inflating,
    });
  }
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0 && weeks[i]!.inflating; i--) streak++;
  const last = weeks[weeks.length - 1];
  const advice = !last
    ? "No Salt has moved yet."
    : streak >= 2
      ? `Salt has grown faster than active players for ${streak} weeks in a row: raise sinks (shop prices, upgrade costs) or trim faucets (daily Salt, goal rewards), per DESIGN §9.`
      : streak === 1
        ? "Salt grew faster than active players last week. One week can be noise; act if it happens again."
        : "Salt is growing no faster than the number of active players.";
  return { weeks, inflatingStreak: streak, advice };
}

/** Monday 00:00 UTC of the week containing `d` (Postgres' date_trunc('week') in UTC). */
export function weekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
