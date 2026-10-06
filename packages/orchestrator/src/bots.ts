/**
 * Bot players: house-run accounts that bet on the stream's fights so the watch page is never empty while the
 * player base grows (GI_BOTS, how many). They're marked as bots wherever their names show, bet through the
 * same ledger and rules as everyone (the latest bet counts, a bailout when broke), and are left out of the
 * crowd numbers (fights.ts LOCK_ODDS), the season leaderboard and tournament podiums.
 *
 * Each has a style (backs favourites, hunts underdogs, follows form, has fighters it loves, always bets Red,
 * goes on gut feeling...) and human habits: they come and go in sessions, bet at their own moment of the
 * window, type round numbers or click the 25%/50% buttons, chase losses, and now and then change their mind.
 * They aren't trying to win: what they see is what players see on the watch page.
 */
import { claimBailout, createUser, getBalance, tournamentBalance, type Db } from "@greed-island/db";
import { seededRandom } from "@greed-island/engine";
import type { Config, Salt, Side } from "@greed-island/shared";
import { createHash } from "node:crypto";
import { fightView } from "./api/views.ts";
import { announceBet, placeFightBet } from "./betting.ts";
import type { BusEvent, FightBus } from "./bus.ts";

export type BotStyle = "favourite" | "underdog" | "fan" | "gut" | "yolo" | "cautious" | "form" | "contrarian" | "red" | "blue";

export interface Bot {
  name: string;
  style: BotStyle;
  /** Fighters (ids) a fan always backs; other fans pick theirs from their name. */
  loves?: readonly string[];
}

/** The bot players, in the order they join (GI_BOTS takes the first n): every stretch has a mix of styles. */
export const BOTS: readonly Bot[] = [
  { name: "SaltLord", style: "favourite" },
  { name: "Underdog_Uma", style: "underdog" },
  { name: "NyanFan", style: "fan", loves: ["gi-nyan-cat", "mugen-nyan-cat"] },
  { name: "VibesOnlyVi", style: "gut" },
  { name: "AllInAndy", style: "yolo" },
  { name: "TurtleTessa", style: "cautious" },
  { name: "HypeTrain", style: "form" },
  { name: "ReadsOnly", style: "contrarian" },
  { name: "RedSideRuby", style: "red" },
  { name: "ComboKing", style: "gut" },
  { name: "ChalkEater", style: "favourite" },
  { name: "LongShotLou", style: "underdog" },
  { name: "GrappleGran", style: "fan" },
  { name: "BrokeAgainBen", style: "yolo" },
  { name: "SpreadsheetSue", style: "favourite" },
  { name: "CoinFlipCody", style: "gut" },
  { name: "BlueMoonBlake", style: "blue" },
  { name: "TierListTina", style: "favourite" },
  { name: "ZoningZack", style: "fan" },
  { name: "WhiffPunisher", style: "contrarian" },
  { name: "OkiOlivia", style: "form" },
  { name: "PopTartPapi", style: "gut" },
  { name: "RageQuitRita", style: "yolo" },
  { name: "NeutralJoe", style: "cautious" },
  { name: "CrossupCarl", style: "underdog" },
  { name: "FrameTrap", style: "favourite" },
  { name: "DizzyDan", style: "gut" },
  { name: "JuggleJen", style: "fan" },
  { name: "SaltyMcSalt", style: "contrarian" },
  { name: "MeterBurn", style: "form" },
  { name: "ChipDamage", style: "cautious" },
  { name: "MashMaster", style: "yolo" },
  { name: "SweepSam", style: "favourite" },
  { name: "ParryPete", style: "underdog" },
  { name: "PixelPriya", style: "fan" },
  { name: "MidnightMaya", style: "gut" },
  { name: "TechThrowTom", style: "form" },
  { name: "BlockBlockBlock", style: "cautious" },
  { name: "CornerCarry", style: "favourite" },
  { name: "LastHitLarry", style: "underdog" },
  // 40 by default; GI_BOTS can add these.
  { name: "KaraCancel", style: "gut" },
  { name: "DPKing", style: "yolo" },
  { name: "SaltMine", style: "contrarian" },
  { name: "GutCheckGus", style: "gut" },
  { name: "TwoFrameTara", style: "favourite" },
  { name: "BigComebackBo", style: "underdog" },
  { name: "SideSwitchSid", style: "form" },
  { name: "PennyPincherPam", style: "cautious" },
];

/** GI_BOTS: how many bot players bet (0 turns them off). Default 40. */
export function loadBotCount(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["GI_BOTS"]?.trim();
  if (!raw) return 40;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > BOTS.length) throw new Error(`GI_BOTS must be a whole number from 0 to ${BOTS.length}, got "${raw}"`);
  return n;
}

/** A bot's habits: the same every time (they come from its name). */
export interface Habits {
  /** Chance it bets on a fight while it's online. */
  keen: number;
  /** When in the betting window it bets (fractions of the window). */
  timing: readonly [number, number];
  /** The share of its balance it usually stakes. */
  share: readonly [number, number];
  /** Chance it changes its mind once before betting closes. */
  fickle: number;
  /** Chance a loss makes it chase with a bigger stake. */
  tilt: number;
  /** Chance it clicks the 25% or 50% button instead of typing a round number. */
  buttons: number;
}

const SHARE: Record<BotStyle, readonly [number, number]> = {
  favourite: [0.08, 0.25],
  underdog: [0.03, 0.12],
  fan: [0.05, 0.2],
  gut: [0.05, 0.25],
  yolo: [0.25, 0.6],
  cautious: [0.02, 0.07],
  form: [0.08, 0.2],
  contrarian: [0.05, 0.15],
  red: [0.05, 0.3],
  blue: [0.05, 0.3],
};

// Early birds, the middle, last-second bettors, and anywhere.
const TIMINGS = [
  [0.03, 0.3],
  [0.2, 0.7],
  [0.55, 0.92],
  [0.03, 0.92],
] as const;

export function habits(bot: Bot): Habits {
  const r = seededRandom(`bot-habits:${bot.name}`);
  return {
    keen: 0.55 + 0.4 * r(),
    timing: TIMINGS[Math.floor(r() * TIMINGS.length)]!,
    share: SHARE[bot.style],
    fickle: 0.02 + 0.1 * r(),
    tilt: bot.style === "yolo" ? 0.6 + 0.4 * r() : 0.4 * r(),
    // Careful bettors type their small stakes.
    buttons: bot.style === "cautious" ? 0 : 0.6 * r(),
  };
}

/** A number from 0 to 1 that's always the same for this bot and this text. */
function fixed(bot: Bot, what: string): number {
  return createHash("sha256").update(`${bot.name}|${what}`).digest().readUInt32LE(0) / 4294967296;
}

/** Whether a fan loves this fighter: its own list, or about one fighter in six chosen by its name. */
export function loves(bot: Bot, fighterId: string): boolean {
  if (bot.style !== "fan") return false;
  return bot.loves ? bot.loves.includes(fighterId) : fixed(bot, `loves:${fighterId}`) < 0.18;
}

/** What a bot sees of a fight: what the watch page shows. */
export interface FightFacts {
  /** Each side's win chance, 0 to 1. */
  chance: Record<Side, number>;
  /** Each side's payout multiplier. */
  multiplier: Record<Side, number>;
  /** Each side's fighter (the design, which is what fans follow) and its recent results, oldest first. */
  sides: Record<Side, { fighterId: string; form: readonly ("W" | "L")[] }>;
}

/** How its last settled bet went. */
export interface Mood {
  last: "won" | "lost" | null;
}

export interface BetPlan {
  /** When, as a fraction of the betting window. */
  at: number;
  side: Side;
  stake: Salt;
}

const other = (s: Side): Side => (s === 1 ? 2 : 1);

/** Which side the bot backs, or null when it sits this one out. */
export function pickSide(bot: Bot, f: FightFacts, r: () => number): Side | null {
  const fav: Side = f.chance[1] >= f.chance[2] ? 1 : 2;
  const dog = other(fav);
  const gap = Math.abs(f.chance[1] - f.chance[2]);
  const lean = (side: Side, p: number): Side => (r() < p ? side : other(side));
  const gut = () => lean(1, 0.5 + 0.4 * (fixed(bot, `vibe:${f.sides[1].fighterId}`) - fixed(bot, `vibe:${f.sides[2].fighterId}`)));
  // Anyone can just click the other one.
  if (r() < 0.08) return r() < 0.5 ? 1 : 2;
  switch (bot.style) {
    case "favourite":
      return lean(fav, Math.min(0.95, 0.72 + gap));
    case "underdog":
      return lean(dog, f.multiplier[dog] >= 2.2 ? 0.75 : 0.5);
    case "fan": {
      const loved = ([1, 2] as const).filter((s) => loves(bot, f.sides[s].fighterId));
      return loved.length === 1 ? lean(loved[0]!, 0.95) : lean(fav, 0.6);
    }
    case "cautious":
      // Coin flips aren't worth it.
      if (gap < 0.1 && r() < 0.5) return null;
      return lean(fav, 0.8);
    case "form": {
      const wins = (s: Side) => f.sides[s].form.slice(-5).filter((x) => x === "W").length;
      return wins(1) === wins(2) ? lean(fav, 0.6) : lean(wins(1) > wins(2) ? 1 : 2, 0.8);
    }
    case "contrarian":
      return f.chance[fav] > 0.65 ? lean(dog, 0.75) : gut();
    case "red":
      return lean(1, 0.92);
    case "blue":
      return lean(2, 0.92);
    case "yolo":
    case "gut":
      return gut();
  }
}

/** A number a person would type: 7, 15, 40, 250, 1,500. */
export function roundish(x: number): number {
  if (x < 10) return Math.max(1, Math.round(x));
  const step = x < 50 ? 5 : x < 200 ? 10 : x < 1000 ? 50 : x < 5000 ? 100 : 500;
  return Math.max(step, Math.round(x / step) * step);
}

/** How much the bot puts on `side`, or null if it can't bet. */
export function pickStake(bot: Bot, f: FightFacts, side: Side, balance: Salt, mood: Mood, limits: { minBet: Salt; maxStake: Salt }, r: () => number): Salt | null {
  const most = balance < limits.maxStake ? balance : limits.maxStake;
  if (most < limits.minBet) return null;
  const h = habits(bot);
  const b = Number(balance);
  let share = h.share[0] + (h.share[1] - h.share[0]) * r();
  // More on a surer thing, much more on a fighter it loves.
  if (bot.style === "favourite" && f.chance[side] > 0.5) share *= 1 + 2 * (f.chance[side] - 0.5);
  if (loves(bot, f.sides[side].fighterId)) share *= 1.8;
  if (mood.last === "lost" && r() < h.tilt) share *= 1.5 + r();
  if (mood.last === "won") share *= 1.2;
  let stake: number;
  // Nearly broke, or that kind of player: all in.
  if (share >= 0.9 || (bot.style === "yolo" && r() < 0.25) || (b <= 150 && r() < 0.4)) stake = b;
  else if (r() < h.buttons) stake = Math.floor(b * (r() < 0.7 ? 0.25 : 0.5));
  else stake = roundish(b * share);
  const s = BigInt(Math.max(1, Math.floor(stake)));
  return s < limits.minBet ? limits.minBet : s > most ? most : s;
}

/** The bot's bets on one fight: none, one, or one then a change of mind (other side, or more on the same). */
export function planBets(bot: Bot, f: FightFacts, balance: Salt, mood: Mood, limits: { minBet: Salt; maxStake: Salt }, r: () => number): BetPlan[] {
  const h = habits(bot);
  if (r() > h.keen) return [];
  const side = pickSide(bot, f, r);
  if (side === null) return [];
  const stake = pickStake(bot, f, side, balance, mood, limits, r);
  if (stake === null) return [];
  const at = h.timing[0] + (h.timing[1] - h.timing[0]) * r();
  const plans: BetPlan[] = [{ at, side, stake }];
  if (r() < h.fickle && at < 0.85) {
    const later = at + (0.93 - at) * (0.3 + 0.7 * r());
    if (r() < 0.5) plans.push({ at: later, side: other(side), stake });
    else {
      const most = balance < limits.maxStake ? balance : limits.maxStake;
      const more = BigInt(roundish(Number(stake) * (1.5 + r())));
      if (more <= most && more > stake) plans.push({ at: later, side, stake: more });
    }
  }
  return plans;
}

/** Bots come and go: an online bot stays for about ten fights, an offline one comes back after about fifteen. */
export function nextOnline(online: boolean, r: () => number): boolean {
  return online ? r() >= 0.1 : r() < 0.07;
}

/** Fewest bots online at once, so the list never looks dead. */
export const MIN_ONLINE = 6;

interface BotState {
  bot: Bot;
  userId: string;
  online: boolean;
  mood: Mood;
  /** The side it's on in each fight it bet on, until the result comes in. */
  sides: Map<string, Side>;
}

export interface BotDeps {
  db: Db;
  config: Config;
  bus: FightBus;
  /** How many of BOTS bet (loadBotCount). */
  count: number;
  random?: () => number;
  /** Run `fn` in `ms` (setTimeout by default); returns a cancel. */
  schedule?: (ms: number, fn: () => void) => () => void;
  log?: (message: string) => void;
}

export class BotPlayers {
  private readonly bots = new Map<string, BotState>();
  private readonly pending = new Map<string, (() => void)[]>();
  private unsubscribe: (() => void) | null = null;
  private readonly r: () => number;
  private readonly schedule: NonNullable<BotDeps["schedule"]>;
  private readonly log: (message: string) => void;

  constructor(private readonly deps: BotDeps) {
    this.r = deps.random ?? Math.random;
    this.schedule =
      deps.schedule ??
      ((ms, fn) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      });
    this.log = deps.log ?? ((m) => console.log(m));
  }

  /** Create the bot accounts that don't exist yet (each starts with the starting balance, like any new player). */
  async ensure(): Promise<void> {
    const { db, config } = this.deps;
    const existing = new Map((await db.user.findMany({ where: { kind: "BOT" }, select: { id: true, displayName: true } })).map((u) => [u.displayName, u.id]));
    for (const bot of BOTS.slice(0, this.deps.count)) {
      const userId = existing.get(bot.name) ?? (await createUser(db, { kind: "BOT", displayName: bot.name }, config.economy)).user.id;
      this.bots.set(bot.name, { bot, userId, online: this.r() < 0.4, mood: { last: null }, sides: new Map() });
    }
  }

  start(): void {
    this.unsubscribe = this.deps.bus.subscribe((e) => this.on(e));
  }

  stop(): void {
    this.unsubscribe?.();
    for (const id of [...this.pending.keys()]) this.cancel(id);
  }

  private on(e: BusEvent): void {
    if (e.type === "fight_state" && e.state === "BETTING_OPEN" && e.bettingClosesAt) {
      this.onBettingOpen(e.fightId, new Date(e.bettingClosesAt)).catch((err: Error) => this.log(`bot players: ${err.message}`));
    } else if (e.type === "fight_state" && e.state !== "BETTING_OPEN") {
      this.cancel(e.fightId);
    } else if (e.type === "fight_result") {
      for (const s of this.bots.values()) {
        const side = s.sides.get(e.fightId);
        if (side === undefined) continue;
        s.sides.delete(e.fightId);
        if (e.result === "SETTLED") s.mood.last = side === e.winnerSide ? "won" : "lost";
      }
    }
  }

  private cancel(fightId: string): void {
    for (const c of this.pending.get(fightId) ?? []) c();
    this.pending.delete(fightId);
  }

  /** Decide who bets on this fight, when and how much, and schedule their bets. Returns the bets scheduled. */
  async onBettingOpen(fightId: string, closesAt: Date): Promise<number> {
    const { db, config } = this.deps;
    const windowMs = closesAt.getTime() - Date.now();
    // Leave the last second and a half alone, so no bet arrives after betting closes.
    const latest = windowMs - 1_500;
    if (latest <= 0) return 0;
    const view = await fightView(db, config, fightId);
    const odds = view?.odds as { chancePct: Record<Side, number>; multiplierBp: Record<Side, string> } | null;
    if (!view || !odds) return 0;
    const facts: FightFacts = {
      chance: { 1: odds.chancePct[1] / 100, 2: odds.chancePct[2] / 100 },
      multiplier: { 1: Number(odds.multiplierBp[1]) / 10_000, 2: Number(odds.multiplierBp[2]) / 10_000 },
      sides: {
        1: { fighterId: view.sides[1].fighter.id, form: view.sides[1].last10 as ("W" | "L")[] },
        2: { fighterId: view.sides[2].fighter.id, form: view.sides[2].last10 as ("W" | "L")[] },
      },
    };
    const all = [...this.bots.values()];
    for (const s of all) s.online = nextOnline(s.online, this.r);
    for (const s of all.filter((x) => !x.online).sort(() => this.r() - 0.5)) {
      if (all.filter((x) => x.online).length >= Math.min(MIN_ONLINE, all.length)) break;
      s.online = true;
    }
    const tournamentId = view.tournament?.id ?? null;
    const limits = { minBet: config.economy.minBet, maxStake: config.economy.maxPayout };
    let scheduled = 0;
    for (const s of all.filter((x) => x.online)) {
      const balance = tournamentId ? ((await tournamentBalance(db, s.userId, tournamentId)) ?? config.tournaments.startingBalance) : await this.mainBalance(s);
      planBets(s.bot, facts, balance, s.mood, limits, this.r).forEach((plan, i) => {
        const cancel = this.schedule(Math.min(latest, plan.at * windowMs), () => void this.place(s, fightId, plan, i));
        this.pending.set(fightId, [...(this.pending.get(fightId) ?? []), cancel]);
        scheduled++;
      });
    }
    return scheduled;
  }

  /** Its Salt, after asking for a bailout when it's broke (like a player clicking the button). */
  private async mainBalance(s: BotState): Promise<Salt> {
    const { db, config } = this.deps;
    const balance = await getBalance(db, s.userId);
    if (balance >= config.economy.bailoutFloor) return balance;
    try {
      return (await claimBailout(db, s.userId, config.economy)).balance;
    } catch {
      // Not eligible yet (a bet still open): it'll get one next time.
      return balance;
    }
  }

  private async place(s: BotState, fightId: string, plan: BetPlan, i: number): Promise<void> {
    const { db, config, bus } = this.deps;
    try {
      const r = await placeFightBet(db, config, { userId: s.userId, fightId, side: plan.side, stake: plan.stake, idempotencyKey: `bot:${fightId}:${i}` });
      s.sides.set(fightId, plan.side);
      if (!r.replayed) await announceBet(db, config, bus, r.bet);
    } catch {
      // Betting closed first, or the stake no longer fits: a player would just miss it too.
    }
  }
}
