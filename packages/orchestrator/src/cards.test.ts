import { describe, expect, it } from "vitest";
import { writePng } from "@greed-island/engine";
import { describeLicence, inputGlyphs, matchupsFor, pickMoves, pngSize, renderCard, type CardData } from "./cards.ts";

const base: CardData = {
  kind: "character",
  name: "Choco <Boy>",
  fighterName: "Good Boy",
  style: "ALL_ROUNDER",
  rarity: "COMMON",
  hp: 1100,
  stats: { power: 108, toughness: 100, speed: 4.2, reach: 80 },
  moves: [
    { name: "Poop Bomb", command: "QCB_x", damage: 50 },
    { name: "Fetch!", command: "throw", damage: 90 },
  ],
  art: null,
  tier: "A",
  rating: 1672,
  record: { wins: 12, losses: 8 },
  number: { n: 42, of: 97 },
  serial: 7,
  firstEdition: true,
  owner: "Antoine",
  title: "Giant Slayer",
  look: null,
  matchups: { strong: { style: "ZONER", pct: 58 }, weak: { style: "GRAPPLER", pct: 41 } },
  flavour: "A joke dog",
  credit: "Art: Pet Dogs Pack by LuizMelo",
};

describe("fighter cards", () => {
  it("draw the name (escaped), HP, style, tier, First Edition number, stats, moves and matchups", () => {
    const svg = renderCard(base);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Choco &lt;Boy&gt;");
    expect(svg).not.toContain("<Boy>");
    expect(svg).toContain(">1100<");
    expect(svg).toContain("BRAWLER");
    expect(svg).toContain("#007");
    expect(svg).toContain("Rating 1672");
    expect(svg).toContain("Owned by Antoine");
    expect(svg).toContain("Poop Bomb");
    expect(svg).toContain("↓↙← X");
    expect(svg).toContain("→ + Y");
    expect(svg).toContain("Sages 58%");
    expect(svg).toContain("Wrestlers 41%");
    expect(svg).toContain("“Giant Slayer”");
  });

  it("put the picture inside the card, and a foil frame on rare fighters", () => {
    const png = writePng({ width: 4, height: 6, colorType: 6, pixels: new Uint8Array(4 * 6 * 4).fill(255) });
    expect(pngSize(png)).toEqual({ width: 4, height: 6 });
    const svg = renderCard({ ...base, art: png, rarity: "RARE" });
    expect(svg).toContain("data:image/png;base64,");
    expect(svg).toContain('fill="url(#foil)"');
    // Unknown numbers show a question mark, never a made-up value; a fighter with no moves known says so.
    const blank = renderCard({ ...base, hp: null, stats: { power: null, toughness: null, speed: null, reach: null }, moves: [] });
    expect(blank).toContain(">?<");
    expect(blank).toContain("Moves of its own");
    expect(blank).not.toContain("HP");
  });

  it("write inputs as arrows and buttons", () => {
    expect([inputGlyphs("QCF_x"), inputGlyphs("DP_y"), inputGlyphs("FF"), inputGlyphs("throw"), inputGlyphs("b"), inputGlyphs(null)]).toEqual(["↓↘→ X", "→↓↘ Y", "→ →", "→ + Y", "B", null]);
  });

  it("pick the signature move first, then the hardest-hitting special", () => {
    const moves = [
      { state: 200, name: "Jab", kind: "normal", damage: 99, reach: 40 },
      { state: 1000, name: "Charge", kind: "special", damage: 70, reach: 80 },
      { state: 1100, name: "Uppercut", kind: "special", damage: 90, reach: 40 },
      { state: 1400, name: "Bazooka", kind: "special", damage: 60, reach: null, command: "QCB_x" },
    ];
    expect(pickMoves({ moves }).map((m) => m.name)).toEqual(["Bazooka", "Uppercut"]);
    expect(pickMoves(null)).toEqual([]);
  });

  it("say which styles it beats and loses to, only from enough fights", () => {
    const wins = { ZONER: { HEAVY: 60, GRAPPLER: 10 }, HEAVY: { ZONER: 40 }, GRAPPLER: { ZONER: 30 } };
    expect(matchupsFor("ZONER", wins)).toEqual({ strong: { style: "HEAVY", pct: 60 }, weak: { style: "GRAPPLER", pct: 25 } });
    expect(matchupsFor("ZONER", wins, 1000)).toEqual({ strong: null, weak: null });
  });

  it("take the flavour and the art credit from the roster's licence note", () => {
    expect(describeLicence("House fighter: a knight with a sword and a frying pan. Sprites: Hero Knight by LuizMelo (CC0, art/SOURCES.md); moves by Greed Island.")).toEqual({
      flavour: "A knight with a sword and a frying pan",
      credit: "Art: Hero Knight by LuizMelo",
    });
    expect(describeLicence("MUGEN character by someone.")).toEqual({ flavour: null, credit: null });
  });
});
