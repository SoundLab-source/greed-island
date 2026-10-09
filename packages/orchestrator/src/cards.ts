/**
 * Fighter cards: a collectible trading card for every fighter (the shop, the roster) and every owned character (its
 * own upgraded stats, record, titles and NFT look), drawn as an SVG so one image serves the website and, later, an
 * NFT's picture. Our own card design. `renderCard` is pure; `fighterCardData` and `characterCardData` gather the
 * numbers: HP and stats from the fighter's numbers.json (written by pnpm templates:build), its picture (card.png),
 * and how its style does against the others on this roster (story.ts `styleWins`).
 */
import type { Archetype } from "@greed-island/shared";
import { characterCosmetics, type Db } from "@greed-island/db";
import { describeCosmetics, playerName } from "@greed-island/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { lookCharacterId } from "./look-sprites.ts";
import { STYLE_NAME, styleWins, type StyleWins } from "./story.ts";

export interface CardMove {
  name: string;
  /** Its input as spec.ts writes it (QCF_x, DP_y, throw...), when known. */
  command: string | null;
  damage: number;
}

export interface CardData {
  kind: "fighter" | "character";
  name: string;
  /** The fighter's own name, when the card's name is an outfit's or an owner's name for it. */
  fighterName: string | null;
  style: Archetype;
  rarity: string;
  hp: number | null;
  stats: { power: number | null; toughness: number | null; speed: number | null; reach: number | null };
  moves: CardMove[];
  /** The picture (a PNG), or none. */
  art: Uint8Array | null;
  tier: string | null;
  rating: number | null;
  record: { wins: number; losses: number } | null;
  /** Its number among the roster's fighters. */
  number: { n: number; of: number } | null;
  serial: number | null;
  firstEdition: boolean;
  owner: string | null;
  title: string | null;
  /** The NFT look it wears, by the NFT's name. */
  look: string | null;
  matchups: { strong: { style: Archetype; pct: number } | null; weak: { style: Archetype; pct: number } | null };
  flavour: string | null;
  credit: string | null;
}

/** Each style's colours on the card: the frame and the accents. */
export const STYLE_COLORS: Record<Archetype, { main: string; dark: string; light: string }> = {
  ALL_ROUNDER: { main: "#e2563f", dark: "#7a2418", light: "#ffb39f" },
  RUSHDOWN: { main: "#f0bf2c", dark: "#7a5a08", light: "#ffe79a" },
  HEAVY: { main: "#b07a4a", dark: "#4f3018", light: "#e6c3a0" },
  GRAPPLER: { main: "#9b5bd6", dark: "#43226a", light: "#d8b8f6" },
  ZONER: { main: "#3fa6e0", dark: "#13486b", light: "#a8dcfa" },
};

/** Inputs as arrows: quarter circles, the dragon punch motion, dashes, and the buttons. */
export function inputGlyphs(command: string | null): string | null {
  if (!command) return null;
  if (command === "throw") return "→ + Y";
  const [motion, button] = command.includes("_") ? command.split("_") : [command, ""];
  const arrows: Record<string, string> = { QCF: "↓↘→", QCB: "↓↙←", DP: "→↓↘", FF: "→ →", BB: "← ←" };
  const b = button ? button.toUpperCase() : "";
  if (!motion) return null;
  if (arrows[motion]) return b ? `${arrows[motion]} ${b}` : arrows[motion]!;
  return motion.length === 1 ? motion.toUpperCase() : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Text that's squeezed to fit `max` pixels when it would run longer (about 0.58 of the size per character). */
/**
 * Text that stays within `max` units: a long line gets a smaller font (down to 70%), and only if that's still too
 * long is it squeezed to `max`. Widths are estimated generously (bold capitals run wide, and the viewer's own fonts
 * decide the real width), so text is never stretched and rarely squeezed.
 */
function fitText(text: string, x: number, y: number, size: number, max: number, attrs: string): string {
  // Arial Black (the names and moves) is very wide; the body font much less so.
  const PER_CHAR = attrs.includes("Arial Black") ? 0.76 : 0.62;
  const fitted = Math.max(size * 0.7, Math.min(size, max / (text.length * PER_CHAR)));
  const squeeze = text.length * fitted * PER_CHAR > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : "";
  return `<text x="${x}" y="${y}" font-size="${Math.round(fitted * 10) / 10}"${squeeze} ${attrs}>${esc(text)}</text>`;
}

/** A PNG's size, from its header. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.length < 24 || png[0] !== 0x89 || png[1] !== 0x50) return null;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

/** A small mark for each style, drawn in a 24-unit box. */
function styleIcon(style: Archetype, x: number, y: number, color: string): string {
  const t = `transform="translate(${x} ${y})"`;
  switch (style) {
    case "ALL_ROUNDER": // a fist
      return `<g ${t} fill="${color}"><rect x="3" y="7" width="16" height="12" rx="4"/><rect x="5" y="3" width="4" height="7" rx="2"/><rect x="9" y="2" width="4" height="8" rx="2"/><rect x="13" y="3" width="4" height="7" rx="2"/><rect x="15" y="10" width="6" height="5" rx="2"/></g>`;
    case "RUSHDOWN": // a lightning bolt
      return `<g ${t}><polygon points="14,1 4,13 11,13 8,23 20,9 13,9 16,1" fill="${color}"/></g>`;
    case "HEAVY": // a boulder
      return `<g ${t}><polygon points="4,18 2,11 7,4 15,3 21,8 22,16 16,21 8,21" fill="${color}"/></g>`;
    case "GRAPPLER": // two linked rings
      return `<g ${t} fill="none" stroke="${color}" stroke-width="3"><circle cx="8" cy="12" r="6"/><circle cx="16" cy="12" r="6"/></g>`;
    case "ZONER": // a spark
      return `<g ${t} fill="${color}"><polygon points="12,1 14.5,9.5 23,12 14.5,14.5 12,23 9.5,14.5 1,12 9.5,9.5"/></g>`;
  }
}

/** The card, 600 x 840 (a trading card's shape). */
/** The lowest the flavour line can sit above the footer (at 806). */
export const FLAVOUR_LAST_Y = 790;

export function renderCard(c: CardData): string {
  const W = 600, H = 840;
  const col = STYLE_COLORS[c.style];
  const rare = c.rarity !== "COMMON";
  const frame = rare ? `url(#foil)` : `url(#frame)`;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`${c.name}, a ${STYLE_NAME[c.style]} fighter card`)}">`);
  out.push(`<defs>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col.light}"/><stop offset="0.35" stop-color="${col.main}"/><stop offset="1" stop-color="${col.dark}"/></linearGradient>
    <linearGradient id="foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4c2"/><stop offset="0.25" stop-color="#f6c945"/><stop offset="0.5" stop-color="#fff0b0"/><stop offset="0.75" stop-color="#c9971c"/><stop offset="1" stop-color="#f6d77a"/></linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2030"/><stop offset="1" stop-color="#111320"/></linearGradient>
    <radialGradient id="stage" cx="0.5" cy="0.78" r="0.75"><stop offset="0" stop-color="${col.main}" stop-opacity="0.55"/><stop offset="0.55" stop-color="${col.dark}" stop-opacity="0.5"/><stop offset="1" stop-color="#0b0c14"/></radialGradient>
    <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ad9" stop-opacity="0"/><stop offset="0.4" stop-color="#7af0ff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff59a" stop-opacity="0.28"/><stop offset="0.6" stop-color="#9aff9f" stop-opacity="0.18"/><stop offset="1" stop-color="#ff7ad9" stop-opacity="0"/></linearGradient>
    <clipPath id="window"><rect x="38" y="138" width="524" height="300" rx="14"/></clipPath>
  </defs>`);
  // Frame and panel.
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="30" fill="${frame}"/>`);
  out.push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="20" fill="url(#panel)"/>`);
  // Header: name, style, HP.
  const font = `font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900"`;
  const body = `font-family="'Trebuchet MS', 'Segoe UI', Helvetica, Arial, sans-serif"`;
  out.push(fitText(c.name, 38, 78, 40, c.hp ? 360 : 520, `${font} fill="#ffffff"`));
  if (c.hp !== null) {
    out.push(`<text x="562" y="78" text-anchor="end" ${font} fill="${col.main}"><tspan font-size="20">HP </tspan><tspan font-size="44">${c.hp}</tspan></text>`);
  }
  out.push(`<rect x="38" y="92" width="${STYLE_NAME[c.style].length * 12 + 52}" height="32" rx="16" fill="${col.main}" fill-opacity="0.18" stroke="${col.main}" stroke-width="2"/>`);
  out.push(styleIcon(c.style, 46, 96, col.main));
  out.push(`<text x="76" y="115" font-size="17" ${body} font-weight="700" letter-spacing="2" fill="${col.light}">${esc(STYLE_NAME[c.style].toUpperCase())}</text>`);
  if (c.fighterName) out.push(fitText(c.fighterName, 562, 115, 17, 230, `text-anchor="end" ${body} font-style="italic" fill="#9aa0b8"`));
  // The art window.
  out.push(`<rect x="38" y="138" width="524" height="300" rx="14" fill="url(#stage)"/>`);
  out.push(`<g clip-path="url(#window)">`);
  out.push(`<ellipse cx="300" cy="412" rx="170" ry="20" fill="#000000" fill-opacity="0.35"/>`);
  const size = c.art ? pngSize(c.art) : null;
  if (c.art && size) {
    // As big as the window allows (whole-number scales when that's still at least 80% of it: crisper pixels).
    const fit = Math.min(480 / size.width, 270 / size.height);
    const k = Math.floor(fit) >= 0.8 * fit ? Math.floor(fit) : fit;
    const w = size.width * k, h = size.height * k;
    out.push(`<image href="data:image/png;base64,${Buffer.from(c.art).toString("base64")}" x="${Math.round(300 - w / 2)}" y="${Math.round(420 - h)}" width="${Math.round(w)}" height="${Math.round(h)}" preserveAspectRatio="none" style="image-rendering: pixelated" image-rendering="optimizeSpeed"/>`);
  } else {
    out.push(`<text x="300" y="330" text-anchor="middle" font-size="120" ${font} fill="${col.main}" fill-opacity="0.35">?</text>`);
  }
  if (rare) out.push(`<rect x="38" y="138" width="524" height="300" fill="url(#holo)"/>`);
  out.push(`</g>`);
  out.push(`<rect x="38" y="138" width="524" height="300" rx="14" fill="none" stroke="${rare ? "#f6c945" : col.main}" stroke-width="3"/>`);
  // Badges on the window: the tier, a First Edition stamp, the NFT look.
  if (c.tier) {
    out.push(`<circle cx="80" cy="180" r="28" fill="#0b0c14" fill-opacity="0.85" stroke="${col.main}" stroke-width="3"/>`);
    out.push(`<text x="80" y="192" text-anchor="middle" font-size="32" ${font} fill="#ffffff">${esc(c.tier)}</text>`);
    out.push(`<text x="80" y="224" text-anchor="middle" font-size="11" ${body} font-weight="700" letter-spacing="2" fill="#c8cbe0">TIER</text>`);
  }
  if (c.firstEdition) {
    out.push(`<g transform="rotate(8 500 176)"><rect x="438" y="156" width="124" height="40" rx="8" fill="#f6c945"/><text x="500" y="174" text-anchor="middle" font-size="12" ${font} fill="#3b2a00">1ST EDITION</text><text x="500" y="190" text-anchor="middle" font-size="13" ${font} fill="#3b2a00">${c.serial ? `#${String(c.serial).padStart(3, "0")}` : ""}</text></g>`);
  }
  if (c.look) out.push(fitText(`NFT look: ${c.look}`, 300, 430, 15, 480, `text-anchor="middle" ${body} font-weight="700" fill="#ffffff" fill-opacity="0.9"`));
  // The info line.
  const info = [
    c.number ? `No. ${c.number.n}/${c.number.of}` : "",
    c.rating !== null ? `Rating ${c.rating}` : "",
    c.record ? `Record ${c.record.wins}–${c.record.losses}` : "",
    c.owner ? `Owned by ${c.owner}` : c.kind === "fighter" ? "" : "House",
  ].filter(Boolean).join("  ·  ");
  out.push(fitText(info, 300, 466, 15, 524, `text-anchor="middle" ${body} font-style="italic" fill="#9aa0b8"`));
  if (c.title) out.push(fitText(`“${c.title}”`, 300, 488, 16, 500, `text-anchor="middle" ${body} font-weight="700" fill="#f6c945"`));
  // Stats.
  const rows: [string, number | null, (v: number) => number, (v: number) => string][] = [
    ["POWER", c.stats.power, (v) => (v - 50) / 100, (v) => String(Math.round(v))],
    ["TOUGHNESS", c.stats.toughness, (v) => (v - 50) / 100, (v) => String(Math.round(v))],
    ["SPEED", c.stats.speed, (v) => (v - 2) / 5, (v) => v.toFixed(1)],
    ["REACH", c.stats.reach, (v) => (v - 20) / 120, (v) => String(Math.round(v))],
  ];
  let y = c.title ? 516 : 506;
  for (const [label, value, share, show] of rows) {
    out.push(`<text x="38" y="${y + 13}" font-size="14" ${body} font-weight="700" letter-spacing="1.5" fill="#c8cbe0">${label}</text>`);
    out.push(`<rect x="160" y="${y}" width="330" height="16" rx="8" fill="#ffffff" fill-opacity="0.08"/>`);
    if (value !== null) {
      const w = Math.max(10, Math.min(1, Math.max(0, share(value))) * 330);
      out.push(`<rect x="160" y="${y}" width="${w.toFixed(1)}" height="16" rx="8" fill="${col.main}"/>`);
    }
    out.push(`<text x="562" y="${y + 14}" text-anchor="end" font-size="17" ${font} fill="#ffffff">${value === null ? "?" : show(value)}</text>`);
    y += 28;
  }
  // Moves.
  y += 8;
  out.push(`<line x1="38" y1="${y}" x2="562" y2="${y}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>`);
  y += 10;
  if (c.moves.length === 0) {
    out.push(`<text x="300" y="${y + 30}" text-anchor="middle" font-size="16" ${body} font-style="italic" fill="#9aa0b8">Moves of its own</text>`);
    y += 50;
  }
  for (const m of c.moves) {
    const input = inputGlyphs(m.command);
    if (input) {
      out.push(`<rect x="38" y="${y + 6}" width="104" height="30" rx="8" fill="${col.main}" fill-opacity="0.2" stroke="${col.main}" stroke-width="1.5"/>`);
      out.push(`<text x="90" y="${y + 27}" text-anchor="middle" font-size="16" ${body} font-weight="700" fill="${col.light}">${esc(input)}</text>`);
    }
    out.push(fitText(m.name, input ? 156 : 38, y + 29, 23, input ? 330 : 448, `${font} fill="#ffffff"`));
    out.push(`<text x="562" y="${y + 31}" text-anchor="end" font-size="30" ${font} fill="${col.main}">${m.damage}</text>`);
    y += 46;
  }
  // Strong and weak against.
  y += 4;
  out.push(`<line x1="38" y1="${y}" x2="562" y2="${y}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>`);
  const mu = (label: string, m: CardData["matchups"]["strong"], x: number, color: string) =>
    m
      ? `<text x="${x}" y="${y + 26}" font-size="15" ${body} fill="#9aa0b8">${label} <tspan font-weight="700" fill="${color}">${esc(STYLE_NAME[m.style])}s ${m.pct}%</tspan></text>`
      : `<text x="${x}" y="${y + 26}" font-size="15" ${body} fill="#6b7088">${label} <tspan font-style="italic">no data yet</tspan></text>`;
  out.push(mu("Strong vs", c.matchups.strong, 38, "#7ee08a"));
  out.push(mu("Weak vs", c.matchups.weak, 320, "#ff8a7a"));
  // Flavour under the matchups (a card with a title and two moves leaves little room), then the footer; left off
  // when it would run into the footer.
  const flavourY = Math.max(778, y + 26 + 22);
  if (c.flavour && flavourY <= FLAVOUR_LAST_Y) out.push(fitText(c.flavour, 300, flavourY, 15, 524, `text-anchor="middle" ${body} font-style="italic" fill="#c8cbe0"`));
  // The credit stops well short of the GREED ISLAND mark at the right.
  if (c.credit) out.push(fitText(c.credit, 38, 806, 11, 340, `${body} fill="#6b7088"`));
  out.push(`<text x="562" y="806" text-anchor="end" font-size="13" ${font} letter-spacing="2" fill="${rare ? "#f6c945" : col.main}">GREED ISLAND ${rare ? "★" : "●"}</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}

// ----- Gathering the numbers -----

interface Numbers {
  life?: number;
  attack?: number;
  defence?: number;
  runFwd?: number;
  moves?: { state: number; name: string; kind: string; damage: number; reach: number | null; command?: string }[];
}

/** A fighter's character folder (under IKEMEN_DIR/chars), or null when its .def isn't there. */
function charDir(ikemenDir: string | undefined, defPath: string): string | null {
  if (!ikemenDir) return null;
  const chars = path.resolve(ikemenDir, "chars");
  const dir = path.resolve(ikemenDir, path.dirname(defPath));
  return dir.startsWith(chars + path.sep) ? dir : null;
}

async function readNumbers(dir: string | null): Promise<Numbers | null> {
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(path.join(dir, "numbers.json"), "utf8")) as Numbers;
  } catch {
    return null;
  }
}

/** The two moves for the card: its signature move first (QCB + x), then its hardest-hitting special or throw. */
export function pickMoves(numbers: Numbers | null): CardMove[] {
  const specials = (numbers?.moves ?? []).filter((m) => m.kind !== "normal");
  const signature = specials.find((m) => m.state === 1400);
  const rest = specials.filter((m) => m !== signature).sort((a, b) => b.damage - a.damage);
  return [signature, ...rest].filter((m) => m !== undefined).slice(0, 2).map((m) => ({ name: m.name, command: m.command ?? null, damage: m.damage }));
}

/** Its style's best and worst matchup on this roster, from enough settled fights. */
export function matchupsFor(style: Archetype, wins: StyleWins, minFights = 30): CardData["matchups"] {
  const shares: { style: Archetype; pct: number }[] = [];
  for (const other of Object.keys(STYLE_NAME) as Archetype[]) {
    if (other === style) continue;
    const won = wins[style]?.[other] ?? 0, lost = wins[other]?.[style] ?? 0;
    if (won + lost >= minFights) shares.push({ style: other, pct: Math.round((100 * won) / (won + lost)) });
  }
  shares.sort((a, b) => b.pct - a.pct);
  const best = shares[0], worst = shares[shares.length - 1];
  return { strong: best && best.pct > 50 ? best : null, weak: worst && worst.pct < 50 ? worst : null };
}

/** "House fighter: a knight with a sword. Sprites: Hero Knight by LuizMelo (CC0...)" → flavour and credit. */
export function describeLicence(note: string): { flavour: string | null; credit: string | null } {
  const what = /^House fighter: ([^.]+)\./.exec(note)?.[1];
  const sprites = /Sprites: ([^(;.]+)/.exec(note)?.[1]?.trim();
  return { flavour: what ? what.charAt(0).toUpperCase() + what.slice(1) : null, credit: sprites ? `Art: ${sprites}` : null };
}

async function rosterNumber(db: Db, fighterId: string): Promise<CardData["number"]> {
  const all = await db.fighter.findMany({ where: { enabled: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } });
  const n = all.findIndex((f) => f.id === fighterId);
  return n < 0 ? null : { n: n + 1, of: all.length };
}

const scaled = (base: number | undefined, pct: number) => (typeof base === "number" ? Math.round((base * pct) / 100) : null);

/** A fighter's card: its base numbers, its record across every copy, its main picture. */
export async function fighterCardData(db: Db, ikemenDir: string | undefined, fighterId: string): Promise<CardData | null> {
  const f = await db.fighter.findUnique({ where: { id: fighterId }, include: { characters: { select: { wins: true, losses: true } } } });
  if (!f) return null;
  const dir = charDir(ikemenDir, f.defPath);
  const numbers = await readNumbers(dir);
  const art = dir ? await readFile(path.join(dir, "card.png")).catch(() => null) : null;
  const wins = f.characters.reduce((n, c) => n + c.wins, 0), losses = f.characters.reduce((n, c) => n + c.losses, 0);
  return {
    kind: "fighter",
    name: f.displayName,
    fighterName: null,
    style: f.archetype as Archetype,
    rarity: f.rarity,
    hp: numbers?.life ?? null,
    stats: { power: numbers?.attack ?? null, toughness: numbers?.defence ?? null, speed: numbers?.runFwd ?? null, reach: maxReach(numbers) },
    moves: pickMoves(numbers),
    art,
    tier: null,
    rating: null,
    record: wins + losses ? { wins, losses } : null,
    number: await rosterNumber(db, f.id),
    serial: null,
    firstEdition: false,
    owner: null,
    title: null,
    look: null,
    matchups: matchupsFor(f.archetype as Archetype, await styleWins(db)),
    ...describeLicence(f.licenseNote),
  };
}

/** A character's card: its fighter's numbers with its own upgrades, its record, tier, title, owner and NFT look. */
export async function characterCardData(db: Db, ikemenDir: string | undefined, characterId: string): Promise<CardData | null> {
  const c = await db.character.findUnique({ where: { id: characterId }, include: { fighter: true, owner: { select: { id: true, displayName: true } } } });
  if (!c) return null;
  const dir = charDir(ikemenDir, c.fighter.defPath);
  const numbers = await readNumbers(dir);
  const cosmetics = describeCosmetics((await characterCosmetics(db, c)).equipped);
  // Its picture: the NFT look's, else its outfit's, else the fighter's.
  const look = cosmetics.look;
  const read = (file: string) => readFile(file).catch(() => null);
  const art =
    (look && ikemenDir ? await read(path.join(ikemenDir, "chars", lookCharacterId(look.id), "card.png")) : null) ??
    (dir && c.palette > 1 ? await read(path.join(dir, `card-${c.palette}.png`)) : null) ??
    (dir ? await read(path.join(dir, "card.png")) : null);
  return {
    kind: "character",
    name: c.name,
    fighterName: c.name !== c.fighter.displayName ? c.fighter.displayName : null,
    style: c.fighter.archetype as Archetype,
    rarity: c.fighter.rarity,
    hp: scaled(numbers?.life, c.lifePct),
    stats: { power: scaled(numbers?.attack, c.attackPct), toughness: scaled(numbers?.defence, c.defensePct), speed: numbers?.runFwd ?? null, reach: maxReach(numbers) },
    moves: pickMoves(numbers),
    art,
    tier: c.tier,
    rating: Math.round(c.rating),
    record: { wins: c.wins, losses: c.losses },
    number: await rosterNumber(db, c.fighterId),
    serial: c.serial,
    firstEdition: c.firstEdition,
    owner: c.owner ? playerName(c.owner) : null,
    title: cosmetics.title?.label ?? null,
    look: look?.name ?? null,
    matchups: matchupsFor(c.fighter.archetype as Archetype, await styleWins(db)),
    ...describeLicence(c.fighter.licenseNote),
  };
}

function maxReach(numbers: Numbers | null): number | null {
  const reaches = (numbers?.moves ?? []).filter((m) => m.kind === "normal" && typeof m.reach === "number").map((m) => m.reach as number);
  return reaches.length ? Math.max(...reaches) : null;
}
