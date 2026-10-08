/**
 * The share page for a character's card (GET /card/:id, apps/web/card.html): the page is static, but chats and social
 * sites read a link's preview from the page's own tags without running its script, so the server fills in the
 * title, description and picture (the share image, share-image.ts) for that character before sending it.
 */
import type { CardData } from "../cards.ts";
import { STYLE_NAME } from "../story.ts";

const START = "<!--share-meta-->";
const END = "<!--/share-meta-->";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ShareMeta {
  title: string;
  description: string;
  url: string;
  image: string;
}

export function shareMeta(card: CardData, characterId: string, publicUrl: string): ShareMeta {
  const base = publicUrl.replace(/\/$/, "");
  const style = STYLE_NAME[card.style];
  // "an S-tier", "a B-tier": as the letter is said.
  const who = card.tier ? `${/^[AEFHILMNORSX]/.test(card.tier) ? "an" : "a"} ${card.tier}-tier ${style}` : `a ${style}`;
  const facts = [
    card.owner ? `Owned by ${card.owner}.` : "",
    card.record ? `Record ${card.record.wins}–${card.record.losses}${card.rating !== null ? `, rating ${card.rating}` : ""}.` : "",
    card.title ? `Title: ${card.title}.` : "",
    "Watch it fight and bet free play money on Greed Island.",
  ];
  const id = encodeURIComponent(characterId);
  return {
    title: `${card.name}: ${who} · Greed Island`,
    description: facts.filter(Boolean).join(" "),
    url: `${base}/card/${id}`,
    image: `${base}/api/cards/characters/${id}/share.png`,
  };
}

/** The page with its preview tags for this card (the page's own block, between the markers, is replaced). */
export function fillSharePage(html: string, m: ShareMeta): string {
  const start = html.indexOf(START), end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error("card.html has no share-meta block");
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Greed Island">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    `<meta property="og:image" content="${esc(m.image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
    `<meta name="twitter:image" content="${esc(m.image)}">`,
  ].join("\n  ");
  return html.slice(0, start) + `${START}\n  ${tags}\n  ` + html.slice(end);
}
