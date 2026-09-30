/**
 * Holders and NFTs (docs/PHASE3.md step 7, "NFTs as fighters"). Read-only:
 * a player proves they control a Solana wallet by signing a free message (no
 * transaction), and we read which NFTs it holds through a DAS API
 * (docs/nft-notes.md). Pure rules and parsing; the network and database side
 * lives in the orchestrator.
 */
import { characterNameProblem, normalizeCharacterName } from "./staff.ts";

export const CHAINS = ["SOLANA"] as const;
export type Chain = (typeof CHAINS)[number];

export interface NftConfig {
  /** How long a wallet sign-in message stays valid. */
  challengeTtlMs: number;
  /** Wallets one account can link. */
  maxWalletsPerUser: number;
}

export const DEFAULT_NFT: Readonly<NftConfig> = Object.freeze({
  challengeTtlMs: 10 * 60_000,
  maxWalletsPerUser: 3,
});

// ---------------------------------------------------------------------------
// Base58 (the Bitcoin alphabet Solana uses for addresses and signatures)

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function decodeBase58(s: string): Uint8Array {
  if (s.length === 0 || s.length > 128) throw new Error("bad base58 length");
  let n = 0n;
  for (const c of s) {
    const v = INDEX.get(c);
    if (v === undefined) throw new Error("not base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function encodeBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

/** A Solana address is a base58-encoded 32-byte public key. */
export function isSolanaAddress(s: string): boolean {
  try {
    return decodeBase58(s).length === 32;
  } catch {
    return false;
  }
}

/** The message a wallet signs to link it to an account. Signing it is free and sends nothing. */
export function walletChallengeMessage(input: { address: string; userId: string; nonce: string; issuedAt: Date }): string {
  return [
    "Greed Island: link this wallet to your account.",
    "",
    `Wallet: ${input.address}`,
    `Account: ${input.userId.slice(0, 8)}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${input.issuedAt.toISOString()}`,
    "",
    "Signing is free and doesn't send a transaction.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// NFTs as the DAS API returns them

export interface NftSummary {
  /** The asset's id (its mint address for standard NFTs). */
  assetId: string;
  name: string;
  /** An https address for its image, if it has one. */
  image: string | null;
  /** The verified collection it belongs to, if any. */
  collection: string | null;
  attributes: { trait: string; value: string }[];
  owner: string;
}

/** ipfs:// and ar:// addresses through public gateways; anything but https is dropped. */
export function httpsImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim();
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, "")}`;
  if (u.startsWith("ar://")) return `https://arweave.net/${u.slice(5)}`;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/**
 * One DAS asset as an NftSummary, or null for anything that isn't a usable
 * NFT (burnt, no id or owner). Unknown shapes are read defensively: the
 * response comes from an outside service.
 */
export function parseDasAsset(raw: unknown): NftSummary | null {
  const a = obj(raw);
  const assetId = str(a["id"]);
  const owner = str(obj(a["ownership"])["owner"]);
  if (!assetId || !owner || a["burnt"] === true) return null;
  const content = obj(a["content"]);
  const metadata = obj(content["metadata"]);
  const files = Array.isArray(content["files"]) ? (content["files"] as unknown[]).map(obj) : [];
  const imageFile = files.find((f) => typeof f["mime"] === "string" && (f["mime"] as string).startsWith("image/"));
  const image = httpsImageUrl(obj(content["links"])["image"]) ?? httpsImageUrl(imageFile?.["cdn_uri"]) ?? httpsImageUrl(imageFile?.["uri"]);
  const groups = Array.isArray(a["grouping"]) ? (a["grouping"] as unknown[]).map(obj) : [];
  const collection = str(groups.find((g) => g["group_key"] === "collection" && g["verified"] !== false)?.["group_value"]);
  const attributes = (Array.isArray(metadata["attributes"]) ? (metadata["attributes"] as unknown[]) : [])
    .map(obj)
    .filter((t) => t["trait_type"] !== undefined && t["value"] !== undefined)
    .map((t) => ({ trait: String(t["trait_type"]).slice(0, 60), value: String(t["value"]).slice(0, 60) }))
    .slice(0, 30);
  const name = (str(metadata["name"]) ?? assetId).slice(0, 80);
  return { assetId, name, image, collection, attributes, owner };
}

/** A fighter name to start from, based on an NFT's name (the submitter can change it). */
export function fighterNameFromNft(nftName: string): string | null {
  const cleaned = normalizeCharacterName(nftName.replace(/[^A-Za-z0-9 '\-.&]/g, " ")).slice(0, 20).trim();
  return characterNameProblem(cleaned) === null ? cleaned : null;
}
