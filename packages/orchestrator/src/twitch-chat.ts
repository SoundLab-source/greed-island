/**
 * Twitch chat commands (docs/ENGAGEMENT.md §4, "chat commands to check odds"; no DESIGN change). A small bot sits in
 * the stream's chat and answers `!fight` (or `!odds`), `!fighter <name>`, `!salt` and `!commands` with the same facts
 * the watch page shows, so viewers on Twitch can follow the betting without leaving chat. It only reads the game and
 * writes chat lines: it never touches Salt, bets or accounts.
 *
 * Off unless GI_TWITCH_CHANNEL, GI_TWITCH_BOT_LOGIN and GI_TWITCH_BOT_TOKEN are all set. Twitch's IRC interface, over
 * a WebSocket (docs/obs-notes.md "Twitch chat" has the sources and what's still UNVERIFIED): connect to wss://irc-ws.chat.twitch.tv:443, send
 * `PASS oauth:<token>` then `NICK <login>`, `CAP REQ :twitch.tv/tags twitch.tv/commands`, `JOIN #<channel>`; answer
 * `PING :x` with `PONG :x`; send `PRIVMSG #<channel> :<text>`, as a reply with the `reply-parent-msg-id` tag. The
 * token needs the chat:read and chat:edit scopes. A normal account may send at most 20 messages per 30 seconds and 1
 * per second per channel; the bot keeps well under both and stays quiet rather than queue up a backlog.
 *
 * `parseIrcLine`, `parseCommand` and the `answer*` functions are pure; `TwitchChatBot` does the connection.
 */
import type { Db } from "@greed-island/db";
import { playerName, type Config, type Side } from "@greed-island/shared";
import { currentFightId, fightView } from "./api/views.ts";

// ---------------------------------------------------------------------------
// IRC lines

export interface IrcMessage {
  tags: Record<string, string>;
  /** The sender's login, from the prefix (nick!user@host). */
  nick: string | null;
  command: string;
  params: string[];
}

/** IRC tag values escape ';', ' ', '\', CR and LF (IRCv3 message tags). */
function unescapeTag(v: string): string {
  return v.replace(/\\(.)/g, (_m, c: string) => ({ ":": ";", s: " ", "\\": "\\", r: "\r", n: "\n" })[c] ?? c);
}

/** One IRC line: `@tags :prefix COMMAND param param :trailing`. Null for an empty line. */
export function parseIrcLine(line: string): IrcMessage | null {
  let rest = line.replace(/\r?\n$/, "");
  if (!rest) return null;
  const tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    for (const pair of rest.slice(1, sp < 0 ? undefined : sp).split(";")) {
      const eq = pair.indexOf("=");
      if (eq < 0) tags[pair] = "";
      else tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1));
    }
    rest = sp < 0 ? "" : rest.slice(sp + 1).trimStart();
  }
  let nick: string | null = null;
  if (rest.startsWith(":")) {
    const sp = rest.indexOf(" ");
    const prefix = rest.slice(1, sp < 0 ? undefined : sp);
    nick = prefix.includes("!") ? prefix.slice(0, prefix.indexOf("!")) : null;
    rest = sp < 0 ? "" : rest.slice(sp + 1).trimStart();
  }
  const trailingAt = rest.indexOf(" :");
  const head = trailingAt < 0 ? rest : rest.slice(0, trailingAt);
  const params = head.split(" ").filter(Boolean);
  const command = params.shift() ?? "";
  if (!command) return null;
  if (trailingAt >= 0) params.push(rest.slice(trailingAt + 2));
  else if (rest.startsWith(":")) params.push(rest.slice(1));
  return { tags, nick, command, params };
}

/** Text safe for one chat line: no line breaks (they'd end the IRC line), at most 500 characters (Twitch's limit). */
export function chatSafe(text: string, max = 500): string {
  const flat = text.replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ---------------------------------------------------------------------------
// Commands

export type ChatCommand = { kind: "fight" } | { kind: "fighter"; name: string } | { kind: "salt" } | { kind: "commands" };

const ALIASES: Record<string, ChatCommand["kind"]> = {
  "!fight": "fight",
  "!odds": "fight",
  "!fighter": "fighter",
  "!salt": "salt",
  "!bet": "salt",
  "!play": "salt",
  "!commands": "commands",
  "!help": "commands",
};

/** A chat message as one of our commands, or null (most chat isn't for us). */
export function parseCommand(text: string): ChatCommand | null {
  const m = /^\s*(![a-z]+)(?:\s+(.*))?$/i.exec(text);
  if (!m) return null;
  const kind = ALIASES[m[1]!.toLowerCase()];
  if (!kind) return null;
  if (kind === "fighter") {
    const name = (m[2] ?? "").trim().replace(/^@/, "").slice(0, 60);
    return { kind, name };
  }
  return { kind } as ChatCommand;
}

/** What the bot needs to know about a fight (from `fightView`). */
export interface ChatFight {
  number: number;
  /** "Matchmaking", "Tournament #4 S tier · Final", "Exhibition", "Rivalry rematch"... */
  label: string;
  state: string;
  bettingClosesAt: Date | null;
  sides: Record<Side, { name: string; tier: string; rating: number; wins: number; losses: number }>;
  /** Payouts, once there are odds. */
  odds: { multiplier: Record<Side, string>; chancePct: Record<Side, number> } | null;
  winnerSide: Side | null;
}

export interface ChatFighter {
  id: string;
  name: string;
  fighterName: string;
  tier: string;
  rating: number;
  wins: number;
  losses: number;
  owner: string | null;
  titles: number;
}

const rec = (w: number, l: number) => `${w}–${l}`;

export function answerFight(f: ChatFight | null, url: string, now: Date): string {
  if (!f) return `No fight yet. Watch and bet free Salt at ${url}`;
  const side = (s: Side) => {
    const x = f.sides[s];
    const pay = f.odds ? ` ${f.odds.multiplier[s].replace("x", "×")}` : "";
    return `${x.name} (${x.tier}, ${x.rating}, ${rec(x.wins, x.losses)})${pay}`;
  };
  const head = `#${f.number} ${f.label}: 🔴 ${side(1)} vs 🔵 ${side(2)}`;
  if (f.state === "SETTLED" && f.winnerSide) {
    const w = f.winnerSide;
    const paid = f.odds ? `, ${w === 1 ? "Red" : "Blue"} paid ${f.odds.multiplier[w].replace("x", "×")}` : "";
    return `${f.sides[w].name} won #${f.number}${paid}. Next fight's betting opens soon: ${url}`;
  }
  if (f.state === "VOIDED") return `#${f.number} was a no contest: every bet refunded. Next fight soon: ${url}`;
  if (f.state === "BETTING_OPEN" && f.bettingClosesAt) {
    const left = Math.max(0, Math.ceil((f.bettingClosesAt.getTime() - now.getTime()) / 1000));
    return `${head} · betting closes in ${left}s · bet free Salt at ${url}`;
  }
  const what = { BOOKED: "betting opens soon", LOCKED: "bets are locked", IN_PROGRESS: "fight on!", SETTLING: "deciding..." }[f.state] ?? "";
  return `${head}${what ? ` · ${what}` : ""} · ${url}`;
}

export function answerFighter(name: string, found: ChatFighter[], url: string): string {
  if (!name) return "Which fighter? Try !fighter <name>";
  if (!found.length) return `No fighter called "${name}". All of them: ${url}/fighters.html`;
  const c = found[0]!;
  const more = found.length > 1 ? ` (and ${found.length - 1} more match${found.length > 2 ? "es" : ""})` : "";
  const who = c.name !== c.fighterName ? `${c.name} (${c.fighterName})` : c.name;
  const games = c.wins + c.losses;
  const pct = games ? `, ${Math.round((c.wins / games) * 100)}% wins` : "";
  return `${who}: ${c.tier} tier, rating ${c.rating}, ${rec(c.wins, c.losses)}${pct}, ${c.titles} title${c.titles === 1 ? "" : "s"}, ${c.owner ? `owned by ${c.owner}` : "a house fighter"}${more} · ${url}/fighter.html?id=${encodeURIComponent(c.id)}`;
}

export const answerSalt = (url: string) => `Bet on every fight with Salt, free play money: you start with 400 and claim more daily. It can never be bought or cashed out. ${url}`;
export const answerCommands = () => "!fight (or !odds): the fight and its payouts · !fighter <name>: a fighter's record · !salt: how betting works";

// ---------------------------------------------------------------------------
// The game's side

/** The current fight as the bot describes it. */
export async function chatFight(db: Db, config: Config): Promise<ChatFight | null> {
  const id = await currentFightId(db);
  const v = id ? await fightView(db, config, id) : null;
  if (!v) return null;
  const side = (s: Side) => ({ name: v.sides[s].name, tier: v.sides[s].tier, rating: v.sides[s].rating, wins: v.sides[s].record.wins, losses: v.sides[s].record.losses });
  const label = v.tournament
    ? `Tournament #${v.tournament.number} ${v.tournament.tier} tier · ${v.tournament.roundName}`
    : v.challenge
      ? "Exhibition"
      : v.pairKind === "SHOWCASE"
        ? "House showcase"
        : v.pairKind === "RIVALRY"
          ? "Rivalry rematch"
          : "Matchmaking";
  const odds = v.odds as { multiplier: Record<Side, string>; chancePct: Record<Side, number> } | null;
  return {
    number: v.number,
    label,
    state: v.state,
    bettingClosesAt: v.times.bettingCloses ? new Date(v.times.bettingCloses) : null,
    sides: { 1: side(1), 2: side(2) },
    odds: odds ? { multiplier: odds.multiplier, chancePct: odds.chancePct } : null,
    winnerSide: v.result && v.result.kind === "settled" ? (v.result.winnerSide as Side) : null,
  };
}

/** Characters by name: exact (any case) first, then names starting with it; best rated first. */
export async function chatFighters(db: Db, name: string): Promise<ChatFighter[]> {
  if (!name) return [];
  const pick = { id: true, name: true, tier: true, rating: true, wins: true, losses: true, fighter: { select: { displayName: true } }, owner: { select: { displayName: true, id: true } }, _count: { select: { titles: true } } } as const;
  const where = (mode: "equals" | "startsWith") => ({ name: { [mode]: name, mode: "insensitive" as const } });
  let rows = await db.character.findMany({ where: where("equals"), select: pick, orderBy: { rating: "desc" }, take: 10 });
  if (!rows.length) rows = await db.character.findMany({ where: where("startsWith"), select: pick, orderBy: { rating: "desc" }, take: 10 });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    fighterName: r.fighter.displayName,
    tier: r.tier,
    rating: Math.round(r.rating),
    wins: r.wins,
    losses: r.losses,
    owner: r.owner ? playerName(r.owner) : null,
    titles: r._count.titles,
  }));
}

// ---------------------------------------------------------------------------
// Settings and the connection

export interface TwitchChatConfig {
  channel: string;
  login: string;
  /** A user access token with chat:read and chat:edit (without the "oauth:" prefix). */
  token: string;
  url: string;
}

/** GI_TWITCH_BOT_LOGIN and GI_TWITCH_BOT_TOKEN (with GI_TWITCH_CHANNEL); null when the bot is off. */
export function loadTwitchChatConfig(channel: string | null, publicUrl: string, env: NodeJS.ProcessEnv = process.env): TwitchChatConfig | null {
  const login = env["GI_TWITCH_BOT_LOGIN"]?.trim().toLowerCase();
  const token = env["GI_TWITCH_BOT_TOKEN"]?.trim().replace(/^oauth:/, "");
  if (!login && !token) return null;
  if (!login || !token) throw new Error("the Twitch chat bot needs both GI_TWITCH_BOT_LOGIN and GI_TWITCH_BOT_TOKEN");
  if (!/^[a-z0-9_]{4,25}$/.test(login)) throw new Error(`GI_TWITCH_BOT_LOGIN "${login}" isn't a Twitch login name`);
  if (!channel) throw new Error("the Twitch chat bot needs GI_TWITCH_CHANNEL, the channel whose chat it answers in");
  return { channel, login, token, url: publicUrl.replace(/\/$/, "") };
}

/** Who may get an answer now: each command at most once per `sameCommandMs`, each viewer once per `perUserMs`, and no more than `maxPer30s` lines. */
export class ChatLimiter {
  private sent: number[] = [];
  private lastCommand = new Map<string, number>();
  private lastUser = new Map<string, number>();
  constructor(private readonly opts = { sameCommandMs: 10_000, perUserMs: 15_000, maxPer30s: 12, minGapMs: 1_500 }) {}

  allow(commandKey: string, user: string, now: number): boolean {
    this.sent = this.sent.filter((t) => now - t < 30_000);
    if (this.sent.length >= this.opts.maxPer30s) return false;
    if (this.sent.length && now - this.sent[this.sent.length - 1]! < this.opts.minGapMs) return false;
    if (now - (this.lastCommand.get(commandKey) ?? -Infinity) < this.opts.sameCommandMs) return false;
    if (now - (this.lastUser.get(user) ?? -Infinity) < this.opts.perUserMs) return false;
    this.sent.push(now);
    this.lastCommand.set(commandKey, now);
    this.lastUser.set(user, now);
    if (this.lastUser.size > 5_000) this.lastUser.clear();
    return true;
  }
}

/** The minimal WebSocket the bot uses (Node's built-in global WebSocket fits; tests pass a fake). */
export interface ChatSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export interface ChatBotDeps {
  answer: (cmd: ChatCommand) => Promise<string>;
  connect?: (url: string) => ChatSocket;
  log?: (m: string) => void;
  now?: () => number;
}

export const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

export class TwitchChatBot {
  private socket: ChatSocket | null = null;
  private stopped = false;
  private retryMs = 2_000;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly limiter = new ChatLimiter();

  constructor(
    private readonly cfg: TwitchChatConfig,
    private readonly deps: ChatBotDeps,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  private log(m: string) {
    (this.deps.log ?? console.log)(`twitch chat: ${m}`);
  }

  private open() {
    const connect = this.deps.connect ?? ((url: string) => new WebSocket(url) as unknown as ChatSocket);
    const ws = connect(TWITCH_IRC_URL);
    this.socket = ws;
    ws.onopen = () => {
      // PASS before NICK, or Twitch answers "Improperly formatted auth".
      ws.send(`PASS oauth:${this.cfg.token}`);
      ws.send(`NICK ${this.cfg.login}`);
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`JOIN #${this.cfg.channel}`);
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) void this.onLine(line);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.socket !== ws || this.stopped) return;
      this.socket = null;
      this.log(`disconnected; trying again in ${Math.round(this.retryMs / 1000)}s`);
      this.timer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 120_000);
    };
  }

  /** Handles one line from Twitch (public for tests). */
  async onLine(line: string): Promise<void> {
    const msg = parseIrcLine(line);
    if (!msg || !this.socket) return;
    const ws = this.socket;
    switch (msg.command) {
      case "PING":
        ws.send(`PONG :${msg.params[0] ?? "tmi.twitch.tv"}`);
        return;
      case "001":
        this.retryMs = 2_000;
        this.log(`signed in as ${this.cfg.login}, answering in #${this.cfg.channel}`);
        return;
      case "NOTICE":
        // A bad or expired token: no point retrying every few seconds.
        if (/authentication failed|improperly formatted auth|invalid nick/i.test(msg.params[1] ?? "")) {
          this.log(`Twitch refused the sign-in (${msg.params[1]}); check GI_TWITCH_BOT_LOGIN and GI_TWITCH_BOT_TOKEN (needs chat:read and chat:edit)`);
          this.stop();
        }
        return;
      case "RECONNECT":
        ws.close();
        return;
      case "PRIVMSG": {
        const text = msg.params[1] ?? "";
        const cmd = parseCommand(text);
        const user = msg.nick ?? "";
        if (!cmd || user === this.cfg.login) return;
        const key = cmd.kind === "fighter" ? `fighter:${cmd.name.toLowerCase()}` : cmd.kind;
        if (!this.limiter.allow(key, user, (this.deps.now ?? Date.now)())) return;
        let reply: string;
        try {
          reply = await this.deps.answer(cmd);
        } catch (err) {
          this.log(`couldn't answer ${text.trim()}: ${(err as Error).message}`);
          return;
        }
        const parent = msg.tags["id"];
        const tag = parent && /^[0-9a-f-]{1,64}$/i.test(parent) ? `@reply-parent-msg-id=${parent} ` : "";
        if (this.socket === ws) ws.send(`${tag}PRIVMSG #${this.cfg.channel} :${chatSafe(reply)}`);
        return;
      }
    }
  }
}

/** The bot's answers from the game's database. */
export function gameAnswers(db: Db, config: Config, url: string, now: () => Date = () => new Date()): (cmd: ChatCommand) => Promise<string> {
  return async (cmd) => {
    switch (cmd.kind) {
      case "fight":
        return answerFight(await chatFight(db, config), url, now());
      case "fighter":
        return answerFighter(cmd.name, await chatFighters(db, cmd.name), url);
      case "salt":
        return answerSalt(url);
      case "commands":
        return answerCommands();
    }
  };
}
