# NFT and wallet notes

Facts the holder features rely on (docs/PHASE3.md step 7), with where they come from. Same legend as `ikemen-notes.md` and `obs-notes.md`:
- **SOURCE**: confirmed in an official specification or document, read 2026-09-29.
- **RUN**: confirmed against the real thing.
- **UNVERIFIED**: not confirmed yet; kept behind an adapter.

Everything here is **read-only**: nothing signs or sends a transaction, and nothing is written on-chain. Minting (our own collection) is phase 4, to be discussed with the owner first.

## Reading NFTs: the DAS API

Code: `packages/orchestrator/src/nft-source.ts` (`DasNftSource`), parsing in `packages/shared/src/nft.ts` (`parseDasAsset`).

| Item | Status | Finding |
|---|---|---|
| What it is | SOURCE | The Metaplex Digital Asset Standard (DAS) API: JSON-RPC over HTTPS, offered by Solana RPC providers. Specification: `specification/metaplex-das-api.json` in github.com/metaplex-foundation/digital-asset-standard-api; TypeScript types in `clients/js/src/types.ts` there. |
| Endpoint | UNVERIFIED | We need an https DAS endpoint in `GI_SOLANA_RPC_URL` (providers usually put an API key in the address, so it stays in `.env`). Not tried against a real provider yet. |
| `getAssetsByOwner` | SOURCE | Params are one named object: `{ownerAddress (required), page, limit, sortBy, before, after, cursor, options}`. Pages start at 1. The result is `{total, limit, page, items[]}`; when `total` is below `limit` there are no more. We read up to 5 pages of 1000. |
| `getAsset` | SOURCE | Params `{id (required), options}`; returns one asset. |
| Asset fields used | SOURCE | `id`; `ownership.owner`; `burnt`; `content.metadata.name` and `content.metadata.attributes[]` (`trait_type`, `value`); `content.links` is an object (we use `links.image`); `content.files[]` has `uri`, `mime` (and `cdn_uri` from some providers, UNVERIFIED); `grouping[]` has `group_key` (`"collection"`), `group_value` (the collection address) and optional `verified`. |
| Unverified collections | SOURCE | `grouping[].verified` can be false; we ignore collections that aren't verified. |
| Image addresses | UNVERIFIED | Many NFTs point at `ipfs://` or `ar://`; we rewrite them to the public gateways `https://ipfs.io/ipfs/` and `https://arweave.net/`. |

## Proving a wallet: signed messages

Code: `packages/orchestrator/src/holders.ts` (`verifySolanaSignature`, `createWalletChallenge`, `verifyWallet`), the button in `apps/web/app.js` (`linkWallet`).

| Item | Status | Finding |
|---|---|---|
| Keys and signatures | SOURCE | A Solana address is a base58-encoded 32-byte Ed25519 public key; signatures are 64 bytes. Phantom's docs: "Phantom uses Ed25519 signatures". We verify with Node's built-in Ed25519 (no extra library); tests sign with generated keys. |
| Asking the wallet | SOURCE (UNVERIFIED end to end) | Phantom's docs: `provider.signMessage(new TextEncoder().encode(message), "utf8")`. The page reads the provider from `window.phantom.solana` (or `window.solana`, `window.solflare`), calls `connect()` for the public key, and accepts the result as `{signature}` or a bare `Uint8Array`. Not yet tried with a real wallet extension. |
| The message | ours | One-time: wallet address, the first 8 characters of the account id, a random nonce, the time, and a line saying signing is free. Valid 10 minutes, used once. |
