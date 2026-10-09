import { readPng, toRgba, writePng } from "@greed-island/engine";
import { describe, expect, it } from "vitest";
import type { CardData } from "./cards.ts";
import { fontSafe, nameLayout, SHARE_H, SHARE_W, shareImage } from "./share-image.ts";
import { fillSharePage, shareMeta } from "./api/share-page.ts";

const card: CardData = {
  kind: "character",
  name: "Señor Bonk & Co.",
  fighterName: "Sir Bonkalot",
  style: "ZONER",
  rarity: "LEGENDARY",
  hp: 1000,
  stats: { power: 100, toughness: 100, speed: 4, reach: 80 },
  moves: [],
  art: null,
  tier: "S",
  rating: 1712,
  record: { wins: 31, losses: 9 },
  number: { n: 3, of: 97 },
  serial: 2,
  firstEdition: true,
  owner: "Antoine <script>",
  title: "Giant Slayer",
  look: null,
  matchups: { strong: null, weak: null },
  flavour: null,
  credit: null,
};

/** A small red figure on a transparent background. */
function sprite(): Buffer {
  const w = 20, h = 30;
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 5; y < h; y++) for (let x = 6; x < 14; x++) pixels.set([220, 30, 30, 255], (y * w + x) * 4);
  return writePng({ width: w, height: h, colorType: 6, pixels });
}

const pixel = (rgb: Uint8Array, x: number, y: number) => [...rgb.subarray((y * SHARE_W + x) * 4, (y * SHARE_W + x) * 4 + 3)];

describe("the share picture", () => {
  it("sets a long name on two lines instead of cutting it, and a short one big on one", () => {
    expect(nameLayout("Pokey", 484)).toEqual({ lines: ["POKEY"], scale: 10 });
    const long = nameLayout("Possibility of Chizuru", 484);
    // Two lines, split where both are as big as possible.
    expect(long.lines).toEqual(["POSSIBILITY", "OF CHIZURU"]);
    expect(long.scale).toBeGreaterThanOrEqual(5);
    // One long word can only be cut.
    expect(nameLayout("Supercalifragilisticexpialidocious", 484).lines).toHaveLength(1);
  });

  it("keeps only what the pixel font can draw", () => {
    expect(fontSafe("Señor Bonk & Co.")).toBe("SENOR BONK CO.");
    expect(fontSafe("Rock–Paper")).toBe("ROCK-PAPER");
    expect(fontSafe("¿?")).toBe("?");
  });

  it("is a 1200 x 630 PNG with the fighter drawn big and a gold frame for a rare fighter", () => {
    const png = readPng(shareImage({ ...card, art: sprite() }));
    expect([png.width, png.height]).toEqual([SHARE_W, SHARE_H]);
    const rgba = toRgba(png);
    expect(pixel(rgba, 4, 4)).toEqual([246, 201, 69]); // the frame
    // The figure, scaled up whole (16x): its red reaches well above the floor.
    expect(pixel(rgba, 330, 568 - 100)).toEqual([220, 30, 30]);
  });

  it("draws a common fighter in its style's colour, without a picture or a record", () => {
    const png = readPng(shareImage({ ...card, rarity: "COMMON", art: null, record: null, tier: null, rating: null, owner: null, title: null, firstEdition: false }));
    expect(pixel(toRgba(png), 4, 4)).toEqual([0x3f, 0xa6, 0xe0]); // the Sage's blue
  });

  it("survives a broken picture", () => {
    expect(() => shareImage({ ...card, art: new Uint8Array([0x89, 0x50, 1, 2]) })).not.toThrow();
  });
});

describe("the share page's link preview", () => {
  it("names the fighter, with the share picture and the page's address", () => {
    const m = shareMeta(card, "7d3c1c1e-0000-4000-8000-000000000001", "https://greedisland.gg/");
    expect(m).toEqual({
      title: "Señor Bonk & Co.: an S-tier Sage · Greed Island",
      description: "Owned by Antoine <script>. Record 31–9, rating 1712. Title: Giant Slayer. Watch it fight and bet free play money on Greed Island.",
      url: "https://greedisland.gg/card/7d3c1c1e-0000-4000-8000-000000000001",
      image: "https://greedisland.gg/api/cards/characters/7d3c1c1e-0000-4000-8000-000000000001/share.png",
    });
  });

  it("replaces the page's own tags, escaped", () => {
    const page = `<head>\n<!--share-meta-->\n<title>Fighter card</title>\n<!--/share-meta-->\n<link rel="stylesheet" href="/site.css">\n</head>`;
    const html = fillSharePage(page, shareMeta(card, "7d3c1c1e-0000-4000-8000-000000000001", "https://greedisland.gg"));
    expect(html).not.toContain("<title>Fighter card</title>");
    expect(html).toContain("<title>Señor Bonk &amp; Co.: an S-tier Sage · Greed Island</title>");
    expect(html).toContain('<meta property="og:image" content="https://greedisland.gg/api/cards/characters/7d3c1c1e-0000-4000-8000-000000000001/share.png">');
    expect(html).toContain("Antoine &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<link rel="stylesheet" href="/site.css">');
    expect(() => fillSharePage("<head></head>", shareMeta(card, "x", "https://g"))).toThrow(/share-meta/);
  });
});
