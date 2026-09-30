/**
 * Holders (docs/PHASE3.md step 7, "NFTs as fighters"). Read-only: a player
 * links a Solana wallet by signing a one-time message (free, no
 * transaction); we read which NFTs it holds from a DAS endpoint; NFTs from
 * collections staff approved can start a fighter submission. Nothing here
 * signs or sends anything on-chain.
 */
import { NotFoundError, withRetry, type Db, type Tx } from "@greed-island/db";
import {
  decodeBase58,
  fighterNameFromNft,
  isSolanaAddress,
  LedgerRuleError,
  pngInfo,
  walletChallengeMessage,
  type Archetype,
  type Config,
  type NftSummary,
} from "@greed-island/shared";
import { createPublicKey, randomBytes, randomInt, verify } from "node:crypto";
import type { ImageFetcher } from "./image-fetch.ts";
import type { NftSource } from "./nft-source.ts";
import { requireStaff } from "./staff.ts";
import type { SubmissionStore } from "./submission-store.ts";
import { addSubmissionFile, createSubmission } from "./submissions.ts";

function refuse(problem: string | null): void {
  if (problem) throw new LedgerRuleError("NOT_ELIGIBLE", problem);
}

/** Sign-in messages a player can ask for per hour. */
const CHALLENGES_PER_HOUR = 10;

/** Ed25519 public keys wrapped for node:crypto (the fixed SPKI header for a raw 32-byte key). */
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

/** Whether `signature` (64 bytes) is `address`'s Ed25519 signature of `message` (UTF-8), as Solana wallets sign. */
export function verifySolanaSignature(address: string, message: string, signature: Uint8Array): boolean {
  if (signature.length !== 64 || !isSolanaAddress(address)) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, decodeBase58(address)]), format: "der", type: "spki" });
  return verify(null, Buffer.from(message, "utf8"), key, signature);
}

/** Step 1 of linking a wallet: the message it must sign. */
export async function createWalletChallenge(db: Db, config: Config, input: { userId: string; address: string }, now = new Date()) {
  const address = input.address.trim();
  if (!isSolanaAddress(address)) refuse("that isn't a Solana wallet address");
  return withRetry(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7110, hashtext(${input.userId}))`;
    const recent = await tx.walletChallenge.count({ where: { userId: input.userId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } });
    if (recent >= CHALLENGES_PER_HOUR) refuse("too many wallet sign-in requests; try again in an hour");
    const nonce = randomBytes(16).toString("hex");
    const message = walletChallengeMessage({ address, userId: input.userId, nonce, issuedAt: now });
    const expiresAt = new Date(now.getTime() + config.nft.challengeTtlMs);
    await tx.walletChallenge.create({ data: { userId: input.userId, chain: "SOLANA", address, nonce, message, createdAt: now, expiresAt } });
    return { nonce, message, expiresAt };
  });
}

/**
 * Step 2: the wallet's signature of that message. Links the wallet to this
 * account (moving it from another account if it was linked there: whoever
 * can sign for the wallet controls it).
 */
export async function verifyWallet(db: Db, config: Config, input: { userId: string; nonce: string; signature: Uint8Array }, now = new Date()) {
  return withRetry(db, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "wallet_challenge" WHERE "nonce" = ${input.nonce} FOR UPDATE`;
    const challenge = rows[0] ? await tx.walletChallenge.findUniqueOrThrow({ where: { id: rows[0].id } }) : null;
    if (!challenge || challenge.userId !== input.userId || challenge.usedAt || challenge.expiresAt <= now) {
      refuse("this wallet sign-in request is used or expired; start again");
    }
    const c = challenge!;
    if (!verifySolanaSignature(c.address, c.message, input.signature)) refuse("the signature doesn't match that wallet");
    await tx.walletChallenge.update({ where: { id: c.id }, data: { usedAt: now } });
    const existing = await tx.wallet.findUnique({ where: { chain_address: { chain: c.chain, address: c.address } } });
    if (existing?.userId !== input.userId) {
      const mine = await tx.wallet.count({ where: { userId: input.userId } });
      if (mine >= config.nft.maxWalletsPerUser) refuse(`an account can link ${config.nft.maxWalletsPerUser} wallets; unlink one first`);
    }
    return existing
      ? tx.wallet.update({ where: { id: existing.id }, data: { userId: input.userId, verifiedAt: now } })
      : tx.wallet.create({ data: { userId: input.userId, chain: c.chain, address: c.address, verifiedAt: now, createdAt: now } });
  });
}

export async function unlinkWallet(db: Db, input: { userId: string; walletId: string }): Promise<void> {
  const { count } = await db.wallet.deleteMany({ where: { id: input.walletId, userId: input.userId } });
  if (count === 0) throw new NotFoundError("no such wallet");
}

export async function listWallets(db: Db | Tx, userId: string) {
  const wallets = await db.wallet.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  return wallets.map((w) => ({ id: w.id, chain: w.chain, address: w.address, verifiedAt: w.verifiedAt }));
}

type CollectionRow = Awaited<ReturnType<Tx["nftCollection"]["findUniqueOrThrow"]>>;

function collectionView(c: CollectionRow) {
  return {
    id: c.id,
    chain: c.chain,
    address: c.address,
    name: c.name,
    licenceUrl: c.licenceUrl,
    licenceNote: c.licenceNote,
    submissionsAllowed: c.submissionsAllowed,
    looksAllowed: c.looksAllowed,
    fighterId: c.fighterId,
    enabled: c.enabled,
  };
}

/**
 * The NFTs in a player's linked wallets that belong to approved collections,
 * with what each can be used for. `configured` is false when there's no DAS
 * endpoint (GI_SOLANA_RPC_URL).
 */
export async function myNfts(db: Db, source: NftSource | null, userId: string) {
  const wallets = await listWallets(db, userId);
  if (!source) return { configured: false, wallets, nfts: [], otherNfts: 0 };
  const collections = new Map((await db.nftCollection.findMany({ where: { enabled: true, chain: "SOLANA" } })).map((c) => [c.address, c]));
  const held: NftSummary[] = [];
  for (const w of wallets) held.push(...(await source.assetsByOwner(w.address)));
  const usable = held.filter((n) => n.collection && collections.has(n.collection));
  const openFrom = new Set(
    (await db.submission.findMany({ where: { nftAssetId: { in: usable.map((n) => n.assetId) }, status: { notIn: ["WITHDRAWN", "REJECTED", "NOT_ELECTED"] } }, select: { nftAssetId: true } })).map(
      (s) => s.nftAssetId,
    ),
  );
  return {
    configured: true,
    wallets,
    nfts: usable.map((n) => {
      const c = collections.get(n.collection!)!;
      return { ...n, collection: { id: c.id, name: c.name, address: c.address, submissionsAllowed: c.submissionsAllowed, looksAllowed: c.looksAllowed }, submitted: openFrom.has(n.assetId) };
    }),
    /** NFTs from collections that aren't approved (not listed). */
    otherNfts: held.length - usable.length,
  };
}

/** Why this NFT can't be used by this player, or the NFT and its approved collection. */
async function heldApproved(db: Db, source: NftSource | null, userId: string, assetId: string, use: "submissions" | "looks") {
  if (!source) refuse("NFT features aren't set up on this server yet");
  const nft = await source!.asset(assetId);
  if (!nft) throw new NotFoundError("no such NFT");
  const wallet = await db.wallet.findUnique({ where: { chain_address: { chain: "SOLANA", address: nft.owner } } });
  if (!wallet || wallet.userId !== userId) refuse("that NFT isn't in a wallet you've linked");
  const collection = nft.collection ? await db.nftCollection.findUnique({ where: { chain_address: { chain: "SOLANA", address: nft.collection } } }) : null;
  if (!collection?.enabled) refuse("that NFT's collection isn't approved yet");
  if (use === "submissions" && !collection!.submissionsAllowed) refuse(`${collection!.name} NFTs can't be submitted as fighters`);
  if (use === "looks" && !collection!.looksAllowed) refuse(`${collection!.name} NFTs can't be used as looks`);
  return { nft, collection: collection! };
}

/**
 * Start a fighter submission from an NFT the player holds: the collection as
 * the community, a name from the NFT's, its image as the portrait (when it's
 * a PNG), and the collection's licence as the rights basis. The player
 * finishes it (sprites, intro, win pose) and sends it for review as usual.
 */
export async function submitFromNft(
  db: Db,
  config: Config,
  deps: { source: NftSource | null; store: SubmissionStore; images: ImageFetcher },
  input: { userId: string; assetId: string; archetype?: Archetype },
  now = new Date(),
) {
  const { nft, collection } = await heldApproved(db, deps.source, input.userId, input.assetId, "submissions");
  const details = (fighterName: string) => ({
    community: collection.name,
    fighterName,
    archetype: input.archetype ?? ("ALL_ROUNDER" as const),
    description: "",
    rightsBasis: "HOLDER_LICENCE" as const,
    rightsDetails: `Started from ${nft.name} (${nft.assetId}), held in wallet ${nft.owner}, from the ${collection.name} collection.`,
    rightsLink: collection.licenceUrl,
  });
  const nftRef = { assetId: nft.assetId, collectionId: collection.id };
  const suggested = fighterNameFromNft(nft.name);
  let sub;
  try {
    sub = await createSubmission(db, config, { userId: input.userId, details: details(suggested ?? `Fighter ${randomInt(1000, 10_000)}`), nft: nftRef }, now);
  } catch (err) {
    // The NFT's name is taken or unusable: start with a placeholder the player renames.
    if (!(err instanceof LedgerRuleError) || !/fighter name/.test(err.message)) throw err;
    sub = await createSubmission(db, config, { userId: input.userId, details: details(`Fighter ${randomInt(1000, 10_000)}`), nft: nftRef }, now);
  }
  let portrait: "added" | "not a png" | "no image" | "couldn't download" = "no image";
  if (nft.image) {
    try {
      const bytes = await deps.images(nft.image);
      if (pngInfo(bytes, config.submissions).ok) {
        await addSubmissionFile(db, config, deps.store, { userId: input.userId, submissionId: sub.id, role: "PORTRAIT", label: "NFT image", bytes }, now);
        portrait = "added";
      } else portrait = "not a png";
    } catch {
      portrait = "couldn't download";
    }
  }
  return { submission: sub, portrait };
}

// ---------------------------------------------------------------------------
// Staff: approved collections

export interface CollectionInput {
  address: string;
  name: string;
  licenceUrl: string | null;
  licenceNote: string;
  submissionsAllowed: boolean;
  looksAllowed: boolean;
  fighterId: string | null;
  enabled: boolean;
}

/** Add or change an approved collection (admins). Logged in the staff log. */
export async function setCollection(db: Db, input: { actorId: string; collection: CollectionInput }, now = new Date()) {
  const c = { ...input.collection, address: input.collection.address.trim(), name: input.collection.name.trim(), licenceUrl: input.collection.licenceUrl?.trim() || null };
  if (!isSolanaAddress(c.address)) refuse("that isn't a Solana collection address");
  if (c.name.length < 1 || c.name.length > 60) refuse("a collection name is 1-60 characters");
  if (c.licenceUrl !== null && !/^https:\/\/\S+$/.test(c.licenceUrl)) refuse("the licence link must be an https:// address");
  if (c.submissionsAllowed && c.licenceUrl === null) refuse("add the licence link before allowing submissions");
  if (c.licenceNote.length > 1000) refuse("the licence note is at most 1000 characters");
  return withRetry(db, async (tx) => {
    const actor = await requireStaff(tx, input.actorId, "manage_collections");
    if (c.fighterId && !(await tx.fighter.findUnique({ where: { id: c.fighterId }, select: { id: true } }))) refuse("no fighter with that id");
    const before = await tx.nftCollection.findUnique({ where: { chain_address: { chain: "SOLANA", address: c.address } } });
    const saved = await tx.nftCollection.upsert({
      where: { chain_address: { chain: "SOLANA", address: c.address } },
      create: { chain: "SOLANA", ...c, createdAt: now, updatedAt: now },
      update: { ...c },
    });
    await tx.staffAction.create({
      data: { actorUserId: actor.id, actorRole: actor.role, kind: "COLLECTION_SET", detail: { collection: collectionView(saved), before: before ? collectionView(before) : null }, createdAt: now },
    });
    return collectionView(saved);
  });
}

export async function listCollections(db: Db, opts: { includeDisabled: boolean }) {
  const rows = await db.nftCollection.findMany({ where: opts.includeDisabled ? {} : { enabled: true }, orderBy: { name: "asc" } });
  return rows.map(collectionView);
}
