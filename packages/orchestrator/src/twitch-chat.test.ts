import { describe, expect, it } from "vitest";
import {
  answerFight,
  answerFighter,
  chatSafe,
  ChatLimiter,
  loadTwitchChatConfig,
  parseCommand,
  parseIrcLine,
  TwitchChatBot,
  type ChatFight,
  type ChatSocket,
} from "./twitch-chat.ts";

const URL = "https://play.example.gg";
const NOW = new Date("2026-11-16T12:00:00Z");

const fight = (over: Partial<ChatFight> = {}): ChatFight => ({
  number: 412,
  label: "Matchmaking",
  state: "BETTING_OPEN",
  bettingClosesAt: new Date(NOW.getTime() + 42_000),
  sides: { 1: { name: "Free Loot", tier: "A", rating: 1640, wins: 12, losses: 5 }, 2: { name: "Hot Takes", tier: "A", rating: 1610, wins: 9, losses: 7 } },
  odds: { multiplier: { 1: "1.71x", 2: "2.21x" }, chancePct: { 1: 55.5, 2: 44.5 } },
  winnerSide: null,
  ...over,
});

describe("IRC lines", () => {
  it("reads tags, the sender and the message", () => {
    const m = parseIrcLine("@badge-info=;display-name=Foo\\sBar;id=f80a19d6-e35a-4273-82d0-cd87f614e767 :foofoo!foofoo@foofoo.tmi.twitch.tv PRIVMSG #bar :!odds please\r\n")!;
    expect(m).toEqual({ tags: { "badge-info": "", "display-name": "Foo Bar", id: "f80a19d6-e35a-4273-82d0-cd87f614e767" }, nick: "foofoo", command: "PRIVMSG", params: ["#bar", "!odds please"] });
  });

  it("reads PING, numerics and junk", () => {
    expect(parseIrcLine("PING :tmi.twitch.tv")).toEqual({ tags: {}, nick: null, command: "PING", params: ["tmi.twitch.tv"] });
    expect(parseIrcLine(":tmi.twitch.tv 001 gibot :Welcome, GLHF!")).toMatchObject({ command: "001", params: ["gibot", "Welcome, GLHF!"] });
    expect(parseIrcLine("")).toBeNull();
  });

  it("never lets an answer start a second IRC line, and keeps it within Twitch's 500 characters", () => {
    expect(chatSafe("hi\r\nPRIVMSG #x :pwned")).toBe("hi PRIVMSG #x :pwned");
    expect(chatSafe("x".repeat(600))).toHaveLength(500);
  });
});

describe("commands", () => {
  it("knows its commands and aliases, and ignores the rest of chat", () => {
    expect(parseCommand("!odds")).toEqual({ kind: "fight" });
    expect(parseCommand("  !FIGHT ")).toEqual({ kind: "fight" });
    expect(parseCommand("!fighter @Free Loot")).toEqual({ kind: "fighter", name: "Free Loot" });
    expect(parseCommand("!fighter")).toEqual({ kind: "fighter", name: "" });
    expect(parseCommand("!bet")).toEqual({ kind: "salt" });
    expect(parseCommand("!help")).toEqual({ kind: "commands" });
    expect(parseCommand("go red!")).toBeNull();
    expect(parseCommand("!ban someone")).toBeNull();
  });

  it("describes the fight while betting is open, after it and when it's void", () => {
    expect(answerFight(fight(), URL, NOW)).toBe(
      "#412 Matchmaking: 🔴 Free Loot (A, 1640, 12–5) 1.71× vs 🔵 Hot Takes (A, 1610, 9–7) 2.21× · betting closes in 42s · bet free Salt at https://play.example.gg",
    );
    expect(answerFight(fight({ state: "IN_PROGRESS" }), URL, NOW)).toMatch(/· fight on! · https/);
    expect(answerFight(fight({ state: "SETTLED", winnerSide: 2 }), URL, NOW)).toBe("Hot Takes won #412, Blue paid 2.21×. Next fight's betting opens soon: https://play.example.gg");
    expect(answerFight(fight({ state: "VOIDED" }), URL, NOW)).toMatch(/no contest: every bet refunded/);
    expect(answerFight(null, URL, NOW)).toMatch(/No fight yet/);
  });

  it("describes a fighter, or says it isn't found", () => {
    const c = { id: "c1", name: "Big Cheese", fighterName: "Hammer Bear", tier: "S", rating: 1802, wins: 30, losses: 10, owner: "Ana", titles: 4 };
    expect(answerFighter("big cheese", [c], URL)).toBe("Big Cheese (Hammer Bear): S tier, rating 1802, 30–10, 75% wins, 4 titles, owned by Ana · https://play.example.gg/fighter.html?id=c1");
    expect(answerFighter("x", [{ ...c, name: "Hammer Bear", owner: null, wins: 0, losses: 0, titles: 1 }, c], URL)).toMatch(/^Hammer Bear: S tier, rating 1802, 0–0, 1 title, a house fighter \(and 1 more match\)/);
    expect(answerFighter("Nobody", [], URL)).toBe('No fighter called "Nobody". All of them: https://play.example.gg/fighters.html');
    expect(answerFighter("", [], URL)).toMatch(/Which fighter/);
  });
});

describe("settings", () => {
  it("is off without a login and token, and refuses half a setup", () => {
    expect(loadTwitchChatConfig("greedislandgg", URL, {})).toBeNull();
    expect(loadTwitchChatConfig("greedislandgg", URL + "/", { GI_TWITCH_BOT_LOGIN: "GIBot", GI_TWITCH_BOT_TOKEN: "oauth:abc123" })).toEqual({ channel: "greedislandgg", login: "gibot", token: "abc123", url: URL });
    expect(() => loadTwitchChatConfig("greedislandgg", URL, { GI_TWITCH_BOT_LOGIN: "gibot" })).toThrow(/both/);
    expect(() => loadTwitchChatConfig(null, URL, { GI_TWITCH_BOT_LOGIN: "gibot", GI_TWITCH_BOT_TOKEN: "t" })).toThrow(/GI_TWITCH_CHANNEL/);
    expect(() => loadTwitchChatConfig("c", URL, { GI_TWITCH_BOT_LOGIN: "a b", GI_TWITCH_BOT_TOKEN: "t" })).toThrow(/login name/);
  });
});

describe("rate limits", () => {
  it("answers each command once per 10 s, each viewer once per 15 s, 1.5 s apart, at most 12 per 30 s", () => {
    const l = new ChatLimiter();
    expect(l.allow("fight", "a", 0)).toBe(true);
    expect(l.allow("fight", "b", 2_000)).toBe(false); // same command
    expect(l.allow("salt", "b", 1_000)).toBe(false); // too soon after the last line
    expect(l.allow("salt", "b", 2_000)).toBe(true);
    expect(l.allow("commands", "a", 4_000)).toBe(false); // same viewer
    expect(l.allow("fight", "c", 10_000)).toBe(true);
    const busy = new ChatLimiter();
    const at: number[] = [];
    for (let i = 0; i < 200; i++) if (busy.allow(`fighter:${i}`, `u${i}`, i * 700)) at.push(i * 700);
    // Never more than 12 lines in any 30 seconds, never closer than 1.5 s, and it keeps answering as time passes.
    for (const t of at) expect(at.filter((x) => x >= t && x < t + 30_000).length).toBeLessThanOrEqual(12);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(1_500);
    expect(at.length).toBeGreaterThan(40);
  });
});

class FakeSocket implements ChatSocket {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

describe("the bot", () => {
  const cfg = { channel: "greedislandgg", login: "gibot", token: "abc123", url: URL };
  const setup = () => {
    const socket = new FakeSocket();
    let t = 0;
    const logs: string[] = [];
    const bot = new TwitchChatBot(cfg, { connect: () => socket, answer: async (c) => `answer to ${c.kind}`, now: () => (t += 20_000), log: (m) => logs.push(m) });
    bot.start();
    socket.onopen!();
    return { bot, socket, logs };
  };

  it("signs in, joins, answers PING and replies to commands in a thread", async () => {
    const { bot, socket } = setup();
    expect(socket.sent).toEqual(["PASS oauth:abc123", "NICK gibot", "CAP REQ :twitch.tv/tags twitch.tv/commands", "JOIN #greedislandgg"]);
    socket.sent = [];
    await bot.onLine("PING :tmi.twitch.tv");
    await bot.onLine("@id=885196de-cb67-427a-baa8-82f9b0fcd05f :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #greedislandgg :!odds");
    await bot.onLine(":viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #greedislandgg :gg");
    // Its own lines, and a reply id that isn't one, never start anything odd.
    await bot.onLine("@id=x;y :gibot!gibot@gibot.tmi.twitch.tv PRIVMSG #greedislandgg :!odds");
    await bot.onLine("@id=bad\\sid :other!other@other.tmi.twitch.tv PRIVMSG #greedislandgg :!salt");
    expect(socket.sent).toEqual(["PONG :tmi.twitch.tv", "@reply-parent-msg-id=885196de-cb67-427a-baa8-82f9b0fcd05f PRIVMSG #greedislandgg :answer to fight", "PRIVMSG #greedislandgg :answer to salt"]);
    bot.stop();
  });

  it("stops for good when Twitch refuses the token", async () => {
    const { bot, socket, logs } = setup();
    await bot.onLine(":tmi.twitch.tv NOTICE * :Login authentication failed");
    expect(socket.closed).toBe(true);
    expect(logs.join("\n")).toMatch(/refused the sign-in/);
    bot.stop();
  });
});
