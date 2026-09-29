# Greed Island

An always-on stream of AI-vs-AI fights on the [IKEMEN GO](https://github.com/ikemen-engine/Ikemen-GO) engine, with free play-money betting (Salt), rating-based odds, Glicko-2 ratings and tiers.

**Status:** Phase 1 (Stream MVP) is built: Salt ledger, betting, odds, ratings and tiers, the match cycle, and an API with live updates and a plain dev page. Salt can never be bought, sold or cashed out.

- Game design: [docs/DESIGN.md](docs/DESIGN.md)
- How it's built: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Setting it up: [docs/SETUP.md](docs/SETUP.md)
- Engine facts, with source references: [docs/ikemen-notes.md](docs/ikemen-notes.md)

Quick start (needs Node 24, pnpm 10 and Docker; no IKEMEN needed):

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm demo
```

IKEMEN GO, its characters and stages are not included in this repo and have their own licenses.
