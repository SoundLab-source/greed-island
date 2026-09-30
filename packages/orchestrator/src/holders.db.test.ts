import { createUser } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { encodeBase58, loadConfig, type Config, type NftSummary } from "@greed-island/shared";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { staffLog } from "./api/staff-views.ts";
import { createWalletChallenge, listCollections, myNfts, setCollection, submitFromNft, unlinkWallet, verifySolanaSignature, verifyWallet, type CollectionInput } from "./holders.ts";
import { MemoryNftSource } from "./nft-source.ts";
import { ForbiddenError, setRole } from "./staff.ts";
import { SubmissionStore } from "./submission-store.ts";
import { png } from "./testing/png.ts";

const db = useTestDb();
const base = loadConfig({});
const config: Config = { ...base, economy: testEconomy, submissions: { ...base.submissions, open: true } };
const dir = await mkdtemp(path.join(tmpdir(), "gi-holders-"));
const store = new SubmissionStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));

/** A Solana-style wallet: an Ed25519 key pair and its base58 address. */
function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { address: encodeBase58(raw), key: privateKey };
}
const signWith = (key: KeyObject, message: string) => sign(null, Buffer.from(message, "utf8"), key);

async function link(userId: string, w: { address: string; key: KeyObject }, now?: Date) {
  const c = await createWalletChallenge(db, config, { userId, address: w.address }, now);
  return verifyWallet(db, config, { userId, nonce: c.nonce, signature: signWith(w.key, c.message) }, now);
}

let admin: string;
let mod: string;
let sam: string;
let pat: string;
const COLLECTION = encodeBase58(new Uint8Array(32).fill(9));
const OTHER_COLLECTION = encodeBase58(new Uint8Array(32).fill(8));
const collection = (over: Partial<CollectionInput> = {}): CollectionInput => ({
  address: COLLECTION,
  name: "Pixel Monks",
  licenceUrl: "https://pixelmonks.example/licence",
  licenceNote: "CC0",
  submissionsAllowed: true,
  looksAllowed: false,
  fighterId: null,
  enabled: true,
  ...over,
});

async function verified(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

beforeEach(async () => {
  [admin, mod, sam, pat] = [await verified("admin@example.com"), await verified("mod@example.com"), await verified("sam@example.com"), await verified("pat@example.com")];
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
  await setRole(db, { actorId: admin, target: { userId: mod }, role: "MODERATOR" });
});

describe("signatures", () => {
  it("accepts only the wallet's own signature of the exact message", () => {
    const w = wallet();
    const other = wallet();
    const sig = signWith(w.key, "hello");
    expect(verifySolanaSignature(w.address, "hello", sig)).toBe(true);
    expect(verifySolanaSignature(w.address, "hello!", sig)).toBe(false);
    expect(verifySolanaSignature(other.address, "hello", sig)).toBe(false);
    expect(verifySolanaSignature(w.address, "hello", sig.subarray(0, 63))).toBe(false);
    expect(verifySolanaSignature("not-an-address", "hello", sig)).toBe(false);
  });
});

describe("linking wallets", () => {
  it("links a wallet with a one-time signed message", async () => {
    const w = wallet();
    const c = await createWalletChallenge(db, config, { userId: sam, address: w.address });
    expect(c.message).toContain(`Wallet: ${w.address}`);
    await expect(verifyWallet(db, config, { userId: sam, nonce: c.nonce, signature: signWith(wallet().key, c.message) })).rejects.toThrow(/doesn't match/);
    await expect(verifyWallet(db, config, { userId: pat, nonce: c.nonce, signature: signWith(w.key, c.message) })).rejects.toThrow(/used or expired/);
    const linked = await verifyWallet(db, config, { userId: sam, nonce: c.nonce, signature: signWith(w.key, c.message) });
    expect(linked).toMatchObject({ userId: sam, chain: "SOLANA", address: w.address });
    // A message works once.
    await expect(verifyWallet(db, config, { userId: sam, nonce: c.nonce, signature: signWith(w.key, c.message) })).rejects.toThrow(/used or expired/);
    await expect(createWalletChallenge(db, config, { userId: sam, address: "0xdeadbeef" })).rejects.toThrow(/isn't a Solana wallet/);
  });

  it("expires messages, moves a wallet to whoever signs, caps wallets per account and rate-limits requests", async () => {
    const w = wallet();
    const t0 = new Date("2026-10-01T00:00:00Z");
    const old = await createWalletChallenge(db, config, { userId: sam, address: w.address }, t0);
    await expect(verifyWallet(db, config, { userId: sam, nonce: old.nonce, signature: signWith(w.key, old.message) }, new Date(t0.getTime() + 11 * 60_000))).rejects.toThrow(/expired/);
    await link(sam, w);
    await link(pat, w);
    expect(await db.wallet.findMany({ select: { userId: true } })).toEqual([{ userId: pat }]);
    for (let i = 0; i < 2; i++) await link(pat, wallet());
    await expect(link(pat, wallet())).rejects.toThrow(/can link 3 wallets/);
    const [first] = await db.wallet.findMany({ where: { userId: pat }, orderBy: { createdAt: "asc" } });
    await expect(unlinkWallet(db, { userId: sam, walletId: first!.id })).rejects.toThrow(/no such wallet/);
    await unlinkWallet(db, { userId: pat, walletId: first!.id });
    await link(pat, wallet());
    // pat has asked for 5 messages this hour; 5 more are allowed.
    for (let i = 0; i < 5; i++) await createWalletChallenge(db, config, { userId: pat, address: w.address });
    await expect(createWalletChallenge(db, config, { userId: pat, address: w.address })).rejects.toThrow(/too many/);
  });
});

describe("collections", () => {
  it("are approved by admins only, with a licence link for submissions, and logged", async () => {
    await expect(setCollection(db, { actorId: mod, collection: collection() })).rejects.toThrow(ForbiddenError);
    await expect(setCollection(db, { actorId: admin, collection: collection({ licenceUrl: null }) })).rejects.toThrow(/licence link before allowing submissions/);
    await expect(setCollection(db, { actorId: admin, collection: collection({ address: "nope" }) })).rejects.toThrow(/Solana collection address/);
    await expect(setCollection(db, { actorId: admin, collection: collection({ fighterId: "ghost" }) })).rejects.toThrow(/no fighter/);
    const saved = await setCollection(db, { actorId: admin, collection: collection() });
    expect(saved).toMatchObject({ name: "Pixel Monks", submissionsAllowed: true, enabled: true });
    await setCollection(db, { actorId: admin, collection: collection({ name: "Pixel Monks!", enabled: false }) });
    expect(await listCollections(db, { includeDisabled: false })).toEqual([]);
    expect(await listCollections(db, { includeDisabled: true })).toMatchObject([{ name: "Pixel Monks!", enabled: false }]);
    const [entry] = await staffLog(db);
    expect(entry).toMatchObject({ kind: "COLLECTION_SET", by: { id: admin }, detail: { collection: { name: "Pixel Monks!" }, before: { name: "Pixel Monks" } } });
    await expect(db.nftCollection.update({ where: { id: saved.id }, data: { licenceUrl: "http://insecure.example" } })).rejects.toThrow(/nft_collection_licence/);
  });
});

describe("NFTs", () => {
  const nft = (over: Partial<NftSummary> & { owner: string }): NftSummary => ({
    assetId: encodeBase58(new Uint8Array(32).fill(1)),
    name: "Pixel Monk #42",
    image: "https://img.example/42.png",
    collection: COLLECTION,
    attributes: [{ trait: "Hat", value: "Straw" }],
    ...over,
  });

  it("lists a holder's NFTs from approved collections, and starts a submission from one", async () => {
    const w = wallet();
    await link(sam, w);
    await setCollection(db, { actorId: admin, collection: collection() });
    const monk = nft({ owner: w.address });
    const stranger = nft({ owner: w.address, assetId: encodeBase58(new Uint8Array(32).fill(2)), collection: OTHER_COLLECTION, name: "Other" });
    const source = new MemoryNftSource([monk, stranger]);
    expect(await myNfts(db, null, sam)).toMatchObject({ configured: false, nfts: [] });
    const listed = await myNfts(db, source, sam);
    expect(listed).toMatchObject({ configured: true, otherNfts: 1, nfts: [{ assetId: monk.assetId, name: "Pixel Monk #42", collection: { name: "Pixel Monks", submissionsAllowed: true }, submitted: false }] });

    const fetched: string[] = [];
    const images = async (url: string) => {
      fetched.push(url);
      return png(64, 64, 3);
    };
    const r = await submitFromNft(db, config, { source, store, images }, { userId: sam, assetId: monk.assetId, archetype: "GRAPPLER" });
    expect(fetched).toEqual(["https://img.example/42.png"]);
    expect(r.portrait).toBe("added");
    expect(r.submission).toMatchObject({
      status: "DRAFT",
      community: "Pixel Monks",
      fighterName: "Pixel Monk 42",
      archetype: "GRAPPLER",
      rightsBasis: "HOLDER_LICENCE",
      rightsLink: "https://pixelmonks.example/licence",
      nftAssetId: monk.assetId,
    });
    expect(r.submission.rightsDetails).toContain(w.address);
    expect(await db.submissionFile.count({ where: { submissionId: r.submission.id, role: "PORTRAIT" } })).toBe(1);
    expect((await myNfts(db, source, sam)).nfts[0]!.submitted).toBe(true);
    // Where it came from is fixed.
    await expect(db.submission.update({ where: { id: r.submission.id }, data: { nftAssetId: stranger.assetId } })).rejects.toThrow(/NFT it came from, are fixed/);
  });

  it("refuses NFTs that aren't the player's or aren't approved, and copes with odd names and images", async () => {
    const w = wallet();
    const theirs = wallet();
    await link(sam, w);
    await setCollection(db, { actorId: admin, collection: collection() });
    const notMine = nft({ owner: theirs.address });
    const other = nft({ owner: w.address, assetId: encodeBase58(new Uint8Array(32).fill(3)), collection: OTHER_COLLECTION });
    const oddName = nft({ owner: w.address, assetId: encodeBase58(new Uint8Array(32).fill(4)), name: "#1", image: "https://img.example/1.jpg" });
    const source = new MemoryNftSource([notMine, other, oddName]);
    const deps = { source, store, images: async () => Buffer.from("\xff\xd8\xff not a png") };
    await expect(submitFromNft(db, config, deps, { userId: sam, assetId: notMine.assetId })).rejects.toThrow(/isn't in a wallet you've linked/);
    await expect(submitFromNft(db, config, deps, { userId: sam, assetId: other.assetId })).rejects.toThrow(/isn't approved/);
    await expect(submitFromNft(db, config, deps, { userId: sam, assetId: "missing" })).rejects.toThrow(/no such NFT/);
    await expect(submitFromNft(db, config, { ...deps, source: null }, { userId: sam, assetId: oddName.assetId })).rejects.toThrow(/aren't set up/);
    const r = await submitFromNft(db, config, deps, { userId: sam, assetId: oddName.assetId });
    expect(r.portrait).toBe("not a png");
    expect(r.submission.fighterName).toMatch(/^Fighter \d{4}$/);
    // Submissions are staff-only while closed, from an NFT too.
    await link(pat, theirs);
    await expect(submitFromNft(db, { ...config, submissions: { ...config.submissions, open: false } }, deps, { userId: pat, assetId: notMine.assetId })).rejects.toThrow(ForbiddenError);
    // Collections that don't take submissions.
    await setCollection(db, { actorId: admin, collection: collection({ submissionsAllowed: false }) });
    await expect(submitFromNft(db, config, deps, { userId: pat, assetId: notMine.assetId })).rejects.toThrow(/can't be submitted/);
  });
});
