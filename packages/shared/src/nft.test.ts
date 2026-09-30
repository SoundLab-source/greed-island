import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";
import { decodeBase58, DEFAULT_NFT, encodeBase58, fighterNameFromNft, httpsImageUrl, isSolanaAddress, parseDasAsset, walletChallengeMessage } from "./nft.ts";

describe("base58", () => {
  it("round-trips any bytes, leading zeros included (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
        expect(decodeBase58(encodeBase58(bytes))).toEqual(bytes);
      }),
    );
  });

  it("knows a Solana address from anything else", () => {
    expect(isSolanaAddress("11111111111111111111111111111111")).toBe(true); // the system program: 32 zero bytes
    expect(isSolanaAddress(encodeBase58(new Uint8Array(32).fill(7)))).toBe(true);
    expect(isSolanaAddress(encodeBase58(new Uint8Array(31).fill(7)))).toBe(false);
    expect(isSolanaAddress("0xabc")).toBe(false);
    expect(isSolanaAddress("")).toBe(false);
    expect(() => decodeBase58("I0lO")).toThrow(/not base58/);
  });
});

describe("walletChallengeMessage", () => {
  it("names the wallet, the account and a one-time nonce, and says it's free", () => {
    const m = walletChallengeMessage({ address: "Wa11et", userId: "0123456789abcdef", nonce: "n0nce", issuedAt: new Date("2026-10-01T00:00:00Z") });
    expect(m).toContain("Wallet: Wa11et");
    expect(m).toContain("Account: 01234567");
    expect(m).toContain("Nonce: n0nce");
    expect(m).toContain("Issued: 2026-10-01T00:00:00.000Z");
    expect(m).toMatch(/free and doesn't send a transaction/);
  });
});

describe("parseDasAsset", () => {
  const asset = {
    interface: "V1_NFT",
    id: "Asset1111",
    content: {
      json_uri: "https://example.com/1.json",
      files: [{ uri: "https://example.com/1.png", cdn_uri: "https://cdn.example.com/1.png", mime: "image/png" }],
      metadata: { name: "Pixel Monk #42", symbol: "PM", attributes: [{ trait_type: "Hat", value: "Straw" }, { trait_type: "Eyes", value: "Sleepy" }, { value: "no trait" }] },
      links: { image: "ipfs://bafyImage/42.png", external_url: "https://pixelmonks.example" },
    },
    grouping: [{ group_key: "collection", group_value: "Coll1111", verified: true }],
    ownership: { owner: "Owner1111", frozen: false, delegated: false, delegate: null, ownership_model: "single" },
    burnt: false,
  };

  it("reads the name, image, collection, traits and owner", () => {
    expect(parseDasAsset(asset)).toEqual({
      assetId: "Asset1111",
      name: "Pixel Monk #42",
      image: "https://ipfs.io/ipfs/bafyImage/42.png",
      collection: "Coll1111",
      attributes: [{ trait: "Hat", value: "Straw" }, { trait: "Eyes", value: "Sleepy" }],
      owner: "Owner1111",
    });
  });

  it("falls back to the file list, ignores unverified collections, and drops burnt or broken assets", () => {
    const noLink = { ...asset, content: { ...asset.content, links: {} }, grouping: [{ group_key: "collection", group_value: "Fake", verified: false }] };
    expect(parseDasAsset(noLink)).toMatchObject({ image: "https://cdn.example.com/1.png", collection: null });
    expect(parseDasAsset({ ...asset, burnt: true })).toBeNull();
    expect(parseDasAsset({ ...asset, ownership: {} })).toBeNull();
    expect(parseDasAsset(null)).toBeNull();
    expect(parseDasAsset("junk")).toBeNull();
    expect(parseDasAsset({ id: "X", ownership: { owner: "O" } })).toEqual({ assetId: "X", name: "X", image: null, collection: null, attributes: [], owner: "O" });
  });

  it("never throws on odd input (property)", () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        expect(() => parseDasAsset(raw)).not.toThrow();
      }),
    );
  });
});

describe("helpers", () => {
  it("keeps only https images (IPFS and Arweave through gateways)", () => {
    expect(httpsImageUrl("https://a.example/x.png")).toBe("https://a.example/x.png");
    expect(httpsImageUrl("ar://abc")).toBe("https://arweave.net/abc");
    expect(httpsImageUrl("ipfs://ipfs/Qm1")).toBe("https://ipfs.io/ipfs/Qm1");
    expect(httpsImageUrl("http://a.example/x.png")).toBeNull();
    expect(httpsImageUrl("https://user:pw@a.example/x.png")).toBeNull();
    expect(httpsImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(httpsImageUrl(42)).toBeNull();
  });

  it("suggests a fighter name from the NFT's name", () => {
    expect(fighterNameFromNft("Pixel Monk #42")).toBe("Pixel Monk 42");
    expect(fighterNameFromNft("Überlong Name Of A Very Fancy Ape")).toBe("berlong Name Of A Ve");
    expect(fighterNameFromNft("#1")).toBeNull();
    expect(fighterNameFromNft("🐵🐵")).toBeNull();
  });

  it("reads the wallet limit", () => {
    expect(loadConfig({}).nft).toEqual(DEFAULT_NFT);
    expect(loadConfig({ GI_MAX_WALLETS: "5" }).nft.maxWalletsPerUser).toBe(5);
  });
});
