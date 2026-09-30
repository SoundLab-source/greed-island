/**
 * Where NFT holdings come from (docs/PHASE3.md step 7). A DAS API endpoint
 * (Metaplex Digital Asset Standard, JSON-RPC; docs/nft-notes.md), set with
 * GI_SOLANA_RPC_URL. Read-only: getAssetsByOwner and getAsset, nothing that
 * signs or sends. Without the setting, NFT features report "not set up".
 */
import { parseDasAsset, type NftSummary } from "@greed-island/shared";

export interface NftSource {
  /** NFTs a wallet holds (burnt ones and anything unreadable left out). */
  assetsByOwner(owner: string): Promise<NftSummary[]>;
  /** One NFT, or null if it doesn't exist or can't be read. */
  asset(assetId: string): Promise<NftSummary | null>;
}

export class NftSourceError extends Error {
  override name = "NftSourceError";
}

export interface DasOptions {
  /** Assets per page (DAS pages start at 1). */
  pageLimit?: number;
  /** Pages read per wallet at most. */
  maxPages?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class DasNftSource implements NftSource {
  private readonly pageLimit: number;
  private readonly maxPages: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextId = 1;

  constructor(
    private readonly rpcUrl: string,
    opts: DasOptions = {},
  ) {
    this.pageLimit = opts.pageLimit ?? 1000;
    this.maxPages = opts.maxPages ?? 5;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new NftSourceError(`the NFT service didn't answer (${(err as Error).name})`);
    }
    if (!res.ok) throw new NftSourceError(`the NFT service answered HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: string } } | null;
    if (!body) throw new NftSourceError("the NFT service sent something that isn't JSON");
    if (body.error) throw new NftSourceError(`the NFT service refused: ${String(body.error.message ?? "error").slice(0, 200)}`);
    return body.result;
  }

  async assetsByOwner(owner: string): Promise<NftSummary[]> {
    const out: NftSummary[] = [];
    for (let page = 1; page <= this.maxPages; page++) {
      const result = (await this.call("getAssetsByOwner", { ownerAddress: owner, page, limit: this.pageLimit })) as { items?: unknown[] } | null;
      const items = Array.isArray(result?.items) ? result.items : [];
      for (const raw of items) {
        const nft = parseDasAsset(raw);
        if (nft && nft.owner === owner) out.push(nft);
      }
      if (items.length < this.pageLimit) break;
    }
    return out;
  }

  async asset(assetId: string): Promise<NftSummary | null> {
    return parseDasAsset(await this.call("getAsset", { id: assetId }));
  }
}

/** Fixed holdings, for tests and trying the pages without a DAS endpoint. */
export class MemoryNftSource implements NftSource {
  constructor(private readonly nfts: NftSummary[] = []) {}

  set(nfts: NftSummary[]): void {
    this.nfts.splice(0, this.nfts.length, ...nfts);
  }

  async assetsByOwner(owner: string): Promise<NftSummary[]> {
    return this.nfts.filter((n) => n.owner === owner);
  }

  async asset(assetId: string): Promise<NftSummary | null> {
    return this.nfts.find((n) => n.assetId === assetId) ?? null;
  }
}

/** GI_SOLANA_RPC_URL: an https DAS endpoint (it usually includes an API key, so it stays in .env). */
export function loadNftSource(env: NodeJS.ProcessEnv = process.env): NftSource | null {
  const url = env["GI_SOLANA_RPC_URL"]?.trim();
  if (!url) return null;
  if (!/^https:\/\//.test(url)) throw new Error("GI_SOLANA_RPC_URL must be an https:// address");
  return new DasNftSource(url);
}
