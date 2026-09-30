import { describe, expect, it } from "vitest";
import { fetchImage, isPublicAddress } from "./image-fetch.ts";
import { DasNftSource, NftSourceError } from "./nft-source.ts";

describe("isPublicAddress", () => {
  it("allows public addresses and refuses private, local and reserved ones", () => {
    for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) expect(isPublicAddress(ip)).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "64:ff9b::127.0.0.1", "::ffff:7f00:1", "::ffff:8.8.8.8", "not-an-ip"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});

describe("fetchImage", () => {
  const opts = { maxBytes: 1024, timeoutMs: 2000 };
  it("refuses anything but plain https to a public host", async () => {
    await expect(fetchImage("http://example.com/a.png", opts)).rejects.toThrow(/only https/);
    await expect(fetchImage("https://example.com:8443/a.png", opts)).rejects.toThrow(/standard https port/);
    await expect(fetchImage("https://user:pw@example.com/a.png", opts)).rejects.toThrow(/passwords/);
    await expect(fetchImage("https://127.0.0.1/a.png", opts)).rejects.toThrow(/public address/);
    await expect(fetchImage("https://[::1]/a.png", opts)).rejects.toThrow(/public address/);
    await expect(fetchImage("https://169.254.169.254/latest/meta-data", opts)).rejects.toThrow(/public address/);
    // A name that resolves to a private address is refused when connecting.
    await expect(fetchImage("https://localhost/a.png", opts)).rejects.toThrow(/isn't a public address/);
    await expect(fetchImage("javascript:alert(1)", opts)).rejects.toThrow(/only https/);
  });
});

describe("DasNftSource", () => {
  const asset = (i: number, owner = "Owner1") => ({ id: `Asset${i}`, content: { metadata: { name: `N${i}` } }, ownership: { owner }, burnt: false });

  it("pages through getAssetsByOwner and reads getAsset", async () => {
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { method: string; params: Record<string, unknown> };
      calls.push(body);
      if (body.method === "getAsset") return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: asset(7) }));
      const page = body.params["page"] as number;
      const items = page === 1 ? [asset(1), asset(2), { ...asset(3), burnt: true }] : [asset(4), asset(5, "SomeoneElse")];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { total: items.length, limit: 3, page, items } }));
    }) as typeof fetch;
    const das = new DasNftSource("https://rpc.example/?api-key=x", { pageLimit: 3, fetch: fake });
    expect((await das.assetsByOwner("Owner1")).map((n) => n.assetId)).toEqual(["Asset1", "Asset2", "Asset4"]);
    expect(calls.map((c) => [c.method, c.params])).toEqual([
      ["getAssetsByOwner", { ownerAddress: "Owner1", page: 1, limit: 3 }],
      ["getAssetsByOwner", { ownerAddress: "Owner1", page: 2, limit: 3 }],
    ]);
    expect(await das.asset("Asset7")).toMatchObject({ assetId: "Asset7", name: "N7" });
  });

  it("reports service problems as NftSourceError", async () => {
    const answer = (res: Response | Error) => new DasNftSource("https://rpc.example", { fetch: (async () => (res instanceof Error ? Promise.reject(res) : res)) as typeof fetch });
    await expect(answer(new Response("nope", { status: 429 })).asset("A")).rejects.toThrow(NftSourceError);
    await expect(answer(new Response("not json")).asset("A")).rejects.toThrow(/isn't JSON/);
    await expect(answer(new Response(JSON.stringify({ error: { message: "bad params" } }))).asset("A")).rejects.toThrow(/refused: bad params/);
    await expect(answer(new TypeError("fetch failed")).asset("A")).rejects.toThrow(/didn't answer/);
  });
});
