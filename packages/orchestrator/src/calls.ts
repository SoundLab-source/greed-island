/**
 * A winning bet as something to show off (docs/ENGAGEMENT.md §4, clip moments): "Alice called it: Hot Takes, a 20%
 * underdog, paid 4.80×, +3,840 Salt". Its page (/call/<betId>, apps/web/call.html) and its link preview picture
 * (share-image.ts `callImage`). Only right calls on settled fights have one; the facts are what everyone could already
 * see on the bets list and the fight's result (the player's name, stake and side), so nothing private is shown.
 */
import { toSalt, type Db } from "@greed-island/db";
import { formatMultiplier, playerName, type Salt, type Side } from "@greed-island/shared";

export interface CallData {
  betId: string;
  player: string;
  fightNumber: number;
  /** The side called, and who it beat. */
  side: Side;
  winner: string;
  loser: string;
  /** The side's locked chance to win, in percent (one decimal). */
  chancePct: number;
  /** "4.80x". */
  multiplier: string;
  stake: Salt;
  returned: Salt;
  profit: Salt;
  currency: "Salt" | "T-Salt";
  /** Called at the upset chance or less (bettors.upsetChanceBp). */
  upset: boolean;
  at: Date;
}

export async function callData(db: Db, betId: string, upsetChanceBp: number): Promise<CallData | null> {
  const b = await db.bet.findUnique({
    where: { id: betId },
    include: { user: { select: { id: true, displayName: true, kind: true } }, fight: { include: { odds: true, loadouts: true } } },
  });
  if (!b || b.status !== "WON" || b.returned === null || b.fight.state !== "SETTLED" || !b.fight.odds) return null;
  const side = b.side as Side;
  const name = (s: Side) => b.fight.loadouts.find((l) => l.side === s)?.name ?? "?";
  const chanceBp = side === 1 ? b.fight.odds.chanceBp1 : b.fight.odds.chanceBp2;
  const multiplierBp = side === 1 ? b.fight.odds.multiplierBp1 : b.fight.odds.multiplierBp2;
  const stake = toSalt(b.stake), returned = toSalt(b.returned);
  return {
    betId: b.id,
    player: playerName(b.user),
    fightNumber: b.fight.number,
    side,
    winner: name(side),
    loser: name(side === 1 ? 2 : 1),
    chancePct: Math.round(chanceBp / 10) / 10,
    multiplier: formatMultiplier(BigInt(multiplierBp)),
    stake,
    returned,
    profit: returned - stake,
    currency: b.fight.tournamentMatchId ? "T-Salt" : "Salt",
    upset: chanceBp <= upsetChanceBp,
    at: b.fight.closedAt ?? b.updatedAt,
  };
}

/** The share page's preview: title and description. */
export function callMeta(c: CallData, publicUrl: string) {
  const base = publicUrl.replace(/\/$/, "");
  const id = encodeURIComponent(c.betId);
  const n = (x: Salt) => Number(x).toLocaleString("en-US");
  return {
    title: `${c.player} called it${c.upset ? " (an upset)" : ""}: +${n(c.profit)} ${c.currency} · Greed Island`,
    description: `${c.winner} beat ${c.loser} in fight #${c.fightNumber} with a ${c.chancePct}% chance to win. ${c.player} bet ${n(c.stake)} ${c.currency} and got ${n(c.returned)} back (${c.multiplier.replace("x", "×")}). Watch AI fighters and bet free play money on Greed Island.`,
    url: `${base}/call/${id}`,
    image: `${base}/api/calls/${id}/share.png`,
  };
}
