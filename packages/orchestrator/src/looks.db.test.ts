import { characterCosmetics, createUser } from "@greed-island/db";
import { economy as testEconomy, useTestDb } from "@greed-island/db/test";
import { encodeBase58, loadConfig, type Config, type NftSummary } from "@greed-island/shared";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { characterCard } from "./api/views.ts";
import { applyLook, createWalletChallenge, readLookImage, removeLook, setCollection, verifyWallet } from "./holders.ts";
import { decodePng, LookStore, sniffImage } from "./look-images.ts";
import { MemoryNftSource } from "./nft-source.ts";
import { setRole } from "./staff.ts";
import { png } from "./testing/png.ts";

const db = useTestDb();
const config: Config = { ...loadConfig({}), economy: testEconomy };
const dir = await mkdtemp(path.join(tmpdir(), "gi-looks-"));
const looks = new LookStore(dir);
afterAll(() => rm(dir, { recursive: true, force: true }));

const COLLECTION = encodeBase58(new Uint8Array(32).fill(9));
const asset = (n: number) => encodeBase58(new Uint8Array(32).fill(n));
let admin: string;
let sam: string;
let pat: string;
let samWallet: string;
let patWallet: string;
const ch: Record<string, string> = {};
let source: MemoryNftSource;
const images = async (url: string) => (url.endsWith(".jpg") ? Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) : url.endsWith(".txt") ? Buffer.from("hello") : png(8, 8, 200));

async function user(email: string) {
  const u = (await createUser(db, { kind: "EMAIL", email }, testEconomy)).user;
  await db.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
  return u.id;
}

async function linkNewWallet(userId: string) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const address = encodeBase58(Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url"));
  const c = await createWalletChallenge(db, config, { userId, address });
  await verifyWallet(db, config, { userId, nonce: c.nonce, signature: sign(null, Buffer.from(c.message, "utf8"), privateKey) });
  return address;
}

const nft = (n: number, owner: string, over: Partial<NftSummary> = {}): NftSummary => ({
  assetId: asset(n),
  name: `Pixel Monk #${n}`,
  image: `https://img.example/${n}.png`,
  collection: COLLECTION,
  attributes: [{ trait: "Hat", value: "Straw" }],
  owner,
  ...over,
});

async function owned(key: string, fighterId: string, userId: string, serial: number) {
  ch[key] = (await db.character.create({
    data: { fighterId, name: `${fighterId} #${serial}`, rating: 1400, deviation: 100, volatility: 0.06, tier: "P", ownerKind: "USER", ownerUserId: userId, serial, acquiredAt: new Date() },
  })).id;
}

beforeEach(async () => {
  for (const id of ["monk", "crane"]) await db.fighter.create({ data: { id, displayName: id, archetype: "ALL_ROUNDER", defPath: `chars/${id}/${id}.def`, licenseNote: "test" } });
  [admin, sam, pat] = [await user("admin@example.com"), await user("sam@example.com"), await user("pat@example.com")];
  await setRole(db, { actorId: null, target: { userId: admin }, role: "ADMIN" });
  await owned("m1", "monk", sam, 1);
  await owned("m2", "monk", sam, 2);
  await owned("m3", "monk", pat, 3);
  await owned("c1", "crane", sam, 1);
  samWallet = await linkNewWallet(sam);
  patWallet = await linkNewWallet(pat);
  source = new MemoryNftSource([nft(1, samWallet), nft(2, samWallet, { image: "https://img.example/2.jpg" }), nft(3, samWallet, { image: "https://img.example/3.txt" }), nft(4, patWallet)]);
  await setCollection(db, {
    actorId: admin,
    collection: { address: COLLECTION, name: "Pixel Monks", licenceUrl: null, licenceNote: "", submissionsAllowed: false, looksAllowed: true, fighterId: "monk", enabled: true },
  });
});

const apply = (userId: string, character: string, n: number) => applyLook(db, { source, images, looks }, { userId, characterId: ch[character]!, assetId: asset(n) });

describe("NFT looks", () => {
  it("dresses an owned copy of the community's fighter in a held NFT, with colours from its image", async () => {
    const r = await apply(sam, "m1", 1);
    expect(r).toMatchObject({ replayed: false, look: { name: "Pixel Monk #1", imageType: "png", walletAddress: samWallet, traits: [{ trait: "Hat", value: "Straw" }] } });
    expect(r.look.colors).toMatchObject({ background: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    expect(await readdir(dir)).toContain(`${r.look.imageSha256}.png`);
    expect((await readLookImage(db, looks, r.look.id)).bytes).toEqual(png(8, 8, 200));
    // It's part of the character's cosmetics (so fights freeze it) and changes the name plate.
    const c = await db.character.findUniqueOrThrow({ where: { id: ch.m1 } });
    expect((await characterCosmetics(db, c)).equipped.look).toMatchObject({ id: r.look.id, name: "Pixel Monk #1" });
    expect((await characterCard(db, ch.m1!)).cosmetics).toMatchObject({ nameplate: { label: "NFT look" }, look: { id: r.look.id, image: `/api/looks/${r.look.id}/image` } });
    expect(await apply(sam, "m1", 1)).toMatchObject({ replayed: true, look: { id: r.look.id } });
  });

  it("puts each NFT's look on one character, and a character wears one look", async () => {
    await apply(sam, "m1", 1);
    await expect(apply(sam, "m2", 1)).rejects.toThrow(/already on another character/);
    // Replacing m1's look frees NFT #1.
    const jpeg = await apply(sam, "m1", 2);
    expect(jpeg.look).toMatchObject({ imageType: "jpeg", colors: null });
    await expect(apply(sam, "m2", 1)).resolves.toMatchObject({ replayed: false });
    await removeLook(db, { userId: sam, characterId: ch.m1! });
    await expect(removeLook(db, { userId: sam, characterId: ch.m1! })).rejects.toThrow(/no NFT look/);
    expect((await characterCosmetics(db, await db.character.findUniqueOrThrow({ where: { id: ch.m1 } }))).equipped.look).toBeUndefined();
    expect(await db.nftLook.count()).toBe(3); // kept as the character's history
  });

  it("refuses other people's NFTs and characters, other fighters, and unusable images", async () => {
    await expect(apply(pat, "m3", 1)).rejects.toThrow(/isn't in a wallet you've linked/);
    await expect(apply(sam, "m3", 1)).rejects.toThrow(/character you own/);
    await expect(apply(sam, "c1", 1)).rejects.toThrow(/only for that community's fighter/);
    await expect(apply(sam, "m1", 3)).rejects.toThrow(/isn't a PNG, JPEG, GIF or WebP/);
    await expect(removeLook(db, { userId: pat, characterId: ch.m1! })).rejects.toThrow(/character you own/);
    const noFighter = { address: COLLECTION, name: "Pixel Monks", licenceUrl: null, licenceNote: "", submissionsAllowed: false, looksAllowed: true, fighterId: null, enabled: true };
    await setCollection(db, { actorId: admin, collection: noFighter });
    await expect(apply(sam, "m1", 1)).rejects.toThrow(/doesn't have a community fighter/);
    await setCollection(db, { actorId: admin, collection: { ...noFighter, looksAllowed: false } });
    await expect(apply(sam, "m1", 1)).rejects.toThrow(/can't be used as looks/);
  });

  it("stays with the character after the NFT is sold, and the buyer can't reuse it", async () => {
    const r = await apply(sam, "m1", 1);
    source.set([nft(1, patWallet), nft(4, patWallet)]); // sam sold NFT #1 to pat
    const c = await db.character.findUniqueOrThrow({ where: { id: ch.m1 } });
    expect((await characterCosmetics(db, c)).equipped.look).toMatchObject({ id: r.look.id });
    await expect(apply(pat, "m3", 1)).rejects.toThrow(/already on another character/);
    await expect(apply(pat, "m3", 4)).resolves.toMatchObject({ replayed: false });
  });

  it("keeps looks in the database as history", async () => {
    const { look } = await apply(sam, "m1", 1);
    await expect(db.nftLook.delete({ where: { id: look.id } })).rejects.toThrow(/kept with the character/);
    await expect(db.nftLook.update({ where: { id: look.id }, data: { name: "Renamed" } })).rejects.toThrow(/only ever taken off/);
    await expect(
      db.nftLook.create({
        data: { characterId: ch.m1!, chain: "SOLANA", assetId: asset(9), collectionId: look.collectionId, name: "x", imageSha256: look.imageSha256, imageType: "png", traits: [], appliedByUserId: sam, walletAddress: samWallet },
      }),
    ).rejects.toThrow(/nft_look_one_per_character|Unique constraint/);
  });
});

describe("look images", () => {
  it("knows image types from their bytes and decodes PNG pixels", () => {
    expect(sniffImage(png(2, 2))).toBe("png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe("jpeg");
    expect(sniffImage(Buffer.from("GIF89a...."))).toBe("gif");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffImage(Buffer.from("<svg>"))).toBeNull();
    const d = decodePng(png(3, 2, 77))!;
    expect(d).toMatchObject({ width: 3, height: 2 });
    expect([...d.rgba.slice(0, 8)]).toEqual([77, 77, 77, 255, 77, 77, 77, 255]);
    expect(decodePng(png(3, 2), 5)).toBeNull(); // too many pixels
    expect(decodePng(Buffer.from("junk"))).toBeNull();
    const broken = png(3, 2);
    broken[broken.length - 20] = broken[broken.length - 20]! ^ 0xff;
    expect(() => decodePng(broken)).not.toThrow();
  });
});
